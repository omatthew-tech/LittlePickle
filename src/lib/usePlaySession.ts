import { useCallback, useEffect, useMemo, useState } from "react";
import { currentPlayers as samplePlayers, recommendedMatches as sampleRecommendations, type Player } from "../data/sampleClub";
import {
  addPlayerToSession,
  createSessionQueuedPlayer,
  getActiveMatches,
  getActiveRecommendations,
  getCompletedMatches,
  getSessionPlayerOptions,
  getSessionRecommendationSnapshot,
  removePlayerFromSession,
  searchLeaguePlayerNames,
  updateCompletedMatchScore as persistCompletedMatchScore,
  type LeaguePlayerNameMatch
} from "./littlePickleData";
import {
  acceptRecommendation,
  completeCustomMatch,
  completeMatch,
  isMatchFlowApiConfigured,
  matchFlowApiConfigKey,
  passPlayer,
  regenerateSessionRecommendations
} from "./matchFlowApi";
import { publicProfileImageUrl } from "./profileImages";
import { isSupabaseConfigured } from "./supabase";
import type {
  ActiveMatch,
  ActiveMatchPlayer,
  CompletedMatch,
  CustomMatchRequest,
  MatchRecommendation,
  PlayerSnapshot,
  RecommendationResponse,
  RecommendationSnapshot,
  SessionPlayerOption
} from "../types/matchFlow";

const defaultSessionId = process.env.EXPO_PUBLIC_DEFAULT_SESSION_ID;

type PlaySessionState = {
  errorMessage: string | null;
  activeMatches: ActiveMatch[];
  addNewPlayerToSession: (displayName: string) => Promise<boolean>;
  canStartRecommendedMatch: boolean;
  completedMatches: CompletedMatch[];
  completeActiveMatch: (matchId: string, teamOneScore: number, teamTwoScore: number) => Promise<void>;
  courtCount: number | null;
  editCompletedMatchScore: (matchId: string, teamOneScore: number, teamTwoScore: number) => Promise<boolean>;
  live: boolean;
  loading: boolean;
  players: Player[];
  recommendations: MatchRecommendation[];
  recordCustomMatch: (request: CustomMatchRequest) => Promise<boolean>;
  refresh: () => Promise<void>;
  sessionEnded: boolean;
  setPlayerInSession: (playerId: string, inSession: boolean) => Promise<boolean>;
  startRecommendedMatch: (recommendationId: string) => Promise<void>;
  passRecommendedPlayer: (recommendationId: string, playerId: string) => Promise<void>;
};

type UsePlaySessionOptions = {
  allowMissingSession?: boolean;
  canManageRoster?: boolean;
  leagueId?: string | null;
  readOnly?: boolean;
};

export function usePlaySession(sessionId?: string | null, options: UsePlaySessionOptions = {}): PlaySessionState {
  const allowMissingSession = Boolean(options.allowMissingSession);
  const canManageRoster = Boolean(options.canManageRoster);
  const leagueId = options.leagueId ?? null;
  const resolvedSessionId = allowMissingSession ? sessionId ?? null : sessionId ?? defaultSessionId ?? null;
  const readOnly = Boolean(options.readOnly);
  const liveEnabled = Boolean(isSupabaseConfigured && resolvedSessionId);
  const needsLiveSession = Boolean(isSupabaseConfigured && !resolvedSessionId);
  const [loading, setLoading] = useState(
    liveEnabled || Boolean(needsLiveSession && allowMissingSession && leagueId)
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([]);
  const [courtCount, setCourtCount] = useState<number | null>(null);
  const [completedMatches, setCompletedMatches] = useState<CompletedMatch[]>([]);
  const [recommendations, setRecommendations] = useState<MatchRecommendation[]>(
    liveEnabled || needsLiveSession ? [] : sampleRecommendations
  );
  const [players, setPlayers] = useState<Player[]>(liveEnabled || needsLiveSession ? [] : samplePlayers);
  const [sessionEnded, setSessionEnded] = useState(false);
  const canStartRecommendedMatch = !liveEnabled || courtCount === null || activeMatches.length < courtCount;

  const refresh = useCallback(async () => {
    if (needsLiveSession) {
      setRecommendations([]);
      setActiveMatches([]);
      setCourtCount(null);
      setCompletedMatches([]);
      setPlayers([]);
      setSessionEnded(false);

      if (!allowMissingSession || !leagueId) {
        setErrorMessage("Join a league queue to view recommended matches");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const leaguePlayers = await searchLeaguePlayerNames(leagueId, "");
        setPlayers(leaguePlayers.map(playerFromLeagueMatch));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not load league players.");
      } finally {
        setLoading(false);
      }

      return;
    }

    if (!liveEnabled || !resolvedSessionId) {
      setRecommendations(sampleRecommendations);
      setActiveMatches([]);
      setCourtCount(null);
      setCompletedMatches([]);
      setPlayers(samplePlayers);
      setSessionEnded(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const sessionData = await loadSessionData(resolvedSessionId, {
        regenerateRecommendations: !readOnly
      });

      setRecommendations(sessionData.recommendationResponse.recommendations);
      setActiveMatches(sessionData.matches.matches);
      setCourtCount(sessionData.courtCount);
      setCompletedMatches(sessionData.completed.matches);
      setPlayers(sessionData.playerOptions.length > 0 ? sessionData.playerOptions.map(playerFromOption) : sessionData.snapshot.players.map(playerFromSnapshot));
      setSessionEnded(sessionData.sessionEnded);
      setErrorMessage(sessionData.warningMessage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load play session.");
      setRecommendations([]);
      setActiveMatches([]);
      setCourtCount(null);
      setCompletedMatches([]);
      setPlayers([]);
      setSessionEnded(false);
    } finally {
      setLoading(false);
    }
  }, [allowMissingSession, leagueId, liveEnabled, needsLiveSession, readOnly, resolvedSessionId, matchFlowApiConfigKey]);

  const passRecommendedPlayer = useCallback(
    async (recommendationId: string, playerId: string) => {
      if (!liveEnabled || !resolvedSessionId) {
        return;
      }

      if (readOnly) {
        setErrorMessage("This queue is view only.");
        return;
      }

      setErrorMessage(null);

      try {
        const response = await passPlayer(recommendationId, {
          player_id: playerId,
          session_id: resolvedSessionId
        });
        const [snapshot, matches, completed, playerOptions] = await Promise.all([
          getSessionRecommendationSnapshot(resolvedSessionId),
          getActiveMatches(resolvedSessionId),
          getCompletedMatches(resolvedSessionId),
          getSessionPlayerOptions(resolvedSessionId)
        ]);
        setRecommendations(response.recommendations);
        setActiveMatches(matches.matches);
        setCourtCount(snapshot.organization.number_of_courts);
        setCompletedMatches(completed.matches);
        setPlayers(playerOptions.length > 0 ? playerOptions.map(playerFromOption) : snapshot.players.map(playerFromSnapshot));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not pass player.");
      }
    },
    [liveEnabled, readOnly, resolvedSessionId]
  );

  const setPlayerInSession = useCallback(
    async (playerId: string, inSession: boolean) => {
      if (readOnly && !canManageRoster) {
        setErrorMessage("This queue is view only.");
        return false;
      }

      if (!liveEnabled || !resolvedSessionId) {
        setPlayers((previousPlayers) =>
          previousPlayers.map((player) =>
            player.id === playerId ? { ...player, inSession } : player
          )
        );
        return true;
      }

      setErrorMessage(null);

      try {
        if (inSession) {
          await addPlayerToSession(resolvedSessionId, playerId);
        } else {
          await removePlayerFromSession(resolvedSessionId, playerId);
        }

        await reloadAfterRosterChange(resolvedSessionId, {
          setActiveMatches,
          setCourtCount,
          setCompletedMatches,
          setPlayers,
          setRecommendations,
          setSessionEnded
        });
        return true;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not update player queue.");
        return false;
      }
    },
    [canManageRoster, liveEnabled, readOnly, resolvedSessionId]
  );

  const addNewPlayerToSession = useCallback(
    async (displayName: string) => {
      const normalizedName = normalizeDisplayName(displayName);

      if (!hasFirstAndLastName(normalizedName)) {
        setErrorMessage("Enter the player's first and last name.");
        return false;
      }

      if (needsLiveSession) {
        setErrorMessage("Join a league queue to view recommended matches");
        return false;
      }

      if (readOnly && !canManageRoster) {
        setErrorMessage("This queue is view only.");
        return false;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        if (!liveEnabled || !resolvedSessionId) {
          setPlayers((previousPlayers) => addDemoPlayer(previousPlayers, normalizedName));
          return true;
        }

        await createSessionQueuedPlayer({
          displayName: normalizedName,
          sessionId: resolvedSessionId
        });

        await reloadAfterRosterChange(resolvedSessionId, {
          setActiveMatches,
          setCourtCount,
          setCompletedMatches,
          setPlayers,
          setRecommendations,
          setSessionEnded
        });
        return true;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not add player to the queue.");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [canManageRoster, liveEnabled, needsLiveSession, readOnly, resolvedSessionId]
  );

  const startRecommendedMatch = useCallback(
    async (recommendationId: string) => {
      if (!liveEnabled || !resolvedSessionId) {
        return;
      }

      if (readOnly) {
        setErrorMessage("This queue is view only.");
        return;
      }

      if (courtCount !== null && activeMatches.length >= courtCount) {
        setErrorMessage("All courts are active. Report a score before starting another match.");
        return;
      }

      if (!isMatchFlowApiConfigured) {
        setErrorMessage("EXPO_PUBLIC_MATCH_FLOW_API_URL is not configured.");
        return;
      }

      setErrorMessage(null);

      try {
        await acceptRecommendation(recommendationId);
        const startedRecommendation = recommendations.find(
          (recommendation) => recommendation.id === recommendationId
        );

        if (startedRecommendation) {
          const startedPlayerIds = new Set(
            startedRecommendation.players.map((player) => player.player_id)
          );
          setRecommendations((previousRecommendations) =>
            recommendationsExcludingPlayerIds(previousRecommendations, startedPlayerIds)
          );
        }

        await refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not start match.");
      }
    },
    [activeMatches.length, courtCount, liveEnabled, readOnly, recommendations, refresh, resolvedSessionId]
  );

  const completeActiveMatch = useCallback(
    async (matchId: string, teamOneScore: number, teamTwoScore: number) => {
      if (!liveEnabled || !resolvedSessionId) {
        return;
      }

      if (readOnly) {
        setErrorMessage("This queue is view only.");
        return;
      }

      if (!isMatchFlowApiConfigured) {
        setErrorMessage("EXPO_PUBLIC_MATCH_FLOW_API_URL is not configured.");
        return;
      }

      setErrorMessage(null);

      try {
        const response = await completeMatch(matchId, {
          team_one_score: teamOneScore,
          team_two_score: teamTwoScore
        });
        const [snapshot, matches, completed, playerOptions] = await Promise.all([
          getSessionRecommendationSnapshot(resolvedSessionId),
          getActiveMatches(resolvedSessionId),
          getCompletedMatches(resolvedSessionId),
          getSessionPlayerOptions(resolvedSessionId)
        ]);
        setRecommendations(response.recommendations);
        setActiveMatches(matches.matches);
        setCourtCount(snapshot.organization.number_of_courts);
        setCompletedMatches(completed.matches);
        setPlayers(playerOptions.length > 0 ? playerOptions.map(playerFromOption) : snapshot.players.map(playerFromSnapshot));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not report score.");
      }
    },
    [liveEnabled, readOnly, resolvedSessionId]
  );

  const editCompletedMatchScore = useCallback(
    async (matchId: string, teamOneScore: number, teamTwoScore: number) => {
      if (!liveEnabled || !resolvedSessionId) {
        setCompletedMatches((previousMatches) =>
          previousMatches.map((match) =>
            match.id === matchId
              ? { ...match, team_one_score: teamOneScore, team_two_score: teamTwoScore }
              : match
          )
        );
        setErrorMessage(null);
        return true;
      }

      if (readOnly) {
        setErrorMessage("This queue is view only.");
        return false;
      }

      setErrorMessage(null);

      try {
        await persistCompletedMatchScore(matchId, teamOneScore, teamTwoScore);
        const completed = await getCompletedMatches(resolvedSessionId);
        setCompletedMatches(completed.matches);
        return true;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not update score.");
        return false;
      }
    },
    [liveEnabled, readOnly, resolvedSessionId]
  );

  const recordCustomMatch = useCallback(
    async (request: CustomMatchRequest) => {
      if (!liveEnabled || !resolvedSessionId) {
        const completedMatch = demoCustomMatch(request, players);

        if (!completedMatch) {
          setErrorMessage("Choose four different players before saving the score.");
          return false;
        }

        const playedPlayerIds = new Set(completedMatch.players.map((player) => player.player_id));
        setCompletedMatches((previousMatches) => [completedMatch, ...previousMatches]);
        setPlayers((previousPlayers) =>
          previousPlayers.map((player) =>
            playedPlayerIds.has(player.id)
              ? { ...player, gamesPlayed: (player.gamesPlayed ?? 0) + 1 }
              : player
          )
        );
        setErrorMessage(null);
        return true;
      }

      if (readOnly) {
        setErrorMessage("This queue is view only.");
        return false;
      }

      if (!isMatchFlowApiConfigured) {
        setErrorMessage("EXPO_PUBLIC_MATCH_FLOW_API_URL is not configured.");
        return false;
      }

      setErrorMessage(null);

      try {
        const response = await completeCustomMatch(resolvedSessionId, request);
        const [snapshot, matches, completed, playerOptions] = await Promise.all([
          getSessionRecommendationSnapshot(resolvedSessionId),
          getActiveMatches(resolvedSessionId),
          getCompletedMatches(resolvedSessionId),
          getSessionPlayerOptions(resolvedSessionId)
        ]);
        setRecommendations(response.recommendations);
        setActiveMatches(matches.matches);
        setCourtCount(snapshot.organization.number_of_courts);
        setCompletedMatches(completed.matches);
        setPlayers(playerOptions.length > 0 ? playerOptions.map(playerFromOption) : snapshot.players.map(playerFromSnapshot));
        return true;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not save custom score.");
        return false;
      }
    },
    [liveEnabled, players, readOnly, resolvedSessionId]
  );

  useEffect(() => {
    setErrorMessage(null);
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      activeMatches,
      addNewPlayerToSession,
      canStartRecommendedMatch,
      completedMatches,
      completeActiveMatch,
      courtCount,
      editCompletedMatchScore,
      errorMessage,
      live: liveEnabled,
      loading,
      passRecommendedPlayer,
      players,
      recommendations,
      recordCustomMatch,
      refresh,
      sessionEnded,
      setPlayerInSession,
      startRecommendedMatch
    }),
    [
      activeMatches,
      addNewPlayerToSession,
      canStartRecommendedMatch,
      completedMatches,
      completeActiveMatch,
      courtCount,
      editCompletedMatchScore,
      errorMessage,
      liveEnabled,
      loading,
      passRecommendedPlayer,
      players,
      recommendations,
      recordCustomMatch,
      refresh,
      sessionEnded,
      setPlayerInSession,
      startRecommendedMatch
    ]
  );
}

type RosterSetters = {
  setActiveMatches: (matches: ActiveMatch[]) => void;
  setCourtCount: (courtCount: number | null) => void;
  setCompletedMatches: (matches: CompletedMatch[]) => void;
  setPlayers: (players: Player[]) => void;
  setRecommendations: (recommendations: MatchRecommendation[]) => void;
  setSessionEnded: (sessionEnded: boolean) => void;
};

async function reloadAfterRosterChange(sessionId: string, setters: RosterSetters) {
  const sessionData = await loadSessionData(sessionId, {
    regenerateRecommendations: true
  });

  setters.setRecommendations(sessionData.recommendationResponse.recommendations);
  setters.setActiveMatches(sessionData.matches.matches);
  setters.setCourtCount(sessionData.courtCount);
  setters.setCompletedMatches(sessionData.completed.matches);
  setters.setPlayers(sessionData.playerOptions.length > 0 ? sessionData.playerOptions.map(playerFromOption) : sessionData.snapshot.players.map(playerFromSnapshot));
  setters.setSessionEnded(sessionData.sessionEnded);
}

type LoadedSessionData = {
  completed: Awaited<ReturnType<typeof getCompletedMatches>>;
  courtCount: number;
  matches: Awaited<ReturnType<typeof getActiveMatches>>;
  playerOptions: SessionPlayerOption[];
  recommendationResponse: RecommendationResponse;
  sessionEnded: boolean;
  snapshot: RecommendationSnapshot;
  warningMessage: string | null;
};

async function loadSessionData(
  sessionId: string,
  options: { regenerateRecommendations: boolean }
): Promise<LoadedSessionData> {
  const [activeRecommendations, snapshot, matches, completed, playerOptions] = await Promise.all([
    getActiveRecommendations(sessionId),
    getSessionRecommendationSnapshot(sessionId),
    getActiveMatches(sessionId),
    getCompletedMatches(sessionId),
    getSessionPlayerOptions(sessionId)
  ]);

  const courtCount = snapshot.organization.number_of_courts;
  const sessionEnded =
    snapshot.session.status !== "open" ||
    !playerOptions.some((player) => player.in_session);

  if (sessionEnded) {
    return {
      completed,
      courtCount,
      matches,
      playerOptions,
      recommendationResponse: emptyRecommendationResponse(activeRecommendations),
      sessionEnded: true,
      snapshot,
      warningMessage: null
    };
  }

  const hasOpenCourt = matches.matches.length < courtCount;
  const availableRecommendations = recommendationsWithoutActivePlayers(
    activeRecommendations,
    matches.matches
  );

  if (
    availableRecommendations.recommendations.length > 0 ||
    !options.regenerateRecommendations ||
    !isMatchFlowApiConfigured ||
    !hasOpenCourt
  ) {
    return {
      completed,
      courtCount,
      matches,
      playerOptions,
      recommendationResponse: availableRecommendations,
      sessionEnded: false,
      snapshot,
      warningMessage: null
    };
  }

  try {
    const regeneratedRecommendations = await regenerateSessionRecommendations(sessionId);

    return {
      completed,
      courtCount,
      matches,
      playerOptions,
      recommendationResponse: recommendationsWithoutActivePlayers(
        regeneratedRecommendations,
        matches.matches
      ),
      sessionEnded: false,
      snapshot,
      warningMessage: null
    };
  } catch (error) {
    return {
      completed,
      courtCount,
      matches,
      playerOptions,
      recommendationResponse: availableRecommendations,
      sessionEnded: false,
      snapshot,
      warningMessage: error instanceof Error ? error.message : "Could not refresh recommended matches."
    };
  }
}

function emptyRecommendationResponse(response: RecommendationResponse): RecommendationResponse {
  return {
    ...response,
    batch_id: null,
    recommendations: []
  };
}

function recommendationsWithoutActivePlayers(
  response: RecommendationResponse,
  activeMatches: ActiveMatch[]
): RecommendationResponse {
  const activePlayerIds = new Set(
    activeMatches.flatMap((match) => match.players.map((player) => player.player_id))
  );

  if (activePlayerIds.size === 0) {
    return response;
  }

  return {
    ...response,
    recommendations: recommendationsExcludingPlayerIds(
      response.recommendations,
      activePlayerIds
    )
  };
}

function recommendationsExcludingPlayerIds(
  recommendations: MatchRecommendation[],
  excludedPlayerIds: Set<string>
) {
  return recommendations.filter((recommendation) =>
    recommendation.players.every((player) => !excludedPlayerIds.has(player.player_id))
  );
}

function playerFromSnapshot(player: PlayerSnapshot): Player {
  return {
    avatarUrl: player.profile_image_path ? publicProfileImageUrl(player.profile_image_path) : null,
    gamesPlayed: player.games_played,
    id: player.id,
    inSession: true,
    initials: initialsFor(player.name),
    name: player.name,
    queuePosition: player.queue_position,
    roundsWaiting: player.rounds_waiting,
    skill: player.skill
  };
}

function playerFromOption(player: SessionPlayerOption): Player {
  return {
    avatarUrl: player.profile_image_path ? publicProfileImageUrl(player.profile_image_path) : null,
    gamesPlayed: player.games_played,
    id: player.id,
    inSession: player.in_session,
    initials: initialsFor(player.name),
    isPlaying: player.is_playing,
    name: player.name,
    queuePosition: player.queue_position,
    roundsWaiting: player.rounds_waiting,
    skill: player.skill
  };
}

function playerFromLeagueMatch(player: LeaguePlayerNameMatch): Player {
  return {
    avatarUrl: player.profile_image_path ? publicProfileImageUrl(player.profile_image_path) : null,
    gamesPlayed: 0,
    id: player.id,
    inSession: false,
    initials: initialsFor(player.display_name),
    isPlaying: false,
    name: player.display_name,
    queuePosition: null,
    roundsWaiting: 0,
    skill: player.rating
  };
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hasFirstAndLastName(value: string) {
  return normalizeDisplayName(value).split(" ").filter(Boolean).length >= 2;
}

function addDemoPlayer(players: Player[], displayName: string) {
  const normalizedName = normalizeDisplayName(displayName);
  const existingPlayer = players.find((player) => normalizeDisplayName(player.name).toLowerCase() === normalizedName.toLowerCase());

  if (existingPlayer) {
    return players.map((player) =>
      player.id === existingPlayer.id ? { ...player, inSession: true } : player
    );
  }

  const idBase = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player";
  const existingIds = new Set(players.map((player) => player.id));
  let id = idBase;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `${idBase}-${suffix}`;
    suffix += 1;
  }

  return [
    ...players,
    {
      id,
      inSession: true,
      initials: initialsFor(normalizedName),
      name: normalizedName,
      skill: 3
    }
  ];
}

function demoCustomMatch(request: CustomMatchRequest, players: Player[]): CompletedMatch | null {
  const playerIds = [...request.team_one_player_ids, ...request.team_two_player_ids];

  if (new Set(playerIds).size !== 4) {
    return null;
  }

  const playersById = new Map(players.map((player) => [player.id, player]));
  const matchPlayers: Array<ActiveMatchPlayer | null> = [
    demoMatchPlayer(playersById, request.team_one_player_ids[0], 1, 1),
    demoMatchPlayer(playersById, request.team_one_player_ids[1], 1, 2),
    demoMatchPlayer(playersById, request.team_two_player_ids[0], 2, 1),
    demoMatchPlayer(playersById, request.team_two_player_ids[1], 2, 2)
  ];

  if (matchPlayers.some((player) => player === null)) {
    return null;
  }

  const completedAt = new Date().toISOString();

  return {
    completed_at: completedAt,
    court_number: null,
    id: `custom-${Date.now()}`,
    players: matchPlayers as ActiveMatchPlayer[],
    started_at: completedAt,
    team_one_score: request.team_one_score,
    team_two_score: request.team_two_score
  };
}

function demoMatchPlayer(
  playersById: Map<string, Player>,
  playerId: string,
  teamNumber: 1 | 2,
  slotNumber: 1 | 2
): ActiveMatchPlayer | null {
  const player = playersById.get(playerId);

  if (!player) {
    return null;
  }

  return {
    name: player.name,
    player_id: player.id,
    profile_image_path: null,
    skill: player.skill ?? 3,
    slot_number: slotNumber,
    team_number: teamNumber
  };
}
