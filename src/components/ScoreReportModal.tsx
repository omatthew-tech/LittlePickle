import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "../design/theme";
import { ActionButton } from "./ActionButton";

type ScoreReportModalProps = {
  onClose: () => void;
  onSubmit: (teamOneScore: number, teamTwoScore: number) => void;
  visible: boolean;
};

export function ScoreReportModal({ onClose, onSubmit, visible }: ScoreReportModalProps) {
  const [teamOneScore, setTeamOneScore] = useState("");
  const [teamTwoScore, setTeamTwoScore] = useState("");

  useEffect(() => {
    if (visible) {
      setTeamOneScore("");
      setTeamTwoScore("");
    }
  }, [visible]);

  const parsedTeamOneScore = Number.parseInt(teamOneScore, 10);
  const parsedTeamTwoScore = Number.parseInt(teamTwoScore, 10);
  const canSubmit = Number.isInteger(parsedTeamOneScore) && Number.isInteger(parsedTeamTwoScore);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View accessibilityLabel="Report score" accessibilityRole="summary" style={styles.dialog}>
          <Text style={styles.title}>Report score</Text>
          <View style={styles.scoreRow}>
            <TextInput
              accessibilityLabel="Team one score"
              keyboardType="number-pad"
              onChangeText={setTeamOneScore}
              placeholder="0"
              placeholderTextColor={theme.color.text.secondary}
              style={styles.scoreInput}
              value={teamOneScore}
            />
            <Text style={styles.separator}>-</Text>
            <TextInput
              accessibilityLabel="Team two score"
              keyboardType="number-pad"
              onChangeText={setTeamTwoScore}
              placeholder="0"
              placeholderTextColor={theme.color.text.secondary}
              style={styles.scoreInput}
              value={teamTwoScore}
            />
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <ActionButton
              disabled={!canSubmit}
              label="Save score"
              onPress={() => onSubmit(parsedTeamOneScore, parsedTeamTwoScore)}
              style={styles.submitButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.inlineDefault,
    justifyContent: "flex-end"
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(34, 40, 58, 0.36)",
    flex: 1,
    justifyContent: "center",
    padding: theme.layout.screenInset
  },
  cancelButton: {
    minHeight: theme.size.targetMinimum,
    paddingHorizontal: theme.space[12],
    justifyContent: "center"
  },
  cancelText: {
    ...theme.type.labelAction,
    color: theme.color.action.primary
  },
  dialog: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
    padding: theme.layout.cardPadding,
    width: "100%"
  },
  scoreInput: {
    ...theme.type.metricScore,
    borderColor: theme.color.border.control,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.interactive,
    color: theme.color.text.primary,
    flex: 1,
    height: 72,
    includeFontPadding: false,
    lineHeight: theme.type.metricScore.fontSize,
    minHeight: 72,
    paddingBottom: theme.space[2],
    paddingTop: 0,
    textAlign: "center",
    textAlignVertical: "center"
  },
  scoreRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.space[12]
  },
  separator: {
    ...theme.type.metricRecord,
    color: theme.color.text.secondary
  },
  submitButton: {
    minWidth: 132
  },
  title: {
    ...theme.type.headingSection,
    color: theme.color.text.primary
  }
});
