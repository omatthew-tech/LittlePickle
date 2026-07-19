import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { theme } from "../design/theme";
import type { MatchResultInput, ResultMode } from "../types/matchFlow";
import type { MatchPlayer, MatchTeam } from "./MatchCard";
import { ActionButton } from "./ActionButton";
import { PlayerRow } from "./PlayerRow";

type ScoreReportModalProps = {
  initialTeamOneScore?: number | null;
  initialTeamTwoScore?: number | null;
  initialWinningTeam?: 1 | 2 | null;
  onClose: () => void;
  onSubmit: (result: MatchResultInput) => Promise<boolean>;
  resultMode: ResultMode;
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
  initialWinningTeam = null,
  onClose,
  onSubmit,
  resultMode,
  teams,
  title,
  visible
}: ScoreReportModalProps) {
  const [teamOneScore, setTeamOneScore] = useState("");
  const [teamTwoScore, setTeamTwoScore] = useState("");
  const [focusedTeam, setFocusedTeam] = useState<1 | 2 | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<1 | 2 | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setTeamOneScore(scoreInputValue(initialTeamOneScore));
      setTeamTwoScore(scoreInputValue(initialTeamTwoScore));
      setFocusedTeam(null);
      setSelectedWinner(initialWinningTeam);
      setSubmitting(false);
    }
  }, [initialTeamOneScore, initialTeamTwoScore, initialWinningTeam, resultMode, visible]);

  const parsedTeamOneScore = Number.parseInt(teamOneScore, 10);
  const parsedTeamTwoScore = Number.parseInt(teamTwoScore, 10);
  const scoresAreComplete =
    teamOneScore.length > 0 &&
    teamTwoScore.length > 0 &&
    Number.isInteger(parsedTeamOneScore) &&
    Number.isInteger(parsedTeamTwoScore);
  const scoresAreTied = scoresAreComplete && parsedTeamOneScore === parsedTeamTwoScore;
  const canSubmit =
    !submitting &&
    (resultMode === "score" ? scoresAreComplete && !scoresAreTied : selectedWinner !== null);
  const dialogTitle = title ?? (resultMode === "score" ? "Report score" : "Who won?");

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    await onSubmit(
      resultMode === "score"
        ? {
            resultMode: "score",
            teamOneScore: parsedTeamOneScore,
            teamTwoScore: parsedTeamTwoScore
          }
        : {
            resultMode: "win_loss",
            winningTeam: selectedWinner!
          }
    );
    setSubmitting(false);
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
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
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>
                {dialogTitle}
              </Text>
              <Text style={styles.subtitle}>
                {resultMode === "score"
                  ? "Enter the final score for each team."
                  : "Choose the winning team to finish the match."}
              </Text>
            </View>

            <View style={styles.teams}>
              {resultMode === "score" ? (
                <TeamScorePanel
                  focused={focusedTeam === 1}
                  onBlur={() => setFocusedTeam(null)}
                  onChangeScore={(value) => setTeamOneScore(numericScore(value))}
                  onFocus={() => setFocusedTeam(1)}
                  score={teamOneScore}
                  team={teams[0]}
                />
              ) : (
                <TeamWinnerPanel
                  onSelect={() => setSelectedWinner(1)}
                  selected={selectedWinner === 1}
                  team={teams[0]}
                />
              )}

              {resultMode === "score" ? (
                <View style={styles.versusRow}>
                  <View accessibilityElementsHidden importantForAccessibility="no" style={styles.versusLine} />
                  <Text accessibilityLabel="versus" style={styles.versus}>
                    VS
                  </Text>
                  <View accessibilityElementsHidden importantForAccessibility="no" style={styles.versusLine} />
                </View>
              ) : null}

              {resultMode === "score" ? (
                <TeamScorePanel
                  focused={focusedTeam === 2}
                  onBlur={() => setFocusedTeam(null)}
                  onChangeScore={(value) => setTeamTwoScore(numericScore(value))}
                  onFocus={() => setFocusedTeam(2)}
                  score={teamTwoScore}
                  team={teams[1]}
                />
              ) : (
                <TeamWinnerPanel
                  onSelect={() => setSelectedWinner(2)}
                  selected={selectedWinner === 2}
                  team={teams[1]}
                />
              )}
            </View>

            {scoresAreTied && resultMode === "score" ? (
              <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                Scores cannot be tied.
              </Text>
            ) : null}

            <View style={styles.actions}>
              <ActionButton
                label="Cancel"
                onPress={onClose}
                style={styles.actionButton}
                variant="text"
              />
              <ActionButton
                disabled={!canSubmit}
                label={submitting ? "Saving..." : resultMode === "score" ? "Save score" : "Save result"}
                onPress={() => void handleSubmit()}
                style={styles.actionButton}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TeamWinnerPanel({
  onSelect,
  selected,
  team
}: {
  onSelect: () => void;
  selected: boolean;
  team: MatchTeam;
}) {
  const names = team.players.map((player) => player.accessibilityName ?? player.name).join(" and ");

  return (
    <Pressable
      accessibilityLabel={`Select ${names} as the winning team`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.teamPanel,
        styles.winnerPanel,
        selected ? styles.winnerPanelSelected : null,
        pressed ? styles.winnerPanelPressed : null
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.playerList, selected ? styles.winnerPlayerListSelected : null]}
      >
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
      {selected ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.winnerMark}
        >
          <Text style={styles.winnerMarkText}>Winner</Text>
        </View>
      ) : null}
    </Pressable>
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
    <View style={[styles.teamPanel, styles.scoreTeamPanel]}>
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
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error,
    textAlign: "center"
  },
  modalContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: theme.layout.screenInset,
    paddingVertical: theme.layout.sectionGap
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
  scoreTeamPanel: {
    alignItems: "center",
    flexDirection: "row"
  },
  scrollView: {
    flex: 1
  },
  subtitle: {
    ...theme.type.bodyDefault,
    color: theme.color.text.secondary,
    textAlign: "left"
  },
  header: {
    gap: theme.layout.stackCompact
  },
  teamPanel: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.quiet,
    gap: theme.layout.inlineDefault,
    padding: theme.space[12]
  },
  teams: {
    gap: theme.layout.stackDefault
  },
  title: {
    ...theme.type.headingPage,
    color: theme.color.text.primary,
    textAlign: "left"
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
  },
  winnerMark: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    right: theme.space[8],
    top: 0,
    transform: [{ rotate: "-18deg" }],
    width: theme.space[64] + theme.space[32]
  },
  winnerMarkText: {
    ...theme.type.labelAction,
    color: theme.color.action.primary,
    textAlign: "center"
  },
  winnerPanel: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.inlineDefault,
    minHeight: theme.size.targetMinimum,
    padding: theme.space[12],
    position: "relative"
  },
  winnerPanelPressed: {
    backgroundColor: theme.color.surface.info
  },
  winnerPanelSelected: {
    backgroundColor: theme.color.surface.social,
    borderColor: theme.color.border.active,
    borderWidth: theme.border.interactive
  },
  winnerPlayerListSelected: {
    paddingRight: theme.space[64] + theme.space[32]
  }
});
