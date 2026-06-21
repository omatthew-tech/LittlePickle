from fastapi.testclient import TestClient

import app.recommendations as recommendation_module
import app.main as main_module
from app.main import app
from app.config import Settings


client = TestClient(app)


def test_health_reports_service_metadata():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert "algorithm_version" in response.json()


def test_preview_endpoint_returns_courts_plus_one_recommendations(monkeypatch):
    monkeypatch.setattr(recommendation_module, "_load_cp_model", lambda: None)

    response = client.post("/recommendations/preview", json=_snapshot(number_of_courts=2))

    assert response.status_code == 200
    body = response.json()
    assert body["recommendation_count"] == 3
    assert len(body["recommendations"]) == 3
    assert body["recommendations"][0]["rank"] == 1


def test_complete_match_requires_bearer_token():
    response = client.post(
        "/matches/00000000-0000-0000-0000-000000000001/complete",
        json={"team_one_score": 11, "team_two_score": 7},
    )

    assert response.status_code == 401


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
