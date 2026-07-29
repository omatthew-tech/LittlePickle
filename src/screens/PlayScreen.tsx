import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../components/ActionButton";
import { CustomScoreModal } from "../components/CustomScoreModal";
import { MatchCard } from "../components/MatchCard";
import { MatchHistoryModal } from "../components/MatchHistoryModal";
import { ScoreReportModal } from "../components/ScoreReportModal";
import { theme } from "../design/theme";
import {
  activeMatchLabel,
  activeMatchTeams,
  recommendationId,
  recommendationLabel,
  recommendationTeams
} from "../lib/matchRecommendationMapping";
import { playerDisplayNames } from "../lib/playerDisplayNames";
import { usePlaySession } from "../lib/usePlaySession";
import type { CompletedMatch, MatchResultInput } from "../types/matchFlow";

type PlayScreenProps = {
  currentPlayerId?: string | null;
  onSessionEnded?: () => void;
  sessionId?: string | null;
};

export function PlayScreen({ currentPlayerId = null, onSessionEnded, sessionId }: PlayScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    activeMatches,
    canStartRecommendedMatch,
    completedMatches,
    completeActiveMatch,
    editCompletedMatchResult,
    errorMessage,
    live,
    loading,
    passRecommendedPlayer,
    players,
    recommendations,
    recordCustomMatch,
    refresh,
    refreshScoreMode,
    scoreModeEnabled,
    sessionEnded,
    startRecommendedMatch
  } = usePlaySession(sessionId);
  const [customScoreOpen, setCustomScoreOpen] = useState(false);
  const [historyEditMatchId, setHistoryEditMatchId] = useState<string | null>(null);
  const [matchHistoryOpen, setMatchHistoryOpen] = useState(false);
  const [scoreMatchId, setScoreMatchId] = useState<string | null>(null);
  const displayNamesByPlayerId = useMemo(
    () => playerDisplayNames(players, currentPlayerId),
    [currentPlayerId, players]
  );
  const scoreMatchTeams = useMemo(() => {
    const scoreMatch = activeMatches.find((match) => match.id === scoreMatchId);

    return scoreMatch ? activeMatchTeams(scoreMatch, displayNamesByPlayerId) : null;
  }, [activeMatches, displayNamesByPlayerId, scoreMatchId]);
  const historyEditMatch = useMemo(
    () => completedMatches.find((match) => match.id === historyEditMatchId) ?? null,
    [completedMatches, historyEditMatchId]
  );
  const historyEditTeams = useMemo(
    () => historyEditMatch ? activeMatchTeams(historyEditMatch, displayNamesByPlayerId) : null,
    [displayNamesByPlayerId, historyEditMatch]
  );
  const showQuickActions =
    recommendations.length > 0 || activeMatches.length > 0 || completedMatches.length > 0;
  const queuedPlayerCount = players.filter((player) => player.inSession && !player.isPlaying).length;
  const playersNeededForMatch =
    queuedPlayerCount > 0 && queuedPlayerCount < 4 ? 4 - queuedPlayerCount : 0;

  useEffect(() => {
    if (sessionEnded) {
      onSessionEnded?.();
    }
  }, [onSessionEnded, sessionEnded]);

  async function handlePassPlayer(matchId: string, playerId: string) {
    if (!live) {
      Alert.alert("Pass", `Passed on ${friendlyPlayerName(playerId)}.`);
      return;
    }

    await passRecommendedPlayer(matchId, playerId);
  }

  async function handleStartMatch(matchId: string) {
    if (!live) {
      Alert.alert("Start match", "Match starting will connect to Supabase once live session data is configured.");
      return;
    }

    if (!canStartRecommendedMatch) {
      Alert.alert("Courts full", "Report a score before starting another match.");
      return;
    }

    await startRecommendedMatch(matchId);
  }

  async function handleSubmitResult(result: MatchResultInput) {
    if (!scoreMatchId) {
      return false;
    }

    const saved = await completeActiveMatch(scoreMatchId, result);

    if (saved) {
      setScoreMatchId(null);
      return true;
    }

    Alert.alert(
      "Result not saved",
      "The league's score mode may have changed. The form has been refreshed; review it and try again."
    );
    return false;
  }

  async function handleOpenResult(matchId: string) {
    const latestMode = await refreshScoreMode();

    if (latestMode === null) {
      Alert.alert("Could not open result", "Check your connection and try again.");
      return;
    }

    setScoreMatchId(matchId);
  }

  async function handleOpenCustomScore() {
    const latestMode = await refreshScoreMode();

    if (latestMode === null) {
      Alert.alert("Could not open custom match", "Check your connection and try again.");
      return;
    }

    setCustomScoreOpen(true);
  }

  async function handleOpenMatchHistory() {
    const latestMode = await refreshScoreMode();

    if (latestMode === null) {
      Alert.alert("Could not open match history", "Check your connection and try again.");
      return;
    }

    await refresh();
    setMatchHistoryOpen(true);
  }

  async function handleEditHistoryMatch(match: CompletedMatch) {
    const latestMode = await refreshScoreMode();

    if (latestMode === null) {
      Alert.alert("Could not edit result", "Check your connection and try again.");
      return;
    }

    setMatchHistoryOpen(false);
    setHistoryEditMatchId(match.id);
  }

  function handleCloseHistoryEdit() {
    setHistoryEditMatchId(null);
    setMatchHistoryOpen(true);
  }

  async function handleSubmitHistoryEdit(result: MatchResultInput) {
    if (!historyEditMatchId) {
      return false;
    }

    const saved = await editCompletedMatchResult(historyEditMatchId, result);

    if (!saved) {
      Alert.alert(
        "Result not saved",
        "The league's score mode may have changed. The form has been refreshed; review it and try again."
      );
      return false;
    }

    setHistoryEditMatchId(null);
    setMatchHistoryOpen(true);
    return true;
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: theme.size.navigationBottomHeight + insets.bottom + theme.layout.sectionGap,
          paddingTop: insets.top + theme.space[32]
        }
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={styles.pageTitle}>
        Recommended matches
      </Text>
      {showQuickActions ? (
        <View accessibilityLabel="Play actions" style={styles.quickActions}>
          <ActionButton
            accessibilityLabel="Create a custom match"
            icon="score"
            label="Custom match"
            onPress={() => void handleOpenCustomScore()}
            style={styles.quickAction}
            variant="text"
          />
          <View accessibilityElementsHidden importantForAccessibility="no" style={styles.quickActionDivider} />
          <ActionButton
            icon="history"
            label="Match history"
            onPress={handleOpenMatchHistory}
            style={styles.quickAction}
            variant="text"
          />
        </View>
      ) : null}
      {errorMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}
      {loading ? <ActivityIndicator color={theme.color.action.primary} style={styles.loading} /> : null}
      {!loading && playersNeededForMatch > 0 ? (
        <Text accessibilityLiveRegion="polite" style={styles.queueGuidance}>
          Add {playersNeededForMatch} more{" "}
          {playersNeededForMatch === 1 ? "player" : "players"} to start a match
        </Text>
      ) : null}
      <View style={styles.matchList}>
        {recommendations.map((match) => (
          <MatchCard
            courtLabel={recommendationLabel(match)}
            key={recommendationId(match)}
            matchId={recommendationId(match)}
            onPassPlayer={handlePassPlayer}
            onReportScore={handleStartMatch}
            canReportScore={canStartRecommendedMatch}
            primaryActionLabel={canStartRecommendedMatch ? "Start match" : "Courts full"}
            teams={recommendationTeams(match, displayNamesByPlayerId)}
          />
        ))}
        {activeMatches.map((match) => (
          <MatchCard
            courtLabel={activeMatchLabel(match)}
            key={match.id}
            matchId={match.id}
            onPassPlayer={() => undefined}
            onReportScore={(matchId) => void handleOpenResult(matchId)}
            playerAction="none"
            primaryActionLabel="Report score"
            primaryActionTone="pickleLeaf"
            teams={activeMatchTeams(match, displayNamesByPlayerId)}
          />
        ))}
      </View>

      {scoreMatchTeams ? (
        <ScoreReportModal
          onClose={() => setScoreMatchId(null)}
          onSubmit={handleSubmitResult}
          resultMode={scoreModeEnabled ? "score" : "win_loss"}
          teams={scoreMatchTeams}
          visible
        />
      ) : null}
      {historyEditMatch && historyEditTeams ? (
        <ScoreReportModal
          initialTeamOneScore={scoreModeEnabled && historyEditMatch.result_mode === "score" ? historyEditMatch.team_one_score : null}
          initialTeamTwoScore={scoreModeEnabled && historyEditMatch.result_mode === "score" ? historyEditMatch.team_two_score : null}
          initialWinningTeam={!scoreModeEnabled ? historyEditMatch.winning_team : null}
          onClose={handleCloseHistoryEdit}
          onSubmit={handleSubmitHistoryEdit}
          resultMode={scoreModeEnabled ? "score" : "win_loss"}
          teams={historyEditTeams}
          title={scoreModeEnabled ? "Edit score" : "Edit result"}
          visible
        />
      ) : null}
      <CustomScoreModal
        currentPlayerId={currentPlayerId}
        onClose={() => setCustomScoreOpen(false)}
        onSubmit={recordCustomMatch}
        players={players}
        resultMode={scoreModeEnabled ? "score" : "win_loss"}
        visible={customScoreOpen}
      />
      <MatchHistoryModal
        matches={completedMatches}
        onClose={() => setMatchHistoryOpen(false)}
        onEditMatch={(match) => void handleEditHistoryMatch(match)}
        scoreModeEnabled={scoreModeEnabled}
        visible={matchHistoryOpen}
      />
    </ScrollView>
  );
}

function friendlyPlayerName(playerId: string) {
  return playerId
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: theme.color.surface.canvas,
    flexGrow: 1,
    paddingHorizontal: theme.layout.screenInset
  },
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error,
    marginTop: theme.space[8]
  },
  loading: {
    marginTop: theme.layout.stackDefault
  },
  matchList: {
    gap: theme.layout.stackCompact,
    marginTop: theme.layout.sectionGap
  },
  pageTitle: {
    ...theme.type.headingPage,
    color: theme.color.text.primary
  },
  queueGuidance: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary,
    marginTop: theme.layout.stackDefault
  },
  quickAction: {
    flex: 1,
    minHeight: theme.size.navigationBottomHeight,
    paddingHorizontal: theme.space[8]
  },
  quickActionDivider: {
    alignSelf: "center",
    backgroundColor: theme.color.border.subtle,
    height: theme.space[40],
    width: theme.border.quiet
  },
  quickActions: {
    backgroundColor: theme.color.surface.info,
    borderRadius: theme.radius.control,
    flexDirection: "row",
    marginTop: theme.layout.sectionGap,
    overflow: "hidden"
  }
});
