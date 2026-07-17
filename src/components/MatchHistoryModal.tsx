import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../design/theme";
import type { ActiveMatchPlayer, CompletedMatch } from "../types/matchFlow";
import { ActionButton } from "./ActionButton";

type MatchHistoryModalProps = {
  matches: CompletedMatch[];
  onClose: () => void;
  onEditMatch: (match: CompletedMatch) => void;
  visible: boolean;
};

export function MatchHistoryModal({ matches, onClose, onEditMatch, visible }: MatchHistoryModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View
        accessibilityViewIsModal
        style={[
          styles.screen,
          {
            paddingBottom: insets.bottom + theme.space[20],
            paddingTop: insets.top + theme.space[20]
          }
        ]}
      >
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Match history
          </Text>
          <ActionButton label="Close" onPress={onClose} variant="text" />
        </View>
        <ScrollView
          contentContainerStyle={styles.matchList}
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
        >
          {matches.map((match) => (
            <HistoryMatch key={match.id} match={match} onEdit={() => onEditMatch(match)} />
          ))}
          {matches.length === 0 ? (
            <Text accessibilityLiveRegion="polite" style={styles.emptyText}>
              Completed matches will appear here.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function HistoryMatch({ match, onEdit }: { match: CompletedMatch; onEdit: () => void }) {
  const teamOneNames = teamNames(match.players, 1);
  const teamTwoNames = teamNames(match.players, 2);
  const winningTeam = winner(match.team_one_score, match.team_two_score);
  const matchDate = formatMatchDate(match.completed_at ?? match.started_at);

  return (
    <View
      accessible={false}
      accessibilityRole="summary"
      style={styles.match}
    >
      <View style={styles.matchMetadata}>
        <Text style={styles.matchDate}>{matchDate}</Text>
        <ActionButton
          accessibilityLabel={`Edit score for match completed ${matchDate}`}
          label="Edit"
          onPress={onEdit}
          variant="text"
        />
      </View>
      <View style={styles.teams}>
        <HistoryTeam names={teamOneNames} score={match.team_one_score} winner={winningTeam === 1} />
        <HistoryTeam names={teamTwoNames} score={match.team_two_score} winner={winningTeam === 2} />
      </View>
    </View>
  );
}

function HistoryTeam({ names, score, winner: isWinner }: { names: string; score: number | null; winner: boolean }) {
  const visibleScore = scoreText(score);

  return (
    <View
      accessibilityLabel={`${names}, ${visibleScore}${isWinner ? ", winner" : ""}`}
      accessible
      style={styles.teamRow}
    >
      <View style={styles.teamIdentity}>
        <Text style={styles.teamNames}>{names}</Text>
      </View>
      <View style={styles.scoreGroup}>
        <Text style={[styles.score, isWinner ? styles.winningScore : null]}>{visibleScore}</Text>
      </View>
    </View>
  );
}

function teamNames(players: ActiveMatchPlayer[], teamNumber: 1 | 2) {
  return players
    .filter((player) => player.team_number === teamNumber)
    .sort((first, second) => first.slot_number - second.slot_number)
    .map((player) => player.name)
    .join(" & ");
}

function winner(teamOneScore: number | null, teamTwoScore: number | null): 1 | 2 | null {
  if (teamOneScore === null || teamTwoScore === null || teamOneScore === teamTwoScore) {
    return null;
  }

  return teamOneScore > teamTwoScore ? 1 : 2;
}

function scoreText(score: number | null) {
  return score === null ? "--" : String(score);
}

function formatMatchDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short"
  });
}

const styles = StyleSheet.create({
  emptyText: {
    ...theme.type.bodyDefault,
    color: theme.color.text.secondary,
    paddingVertical: theme.layout.sectionGap
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  match: {
    ...theme.shadow.card,
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
    padding: theme.layout.cardPadding
  },
  matchDate: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  matchList: {
    gap: theme.layout.sectionGap,
    paddingBottom: theme.layout.sectionGap
  },
  matchMetadata: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: theme.size.targetMinimum
  },
  score: {
    ...theme.type.metricRecord,
    color: theme.color.text.primary,
    includeFontPadding: false
  },
  scoreGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.space[4]
  },
  scrollView: {
    flex: 1
  },
  screen: {
    backgroundColor: theme.color.surface.canvas,
    flex: 1,
    gap: theme.layout.sectionGap,
    paddingHorizontal: theme.layout.screenInset
  },
  teamIdentity: {
    flex: 1,
    gap: theme.space[2],
    minWidth: 0
  },
  teamNames: {
    ...theme.type.titleCard,
    color: theme.color.text.primary,
    flexShrink: 1
  },
  teamRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.inlineDefault,
    justifyContent: "space-between"
  },
  teams: {
    gap: theme.layout.stackCompact
  },
  title: {
    ...theme.type.headingPage,
    color: theme.color.text.primary
  },
  winningScore: {
    color: theme.color.text.selected
  }
});
