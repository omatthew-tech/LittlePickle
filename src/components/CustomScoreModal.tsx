import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../design/theme";
import type { ActiveMatch, ActiveMatchPlayer } from "../types/matchFlow";
import { ActionButton } from "./ActionButton";

type CustomScoreModalProps = {
  matches: ActiveMatch[];
  onClose: () => void;
  onSelectMatch: (matchId: string) => void;
  visible: boolean;
};

export function CustomScoreModal({ matches, onClose, onSelectMatch, visible }: CustomScoreModalProps) {
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
            Custom score
          </Text>
          <ActionButton label="Close" onPress={onClose} variant="text" />
        </View>
        <Text style={styles.helpText}>Choose an active match, then enter the final score.</Text>
        <ScrollView contentContainerStyle={styles.matchList} showsVerticalScrollIndicator={false}>
          {matches.map((match) => (
            <View key={match.id} style={styles.matchRow}>
              <View style={styles.matchIdentity}>
                <Text style={styles.matchLabel}>{match.court_number ? `Court ${match.court_number}` : "Active match"}</Text>
                <Text style={styles.teamNames}>{teamNames(match.players, 1)}</Text>
                <Text style={styles.versus}>vs {teamNames(match.players, 2)}</Text>
              </View>
              <ActionButton
                accessibilityLabel={`Enter score for ${match.court_number ? `court ${match.court_number}` : "active match"}`}
                label="Enter score"
                onPress={() => onSelectMatch(match.id)}
                variant="text"
              />
            </View>
          ))}
          {matches.length === 0 ? (
            <Text accessibilityLiveRegion="polite" style={styles.emptyText}>
              Start a match before entering a custom score.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function teamNames(players: ActiveMatchPlayer[], teamNumber: 1 | 2) {
  return players
    .filter((player) => player.team_number === teamNumber)
    .sort((first, second) => first.slot_number - second.slot_number)
    .map((player) => player.name)
    .join(" + ");
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
  helpText: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  matchIdentity: {
    flex: 1,
    gap: theme.space[4],
    minWidth: 0
  },
  matchLabel: {
    ...theme.type.metricDetail,
    color: theme.color.text.secondary
  },
  matchList: {
    paddingBottom: theme.layout.sectionGap
  },
  matchRow: {
    alignItems: "center",
    borderBottomColor: theme.color.border.subtle,
    borderBottomWidth: theme.border.quiet,
    flexDirection: "row",
    gap: theme.layout.inlineDefault,
    minHeight: theme.size.playerRowMinimumHeight,
    paddingVertical: theme.space[12]
  },
  screen: {
    backgroundColor: theme.color.surface.canvas,
    flex: 1,
    gap: theme.layout.stackDefault,
    paddingHorizontal: theme.layout.screenInset
  },
  teamNames: {
    ...theme.type.titleCard,
    color: theme.color.text.primary
  },
  title: {
    ...theme.type.headingPage,
    color: theme.color.text.primary
  },
  versus: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  }
});
