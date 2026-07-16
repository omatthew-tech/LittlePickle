from __future__ import annotations

import asyncio
from uuid import UUID

from app.config import Settings
from app.models import CustomMatchRequest, CompleteMatchRequest, PassPlayerRequest, RecommendationResponse
from app.supabase_gateway import SupabaseGateway


def test_store_recommendations_maps_supabase_ids_to_response():
    gateway = RecordingGateway()
    response = RecommendationResponse.model_validate(_recommendation_response())
    match_id = UUID("00000000-0000-0000-0000-000000000111")

    stored = asyncio.run(gateway.store_recommendations(response, generated_after_match_id=match_id))

    assert gateway.service_calls == [
        (
            "replace_recommendation_batch",
            {
                "p_session_id": "session-1",
                "p_generated_after_match_id": str(match_id),
                "p_algorithm_version": "test",
                "p_recommendations": [
                    {
                        "id": None,
                        "rank": 1,
                        "court_number": None,
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
            "complete_match_for_recommendations",
            {
                "p_match_id": "00000000-0000-0000-0000-000000000111",
                "p_team_one_score": 11,
                "p_team_two_score": 7,
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
            "complete_custom_match_for_recommendations",
            {
                "p_session_id": "00000000-0000-0000-0000-000000000333",
                "p_team_one_player_one_id": "00000000-0000-0000-0000-000000000011",
                "p_team_one_player_two_id": "00000000-0000-0000-0000-000000000012",
                "p_team_two_player_one_id": "00000000-0000-0000-0000-000000000013",
                "p_team_two_player_two_id": "00000000-0000-0000-0000-000000000014",
                "p_team_one_score": 11,
                "p_team_two_score": 9,
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

        if function_name == "complete_custom_match_for_recommendations":
            return {
                "match_id": "00000000-0000-0000-0000-000000000999",
                "snapshot": _snapshot(number_of_courts=2),
            }

        return _snapshot(number_of_courts=2)


def _recommendation_response():
    return {
        "algorithm_version": "test",
        "session_id": "session-1",
        "recommendation_count": 1,
        "recommendations": [
            {
                "rank": 1,
                "court_number": None,
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
