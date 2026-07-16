import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../components/ActionButton";
import { MatchCard } from "../components/MatchCard";
import { ScoreReportModal } from "../components/ScoreReportModal";
import { theme } from "../design/theme";
import {
  activeMatchLabel,
  activeMatchTeams,
  recommendationId,
  recommendationLabel,
  recommendationTeams
} from "../lib/matchRecommendationMapping";
import { usePlaySession } from "../lib/usePlaySession";

type PlayScreenProps = {
  onSessionEnded?: () => void;
  sessionId?: string | null;
};

export function PlayScreen({ onSessionEnded, sessionId }: PlayScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    activeMatches,
    canStartRecommendedMatch,
    completeActiveMatch,
    courtCount,
    errorMessage,
    live,
    loading,
    passRecommendedPlayer,
    recommendations,
    refresh,
    sessionEnded,
    startRecommendedMatch
  } = usePlaySession(sessionId);
  const [scoreMatchId, setScoreMatchId] = useState<string | null>(null);

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

  const scoreMatch = activeMatches.find((match) => match.id === scoreMatchId) ?? null;

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
      {live && courtCount ? (
        <Text style={styles.sessionMeta}>
          {activeMatches.length}/{courtCount} courts active
        </Text>
      ) : null}
      {errorMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}
      {loading ? <ActivityIndicator color={theme.color.action.primary} style={styles.loading} /> : null}
      {activeMatches.length > 0 ? (
        <View style={styles.activeSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Active matches
          </Text>
          <View style={styles.matchList}>
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
        </View>
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
            teams={recommendationTeams(match)}
          />
        ))}
      </View>

      {live ? (
        <View style={styles.playersSection}>
          <ActionButton
            icon="history"
            label="Refresh recommendations"
            onPress={() => void refresh()}
            variant="text"
          />
        </View>
      ) : null}
      <ScoreReportModal
        matchLabel={scoreMatch ? activeMatchLabel(scoreMatch) : "Active match"}
        onClose={() => setScoreMatchId(null)}
        onSubmit={handleSubmitScore}
        visible={Boolean(scoreMatchId)}
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
  activeSection: {
    marginTop: theme.layout.sectionGap
  },
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
    marginTop: theme.layout.stackDefault
  },
  pageTitle: {
    ...theme.type.headingPage,
    color: theme.color.text.primary
  },
  playersSection: {
    gap: theme.layout.stackDefault,
    marginTop: theme.layout.sectionGap
  },
  sectionTitle: {
    ...theme.type.headingSection,
    color: theme.color.text.primary
  },
  sessionMeta: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary,
    marginTop: theme.space[4]
  }
});
