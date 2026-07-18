from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import os
from pathlib import Path
import sys
from typing import Any

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings
from app.main import app


@dataclass(frozen=True)
class TestIdentity:
    access_token: str
    temporary_user_id: str | None = None


def main() -> None:
    settings = Settings()

    if not settings.supabase_configured:
        raise SystemExit(
            "Backend Supabase env is not configured. Fill backend/.env first."
        )

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    identity = _test_identity(settings, timestamp)
    access_token = identity.access_token
    organization_id: str | None = None
    session_id: str | None = None
    non_admin_user_id: str | None = None

    try:
        organization_id = _rpc(
            settings,
            access_token,
            "create_organization",
            {
                "p_name": f"LittlePickle Live Smoke {timestamp}",
                "p_slug": f"lp-smoke-{timestamp}",
                "p_number_of_courts": 2,
            },
        )

        organizations = _rpc(settings, access_token, "my_organizations", {})
        smoke_organization = next(
            organization
            for organization in organizations
            if organization["id"] == organization_id
        )
        assert smoke_organization["score_mode_enabled"] is True, (
            "new leagues must default to score mode"
        )

        non_admin_email = f"littlepickle-smoke-player-{timestamp}@example.com"
        non_admin_password = f"LittlePickle-smoke-player-{timestamp}!"
        non_admin_user_id = _create_user(
            settings,
            non_admin_email,
            non_admin_password,
        )
        non_admin_token = _sign_in(
            settings,
            non_admin_email,
            non_admin_password,
        )
        _rpc(
            settings,
            non_admin_token,
            "join_organization",
            {"p_organization_id": organization_id},
        )

        try:
            _rpc(
                settings,
                non_admin_token,
                "set_organization_score_mode",
                {
                    "p_organization_id": organization_id,
                    "p_score_mode_enabled": False,
                },
            )
        except AssertionError as error:
            assert "403" in str(error) or "42501" in str(error)
        else:
            raise AssertionError("non-admin league members must not change score mode")

        for index, rating in enumerate((3.10, 3.25, 3.40, 3.55, 3.70, 3.85, 4.00), start=1):
            _rpc(
                settings,
                access_token,
                "create_player",
                {
                    "p_organization_id": organization_id,
                    "p_display_name": f"Smoke Guest {index}",
                    "p_rating": rating,
                    "p_user_id": None,
                },
            )

        players = _rpc(
            settings,
            access_token,
            "organization_players_for_admin",
            {"p_organization_id": organization_id},
        )
        assert len(players) >= 8, "expected current user plus seven guest players"

        session_id = _rpc(
            settings,
            access_token,
            "create_play_session",
            {
                "p_organization_id": organization_id,
                "p_court_count": 2,
            },
        )

        for player in players[:8]:
            _rpc(
                settings,
                access_token,
                "add_player_to_session",
                {
                    "p_session_id": session_id,
                    "p_player_id": player["id"],
                },
            )

        client = TestClient(app)
        authorization = {"Authorization": f"Bearer {access_token}"}

        regenerated = _api_post(
            client,
            f"/sessions/{session_id}/recommendations/regenerate",
            authorization,
        )
        _assert_recommendations(regenerated, expected_count=3)

        first_recommendation = regenerated["recommendations"][0]
        accepted = _api_post(
            client,
            f"/recommendations/{first_recommendation['id']}/accept",
            authorization,
            {},
        )
        match_id = accepted["match_id"]

        accepted_player_ids = {
            player["player_id"]
            for player in first_recommendation["players"]
        }
        remaining_recommendations = _rpc(
            settings,
            access_token,
            "active_recommendations",
            {"p_session_id": session_id},
        )
        _assert_recommendations_exclude_players(
            remaining_recommendations,
            accepted_player_ids,
        )

        score_mode_off = _rpc(
            settings,
            access_token,
            "set_organization_score_mode",
            {
                "p_organization_id": organization_id,
                "p_score_mode_enabled": False,
            },
        )
        assert score_mode_off["score_mode_enabled"] is False

        completed = _api_post(
            client,
            f"/matches/{match_id}/complete",
            authorization,
            {"result_mode": "win_loss", "winning_team": 1},
        )
        _assert_recommendations(completed, expected_count=3)

        history = _rpc(
            settings,
            access_token,
            "completed_matches",
            {"p_session_id": session_id},
        )["matches"]
        assert history[0]["result_mode"] == "win_loss"
        assert history[0]["winning_team"] == 1
        assert history[0]["team_one_score"] is None
        assert history[0]["team_two_score"] is None

        score_mode_on = _rpc(
            settings,
            access_token,
            "set_organization_score_mode",
            {
                "p_organization_id": organization_id,
                "p_score_mode_enabled": True,
            },
        )
        assert score_mode_on["score_mode_enabled"] is True

        custom_completed = _api_post(
            client,
            f"/sessions/{session_id}/matches/custom",
            authorization,
            {
                "result_mode": "score",
                "team_one_player_ids": [players[0]["id"], players[1]["id"]],
                "team_one_score": 11,
                "team_two_player_ids": [players[2]["id"], players[3]["id"]],
                "team_two_score": 8,
            },
        )
        _assert_recommendations(custom_completed, expected_count=3)

        history = _rpc(
            settings,
            access_token,
            "completed_matches",
            {"p_session_id": session_id},
        )["matches"]
        scored_result = next(match for match in history if match["result_mode"] == "score")
        assert scored_result["team_one_score"] == 11
        assert scored_result["team_two_score"] == 8
        assert scored_result["winning_team"] == 1

        stale_recommendation = custom_completed["recommendations"][0]
        stale_accepted = _api_post(
            client,
            f"/recommendations/{stale_recommendation['id']}/accept",
            authorization,
            {},
        )
        stale_match_id = stale_accepted["match_id"]

        _rpc(
            settings,
            access_token,
            "set_organization_score_mode",
            {
                "p_organization_id": organization_id,
                "p_score_mode_enabled": False,
            },
        )
        stale_response = client.post(
            f"/matches/{stale_match_id}/complete",
            headers=authorization,
            json={
                "result_mode": "score",
                "team_one_score": 11,
                "team_two_score": 9,
            },
        )
        assert stale_response.status_code == 400
        assert "score mode changed" in stale_response.text.lower()

        completed = _api_post(
            client,
            f"/matches/{stale_match_id}/complete",
            authorization,
            {"result_mode": "win_loss", "winning_team": 2},
        )
        _assert_recommendations(completed, expected_count=3)

        history_while_off = _rpc(
            settings,
            access_token,
            "completed_matches",
            {"p_session_id": session_id},
        )["matches"]
        preserved_score = next(
            match for match in history_while_off if match["id"] == scored_result["id"]
        )
        assert preserved_score["team_one_score"] == 11
        assert preserved_score["team_two_score"] == 8

        pass_recommendation = completed["recommendations"][0]
        pass_player = pass_recommendation["players"][0]
        passed = _api_post(
            client,
            f"/recommendations/{pass_recommendation['id']}/pass-player",
            authorization,
            {
                "session_id": session_id,
                "player_id": pass_player["player_id"],
            },
        )
        _assert_recommendations(passed, expected_count=3)

        for player in players[:8]:
            final_snapshot = _rpc(
                settings,
                access_token,
                "remove_player_from_session",
                {
                    "p_session_id": session_id,
                    "p_player_id": player["id"],
                },
            )

        assert final_snapshot["session"]["status"] == "closed", (
            "removing the final queued player must close the play session"
        )
        assert final_snapshot["players"] == []

        empty_recommendations = _rpc(
            settings,
            access_token,
            "active_recommendations",
            {"p_session_id": session_id},
        )
        assert empty_recommendations["recommendations"] == [], (
            "closed empty sessions must not expose recommendations"
        )

        open_sessions = _rpc(
            settings,
            access_token,
            "organization_open_sessions",
            {"p_organization_id": organization_id},
        )
        assert all(open_session["id"] != session_id for open_session in open_sessions)

        reopened = _rpc(
            settings,
            access_token,
            "join_league_queue",
            {
                "p_allow_duplicate_name": False,
                "p_display_name": players[0]["display_name"],
                "p_organization_id": organization_id,
                "p_player_id": players[0]["id"],
                "p_profile_image_path": None,
            },
        )
        assert reopened["session_id"] != session_id, (
            "adding the first player must create a new play session"
        )

        reopened_snapshot = _rpc(
            settings,
            access_token,
            "remove_player_from_session",
            {
                "p_session_id": reopened["session_id"],
                "p_player_id": players[0]["id"],
            },
        )
        assert reopened_snapshot["session"]["status"] == "closed"

        print(
            "live smoke checks passed: "
            f"organization={organization_id} session={session_id}"
        )
    finally:
        if organization_id:
            try:
                _delete_organization(settings, organization_id)
            except Exception as error:
                print(f"warning: could not delete live smoke organization: {error}")
        if identity.temporary_user_id:
            try:
                _delete_user(settings, identity.temporary_user_id)
            except Exception as error:
                print(f"warning: could not delete temporary auth user: {error}")
        if non_admin_user_id:
            try:
                _delete_user(settings, non_admin_user_id)
            except Exception as error:
                print(f"warning: could not delete temporary non-admin user: {error}")


def _test_identity(settings: Settings, timestamp: str) -> TestIdentity:
    direct_token = os.getenv("SUPABASE_ACCESS_TOKEN")

    if direct_token:
        return TestIdentity(access_token=direct_token)

    email = os.getenv("LIVE_TEST_EMAIL")
    password = os.getenv("LIVE_TEST_PASSWORD")

    if email and password:
        return TestIdentity(access_token=_sign_in(settings, email, password))

    if os.getenv("LIVE_TEST_CREATE_TEMP_USER") == "1":
        temporary_email = f"littlepickle-smoke-{timestamp}@example.com"
        temporary_password = f"LittlePickle-smoke-{timestamp}!"
        user_id = _create_user(settings, temporary_email, temporary_password)
        return TestIdentity(
            access_token=_sign_in(settings, temporary_email, temporary_password),
            temporary_user_id=user_id,
        )

    raise SystemExit(
        "Set SUPABASE_ACCESS_TOKEN, set LIVE_TEST_EMAIL and LIVE_TEST_PASSWORD, "
        "or set LIVE_TEST_CREATE_TEMP_USER=1."
    )


def _sign_in(settings: Settings, email: str, password: str) -> str:
    url = f"{_supabase_url(settings)}/auth/v1/token?grant_type=password"
    response = httpx.post(
        url,
        headers={
            "apikey": settings.supabase_anon_key or "",
            "content-type": "application/json",
        },
        json={"email": email, "password": password},
        timeout=20,
    )
    _raise_for_response(response, "sign in test user")
    data = response.json()
    return data["access_token"]


def _create_user(settings: Settings, email: str, password: str) -> str:
    url = f"{_supabase_url(settings)}/auth/v1/admin/users"
    response = httpx.post(
        url,
        headers=_service_headers(settings),
        json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "display_name": "LittlePickle Smoke User",
            },
        },
        timeout=20,
    )
    _raise_for_response(response, "create temporary auth user")
    data = response.json()
    return data["id"]


def _delete_user(settings: Settings, user_id: str) -> None:
    url = f"{_supabase_url(settings)}/auth/v1/admin/users/{user_id}"
    response = httpx.delete(
        url,
        headers=_service_headers(settings),
        timeout=20,
    )
    _raise_for_response(response, "delete temporary auth user")


def _delete_organization(settings: Settings, organization_id: str) -> None:
    url = f"{_supabase_url(settings)}/rest/v1/organizations"
    response = httpx.delete(
        url,
        headers={
            **_service_headers(settings),
            "prefer": "return=minimal",
        },
        params={"id": f"eq.{organization_id}"},
        timeout=20,
    )
    _raise_for_response(response, "delete live smoke organization")


def _rpc(
    settings: Settings,
    access_token: str,
    function_name: str,
    payload: dict[str, Any],
) -> Any:
    url = f"{_supabase_url(settings)}/rest/v1/rpc/{function_name}"
    response = httpx.post(
        url,
        headers={
            "apikey": settings.supabase_anon_key or "",
            "authorization": f"Bearer {access_token}",
            "content-type": "application/json",
        },
        json=payload,
        timeout=20,
    )
    _raise_for_response(response, function_name)
    return response.json()


def _service_headers(settings: Settings) -> dict[str, str]:
    service_key = settings.supabase_service_role_key or ""
    return {
        "apikey": service_key,
        "authorization": f"Bearer {service_key}",
        "content-type": "application/json",
    }


def _api_post(
    client: TestClient,
    path: str,
    authorization: dict[str, str],
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    response = client.post(path, headers=authorization, json=payload)

    if response.status_code >= 400:
        raise AssertionError(f"{path} failed: {response.status_code} {response.text}")

    return response.json()


def _assert_recommendations(response: dict[str, Any], expected_count: int) -> None:
    assert response["recommendation_count"] == expected_count
    assert len(response["recommendations"]) == expected_count
    assert response["recommendations"][0]["id"], "stored recommendation id missing"


def _assert_recommendations_exclude_players(
    response: dict[str, Any],
    excluded_player_ids: set[str],
) -> None:
    for recommendation in response["recommendations"]:
        recommended_player_ids = {
            player["player_id"]
            for player in recommendation["players"]
        }
        assert recommended_player_ids.isdisjoint(excluded_player_ids), (
            "active match players must not appear in remaining recommendations"
        )


def _raise_for_response(response: httpx.Response, label: str) -> None:
    if response.status_code < 400:
        return

    try:
        detail = response.json()
    except ValueError:
        detail = response.text

    raise AssertionError(f"{label} failed: {response.status_code} {detail}")


def _supabase_url(settings: Settings) -> str:
    return str(settings.supabase_url).rstrip("/")


if __name__ == "__main__":
    main()
