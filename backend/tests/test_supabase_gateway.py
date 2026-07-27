from __future__ import annotations

import asyncio
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.models import CustomMatchRequest, CompleteMatchRequest, PassPlayerRequest, RecommendationResponse
from app.supabase_gateway import SupabaseGateway


def test_store_recommendations_maps_supabase_ids_to_response():
    gateway = RecordingGateway()
    response = RecommendationResponse.model_validate(_recommendation_response())
    match_id = UUID("00000000-0000-0000-0000-000000000111")

    stored = asyncio.run(
        gateway.store_recommendations(
            response,
            expected_recommendation_version=7,
            generated_after_match_id=match_id,
        )
    )

    assert gateway.service_calls == [
        (
            "replace_recommendation_batch_v2",
            {
                "p_session_id": "session-1",
                "p_generated_after_match_id": str(match_id),
                "p_algorithm_version": "test",
                "p_expected_recommendation_version": 7,
                "p_recommendations": [
                    {
                        "id": None,
                        "rank": 1,
                        "court_number": 1,
                        "quality_score": 0.1,
                        "team_average_skill_difference": 0.05,
                        "player_skill_spread": 0.4,
                        "predicted_team_one_win_probability": 0.55,
                        "fairness_score": 42,
                        "players": [
                            {
                                "player_id": "p01",
                                "team_number": 1,
                                "slot_number": 1,
                                "name": "Avery",
                                "skill": 3.6,
                                "profile_image_path": "avatars/p01.jpg",
                                "rounds_waiting": 1,
                                "queue_position": 0,
                                "games_played": 0,
                            },
                            {
                                "player_id": "p02",
                                "team_number": 1,
                                "slot_number": 2,
                                "name": "Blake",
                                "skill": 3.5,
                                "profile_image_path": None,
                                "rounds_waiting": 1,
                                "queue_position": 1,
                                "games_played": 0,
                            },
                            {
                                "player_id": "p03",
                                "team_number": 2,
                                "slot_number": 1,
                                "name": "Casey",
                                "skill": 3.7,
                                "profile_image_path": None,
                                "rounds_waiting": 0,
                                "queue_position": 2,
                                "games_played": 0,
                            },
                            {
                                "player_id": "p04",
                                "team_number": 2,
                                "slot_number": 2,
                                "name": "Devon",
                                "skill": 3.45,
                                "profile_image_path": None,
                                "rounds_waiting": 0,
                                "queue_position": 3,
                                "games_played": 0,
                            },
                        ],
                    }
                ],
            },
        )
    ]
    assert stored.batch_id == "batch-1"
    assert stored.recommendations[0].id == "recommendation-1"


def test_user_commands_call_expected_rpc_payloads():
    gateway = RecordingGateway()

    asyncio.run(
        gateway.complete_match(
            UUID("00000000-0000-0000-0000-000000000111"),
            CompleteMatchRequest(team_one_score=11, team_two_score=7),
            "user-token",
        )
    )
    asyncio.run(
        gateway.pass_player(
            UUID("00000000-0000-0000-0000-000000000222"),
            PassPlayerRequest(
                session_id=UUID("00000000-0000-0000-0000-000000000333"),
                player_id=UUID("00000000-0000-0000-0000-000000000444"),
            ),
            "user-token",
        )
    )
    custom_match_id, custom_snapshot = asyncio.run(
        gateway.complete_custom_match(
            UUID("00000000-0000-0000-0000-000000000333"),
            CustomMatchRequest(
                team_one_player_ids=[
                    UUID("00000000-0000-0000-0000-000000000011"),
                    UUID("00000000-0000-0000-0000-000000000012"),
                ],
                team_two_player_ids=[
                    UUID("00000000-0000-0000-0000-000000000013"),
                    UUID("00000000-0000-0000-0000-000000000014"),
                ],
                team_one_score=11,
                team_two_score=9,
            ),
            "user-token",
        )
    )
    asyncio.run(
        gateway.accept_recommendation(
            UUID("00000000-0000-0000-0000-000000000555"),
            court_number=2,
            access_token="user-token",
        )
    )

    assert custom_match_id == UUID("00000000-0000-0000-0000-000000000999")
    assert custom_snapshot.session.id == "sample-session"
    assert gateway.user_calls == [
        (
            "complete_match_result_for_recommendations",
            {
                "p_match_id": "00000000-0000-0000-0000-000000000111",
                "p_result_mode": "score",
                "p_team_one_score": 11,
                "p_team_two_score": 7,
                "p_winning_team": None,
            },
            "user-token",
        ),
        (
            "pass_player",
            {
                "p_session_id": "00000000-0000-0000-0000-000000000333",
                "p_player_id": "00000000-0000-0000-0000-000000000444",
                "p_recommendation_id": "00000000-0000-0000-0000-000000000222",
            },
            "user-token",
        ),
        (
            "complete_custom_match_result_for_recommendations",
            {
                "p_session_id": "00000000-0000-0000-0000-000000000333",
                "p_team_one_player_one_id": "00000000-0000-0000-0000-000000000011",
                "p_team_one_player_two_id": "00000000-0000-0000-0000-000000000012",
                "p_team_two_player_one_id": "00000000-0000-0000-0000-000000000013",
                "p_team_two_player_two_id": "00000000-0000-0000-0000-000000000014",
                "p_result_mode": "score",
                "p_team_one_score": 11,
                "p_team_two_score": 9,
                "p_winning_team": None,
            },
            "user-token",
        ),
        (
            "accept_recommendation",
            {
                "p_recommendation_id": "00000000-0000-0000-0000-000000000555",
                "p_court_number": 2,
            },
            "user-token",
        ),
    ]


def test_win_loss_request_uses_explicit_winner_payload():
    gateway = RecordingGateway()

    asyncio.run(
        gateway.complete_match(
            UUID("00000000-0000-0000-0000-000000000111"),
            CompleteMatchRequest(result_mode="win_loss", winning_team=2),
            "user-token",
        )
    )

    assert gateway.user_calls == [
        (
            "complete_match_result_for_recommendations",
            {
                "p_match_id": "00000000-0000-0000-0000-000000000111",
                "p_result_mode": "win_loss",
                "p_team_one_score": None,
                "p_team_two_score": None,
                "p_winning_team": 2,
            },
            "user-token",
        )
    ]


def test_result_request_rejects_ties_and_mixed_shapes():
    with pytest.raises(ValidationError, match="scores cannot be tied"):
        CompleteMatchRequest(team_one_score=11, team_two_score=11)

    with pytest.raises(ValidationError, match="scores are not accepted"):
        CompleteMatchRequest(
            result_mode="win_loss",
            team_one_score=1,
            team_two_score=0,
            winning_team=1,
        )


def test_snapshot_defaults_score_mode_on_for_legacy_responses():
    snapshot = _snapshot(number_of_courts=2)

    assert "score_mode_enabled" not in snapshot["organization"]
    assert gateway_snapshot(snapshot).organization.score_mode_enabled is True


def test_regeneration_uses_membership_protected_snapshot_rpc():
    gateway = RecordingGateway()

    asyncio.run(
        gateway.regenerate_session(
            UUID("00000000-0000-0000-0000-000000000333"),
            "user-token",
        )
    )

    assert gateway.user_calls == [
        (
            "authorized_session_recommendation_snapshot",
            {"p_session_id": "00000000-0000-0000-0000-000000000333"},
            "user-token",
        )
    ]


def test_player_data_retention_purges_records_and_storage_images():
    gateway = RetentionRecordingGateway()

    result = asyncio.run(gateway.purge_deactivated_players())

    assert result == {
        "purged_players": 2,
        "deleted_profile_images": 2,
    }
    assert gateway.deleted_image_paths == [
        "user-one/avatar.jpg",
        "user-two/avatar.png",
    ]
    assert gateway.service_calls == [
        ("purge_due_deactivated_players", {}),
        ("pending_player_profile_image_deletions", {}),
        (
            "complete_player_profile_image_deletions",
            {
                "p_profile_image_paths": [
                    "user-one/avatar.jpg",
                    "user-two/avatar.png",
                ]
            },
        ),
    ]


def test_account_deletion_schedules_then_bans_authenticated_user():
    gateway = AccountDeletionRecordingGateway()

    result = asyncio.run(gateway.request_account_deletion("user-token"))

    assert result.scheduled is True
    assert result.deletion_scheduled_at.isoformat() == "2026-08-25T12:00:00+00:00"
    assert gateway.user_calls == [
        ("schedule_current_account_deletion", {}, "user-token")
    ]
    assert gateway.banned_user_ids == ["user-one"]
    assert gateway.service_calls == []


def test_account_deletion_rolls_back_schedule_when_ban_fails():
    gateway = AccountDeletionRecordingGateway()
    gateway.fail_ban = True

    with pytest.raises(RuntimeError, match="ban failed"):
        asyncio.run(gateway.request_account_deletion("user-token"))

    assert gateway.service_calls == [
        ("cancel_account_deletion", {"p_user_id": "user-one"})
    ]


def test_due_account_retention_deletes_storage_then_auth_user():
    gateway = AccountRetentionRecordingGateway()

    result = asyncio.run(gateway.purge_due_accounts())

    assert result == {
        "deleted_accounts": 2,
        "failed_accounts": 0,
        "deleted_account_profile_images": 2,
    }
    assert gateway.deleted_image_paths == [
        "user-one/avatar.jpg",
        "user-two/avatar.png",
    ]
    assert gateway.deleted_auth_user_ids == ["user-one", "user-two"]
    assert gateway.service_calls == [
        ("due_account_deletions", {}),
        ("prepare_account_auth_deletion", {"p_user_id": "user-one"}),
        ("prepare_account_auth_deletion", {"p_user_id": "user-two"}),
    ]


class RecordingGateway(SupabaseGateway):
    def __init__(self) -> None:
        super().__init__(
            Settings(
                SUPABASE_URL="https://example.supabase.co",
                SUPABASE_ANON_KEY="anon",
                SUPABASE_SERVICE_ROLE_KEY="service",
            )
        )
        self.service_calls: list[tuple[str, dict]] = []
        self.user_calls: list[tuple[str, dict, str]] = []

    async def _rpc_as_service(self, function_name: str, payload: dict):
        self.service_calls.append((function_name, payload))
        return {
            "batch_id": "batch-1",
            "recommendation_ids": [
                {
                    "rank": 1,
                    "id": "recommendation-1",
                }
            ],
        }

    async def _rpc_as_user(self, function_name: str, payload: dict, access_token: str):
        self.user_calls.append((function_name, payload, access_token))

        if function_name == "accept_recommendation":
            return "match-1"

        if function_name == "complete_custom_match_result_for_recommendations":
            return {
                "match_id": "00000000-0000-0000-0000-000000000999",
                "snapshot": _snapshot(number_of_courts=2),
            }

        return _snapshot(number_of_courts=2)


class RetentionRecordingGateway(SupabaseGateway):
    def __init__(self) -> None:
        super().__init__(
            Settings(
                SUPABASE_URL="https://example.supabase.co",
                SUPABASE_ANON_KEY="anon",
                SUPABASE_SERVICE_ROLE_KEY="service",
            )
        )
        self.deleted_image_paths: list[str] = []
        self.service_calls: list[tuple[str, dict]] = []

    async def _rpc_as_service(self, function_name: str, payload: dict):
        self.service_calls.append((function_name, payload))

        if function_name == "purge_due_deactivated_players":
            return 2

        if function_name == "pending_player_profile_image_deletions":
            return [
                {
                    "player_id": "player-one",
                    "profile_image_path": "user-one/avatar.jpg",
                },
                {
                    "player_id": "player-two",
                    "profile_image_path": "user-two/avatar.png",
                },
            ]

        return 2

    async def _delete_profile_images(self, image_paths: list[str]) -> None:
        self.deleted_image_paths.extend(image_paths)


class AccountDeletionRecordingGateway(SupabaseGateway):
    def __init__(self) -> None:
        super().__init__(
            Settings(
                SUPABASE_URL="https://example.supabase.co",
                SUPABASE_ANON_KEY="anon",
                SUPABASE_SERVICE_ROLE_KEY="service",
            )
        )
        self.banned_user_ids: list[str] = []
        self.fail_ban = False
        self.service_calls: list[tuple[str, dict]] = []
        self.user_calls: list[tuple[str, dict, str]] = []

    async def _current_auth_user_id(self, access_token: str) -> str:
        assert access_token == "user-token"
        return "user-one"

    async def _rpc_as_user(
        self,
        function_name: str,
        payload: dict,
        access_token: str,
    ):
        self.user_calls.append((function_name, payload, access_token))
        return {
            "scheduled": True,
            "deletion_scheduled_at": "2026-08-25T12:00:00Z",
        }

    async def _rpc_as_service(self, function_name: str, payload: dict):
        self.service_calls.append((function_name, payload))

    async def _ban_auth_user(self, user_id: str) -> None:
        if self.fail_ban:
            raise RuntimeError("ban failed")
        self.banned_user_ids.append(user_id)


class AccountRetentionRecordingGateway(SupabaseGateway):
    def __init__(self) -> None:
        super().__init__(
            Settings(
                SUPABASE_URL="https://example.supabase.co",
                SUPABASE_ANON_KEY="anon",
                SUPABASE_SERVICE_ROLE_KEY="service",
            )
        )
        self.deleted_auth_user_ids: list[str] = []
        self.deleted_image_paths: list[str] = []
        self.service_calls: list[tuple[str, dict]] = []

    async def _rpc_as_service(self, function_name: str, payload: dict):
        self.service_calls.append((function_name, payload))

        if function_name == "due_account_deletions":
            return [
                {"user_id": "user-one"},
                {"user_id": "user-two"},
            ]

        if function_name == "prepare_account_auth_deletion":
            user_id = payload["p_user_id"]
            extension = "jpg" if user_id == "user-one" else "png"
            return {
                "user_id": user_id,
                "profile_image_paths": [f"{user_id}/avatar.{extension}"],
            }

        raise AssertionError(f"Unexpected service RPC: {function_name}")

    async def _delete_profile_images(self, image_paths: list[str]) -> None:
        self.deleted_image_paths.extend(image_paths)

    async def _delete_auth_user(self, user_id: str) -> None:
        self.deleted_auth_user_ids.append(user_id)


def _recommendation_response():
    return {
        "algorithm_version": "test",
        "session_id": "session-1",
        "recommendation_count": 1,
        "recommendations": [
            {
                "rank": 1,
                "court_number": 1,
                "quality_score": 0.1,
                "team_average_skill_difference": 0.05,
                "player_skill_spread": 0.4,
                "predicted_team_one_win_probability": 0.55,
                "fairness_score": 42,
                "players": [
                    {
                        "player_id": "p01",
                        "team_number": 1,
                        "slot_number": 1,
                        "name": "Avery",
                        "skill": 3.6,
                        "profile_image_path": "avatars/p01.jpg",
                        "rounds_waiting": 1,
                        "queue_position": 0,
                        "games_played": 0,
                    },
                    {
                        "player_id": "p02",
                        "team_number": 1,
                        "slot_number": 2,
                        "name": "Blake",
                        "skill": 3.5,
                        "rounds_waiting": 1,
                        "queue_position": 1,
                        "games_played": 0,
                    },
                    {
                        "player_id": "p03",
                        "team_number": 2,
                        "slot_number": 1,
                        "name": "Casey",
                        "skill": 3.7,
                        "rounds_waiting": 0,
                        "queue_position": 2,
                        "games_played": 0,
                    },
                    {
                        "player_id": "p04",
                        "team_number": 2,
                        "slot_number": 2,
                        "name": "Devon",
                        "skill": 3.45,
                        "rounds_waiting": 0,
                        "queue_position": 3,
                        "games_played": 0,
                    },
                ],
            }
        ],
    }


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
        ],
    }


def gateway_snapshot(data: dict):
    from app.models import RecommendationSnapshot

    return RecommendationSnapshot.model_validate(data)
