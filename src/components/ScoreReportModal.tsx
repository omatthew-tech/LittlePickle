import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { theme } from "../design/theme";
import type { MatchPlayer, MatchTeam } from "./MatchCard";
import { ActionButton } from "./ActionButton";
import { PlayerRow } from "./PlayerRow";

type ScoreReportModalProps = {
  initialTeamOneScore?: number | null;
  initialTeamTwoScore?: number | null;
  onClose: () => void;
  onSubmit: (teamOneScore: number, teamTwoScore: number) => void;
  teams: [MatchTeam, MatchTeam];
  title?: string;
  visible: boolean;
};

type TeamScorePanelProps = {
  focused: boolean;
  onBlur: () => void;
  onChangeScore: (value: string) => void;
  onFocus: () => void;
  score: string;
  team: MatchTeam;
};

export function ScoreReportModal({
  initialTeamOneScore = null,
  initialTeamTwoScore = null,
  onClose,
  onSubmit,
  teams,
  title = "Report score",
  visible
}: ScoreReportModalProps) {
  const [teamOneScore, setTeamOneScore] = useState("");
  const [teamTwoScore, setTeamTwoScore] = useState("");
  const [focusedTeam, setFocusedTeam] = useState<1 | 2 | null>(null);

  useEffect(() => {
    if (visible) {
      setTeamOneScore(scoreInputValue(initialTeamOneScore));
      setTeamTwoScore(scoreInputValue(initialTeamTwoScore));
      setFocusedTeam(null);
    }
  }, [initialTeamOneScore, initialTeamTwoScore, visible]);

  const parsedTeamOneScore = Number.parseInt(teamOneScore, 10);
  const parsedTeamTwoScore = Number.parseInt(teamTwoScore, 10);
  const canSubmit =
    teamOneScore.length > 0 &&
    teamTwoScore.length > 0 &&
    Number.isInteger(parsedTeamOneScore) &&
    Number.isInteger(parsedTeamTwoScore);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View pointerEvents="none" style={styles.backdropTint} />
        <ScrollView
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
        >
          <View accessibilityViewIsModal style={styles.dialog}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>

            <View style={styles.teams}>
              <TeamScorePanel
                focused={focusedTeam === 1}
                onBlur={() => setFocusedTeam(null)}
                onChangeScore={(value) => setTeamOneScore(numericScore(value))}
                onFocus={() => setFocusedTeam(1)}
                score={teamOneScore}
                team={teams[0]}
              />

              <View style={styles.versusRow}>
                <View accessibilityElementsHidden importantForAccessibility="no" style={styles.versusLine} />
                <Text accessibilityLabel="versus" style={styles.versus}>
                  VS
                </Text>
                <View accessibilityElementsHidden importantForAccessibility="no" style={styles.versusLine} />
              </View>

              <TeamScorePanel
                focused={focusedTeam === 2}
                onBlur={() => setFocusedTeam(null)}
                onChangeScore={(value) => setTeamTwoScore(numericScore(value))}
                onFocus={() => setFocusedTeam(2)}
                score={teamTwoScore}
                team={teams[1]}
              />
            </View>

            <View style={styles.actions}>
              <ActionButton
                label="Cancel"
                onPress={onClose}
                style={styles.actionButton}
                variant="text"
              />
              <ActionButton
                disabled={!canSubmit}
                label="Save score"
                onPress={() => onSubmit(parsedTeamOneScore, parsedTeamTwoScore)}
                style={styles.actionButton}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TeamScorePanel({
  focused,
  onBlur,
  onChangeScore,
  onFocus,
  score,
  team
}: TeamScorePanelProps) {
  const names = team.players.map((player) => player.accessibilityName ?? player.name).join(" and ");

  return (
    <View style={styles.teamPanel}>
      <View style={styles.playerList}>
        {team.players.map((player) => (
          <PlayerRow
            accessibilityName={player.accessibilityName}
            action="none"
            avatarInitials={playerInitials(player)}
            avatarUrl={player.avatarUrl}
            density="compact"
            key={player.id}
            name={player.name}
            showDivider={false}
          />
        ))}
      </View>
      <View style={[styles.scoreInputFrame, focused ? styles.scoreInputFrameFocused : null]}>
        <TextInput
          accessibilityLabel={`${names} score`}
          keyboardType="number-pad"
          onBlur={onBlur}
          onChangeText={onChangeScore}
          onFocus={onFocus}
          placeholder="0"
          placeholderTextColor={theme.color.text.secondary}
          selectionColor={theme.color.action.primary}
          selectTextOnFocus
          style={styles.scoreInput}
          value={score}
        />
      </View>
    </View>
  );
}

function numericScore(value: string) {
  return value.replace(/\D/g, "");
}

function scoreInputValue(score: number | null) {
  return score === null ? "" : String(score);
}

function playerInitials(player: MatchPlayer) {
  return (player.accessibilityName ?? player.name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const styles = StyleSheet.create({
  actionButton: {
    flex: 1
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.inlineDefault
  },
  backdrop: {
    flex: 1
  },
  backdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.color.text.primary,
    opacity: 0.36
  },
  dialog: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.space[20],
    padding: theme.layout.screenInset,
    width: "100%"
  },
  modalContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.layout.screenInset
  },
  playerList: {
    flex: 1,
    minWidth: 0
  },
  scoreInput: {
    ...theme.type.metricScore,
    color: theme.color.text.selected,
    flex: 1,
    includeFontPadding: false,
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[0],
    textAlign: "center",
    textAlignVertical: "center"
  },
  scoreInputFrame: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.control,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.interactive,
    height: theme.space[64],
    overflow: "hidden",
    width: theme.space[64]
  },
  scoreInputFrameFocused: {
    borderColor: theme.color.focus.ring,
    borderWidth: theme.border.focus
  },
  scrollView: {
    flex: 1
  },
  teamPanel: {
    alignItems: "center",
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.quiet,
    flexDirection: "row",
    gap: theme.layout.inlineDefault,
    padding: theme.space[12]
  },
  teams: {
    gap: theme.layout.stackDefault
  },
  title: {
    ...theme.type.headingPage,
    color: theme.color.text.primary,
    textAlign: "center"
  },
  versus: {
    ...theme.type.labelAction,
    color: theme.color.text.secondary
  },
  versusLine: {
    backgroundColor: theme.color.border.subtle,
    flex: 1,
    height: theme.border.quiet
  },
  versusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.space[8]
  }
});
