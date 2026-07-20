from __future__ import annotations

from itertools import combinations

import pytest

import app.recommendations as recommendation_module
from app.models import RecommendationSnapshot
from app.recommendations import (
    RecommendationConfig,
    _best_team_option,
    build_recommendation_response,
)


def test_coordinated_batch_covers_open_courts_without_overlap():
    snapshot = RecommendationSnapshot.model_validate(
        _snapshot(player_count=8, number_of_courts=2)
    )

    response = build_recommendation_response(snapshot, algorithm_version="test")

    assert response.recommendation_count == 2
    assert [recommendation.court_number for recommendation in response.recommendations] == [1, 2]
    player_ids = [
        str(player.player_id)
        for recommendation in response.recommendations
        for player in recommendation.players
    ]
    assert len(player_ids) == 8
    assert len(set(player_ids)) == 8


def test_only_open_courts_receive_recommendations():
    data = _snapshot(player_count=8, number_of_courts=3)
    data["open_court_numbers"] = [2]
    snapshot = RecommendationSnapshot.model_validate(data)

    response = build_recommendation_response(snapshot, algorithm_version="test")

    assert response.recommendation_count == 1
    assert response.recommendations[0].court_number == 2


def test_response_is_empty_without_four_available_players():
    snapshot = RecommendationSnapshot.model_validate(
        _snapshot(player_count=3, number_of_courts=2)
    )

    response = build_recommendation_response(snapshot, algorithm_version="test")

    assert response.recommendation_count == 0
    assert response.recommendations == []


@pytest.mark.parametrize("player_count", [5, 6, 7])
def test_no_player_sits_out_twice_when_capacity_allows(player_count):
    players = _players(player_count)
    previous_sit_outs: set[str] = set()

    for _ in range(20):
        snapshot = RecommendationSnapshot.model_validate(
            _snapshot_from_players(players, number_of_courts=1)
        )
        response = build_recommendation_response(snapshot, algorithm_version="test")
        selected = {
            str(player.player_id)
            for player in response.recommendations[0].players
        }

        assert previous_sit_outs.issubset(selected)
        current_sit_outs = {player["id"] for player in players} - selected
        assert previous_sit_outs.isdisjoint(current_sit_outs)

        _complete_rotation(players, selected)
        previous_sit_outs = current_sit_outs


def test_longest_waiting_players_win_when_waiters_exceed_capacity():
    data = _snapshot(player_count=9, number_of_courts=1)
    for index, player in enumerate(data["players"]):
        player["rounds_waiting"] = 9 - index
        player["games_played"] = index // 2
    snapshot = RecommendationSnapshot.model_validate(data)

    response = build_recommendation_response(snapshot, algorithm_version="test")
    selected = {
        str(player.player_id)
        for player in response.recommendations[0].players
    }

    assert selected == {"p01", "p02", "p03", "p04"}


def test_four_players_receive_best_75_25_pairing():
    data = _snapshot(player_count=4, number_of_courts=1)
    skills = [5.0, 4.0, 2.0, 1.0]
    for player, skill in zip(data["players"], skills, strict=True):
        player["skill"] = skill
    snapshot = RecommendationSnapshot.model_validate(data)

    response = build_recommendation_response(snapshot, algorithm_version="test")
    recommendation = response.recommendations[0]
    teams = {
        frozenset(
            str(player.player_id)
            for player in recommendation.players
            if player.team_number == team_number
        )
        for team_number in (1, 2)
    }

    assert teams == {frozenset({"p01", "p04"}), frozenset({"p02", "p03"})}
    assert recommendation.team_average_skill_difference == 0
    assert recommendation.quality_score == 1


def test_weighted_selection_matches_exhaustive_objective():
    data = _snapshot(player_count=6, number_of_courts=1)
    skills = [4.8, 4.2, 3.8, 3.2, 2.8, 2.2]
    games = [0, 1, 1, 2, 2, 3]
    for player, skill, games_played in zip(data["players"], skills, games, strict=True):
        player["skill"] = skill
        player["games_played"] = games_played
    data["players"][0]["rounds_waiting"] = 1
    snapshot = RecommendationSnapshot.model_validate(data)
    config = RecommendationConfig()

    response = build_recommendation_response(
        snapshot,
        algorithm_version="test",
        config=config,
    )
    selected = frozenset(
        str(player.player_id)
        for player in response.recommendations[0].players
    )

    required = snapshot.players[0]
    optional = snapshot.players[1:]
    optional_games = sorted(player.games_played for player in optional)
    minimum_games = sum(optional_games[:3])
    maximum_games = sum(optional_games[-3:])
    games_denominator = maximum_games - minimum_games
    skill_span = max(player.skill for player in snapshot.players) - min(
        player.skill for player in snapshot.players
    )

    objectives: dict[frozenset[str], float] = {}
    for remaining_players in combinations(optional, 3):
        quartet = (required, *remaining_players)
        option = _best_team_option(quartet, config)
        fairness = (
            sum(player.games_played for player in remaining_players) - minimum_games
        ) / games_denominator
        balance = option.quality_score / skill_span
        objectives[frozenset(str(player.id) for player in quartet)] = (
            0.6 * fairness + 0.4 * balance
        )

    assert objectives[selected] == pytest.approx(min(objectives.values()))


def test_fallback_is_disjoint_and_keeps_waiting_players(monkeypatch):
    monkeypatch.setattr(recommendation_module, "_load_cp_model", lambda: None)
    data = _snapshot(player_count=9, number_of_courts=2)
    data["players"][8]["rounds_waiting"] = 2
    snapshot = RecommendationSnapshot.model_validate(data)

    response = build_recommendation_response(snapshot, algorithm_version="test")
    player_ids = [
        str(player.player_id)
        for recommendation in response.recommendations
        for player in recommendation.players
    ]

    assert response.recommendation_count == 2
    assert len(player_ids) == len(set(player_ids)) == 8
    assert "p09" in player_ids


def test_optimizer_is_deterministic():
    snapshot = RecommendationSnapshot.model_validate(
        _snapshot(player_count=12, number_of_courts=3)
    )

    first = build_recommendation_response(snapshot, algorithm_version="test")
    second = build_recommendation_response(snapshot, algorithm_version="test")

    assert first.model_dump() == second.model_dump()


def test_recommendations_preserve_profile_image_paths(monkeypatch):
    monkeypatch.setattr(recommendation_module, "_load_cp_model", lambda: None)
    data = _snapshot(player_count=4, number_of_courts=1)
    data["players"][0]["profile_image_path"] = "avatars/p01.jpg"
    snapshot = RecommendationSnapshot.model_validate(data)

    response = build_recommendation_response(snapshot, algorithm_version="test")
    image_paths_by_player_id = {
        str(player.player_id): player.profile_image_path
        for recommendation in response.recommendations
        for player in recommendation.players
    }

    assert image_paths_by_player_id["p01"] == "avatars/p01.jpg"


def _snapshot(player_count: int, number_of_courts: int):
    return _snapshot_from_players(_players(player_count), number_of_courts)


def _snapshot_from_players(players: list[dict], number_of_courts: int):
    return {
        "organization": {
            "id": "sample-club",
            "number_of_courts": number_of_courts,
        },
        "session": {
            "id": "sample-session",
            "status": "open",
            "current_round": 0,
            "recommendation_version": 1,
        },
        "open_court_numbers": list(range(1, number_of_courts + 1)),
        "players": players,
    }


def _players(player_count: int):
    return [
        {
            "id": f"p{index:02}",
            "name": f"Player {index}",
            "skill": round(2.5 + (index % 7) * 0.3, 2),
            "rounds_waiting": 0,
            "queue_position": index - 1,
            "games_played": 0,
        }
        for index in range(1, player_count + 1)
    ]


def _complete_rotation(players: list[dict], selected: set[str]) -> None:
    sitting = [player for player in players if player["id"] not in selected]
    played = [player for player in players if player["id"] in selected]
    for player in sitting:
        player["rounds_waiting"] += 1
    for player in played:
        player["rounds_waiting"] = 0
        player["games_played"] += 1
    for queue_position, player in enumerate([*sitting, *played]):
        player["queue_position"] = queue_position
