import type { MatchTeam } from "../components/MatchCard";

export type Player = {
  id: string;
  name: string;
  initials: string;
};

export const recommendedMatch = {
  id: "match-rose-park-630",
  teams: [
    {
      id: "team-a",
      players: [
        { id: "maya-chen", name: "Maya Chen" },
        { id: "jules-parker", name: "Jules Parker" }
      ]
    },
    {
      id: "team-b",
      players: [
        { id: "alex-morgan", name: "Alex Morgan" },
        { id: "sam-rivera", name: "Sam Rivera" }
      ]
    }
  ] as [MatchTeam, MatchTeam]
};

export const currentPlayers: Player[] = [
  { id: "maya-chen", name: "Maya Chen", initials: "MC" },
  { id: "jules-parker", name: "Jules Parker", initials: "JP" },
  { id: "alex-morgan", name: "Alex Morgan", initials: "AM" },
  { id: "sam-rivera", name: "Sam Rivera", initials: "SR" },
  { id: "nina-patel", name: "Nina Patel", initials: "NP" },
  { id: "ben-walker", name: "Ben Walker", initials: "BW" }
];
