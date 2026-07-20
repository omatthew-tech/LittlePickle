from __future__ import annotations

from dataclasses import dataclass
from math import exp
from time import perf_counter
from typing import Any, Iterable

try:
    from ortools.sat.python import cp_model as _CP_MODEL
except ImportError:  # pragma: no cover - production installs OR-Tools.
    _CP_MODEL = None

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
    fairness_weight: int = 60
    batch_balance_weight: int = 40
    solver_target_seconds: float = 0.85
    solver_time_limit_seconds: float = 2.0
    skill_scale: int = 100
    win_probability_scale: float = 0.35

    def __post_init__(self) -> None:
        if self.team_balance_weight + self.skill_closeness_weight != 100:
            raise ValueError("quality weights must add to 100")
        if self.fairness_weight + self.batch_balance_weight != 100:
            raise ValueError("batch objective weights must add to 100")
        if self.fairness_weight != 60 or self.batch_balance_weight != 40:
            raise ValueError("coordinated-fairness-v2 uses a fixed 60/40 objective")
        if self.solver_time_limit_seconds <= 0:
            raise ValueError("solver_time_limit_seconds must be positive")
        if (
            self.solver_target_seconds <= 0
            or self.solver_target_seconds > self.solver_time_limit_seconds
        ):
            raise ValueError("solver_target_seconds must fit inside the hard limit")
        if self.skill_scale < 1:
            raise ValueError("skill_scale must be positive")
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
    court_number: int


def build_recommendation_response(
    snapshot: RecommendationSnapshot,
    algorithm_version: str,
    config: RecommendationConfig | None = None,
) -> RecommendationResponse:
    config = config or RecommendationConfig()
    candidates = recommend_match_candidates(
        players=snapshot.players,
        number_of_courts=snapshot.organization.number_of_courts,
        open_court_numbers=snapshot.open_court_numbers,
        config=config,
    )

    recommendations = [
        _candidate_to_recommendation(candidate, rank=index)
        for index, candidate in enumerate(candidates, start=1)
    ]

    return RecommendationResponse(
        algorithm_version=algorithm_version,
        session_id=snapshot.session.id,
        recommendation_count=len(recommendations),
        recommendations=recommendations,
    )


def recommend_match_candidates(
    players: Iterable[PlayerSnapshot],
    number_of_courts: int,
    recommendation_count: int | None = None,
    config: RecommendationConfig | None = None,
    open_court_numbers: Iterable[int] | None = None,
) -> list[Candidate]:
    config = config or RecommendationConfig()
    player_list = list(players)
    _validate_players(player_list)

    if number_of_courts < 1:
        raise ValueError("number_of_courts must be at least 1")

    courts = sorted(
        set(open_court_numbers)
        if open_court_numbers is not None
        else range(1, number_of_courts + 1)
    )
    if any(court < 1 or court > number_of_courts for court in courts):
        raise ValueError("open courts must belong to the session")

    if recommendation_count is not None:
        courts = courts[: max(0, recommendation_count)]

    match_count = min(len(courts), len(player_list) // 4)
    if match_count < 1:
        return []

    courts = courts[:match_count]
    fallback_candidates = _fallback_candidates(player_list, courts, config)
    solver_candidates = _coordinated_candidates_with_cp_sat(
        players=player_list,
        court_numbers=courts,
        config=config,
        solution_hint=fallback_candidates,
    )
    if solver_candidates is None:
        return fallback_candidates

    capacity = len(courts) * 4
    return min(
        (solver_candidates, fallback_candidates),
        key=lambda candidates: _batch_rank_key(candidates, player_list, capacity),
    )


def _coordinated_candidates_with_cp_sat(
    players: list[PlayerSnapshot],
    court_numbers: list[int],
    config: RecommendationConfig,
    solution_hint: list[Candidate],
) -> list[Candidate] | None:
    cp_model = _load_cp_model()
    if cp_model is None:
        return None

    model = cp_model.CpModel()
    player_count = len(players)
    match_count = len(court_numbers)
    capacity = match_count * 4
    required_ids = {
        str(player.id)
        for player in _required_waiting_players(players, capacity)
    }
    skill_units = [round(player.skill * config.skill_scale) for player in players]
    skill_min = min(skill_units)
    skill_max = max(skill_units)
    skill_span = skill_max - skill_min

    assignments: dict[tuple[int, int, int], Any] = {}
    selected: list[Any] = []
    for player_index in range(player_count):
        selected_var = model.new_bool_var(f"selected_{player_index}")
        selected.append(selected_var)
        player_assignments: list[Any] = []
        for court_index in range(match_count):
            for team_index in range(2):
                assignment = model.new_bool_var(
                    f"player_{player_index}_court_{court_index}_team_{team_index}"
                )
                assignments[(player_index, court_index, team_index)] = assignment
                player_assignments.append(assignment)
        model.add(selected_var == sum(player_assignments))
        if str(players[player_index].id) in required_ids:
            model.add(selected_var == 1)

    for court_index in range(match_count):
        for team_index in range(2):
            model.add(
                sum(
                    assignments[(player_index, court_index, team_index)]
                    for player_index in range(player_count)
                )
                == 2
            )

    qualities: list[Any] = []
    court_min_player_indices: list[Any] = []
    quality_upper_bound = 200 * skill_span
    for court_index in range(match_count):
        team_sums: list[Any] = []
        in_court: list[Any] = []
        for player_index in range(player_count):
            in_court_var = model.new_bool_var(
                f"player_{player_index}_in_court_{court_index}"
            )
            model.add(
                in_court_var
                == assignments[(player_index, court_index, 0)]
                + assignments[(player_index, court_index, 1)]
            )
            in_court.append(in_court_var)

        player_index_sources: list[Any] = []
        for player_index, in_court_var in enumerate(in_court):
            index_source = model.new_int_var(
                0,
                player_count,
                f"court_{court_index}_player_{player_index}_index_source",
            )
            model.add(index_source == player_index).only_enforce_if(in_court_var)
            model.add(index_source == player_count).only_enforce_if(in_court_var.negated())
            player_index_sources.append(index_source)

        minimum_player_index = model.new_int_var(
            0,
            player_count - 1,
            f"court_{court_index}_minimum_player_index",
        )
        model.add_min_equality(minimum_player_index, player_index_sources)
        court_min_player_indices.append(minimum_player_index)

        for team_index in range(2):
            team_sum = model.new_int_var(
                2 * skill_min,
                2 * skill_max,
                f"court_{court_index}_team_{team_index}_skill",
            )
            model.add(
                team_sum
                == sum(
                    skill_units[player_index]
                    * assignments[(player_index, court_index, team_index)]
                    for player_index in range(player_count)
                )
            )
            team_sums.append(team_sum)

        # Team one is always the stronger team, matching the public response contract.
        model.add(team_sums[0] >= team_sums[1])
        difference = model.new_int_var(
            0,
            2 * skill_span,
            f"court_{court_index}_team_difference",
        )
        model.add_abs_equality(difference, team_sums[0] - team_sums[1])

        max_sources: list[Any] = []
        min_sources: list[Any] = []
        for player_index, in_court_var in enumerate(in_court):
            max_source = model.new_int_var(
                skill_min,
                skill_max,
                f"court_{court_index}_player_{player_index}_max_source",
            )
            min_source = model.new_int_var(
                skill_min,
                skill_max,
                f"court_{court_index}_player_{player_index}_min_source",
            )
            model.add(max_source == skill_units[player_index]).only_enforce_if(in_court_var)
            model.add(max_source == skill_min).only_enforce_if(in_court_var.negated())
            model.add(min_source == skill_units[player_index]).only_enforce_if(in_court_var)
            model.add(min_source == skill_max).only_enforce_if(in_court_var.negated())
            max_sources.append(max_source)
            min_sources.append(min_source)

        court_max = model.new_int_var(
            skill_min,
            skill_max,
            f"court_{court_index}_max_skill",
        )
        court_min = model.new_int_var(
            skill_min,
            skill_max,
            f"court_{court_index}_min_skill",
        )
        model.add_max_equality(court_max, max_sources)
        model.add_min_equality(court_min, min_sources)
        spread = model.new_int_var(
            0,
            skill_span,
            f"court_{court_index}_skill_spread",
        )
        model.add(spread == court_max - court_min)

        quality = model.new_int_var(
            0,
            quality_upper_bound,
            f"court_{court_index}_quality",
        )
        # This is the exact integer form of 75% team-average difference plus
        # 25% player spread. The common scale does not affect optimization.
        model.add(quality == 75 * difference + 50 * spread)
        qualities.append(quality)

    for court_index in range(match_count - 1):
        model.add(
            court_min_player_indices[court_index]
            < court_min_player_indices[court_index + 1]
        )

    hinted_assignments = {
        (str(player.id), candidate.court_number, team_number)
        for candidate in solution_hint
        for team_number, team in (
            (0, candidate.option.team_one),
            (1, candidate.option.team_two),
        )
        for player in team
    }
    hinted_player_ids = {player_id for player_id, _, _ in hinted_assignments}
    for player_index, player in enumerate(players):
        player_id = str(player.id)
        model.add_hint(selected[player_index], 1 if player_id in hinted_player_ids else 0)
        for court_index, court_number in enumerate(court_numbers):
            for team_index in range(2):
                model.add_hint(
                    assignments[(player_index, court_index, team_index)],
                    1
                    if (player_id, court_number, team_index) in hinted_assignments
                    else 0,
                )

    worst_quality = model.new_int_var(0, quality_upper_bound, "worst_match_quality")
    model.add_max_equality(worst_quality, qualities)
    total_quality = sum(qualities)
    balance_numerator = match_count * worst_quality + total_quality

    optional_indices = [
        index
        for index, player in enumerate(players)
        if str(player.id) not in required_ids
    ]
    optional_slots = capacity - len(required_ids)
    optional_games = sorted(players[index].games_played for index in optional_indices)
    minimum_optional_games = sum(optional_games[:optional_slots])
    maximum_optional_games = sum(optional_games[-optional_slots:]) if optional_slots else 0
    fairness_denominator = maximum_optional_games - minimum_optional_games
    selected_optional_games = sum(
        players[index].games_played * selected[index]
        for index in optional_indices
    )

    if fairness_denominator > 0:
        fairness_numerator = selected_optional_games - minimum_optional_games
        balance_denominator = max(1, 400 * skill_span * match_count)
        primary_objective = (
            3 * balance_denominator * fairness_numerator
            + 2 * fairness_denominator * balance_numerator
        )
    else:
        primary_objective = balance_numerator

    queue_objective = sum(
        player.queue_position * selected[index]
        for index, player in enumerate(players)
    )
    solver = _solve_lexicographic(
        model=model,
        cp_model=cp_model,
        objectives=(primary_objective, worst_quality, queue_objective),
        target_seconds=config.solver_target_seconds,
        time_limit_seconds=config.solver_time_limit_seconds,
    )
    if solver is None:
        return None

    queue_rank = _queue_rank_by_player(players)
    candidates: list[Candidate] = []
    for court_index, court_number in enumerate(court_numbers):
        teams: list[tuple[PlayerSnapshot, PlayerSnapshot]] = []
        for team_index in range(2):
            team = tuple(
                players[player_index]
                for player_index in range(player_count)
                if solver.value(assignments[(player_index, court_index, team_index)])
            )
            if len(team) != 2:
                return None
            teams.append((team[0], team[1]))

        option = _score_pairing(teams[0], teams[1], config)
        quartet = (*option.team_one, *option.team_two)
        candidates.append(
            Candidate(
                option=option,
                fairness_score=_fairness_score(quartet, queue_rank),
                court_number=court_number,
            )
        )

    return candidates


def _solve_lexicographic(
    model: Any,
    cp_model: Any,
    objectives: tuple[Any, ...],
    target_seconds: float,
    time_limit_seconds: float,
) -> Any | None:
    deadline = perf_counter() + time_limit_seconds
    best_solver: Any | None = None

    for objective in objectives:
        remaining = deadline - perf_counter()
        if remaining <= 0.01:
            break

        model.minimize(objective)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = min(target_seconds, remaining)
        solver.parameters.num_search_workers = 1
        solver.parameters.random_seed = 0
        solver.parameters.relative_gap_limit = 0.01
        status = solver.solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            break

        best_solver = solver
        if status != cp_model.OPTIMAL:
            break

        optimum = int(round(solver.objective_value))
        model.add(objective == optimum)

    return best_solver


def _fallback_candidates(
    players: list[PlayerSnapshot],
    court_numbers: list[int],
    config: RecommendationConfig,
) -> list[Candidate]:
    capacity = len(court_numbers) * 4
    required = _required_waiting_players(players, capacity)
    required_ids = {str(player.id) for player in required}
    optional = sorted(
        (player for player in players if str(player.id) not in required_ids),
        key=lambda player: (
            player.games_played,
            player.queue_position,
            str(player.id),
        ),
    )
    selected = [*required, *optional[: capacity - len(required)]]
    selected.sort(key=lambda player: (-player.skill, str(player.id)))

    court_players: list[list[PlayerSnapshot]] = [[] for _ in court_numbers]
    court_count = len(court_numbers)
    for index, player in enumerate(selected):
        band = index // court_count
        offset = index % court_count
        court_index = offset if band % 2 == 0 else court_count - 1 - offset
        court_players[court_index].append(player)

    queue_rank = _queue_rank_by_player(players)
    options = [
        _best_team_option(tuple(quartet), config)
        for quartet in court_players
    ]
    options.sort(
        key=lambda option: min(
            player.queue_position
            for player in (*option.team_one, *option.team_two)
        )
    )

    candidates: list[Candidate] = []
    for court_number, option in zip(court_numbers, options, strict=True):
        players_in_match = (*option.team_one, *option.team_two)
        candidates.append(
            Candidate(
                option=option,
                fairness_score=_fairness_score(players_in_match, queue_rank),
                court_number=court_number,
            )
        )
    return candidates


def _batch_rank_key(
    candidates: list[Candidate],
    players: list[PlayerSnapshot],
    capacity: int,
) -> tuple[float, float, int, tuple[tuple[str, ...], ...]]:
    required_ids = {
        str(player.id)
        for player in _required_waiting_players(players, capacity)
    }
    selected_players = [
        player
        for candidate in candidates
        for player in (*candidate.option.team_one, *candidate.option.team_two)
    ]
    selected_ids = {str(player.id) for player in selected_players}
    optional = [player for player in players if str(player.id) not in required_ids]
    optional_slots = capacity - len(required_ids)
    optional_games = sorted(player.games_played for player in optional)
    minimum_games = sum(optional_games[:optional_slots])
    maximum_games = sum(optional_games[-optional_slots:]) if optional_slots else 0
    denominator = maximum_games - minimum_games
    selected_optional_games = sum(
        player.games_played
        for player in optional
        if str(player.id) in selected_ids
    )
    fairness = (
        (selected_optional_games - minimum_games) / denominator
        if denominator > 0
        else 0.0
    )

    qualities = [candidate.option.quality_score for candidate in candidates]
    skill_span = max(player.skill for player in players) - min(
        player.skill for player in players
    )
    balance = (
        (max(qualities) + sum(qualities) / len(qualities)) / (2 * skill_span)
        if skill_span > 0
        else 0.0
    )
    combined = 0.6 * fairness + 0.4 * balance
    queue_sum = sum(player.queue_position for player in selected_players)
    canonical_ids = tuple(
        sorted(
            tuple(
                sorted(
                    str(player.id)
                    for player in (*candidate.option.team_one, *candidate.option.team_two)
                )
            )
            for candidate in candidates
        )
    )
    return (combined, max(qualities), queue_sum, canonical_ids)


def _required_waiting_players(
    players: list[PlayerSnapshot],
    capacity: int,
) -> list[PlayerSnapshot]:
    waiting = sorted(
        (player for player in players if player.rounds_waiting > 0),
        key=lambda player: (
            -player.rounds_waiting,
            player.games_played,
            player.queue_position,
            str(player.id),
        ),
    )
    return waiting[:capacity]


def _candidate_to_recommendation(candidate: Candidate, rank: int) -> MatchRecommendation:
    players = [
        *_team_players(candidate.option.team_one, team_number=1),
        *_team_players(candidate.option.team_two, team_number=2),
    ]

    return MatchRecommendation(
        rank=rank,
        court_number=candidate.court_number,
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
    ordered_team = sorted(team, key=lambda player: (player.queue_position, str(player.id)))
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
        for index, player in enumerate(ordered_team, start=1)
    ]


def _best_team_option(
    quartet: tuple[PlayerSnapshot, ...],
    config: RecommendationConfig,
) -> TeamOption:
    if len(quartet) != 4:
        raise ValueError("a match requires exactly four players")
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
            _team_ids(option.team_one),
            _team_ids(option.team_two),
        ),
    )


def _score_pairing(
    raw_team_one: tuple[PlayerSnapshot, PlayerSnapshot],
    raw_team_two: tuple[PlayerSnapshot, PlayerSnapshot],
    config: RecommendationConfig,
) -> TeamOption:
    team_one = tuple(sorted(raw_team_one, key=lambda player: str(player.id)))
    team_two = tuple(sorted(raw_team_two, key=lambda player: str(player.id)))
    team_one_average = _average_skill(team_one)
    team_two_average = _average_skill(team_two)

    if team_two_average > team_one_average or (
        team_two_average == team_one_average and _team_ids(team_two) < _team_ids(team_one)
    ):
        team_one, team_two = team_two, team_one
        team_one_average, team_two_average = team_two_average, team_one_average

    average_difference = abs(team_one_average - team_two_average)
    skills = [player.skill for player in (*team_one, *team_two)]
    spread = max(skills) - min(skills)
    quality_score = (
        config.team_balance_weight / 100.0 * average_difference
        + config.skill_closeness_weight / 100.0 * spread
    )

    return TeamOption(
        team_one=(team_one[0], team_one[1]),
        team_two=(team_two[0], team_two[1]),
        predicted_team_one_win_probability=_win_probability(
            team_one_average - team_two_average,
            config.win_probability_scale,
        ),
        team_average_skill_difference=average_difference,
        player_skill_spread=spread,
        quality_score=quality_score,
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
    ranked_players = sorted(
        players,
        key=lambda player: (
            player.queue_position,
            player.games_played,
            str(player.id),
        ),
    )
    return {str(player.id): rank for rank, player in enumerate(ranked_players)}


def _team_ids(team: tuple[PlayerSnapshot, PlayerSnapshot]) -> tuple[str, str]:
    return tuple(sorted((str(team[0].id), str(team[1].id))))


def _average_skill(team: tuple[PlayerSnapshot, PlayerSnapshot]) -> float:
    return (team[0].skill + team[1].skill) / 2.0


def _win_probability(team_average_difference: float, scale: float) -> float:
    exponent = max(-60.0, min(60.0, -team_average_difference / scale))
    return 1.0 / (1.0 + exp(exponent))


def _load_cp_model() -> Any | None:
    return _CP_MODEL


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
