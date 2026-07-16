import type { MatchTeam } from "../components/MatchCard";
import type { ActiveMatch, ActiveMatchPlayer, MatchRecommendation, RecommendationPlayer } from "../types/matchFlow";
import { publicProfileImageUrl } from "./profileImages";

export function recommendationId(recommendation: MatchRecommendation) {
  return recommendation.id ?? `preview-recommendation-${recommendation.rank}`;
}

export function recommendationLabel(recommendation: MatchRecommendation) {
  return recommendation.rank === 1 ? "Best match" : `Option ${recommendation.rank}`;
}

export function recommendationTeams(recommendation: MatchRecommendation): [MatchTeam, MatchTeam] {
  return [teamFromRecommendation(recommendation, 1), teamFromRecommendation(recommendation, 2)];
}

export function activeMatchLabel(match: ActiveMatch) {
  return match.court_number ? `Court ${match.court_number}` : "Active match";
}

export function activeMatchTeams(match: ActiveMatch): [MatchTeam, MatchTeam] {
  return [teamFromPlayers(match.id, match.players, 1), teamFromPlayers(match.id, match.players, 2)];
}

function teamFromRecommendation(recommendation: MatchRecommendation, teamNumber: 1 | 2): MatchTeam {
  return teamFromPlayers(recommendationId(recommendation), recommendation.players, teamNumber);
}

function teamFromPlayers(
  idPrefix: string,
  players: Array<RecommendationPlayer | ActiveMatchPlayer>,
  teamNumber: 1 | 2
): MatchTeam {
  return {
    id: `${idPrefix}-team-${teamNumber}`,
    players: players
      .filter((player) => player.team_number === teamNumber)
      .sort((first, second) => first.slot_number - second.slot_number)
      .map((player) => ({
        avatarUrl: player.profile_image_path ? publicProfileImageUrl(player.profile_image_path) : null,
        id: player.player_id,
        name: player.name
      }))
  };
}
