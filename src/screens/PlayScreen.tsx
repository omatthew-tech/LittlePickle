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
    errorMessage,
    live,
    loading,
    passRecommendedPlayer,
    players,
    recommendations,
    refresh,
    sessionEnded,
    startRecommendedMatch
  } = usePlaySession(sessionId);
  const [customScoreOpen, setCustomScoreOpen] = useState(false);
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

  async function handleSubmitScore(teamOneScore: number, teamTwoScore: number) {
    if (!scoreMatchId) {
      return;
    }

    const matchId = scoreMatchId;
    setScoreMatchId(null);
    await completeActiveMatch(matchId, teamOneScore, teamTwoScore);
  }

  function handleSelectCustomScoreMatch(matchId: string) {
    setCustomScoreOpen(false);
    setScoreMatchId(matchId);
  }

  function handleOpenMatchHistory() {
    setMatchHistoryOpen(true);
    void refresh();
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: theme.size.navigationBottomHeight + insets.bottom + theme.layout.sectionGap,
          paddingTop: insets.top + theme.space[20]
        }
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={styles.pageTitle}>
        Recommended matches
      </Text>
      <View accessibilityLabel="Play actions" style={styles.quickActions}>
        <ActionButton
          accessibilityLabel="Enter a custom score"
          icon="score"
          label="Custom score"
          onPress={() => setCustomScoreOpen(true)}
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
      {errorMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}
      {loading ? <ActivityIndicator color={theme.color.action.primary} style={styles.loading} /> : null}
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
            onReportScore={(matchId) => setScoreMatchId(matchId)}
            playerAction="none"
            primaryActionLabel="Report score"
            primaryActionTone="pickleLeaf"
            teams={activeMatchTeams(match)}
          />
        ))}
      </View>

      {scoreMatchTeams ? (
        <ScoreReportModal
          onClose={() => setScoreMatchId(null)}
          onSubmit={handleSubmitScore}
          teams={scoreMatchTeams}
          visible
        />
      ) : null}
      <CustomScoreModal
        matches={activeMatches}
        onClose={() => setCustomScoreOpen(false)}
        onSelectMatch={handleSelectCustomScoreMatch}
        visible={customScoreOpen}
      />
      <MatchHistoryModal
        matches={completedMatches}
        onClose={() => setMatchHistoryOpen(false)}
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
