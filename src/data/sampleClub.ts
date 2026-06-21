import type { MatchRecommendation } from "../types/matchFlow";

export type Player = {
  avatarUrl?: string | null;
  id: string;
  inSession?: boolean;
  name: string;
  initials: string;
  isPlaying?: boolean;
  skill?: number;
};

export const recommendedMatches: MatchRecommendation[] = [
  {
    id: "recommendation-rose-park-1",
    rank: 1,
    court_number: null,
    quality_score: 0.06,
    team_average_skill_difference: 0.05,
    player_skill_spread: 0.3,
    predicted_team_one_win_probability: 0.54,
    fairness_score: 46,
    players: [
      recommendationPlayer("maya-chen", "Maya Chen", 1, 1, 3.6, 1, 0),
      recommendationPlayer("jules-parker", "Jules Parker", 1, 2, 3.5, 1, 1),
      recommendationPlayer("alex-morgan", "Alex Morgan", 2, 1, 3.7, 0, 2),
      recommendationPlayer("sam-rivera", "Sam Rivera", 2, 2, 3.4, 0, 3)
    ]
  },
  {
    id: "recommendation-rose-park-2",
    rank: 2,
    court_number: null,
    quality_score: 0.11,
    team_average_skill_difference: 0.1,
    player_skill_spread: 0.6,
    predicted_team_one_win_probability: 0.57,
    fairness_score: 38,
    players: [
      recommendationPlayer("nina-patel", "Nina Patel", 1, 1, 4.1, 0, 4),
      recommendationPlayer("ben-walker", "Ben Walker", 1, 2, 3.9, 0, 5),
      recommendationPlayer("maya-chen", "Maya Chen", 2, 1, 3.6, 1, 0),
      recommendationPlayer("jules-parker", "Jules Parker", 2, 2, 3.5, 1, 1)
    ]
  },
  {
    id: "recommendation-rose-park-3",
    rank: 3,
    court_number: null,
    quality_score: 0.14,
    team_average_skill_difference: 0.15,
    player_skill_spread: 0.7,
    predicted_team_one_win_probability: 0.61,
    fairness_score: 34,
    players: [
      recommendationPlayer("alex-morgan", "Alex Morgan", 1, 1, 3.7, 0, 2),
      recommendationPlayer("nina-patel", "Nina Patel", 1, 2, 4.1, 0, 4),
      recommendationPlayer("sam-rivera", "Sam Rivera", 2, 1, 3.4, 0, 3),
      recommendationPlayer("ben-walker", "Ben Walker", 2, 2, 3.9, 0, 5)
    ]
  },
  {
    id: "recommendation-rose-park-4",
    rank: 4,
    court_number: null,
    quality_score: 0.18,
    team_average_skill_difference: 0.2,
    player_skill_spread: 0.4,
    predicted_team_one_win_probability: 0.64,
    fairness_score: 32,
    players: [
      recommendationPlayer("maya-chen", "Maya Chen", 1, 1, 3.6, 1, 0),
      recommendationPlayer("sam-rivera", "Sam Rivera", 1, 2, 3.4, 0, 3),
      recommendationPlayer("alex-morgan", "Alex Morgan", 2, 1, 3.7, 0, 2),
      recommendationPlayer("jules-parker", "Jules Parker", 2, 2, 3.5, 1, 1)
    ]
  }
];

export const currentPlayers: Player[] = [
  { id: "maya-chen", inSession: true, name: "Maya Chen", initials: "MC", skill: 3.6 },
  { id: "jules-parker", inSession: true, name: "Jules Parker", initials: "JP", skill: 3.5 },
  { id: "alex-morgan", inSession: true, name: "Alex Morgan", initials: "AM", skill: 3.7 },
  { id: "sam-rivera", inSession: true, name: "Sam Rivera", initials: "SR", skill: 3.4 },
  { id: "nina-patel", inSession: false, name: "Nina Patel", initials: "NP", skill: 4.1 },
  { id: "ben-walker", inSession: false, name: "Ben Walker", initials: "BW", skill: 3.9 }
];

function recommendationPlayer(
  playerId: string,
  name: string,
  teamNumber: 1 | 2,
  slotNumber: 1 | 2,
  skill: number,
  roundsWaiting: number,
  queuePosition: number
) {
  return {
    player_id: playerId,
    team_number: teamNumber,
    slot_number: slotNumber,
    name,
    skill,
    profile_image_path: null,
    rounds_waiting: roundsWaiting,
    queue_position: queuePosition,
    games_played: 0
  };
}
