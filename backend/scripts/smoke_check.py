from pathlib import Path
import asyncio
import sys
from uuid import UUID

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings
import app.main as main_module
from app.main import app
from app.models import CompleteMatchRequest, PassPlayerRequest, RecommendationSnapshot
from app.recommendations import build_recommendation_response
from app.supabase_gateway import SupabaseGateway


def main() -> None:
    client = TestClient(app)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["ok"] is True

    preview = client.post("/recommendations/preview", json=_snapshot(number_of_courts=2))
    assert preview.status_code == 200
    preview_body = preview.json()
    assert preview_body["recommendation_count"] == 3
    assert len(preview_body["recommendations"]) == 3

    snapshot = RecommendationSnapshot.model_validate(_snapshot(number_of_courts=3))
    response = build_recommendation_response(snapshot, algorithm_version="smoke")
    assert response.recommendation_count == 4
    assert len(response.recommendations) == 4
    assert any(
        player.profile_image_path == "avatars/p01.jpg"
        for recommendation in response.recommendations
        for player in recommendation.players
    )
    asyncio.run(_check_supabase_gateway_contract(response))

    unauthorized = client.post(
        "/matches/00000000-0000-0000-0000-000000000001/complete",
        json={"team_one_score": 11, "team_two_score": 7},
    )
    assert unauthorized.status_code == 401

    original_gateway = main_module.SupabaseGateway
    main_module.SupabaseGateway = FakeGateway
    FakeGateway.stores = []

    try:
        match_id = "00000000-0000-0000-0000-000000000111"
        completed = client.post(
            f"/matches/{match_id}/complete",
            headers={"Authorization": "Bearer smoke-token"},
            json={"team_one_score": 11, "team_two_score": 7},
        )
        assert completed.status_code == 200, completed.text
        assert completed.json()["recommendation_count"] == 3
        assert FakeGateway.stores[-1] == match_id

        passed = client.post(
            "/recommendations/00000000-0000-0000-0000-000000000222/pass-player",
            headers={"Authorization": "Bearer smoke-token"},
            json={
                "player_id": "00000000-0000-0000-0000-000000000333",
                "session_id": "00000000-0000-0000-0000-000000000444",
            },
        )
        assert passed.status_code == 200, passed.text
        assert passed.json()["recommendation_count"] == 3
        assert FakeGateway.stores[-1] is None
    finally:
        main_module.SupabaseGateway = original_gateway

    print("backend smoke checks passed")


class FakeGateway:
    stores: list[str | None] = []

    def __init__(self, settings) -> None:
        self.settings = settings

    async def complete_match(self, match_id, request, access_token):
        assert access_token == "smoke-token"
        assert request.team_one_score == 11
        assert request.team_two_score == 7
        return RecommendationSnapshot.model_validate(_snapshot(number_of_courts=2))

    async def pass_player(self, recommendation_id, request, access_token):
        assert access_token == "smoke-token"
        return RecommendationSnapshot.model_validate(_snapshot(number_of_courts=2))

    async def store_recommendations(self, response, generated_after_match_id=None):
        self.stores.append(str(generated_after_match_id) if generated_after_match_id else None)
        return response.model_copy(update={"batch_id": "fake-batch"})


class RecordingSupabaseGateway(SupabaseGateway):
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
            "batch_id": "stored-batch",
            "recommendation_ids": [
                {"rank": item["rank"], "id": f"stored-rec-{item['rank']}"}
                for item in payload["p_recommendations"]
            ],
        }

    async def _rpc_as_user(self, function_name: str, payload: dict, access_token: str):
        self.user_calls.append((function_name, payload, access_token))
        if function_name == "accept_recommendation":
            return "match-from-rpc"
        return _snapshot(number_of_courts=2)


async def _check_supabase_gateway_contract(response) -> None:
    gateway = RecordingSupabaseGateway()
    match_id = UUID("00000000-0000-0000-0000-000000000111")

    stored = await gateway.store_recommendations(
        response,
        generated_after_match_id=match_id,
    )

    assert stored.batch_id == "stored-batch"
    assert stored.recommendations[0].id == "stored-rec-1"
    service_function, service_payload = gateway.service_calls[0]
    assert service_function == "replace_recommendation_batch"
    assert service_payload["p_session_id"] == "sample-session"
    assert service_payload["p_generated_after_match_id"] == str(match_id)
    assert service_payload["p_algorithm_version"] == "smoke"
    assert len(service_payload["p_recommendations"]) == response.recommendation_count
    assert any(
        player["profile_image_path"] == "avatars/p01.jpg"
        for recommendation in service_payload["p_recommendations"]
        for player in recommendation["players"]
    )

    await gateway.complete_match(
        match_id,
        CompleteMatchRequest(team_one_score=11, team_two_score=7),
        "user-token",
    )
    await gateway.pass_player(
        UUID("00000000-0000-0000-0000-000000000222"),
        PassPlayerRequest(
            session_id=UUID("00000000-0000-0000-0000-000000000333"),
            player_id=UUID("00000000-0000-0000-0000-000000000444"),
        ),
        "user-token",
    )
    accepted = await gateway.accept_recommendation(
        UUID("00000000-0000-0000-0000-000000000555"),
        court_number=2,
        access_token="user-token",
    )

    assert accepted.match_id == "match-from-rpc"
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
            "accept_recommendation",
            {
                "p_recommendation_id": "00000000-0000-0000-0000-000000000555",
                "p_court_number": 2,
            },
            "user-token",
        ),
    ]


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
            {"id": "p01", "name": "Avery", "skill": 3.60, "profile_image_path": "avatars/p01.jpg", "rounds_waiting": 1, "queue_position": 0, "games_played": 0},
            {"id": "p02", "name": "Blake", "skill": 3.55, "rounds_waiting": 1, "queue_position": 1, "games_played": 0},
            {"id": "p03", "name": "Casey", "skill": 3.70, "rounds_waiting": 0, "queue_position": 2, "games_played": 0},
            {"id": "p04", "name": "Devon", "skill": 3.45, "rounds_waiting": 0, "queue_position": 3, "games_played": 0},
            {"id": "p05", "name": "Emery", "skill": 4.10, "rounds_waiting": 0, "queue_position": 4, "games_played": 0},
            {"id": "p06", "name": "Finley", "skill": 4.00, "rounds_waiting": 0, "queue_position": 5, "games_played": 0},
            {"id": "p07", "name": "Gray", "skill": 4.20, "rounds_waiting": 0, "queue_position": 6, "games_played": 0},
            {"id": "p08", "name": "Harper", "skill": 3.95, "rounds_waiting": 0, "queue_position": 7, "games_played": 0},
            {"id": "p09", "name": "Indigo", "skill": 3.15, "rounds_waiting": 0, "queue_position": 8, "games_played": 0},
            {"id": "p10", "name": "Jordan", "skill": 3.25, "rounds_waiting": 0, "queue_position": 9, "games_played": 0},
            {"id": "p11", "name": "Kai", "skill": 3.05, "rounds_waiting": 0, "queue_position": 10, "games_played": 0},
            {"id": "p12", "name": "Logan", "skill": 3.20, "rounds_waiting": 0, "queue_position": 11, "games_played": 0},
            {"id": "p13", "name": "Morgan", "skill": 3.65, "rounds_waiting": 0, "queue_position": 12, "games_played": 0},
            {"id": "p14", "name": "Nico", "skill": 3.50, "rounds_waiting": 0, "queue_position": 13, "games_played": 0},
        ],
    }


if __name__ == "__main__":
    main()
