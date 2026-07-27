import asyncio
from uuid import UUID

from fastapi.testclient import TestClient

import app.recommendations as recommendation_module
import app.main as main_module
from app.main import app
from app.config import Settings
from app.models import RecommendationSnapshot
from app.supabase_gateway import StaleRecommendationVersionError


client = TestClient(app)


def test_health_reports_service_metadata():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert "algorithm_version" in response.json()


def test_account_deletion_requires_bearer_token():
    response = client.post("/account/deletion")

    assert response.status_code == 401


def test_account_deletion_schedules_authenticated_user(monkeypatch):
    class FakeGateway:
        def __init__(self, settings: Settings) -> None:
            self.settings = settings

        async def request_account_deletion(self, access_token):
            assert access_token == "user-token"
            return {
                "scheduled": True,
                "deletion_scheduled_at": "2026-08-25T12:00:00Z",
            }

    monkeypatch.setattr(main_module, "SupabaseGateway", FakeGateway)

    response = client.post(
        "/account/deletion",
        headers={"Authorization": "Bearer user-token"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "scheduled": True,
        "deletion_scheduled_at": "2026-08-25T12:00:00Z",
    }


def test_preview_endpoint_returns_one_disjoint_match_per_court(monkeypatch):
    monkeypatch.setattr(recommendation_module, "_load_cp_model", lambda: None)

    response = client.post("/recommendations/preview", json=_snapshot(number_of_courts=2))

    assert response.status_code == 200
    body = response.json()
    assert body["recommendation_count"] == 2
    assert len(body["recommendations"]) == 2
    assert body["recommendations"][0]["rank"] == 1
    assert [item["court_number"] for item in body["recommendations"]] == [1, 2]


def test_complete_match_requires_bearer_token():
    response = client.post(
        "/matches/00000000-0000-0000-0000-000000000001/complete",
        json={"team_one_score": 11, "team_two_score": 7},
    )

    assert response.status_code == 401


def test_custom_match_requires_bearer_token():
    response = client.post(
        "/sessions/00000000-0000-0000-0000-000000000001/matches/custom",
        json={
            "team_one_player_ids": [
                "00000000-0000-0000-0000-000000000011",
                "00000000-0000-0000-0000-000000000012",
            ],
            "team_two_player_ids": [
                "00000000-0000-0000-0000-000000000013",
                "00000000-0000-0000-0000-000000000014",
            ],
            "team_one_score": 11,
            "team_two_score": 7,
        },
    )

    assert response.status_code == 401


def test_custom_match_requires_four_distinct_players():
    response = client.post(
        "/sessions/00000000-0000-0000-0000-000000000001/matches/custom",
        headers={"Authorization": "Bearer user-token"},
        json={
            "team_one_player_ids": [
                "00000000-0000-0000-0000-000000000011",
                "00000000-0000-0000-0000-000000000012",
            ],
            "team_two_player_ids": [
                "00000000-0000-0000-0000-000000000011",
                "00000000-0000-0000-0000-000000000014",
            ],
            "team_one_score": 11,
            "team_two_score": 7,
        },
    )

    assert response.status_code == 422


def test_custom_match_completes_and_regenerates_recommendations(monkeypatch):
    stored_match_ids: list[UUID] = []

    class FakeGateway:
        def __init__(self, settings: Settings) -> None:
            self.settings = settings

        async def complete_custom_match(self, session_id, request, access_token):
            assert str(session_id) == "00000000-0000-0000-0000-000000000001"
            assert request.team_one_score == 11
            assert request.team_two_score == 7
            assert access_token == "user-token"
            return (
                UUID("00000000-0000-0000-0000-000000000999"),
                RecommendationSnapshot.model_validate(_snapshot(number_of_courts=2)),
            )

        async def store_recommendations(
            self,
            response,
            expected_recommendation_version,
            generated_after_match_id,
        ):
            assert expected_recommendation_version == 0
            stored_match_ids.append(generated_after_match_id)
            return response

    monkeypatch.setattr(recommendation_module, "_load_cp_model", lambda: None)
    monkeypatch.setattr(main_module, "SupabaseGateway", FakeGateway)

    response = client.post(
        "/sessions/00000000-0000-0000-0000-000000000001/matches/custom",
        headers={"Authorization": "Bearer user-token"},
        json={
            "team_one_player_ids": [
                "00000000-0000-0000-0000-000000000011",
                "00000000-0000-0000-0000-000000000012",
            ],
            "team_two_player_ids": [
                "00000000-0000-0000-0000-000000000013",
                "00000000-0000-0000-0000-000000000014",
            ],
            "team_one_score": 11,
            "team_two_score": 7,
        },
    )

    assert response.status_code == 200
    assert response.json()["session_id"] == "sample-session"
    assert stored_match_ids == [UUID("00000000-0000-0000-0000-000000000999")]


def test_generation_retries_once_with_latest_snapshot():
    initial_data = _snapshot(number_of_courts=2)
    initial_data["session"]["recommendation_version"] = 4
    latest_data = _snapshot(number_of_courts=2)
    latest_data["session"]["recommendation_version"] = 5
    versions: list[int] = []

    class RetryGateway:
        async def store_recommendations(
            self,
            response,
            expected_recommendation_version,
            generated_after_match_id=None,
        ):
            versions.append(expected_recommendation_version)
            if len(versions) == 1:
                raise StaleRecommendationVersionError()
            return response

        async def regenerate_session(self, session_id, access_token):
            assert session_id == "sample-session"
            assert access_token == "user-token"
            return RecommendationSnapshot.model_validate(latest_data)

    result = asyncio.run(
        main_module.generate_and_store_recommendations(
            gateway=RetryGateway(),
            snapshot=RecommendationSnapshot.model_validate(initial_data),
            algorithm_version="test",
            access_token="user-token",
        )
    )

    assert versions == [4, 5]
    assert result.recommendation_count == 2


def test_qr_email_requires_bearer_token():
    response = client.post(
        "/leagues/00000000-0000-0000-0000-000000000001/qr-email",
        json={
            "league_name": "Rose Park",
            "qr_png_base64": "cG5n",
            "qr_value": "littlepickle://league/rose-park",
            "recipient_email": "admin@example.com",
        },
    )

    assert response.status_code == 401


def test_qr_email_validates_admin_and_sends(monkeypatch):
    sent: list[dict] = []

    class FakeGateway:
        def __init__(self, settings: Settings) -> None:
            self.settings = settings

        async def require_league_admin(self, organization_id, access_token):
            assert str(organization_id) == "00000000-0000-0000-0000-000000000001"
            assert access_token == "admin-token"

    def fake_send_league_qr_email(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr(main_module, "SupabaseGateway", FakeGateway)
    monkeypatch.setattr(main_module, "send_league_qr_email", fake_send_league_qr_email)

    response = client.post(
        "/leagues/00000000-0000-0000-0000-000000000001/qr-email",
        headers={"Authorization": "Bearer admin-token"},
        json={
            "league_name": "Rose Park",
            "qr_png_base64": "cG5n",
            "qr_value": "littlepickle://league/rose-park",
            "recipient_email": "admin@example.com",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"sent": True}
    assert sent[0]["league_name"] == "Rose Park"
    assert sent[0]["recipient_email"] == "admin@example.com"


def _snapshot(number_of_courts: int):
    return {
        "organization": {
            "id": "sample-club",
            "number_of_courts": number_of_courts,
        },
        "session": {
            "id": "sample-session",
            "status": "open",
            "current_round": 0,
        },
        "players": [
            {"id": "p01", "name": "Avery", "skill": 3.60, "rounds_waiting": 1, "queue_position": 0, "games_played": 0},
            {"id": "p02", "name": "Blake", "skill": 3.55, "rounds_waiting": 1, "queue_position": 1, "games_played": 0},
            {"id": "p03", "name": "Casey", "skill": 3.70, "rounds_waiting": 0, "queue_position": 2, "games_played": 0},
            {"id": "p04", "name": "Devon", "skill": 3.45, "rounds_waiting": 0, "queue_position": 3, "games_played": 0},
            {"id": "p05", "name": "Emery", "skill": 4.10, "rounds_waiting": 0, "queue_position": 4, "games_played": 0},
            {"id": "p06", "name": "Finley", "skill": 4.00, "rounds_waiting": 0, "queue_position": 5, "games_played": 0},
            {"id": "p07", "name": "Gray", "skill": 4.20, "rounds_waiting": 0, "queue_position": 6, "games_played": 0},
            {"id": "p08", "name": "Harper", "skill": 3.95, "rounds_waiting": 0, "queue_position": 7, "games_played": 0},
        ],
    }
