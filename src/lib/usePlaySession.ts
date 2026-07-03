import { useCallback, useEffect, useMemo, useState } from "react";
import { currentPlayers as samplePlayers, recommendedMatches as sampleRecommendations, type Player } from "../data/sampleClub";
import {
  addPlayerToSession,
  closePlaySession,
  getActiveMatches,
  getActiveRecommendations,
  getCompletedMatches,
  getSessionPlayerOptions,
  getSessionRecommendationSnapshot,
  removePlayerFromSession
} from "./littlePickleData";
import {
  acceptRecommendation,
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
  CompletedMatch,
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
  canStartRecommendedMatch: boolean;
  completedMatches: CompletedMatch[];
  completeActiveMatch: (matchId: string, teamOneScore: number, teamTwoScore: number) => Promise<void>;
  closeSession: () => Promise<boolean>;
  courtCount: number | null;
  live: boolean;
  loading: boolean;
  players: Player[];
  recommendations: MatchRecommendation[];
  refresh: () => Promise<void>;
  setPlayerInSession: (playerId: string, inSession: boolean) => Promise<void>;
  startRecommendedMatch: (recommendationId: string) => Promise<void>;
  passRecommendedPlayer: (recommendationId: string, playerId: string) => Promise<void>;
};

export function usePlaySession(sessionId?: string | null): PlaySessionState {
  const resolvedSessionId = sessionId ?? defaultSessionId ?? null;
  const liveEnabled = Boolean(isSupabaseConfigured && resolvedSessionId);
  const needsLiveSession = Boolean(isSupabaseConfigured && !resolvedSessionId);
  const [loading, setLoading] = useState(liveEnabled);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([]);
  const [courtCount, setCourtCount] = useState<number | null>(null);
  const [completedMatches, setCompletedMatches] = useState<CompletedMatch[]>([]);
  const [recommendations, setRecommendations] = useState<MatchRecommendation[]>(sampleRecommendations);
  const [players, setPlayers] = useState<Player[]>(samplePlayers);
  const canStartRecommendedMatch = !liveEnabled || courtCount === null || activeMatches.length < courtCount;

  const refresh = useCallback(async () => {
    if (needsLiveSession) {
      setRecommendations([]);
      setActiveMatches([]);
      setCourtCount(null);
      setCompletedMatches([]);
      setPlayers([]);
      setErrorMessage("Join a league queue from Home.");
      setLoading(false);
      return;
    }

    if (!liveEnabled || !resolvedSessionId) {
      setRecommendations(sampleRecommendations);
      setActiveMatches([]);
      setCourtCount(null);
      setCompletedMatches([]);
      setPlayers(samplePlayers);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const sessionData = await loadSessionData(resolvedSessionId);

      setRecommendations(sessionData.recommendationResponse.recommendations);
      setActiveMatches(sessionData.matches.matches);
      setCourtCount(sessionData.courtCount);
      setCompletedMatches(sessionData.completed.matches);
      setPlayers(sessionData.playerOptions.length > 0 ? sessionData.playerOptions.map(playerFromOption) : sessionData.snapshot.players.map(playerFromSnapshot));
      setErrorMessage(sessionData.warningMessage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load play session.");
      setRecommendations([]);
      setActiveMatches([]);
      setCourtCount(null);
      setCompletedMatches([]);
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, [liveEnabled, needsLiveSession, resolvedSessionId, matchFlowApiConfigKey]);

  const passRecommendedPlayer = useCallback(
    async (recommendationId: string, playerId: string) => {
      if (!liveEnabled || !resolvedSessionId) {
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
    [liveEnabled, resolvedSessionId]
  );

  const setPlayerInSession = useCallback(
    async (playerId: string, inSession: boolean) => {
      if (!liveEnabled || !resolvedSessionId) {
        setPlayers((previousPlayers) =>
          previousPlayers.map((player) =>
            player.id === playerId ? { ...player, inSession } : player
          )
        );
        return;
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
          setRecommendations
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not update player queue.");
      }
    },
    [liveEnabled, resolvedSessionId]
  );

  const startRecommendedMatch = useCallback(
    async (recommendationId: string) => {
      if (!liveEnabled || !resolvedSessionId) {
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
        await refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not start match.");
      }
    },
    [activeMatches.length, courtCount, liveEnabled, refresh, resolvedSessionId]
  );

  const completeActiveMatch = useCallback(
    async (matchId: string, teamOneScore: number, teamTwoScore: number) => {
      if (!liveEnabled || !resolvedSessionId) {
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
    [liveEnabled, resolvedSessionId]
  );

  const closeSession = useCallback(async () => {
    if (!liveEnabled || !resolvedSessionId) {
      return false;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await closePlaySession(resolvedSessionId);
      setActiveMatches([]);
      setCourtCount(null);
      setCompletedMatches([]);
      setRecommendations([]);
      setPlayers([]);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not close session.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [liveEnabled, resolvedSessionId]);

  useEffect(() => {
    setErrorMessage(null);
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      activeMatches,
      canStartRecommendedMatch,
      closeSession,
      completedMatches,
      completeActiveMatch,
      courtCount,
      errorMessage,
      live: liveEnabled,
      loading,
      passRecommendedPlayer,
      players,
      recommendations,
      refresh,
      setPlayerInSession,
      startRecommendedMatch
    }),
    [
      activeMatches,
      canStartRecommendedMatch,
      closeSession,
      completedMatches,
      completeActiveMatch,
      courtCount,
      errorMessage,
      liveEnabled,
      loading,
      passRecommendedPlayer,
      players,
      recommendations,
      refresh,
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
};

async function reloadAfterRosterChange(sessionId: string, setters: RosterSetters) {
  const sessionData = await loadSessionData(sessionId);

  setters.setRecommendations(sessionData.recommendationResponse.recommendations);
  setters.setActiveMatches(sessionData.matches.matches);
  setters.setCourtCount(sessionData.courtCount);
  setters.setCompletedMatches(sessionData.completed.matches);
  setters.setPlayers(sessionData.playerOptions.length > 0 ? sessionData.playerOptions.map(playerFromOption) : sessionData.snapshot.players.map(playerFromSnapshot));
}

type LoadedSessionData = {
  completed: Awaited<ReturnType<typeof getCompletedMatches>>;
  courtCount: number;
  matches: Awaited<ReturnType<typeof getActiveMatches>>;
  playerOptions: SessionPlayerOption[];
  recommendationResponse: RecommendationResponse;
  snapshot: RecommendationSnapshot;
  warningMessage: string | null;
};

async function loadSessionData(sessionId: string): Promise<LoadedSessionData> {
  const [activeRecommendations, snapshot, matches, completed, playerOptions] = await Promise.all([
    getActiveRecommendations(sessionId),
    getSessionRecommendationSnapshot(sessionId),
    getActiveMatches(sessionId),
    getCompletedMatches(sessionId),
    getSessionPlayerOptions(sessionId)
  ]);

  const courtCount = snapshot.organization.number_of_courts;
  const hasOpenCourt = matches.matches.length < courtCount;

  if (activeRecommendations.recommendations.length > 0 || !isMatchFlowApiConfigured || !hasOpenCourt) {
    return {
      completed,
      courtCount,
      matches,
      playerOptions,
      recommendationResponse: activeRecommendations,
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
      recommendationResponse: regeneratedRecommendations,
      snapshot,
      warningMessage: null
    };
  } catch (error) {
    return {
      completed,
      courtCount,
      matches,
      playerOptions,
      recommendationResponse: activeRecommendations,
      snapshot,
      warningMessage: error instanceof Error ? error.message : "Could not refresh recommended matches."
    };
  }
}

function playerFromSnapshot(player: PlayerSnapshot): Player {
  return {
    avatarUrl: player.profile_image_path ? publicProfileImageUrl(player.profile_image_path) : null,
    id: player.id,
    inSession: true,
    initials: initialsFor(player.name),
    name: player.name,
    skill: player.skill
  };
}

function playerFromOption(player: SessionPlayerOption): Player {
  return {
    avatarUrl: player.profile_image_path ? publicProfileImageUrl(player.profile_image_path) : null,
    id: player.id,
    inSession: player.in_session,
    initials: initialsFor(player.name),
    isPlaying: player.is_playing,
    name: player.name,
    skill: player.skill
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
