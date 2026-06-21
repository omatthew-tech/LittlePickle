from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from math import exp
from typing import Any, Iterable

from .models import (
    MatchRecommendation,
    PlayerSnapshot,
    RecommendationPlayer,
    RecommendationResponse,
    RecommendationSnapshot,
)


@dataclass(frozen=True, slots=True)
class RecommendationConfig:
    team_balance_weight: int = 75
    skill_closeness_weight: int = 25
    quality_tolerance: float = 0.05
    max_candidate_pool_size: int = 28
    win_probability_scale: float = 0.35

    def __post_init__(self) -> None:
        if self.team_balance_weight + self.skill_closeness_weight != 100:
            raise ValueError("quality weights must add to 100")
        if self.max_candidate_pool_size < 4:
            raise ValueError("max_candidate_pool_size must be at least 4")
        if self.win_probability_scale <= 0:
            raise ValueError("win_probability_scale must be positive")


@dataclass(frozen=True, slots=True)
class TeamOption:
    team_one: tuple[PlayerSnapshot, PlayerSnapshot]
    team_two: tuple[PlayerSnapshot, PlayerSnapshot]
    predicted_team_one_win_probability: float
    team_average_skill_difference: float
    player_skill_spread: float
    quality_score: float


@dataclass(frozen=True, slots=True)
class Candidate:
    option: TeamOption
    fairness_score: int


def build_recommendation_response(
    snapshot: RecommendationSnapshot,
    algorithm_version: str,
    config: RecommendationConfig | None = None,
) -> RecommendationResponse:
    config = config or RecommendationConfig()
    recommendation_count = snapshot.organization.number_of_courts + 1
    candidates = recommend_match_candidates(
        players=snapshot.players,
        number_of_courts=snapshot.organization.number_of_courts,
        recommendation_count=recommendation_count,
        config=config,
    )

    recommendations = [
        _candidate_to_recommendation(candidate, rank=index)
        for index, candidate in enumerate(candidates, start=1)
    ]

    return RecommendationResponse(
        algorithm_version=algorithm_version,
        session_id=snapshot.session.id,
        recommendation_count=recommendation_count,
        recommendations=recommendations,
    )


def recommend_match_candidates(
    players: Iterable[PlayerSnapshot],
    number_of_courts: int,
    recommendation_count: int | None = None,
    config: RecommendationConfig | None = None,
) -> list[Candidate]:
    config = config or RecommendationConfig()
    player_list = list(players)
    _validate_players(player_list)

    if number_of_courts < 1:
        raise ValueError("number_of_courts must be at least 1")

    target_count = recommendation_count or number_of_courts + 1
    if len(player_list) < 4 or target_count < 1:
        return []

    candidate_pool = _candidate_pool(player_list, number_of_courts, target_count, config)
    queue_rank = _queue_rank_by_player(candidate_pool)
    candidates: list[Candidate] = []

    for quartet in combinations(candidate_pool, 4):
        option = _best_team_option(quartet, config)
        candidates.append(
            Candidate(
                option=option,
                fairness_score=_fairness_score(quartet, queue_rank),
            )
        )

    if not candidates:
        return []

    best_quality = min(candidate.option.quality_score for candidate in candidates)
    solver_ranked_candidates = _rank_candidates_with_cp_sat(
        candidates=candidates,
        best_quality=best_quality,
        target_count=target_count,
        config=config,
    )

    if solver_ranked_candidates is not None:
        return solver_ranked_candidates

    candidates.sort(key=lambda candidate: _candidate_rank_key(candidate, best_quality, config))
    return candidates[:target_count]


def _candidate_to_recommendation(candidate: Candidate, rank: int) -> MatchRecommendation:
    players = [
        *_team_players(candidate.option.team_one, team_number=1),
        *_team_players(candidate.option.team_two, team_number=2),
    ]

    return MatchRecommendation(
        rank=rank,
        court_number=None,
        quality_score=round(candidate.option.quality_score, 4),
        team_average_skill_difference=round(candidate.option.team_average_skill_difference, 4),
        player_skill_spread=round(candidate.option.player_skill_spread, 4),
        predicted_team_one_win_probability=round(
            candidate.option.predicted_team_one_win_probability,
            6,
        ),
        fairness_score=candidate.fairness_score,
        players=players,
    )


def _team_players(
    team: tuple[PlayerSnapshot, PlayerSnapshot],
    team_number: int,
) -> list[RecommendationPlayer]:
    return [
        RecommendationPlayer(
            player_id=player.id,
            team_number=team_number,
            slot_number=index,
            name=player.name,
            skill=player.skill,
            profile_image_path=player.profile_image_path,
            rounds_waiting=player.rounds_waiting,
            queue_position=player.queue_position,
            games_played=player.games_played,
        )
        for index, player in enumerate(team, start=1)
    ]


def _candidate_pool(
    players: list[PlayerSnapshot],
    number_of_courts: int,
    recommendation_count: int,
    config: RecommendationConfig,
) -> list[PlayerSnapshot]:
    pool_size = min(
        len(players),
        config.max_candidate_pool_size,
        max(12, number_of_courts * 4 + 8, recommendation_count * 4),
    )
    return sorted(players, key=_fairness_sort_key)[:pool_size]


def _best_team_option(
    quartet: tuple[PlayerSnapshot, PlayerSnapshot, PlayerSnapshot, PlayerSnapshot],
    config: RecommendationConfig,
) -> TeamOption:
    pairings = (
        ((quartet[0], quartet[1]), (quartet[2], quartet[3])),
        ((quartet[0], quartet[2]), (quartet[1], quartet[3])),
        ((quartet[0], quartet[3]), (quartet[1], quartet[2])),
    )
    return min(
        (_score_pairing(pairing[0], pairing[1], config) for pairing in pairings),
        key=lambda option: (
            option.quality_score,
            option.team_average_skill_difference,
            option.player_skill_spread,
        ),
    )


def _score_pairing(
    raw_team_one: tuple[PlayerSnapshot, PlayerSnapshot],
    raw_team_two: tuple[PlayerSnapshot, PlayerSnapshot],
    config: RecommendationConfig,
) -> TeamOption:
    team_one_average = _average_skill(raw_team_one)
    team_two_average = _average_skill(raw_team_two)

    if team_two_average > team_one_average:
        team_one = raw_team_two
        team_two = raw_team_one
        team_one_average, team_two_average = team_two_average, team_one_average
    else:
        team_one = raw_team_one
        team_two = raw_team_two

    average_difference = abs(team_one_average - team_two_average)
    skills = [player.skill for player in (*team_one, *team_two)]
    spread = max(skills) - min(skills)
    quality_score = (
        config.team_balance_weight / 100.0 * average_difference
        + config.skill_closeness_weight / 100.0 * spread
    )

    return TeamOption(
        team_one=team_one,
        team_two=team_two,
        predicted_team_one_win_probability=_win_probability(
            team_one_average - team_two_average,
            config.win_probability_scale,
        ),
        team_average_skill_difference=average_difference,
        player_skill_spread=spread,
        quality_score=quality_score,
    )


def _candidate_rank_key(
    candidate: Candidate,
    best_quality: float,
    config: RecommendationConfig,
) -> tuple[int, float, int, float, int, int]:
    quality_over_tolerance = max(
        0.0,
        candidate.option.quality_score - best_quality - config.quality_tolerance,
    )
    players = (*candidate.option.team_one, *candidate.option.team_two)
    return (
        1 if quality_over_tolerance > 0 else 0,
        round(quality_over_tolerance, 4),
        -candidate.fairness_score,
        round(candidate.option.quality_score, 4),
        min(player.queue_position for player in players),
        sum(player.games_played for player in players),
    )


def _rank_candidates_with_cp_sat(
    candidates: list[Candidate],
    best_quality: float,
    target_count: int,
    config: RecommendationConfig,
) -> list[Candidate] | None:
    cp_model = _load_cp_model()

    if cp_model is None:
        return None

    ranked: list[Candidate] = []
    excluded_indices: set[int] = set()
    objective_units = [
        _candidate_objective_units(candidate, best_quality, config)
        for candidate in candidates
    ]

    while len(ranked) < target_count and len(excluded_indices) < len(candidates):
        model = cp_model.CpModel()
        selected = [
            model.new_bool_var(f"candidate_{index}")
            for index in range(len(candidates))
        ]
        model.add(sum(selected) == 1)

        for index in excluded_indices:
            model.add(selected[index] == 0)

        model.minimize(
            sum(objective_units[index] * selected[index] for index in range(len(candidates)))
        )

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 2.0
        solver.parameters.num_search_workers = 1
        status = solver.solve(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            break

        chosen_index = next(
            index for index, selected_var in enumerate(selected)
            if solver.value(selected_var)
        )
        ranked.append(candidates[chosen_index])
        excluded_indices.add(chosen_index)

    return ranked or None


def _load_cp_model() -> Any | None:
    try:
        from ortools.sat.python import cp_model
    except ImportError:  # pragma: no cover - local fallback for dependency-free previews.
        return None
    return cp_model


def _candidate_objective_units(
    candidate: Candidate,
    best_quality: float,
    config: RecommendationConfig,
) -> int:
    players = (*candidate.option.team_one, *candidate.option.team_two)
    quality_over_tolerance = max(
        0.0,
        candidate.option.quality_score - best_quality - config.quality_tolerance,
    )
    over_tolerance_flag = 1 if quality_over_tolerance > 0 else 0
    over_tolerance_units = round(quality_over_tolerance * 10000)
    quality_units = round(candidate.option.quality_score * 10000)
    min_queue_position = min(player.queue_position for player in players)
    games_played = sum(player.games_played for player in players)

    return (
        over_tolerance_flag * 10_000_000_000
        + over_tolerance_units * 1_000_000
        - candidate.fairness_score * 1_000
        + quality_units
        + min_queue_position * 10
        + games_played
    )


def _fairness_score(
    players: tuple[PlayerSnapshot, PlayerSnapshot, PlayerSnapshot, PlayerSnapshot],
    queue_rank: dict[str, int],
) -> int:
    player_count = len(queue_rank)
    wait_round_weight = player_count + 1
    return sum(
        player.rounds_waiting * wait_round_weight
        + (player_count - queue_rank[str(player.id)])
        for player in players
    )


def _queue_rank_by_player(players: list[PlayerSnapshot]) -> dict[str, int]:
    ranked_players = sorted(players, key=lambda player: (player.queue_position, player.games_played, str(player.id)))
    return {str(player.id): rank for rank, player in enumerate(ranked_players)}


def _fairness_sort_key(player: PlayerSnapshot) -> tuple[int, int, int, str]:
    return (
        -player.rounds_waiting,
        player.queue_position,
        player.games_played,
        str(player.id),
    )


def _average_skill(team: tuple[PlayerSnapshot, PlayerSnapshot]) -> float:
    return (team[0].skill + team[1].skill) / 2.0


def _win_probability(team_average_difference: float, scale: float) -> float:
    exponent = max(-60.0, min(60.0, -team_average_difference / scale))
    return 1.0 / (1.0 + exp(exponent))


def _validate_players(players: list[PlayerSnapshot]) -> None:
    ids: set[str] = set()
    positions: set[int] = set()
    for player in players:
        player_id = str(player.id)
        if player_id in ids:
            raise ValueError(f"duplicate player id: {player_id}")
        if player.queue_position in positions:
            raise ValueError(
                f"duplicate queue_position: {player.queue_position}; "
                "queue positions must be unique"
            )
        ids.add(player_id)
        positions.add(player.queue_position)
