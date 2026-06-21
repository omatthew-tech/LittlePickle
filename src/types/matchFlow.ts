export type OrganizationSnapshot = {
  id: string;
  number_of_courts: number;
};

export type SessionSnapshot = {
  id: string;
  status: string;
  current_round: number;
};

export type PlayerSnapshot = {
  id: string;
  name: string;
  skill: number;
  profile_image_path: string | null;
  rounds_waiting: number;
  queue_position: number;
  games_played: number;
};

export type SessionPlayerOption = {
  id: string;
  name: string;
  skill: number;
  profile_image_path: string | null;
  in_session: boolean;
  is_playing: boolean;
  rounds_waiting: number;
  queue_position: number | null;
  games_played: number;
};

export type RecommendationSnapshot = {
  organization: OrganizationSnapshot;
  session: SessionSnapshot;
  players: PlayerSnapshot[];
};

export type RecommendationPlayer = {
  player_id: string;
  team_number: 1 | 2;
  slot_number: 1 | 2;
  name: string;
  skill: number;
  profile_image_path: string | null;
  rounds_waiting: number;
  queue_position: number;
  games_played: number;
};

export type ActiveMatchPlayer = {
  player_id: string;
  team_number: 1 | 2;
  slot_number: 1 | 2;
  name: string;
  skill: number;
  profile_image_path: string | null;
};

export type ActiveMatch = {
  id: string;
  court_number: number | null;
  started_at: string;
  players: ActiveMatchPlayer[];
};

export type ActiveMatchesResponse = {
  session_id: string;
  matches: ActiveMatch[];
};

export type CompletedMatch = {
  id: string;
  court_number: number | null;
  started_at: string;
  completed_at: string | null;
  team_one_score: number | null;
  team_two_score: number | null;
  players: ActiveMatchPlayer[];
};

export type CompletedMatchesResponse = {
  session_id: string;
  matches: CompletedMatch[];
};

export type MatchRecommendation = {
  id: string | null;
  rank: number;
  court_number: number | null;
  quality_score: number;
  team_average_skill_difference: number;
  player_skill_spread: number;
  predicted_team_one_win_probability: number;
  fairness_score: number;
  players: RecommendationPlayer[];
};

export type RecommendationResponse = {
  algorithm_version: string | null;
  session_id: string;
  recommendation_count: number;
  recommendations: MatchRecommendation[];
  batch_id: string | null;
};

export type CompleteMatchRequest = {
  team_one_score: number;
  team_two_score: number;
};

export type PassPlayerRequest = {
  session_id: string;
  player_id: string;
};

export type AcceptRecommendationRequest = {
  court_number?: number | null;
};

export type AcceptRecommendationResponse = {
  match_id: string;
};
