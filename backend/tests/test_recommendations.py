import app.recommendations as recommendation_module
from app.models import RecommendationSnapshot
from app.recommendations import build_recommendation_response


def test_build_recommendation_response_returns_courts_plus_one(monkeypatch):
    monkeypatch.setattr(recommendation_module, "_load_cp_model", lambda: None)
    snapshot = RecommendationSnapshot.model_validate(_snapshot(number_of_courts=3))

    response = build_recommendation_response(snapshot, algorithm_version="test")

    assert response.recommendation_count == 4
    assert len(response.recommendations) == 4
    assert [recommendation.rank for recommendation in response.recommendations] == [1, 2, 3, 4]
    assert all(len(recommendation.players) == 4 for recommendation in response.recommendations)


def test_build_recommendation_response_returns_empty_list_without_complete_match(monkeypatch):
    monkeypatch.setattr(recommendation_module, "_load_cp_model", lambda: None)
    data = _snapshot(number_of_courts=2)
    data["players"] = data["players"][:3]
    snapshot = RecommendationSnapshot.model_validate(data)

    response = build_recommendation_response(snapshot, algorithm_version="test")

    assert response.recommendation_count == 3
    assert response.recommendations == []


def test_best_recommendation_uses_oldest_queue_players_when_quality_is_close(monkeypatch):
    monkeypatch.setattr(recommendation_module, "_load_cp_model", lambda: None)
    snapshot = RecommendationSnapshot.model_validate(_snapshot(number_of_courts=2))

    response = build_recommendation_response(snapshot, algorithm_version="test")
    first_player_ids = {
        str(player.player_id)
        for player in response.recommendations[0].players
    }

    assert {"p01", "p02", "p03", "p04"}.issubset(first_player_ids)


def test_recommendations_preserve_profile_image_paths(monkeypatch):
    monkeypatch.setattr(recommendation_module, "_load_cp_model", lambda: None)
    data = _snapshot(number_of_courts=2)
    data["players"][0]["profile_image_path"] = "avatars/p01.jpg"
    snapshot = RecommendationSnapshot.model_validate(data)

    response = build_recommendation_response(snapshot, algorithm_version="test")
    image_paths_by_player_id = {
        str(player.player_id): player.profile_image_path
        for recommendation in response.recommendations
        for player in recommendation.players
    }

    assert image_paths_by_player_id["p01"] == "avatars/p01.jpg"


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
            {"id": "p09", "name": "Indigo", "skill": 3.15, "rounds_waiting": 0, "queue_position": 8, "games_played": 0},
            {"id": "p10", "name": "Jordan", "skill": 3.25, "rounds_waiting": 0, "queue_position": 9, "games_played": 0},
            {"id": "p11", "name": "Kai", "skill": 3.05, "rounds_waiting": 0, "queue_position": 10, "games_played": 0},
            {"id": "p12", "name": "Logan", "skill": 3.20, "rounds_waiting": 0, "queue_position": 11, "games_played": 0},
            {"id": "p13", "name": "Morgan", "skill": 3.65, "rounds_waiting": 0, "queue_position": 12, "games_played": 0},
            {"id": "p14", "name": "Nico", "skill": 3.50, "rounds_waiting": 0, "queue_position": 13, "games_played": 0},
        ],
    }
