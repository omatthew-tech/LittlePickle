import { useEffect, useMemo, useState } from "react";
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
import type { Player } from "../data/sampleClub";
import { theme } from "../design/theme";
import type { CustomMatchRequest } from "../types/matchFlow";
import { ActionButton } from "./ActionButton";
import { PlayerRow } from "./PlayerRow";
import { SearchField } from "./SearchField";

type CustomScoreModalProps = {
  onClose: () => void;
  onSubmit: (request: CustomMatchRequest) => Promise<boolean>;
  players: Player[];
  visible: boolean;
};

type PlayerQueries = [string, string, string, string];
type SelectedPlayerIds = [string | null, string | null, string | null, string | null];
type PlayerSlot = 0 | 1 | 2 | 3;

const emptyQueries = (): PlayerQueries => ["", "", "", ""];
const emptyPlayerIds = (): SelectedPlayerIds => [null, null, null, null];

export function CustomScoreModal({ onClose, onSubmit, players, visible }: CustomScoreModalProps) {
  const [focusedTeam, setFocusedTeam] = useState<1 | 2 | null>(null);
  const [playerQueries, setPlayerQueries] = useState<PlayerQueries>(emptyQueries);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<SelectedPlayerIds>(emptyPlayerIds);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [teamOneScore, setTeamOneScore] = useState("");
  const [teamTwoScore, setTeamTwoScore] = useState("");
  const eligiblePlayers = useMemo(
    () => players.filter((player) => player.inSession && !player.isPlaying),
    [players]
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    setFocusedTeam(null);
    setPlayerQueries(emptyQueries());
    setSelectedPlayerIds(emptyPlayerIds());
    setSubmissionError(null);
    setSubmitting(false);
    setTeamOneScore("");
    setTeamTwoScore("");
  }, [visible]);

  const parsedTeamOneScore = Number.parseInt(teamOneScore, 10);
  const parsedTeamTwoScore = Number.parseInt(teamTwoScore, 10);
  const chosenPlayerIds = selectedPlayerIds.filter((playerId): playerId is string => Boolean(playerId));
  const canSubmit =
    chosenPlayerIds.length === 4 &&
    new Set(chosenPlayerIds).size === 4 &&
    chosenPlayerIds.every((playerId) => eligiblePlayers.some((player) => player.id === playerId)) &&
    teamOneScore.length > 0 &&
    teamTwoScore.length > 0 &&
    Number.isInteger(parsedTeamOneScore) &&
    Number.isInteger(parsedTeamTwoScore) &&
    !submitting;

  function updatePlayerQuery(slot: PlayerSlot, query: string) {
    const nextQuery = query.trimStart().replace(/\s+/g, " ");
    setPlayerQueries((previousQueries) => replaceTupleValue(previousQueries, slot, nextQuery));
    setSelectedPlayerIds((previousIds) => {
      const selectedElsewhere = new Set(
        previousIds.filter((playerId, index) => index !== slot && Boolean(playerId))
      );
      const exactPlayer = eligiblePlayers.find(
        (player) =>
          !selectedElsewhere.has(player.id) &&
          player.name.toLowerCase() === nextQuery.trim().toLowerCase()
      );

      return replaceTupleValue(previousIds, slot, exactPlayer?.id ?? null);
    });
    setSubmissionError(null);
  }

  function selectPlayer(slot: PlayerSlot, player: Player) {
    setPlayerQueries((previousQueries) => replaceTupleValue(previousQueries, slot, player.name));
    setSelectedPlayerIds((previousIds) => replaceTupleValue(previousIds, slot, player.id));
    setSubmissionError(null);
  }

  function playerMatches(slot: PlayerSlot) {
    const normalizedQuery = playerQueries[slot].trim().toLowerCase();

    if (!normalizedQuery || selectedPlayerIds[slot]) {
      return [];
    }

    const selectedElsewhere = new Set(
      selectedPlayerIds.filter((playerId, index) => index !== slot && Boolean(playerId))
    );

    return eligiblePlayers
      .filter(
        (player) =>
          !selectedElsewhere.has(player.id) && player.name.toLowerCase().includes(normalizedQuery)
      )
      .slice(0, 4);
  }

  function renderPlayerPicker(slot: PlayerSlot, label: string) {
    const matches = playerMatches(slot);
    const hasQuery = Boolean(playerQueries[slot].trim());
    const selected = Boolean(selectedPlayerIds[slot]);

    return (
      <View style={styles.playerPicker}>
        <Text style={styles.playerLabel}>{label}</Text>
        <SearchField
          disabled={submitting}
          label={`${label} name`}
          onChangeText={(query) => updatePlayerQuery(slot, query)}
          placeholder="Search players"
          scope="player"
          value={playerQueries[slot]}
        />
        {selected ? <Text style={styles.selectedLabel}>Player selected</Text> : null}
        {matches.length > 0 ? (
          <View accessibilityLabel={`${label} search results`} accessibilityRole="list" style={styles.searchResults}>
            {matches.map((player, index) => (
              <PlayerRow
                accessibilityName={player.name}
                action="none"
                avatarInitials={player.initials}
                avatarUrl={player.avatarUrl}
                density="compact"
                key={player.id}
                name={player.name}
                onSelectionChange={() => selectPlayer(slot, player)}
                showDivider={index < matches.length - 1}
              />
            ))}
          </View>
        ) : null}
        {hasQuery && !selected && matches.length === 0 ? (
          <Text accessibilityLiveRegion="polite" style={styles.noResults}>
            No available current players found.
          </Text>
        ) : null}
      </View>
    );
  }

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setSubmissionError(null);
    const saved = await onSubmit({
      team_one_player_ids: [selectedPlayerIds[0]!, selectedPlayerIds[1]!],
      team_one_score: parsedTeamOneScore,
      team_two_player_ids: [selectedPlayerIds[2]!, selectedPlayerIds[3]!],
      team_two_score: parsedTeamTwoScore
    });
    setSubmitting(false);

    if (saved) {
      onClose();
      return;
    }

    setSubmissionError("Could not save the custom score. Check the players and try again.");
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
            <Text accessibilityRole="header" style={styles.title}>
              Custom score
            </Text>
            <Text style={styles.helpText}>
              Search for four current players and enter the final score.
            </Text>

            {eligiblePlayers.length < 4 ? (
              <Text accessibilityLiveRegion="polite" style={styles.availabilityMessage}>
                At least four current players who are not already playing are needed.
              </Text>
            ) : null}

            <View style={styles.teamPanel}>
              <View style={styles.teamHeading}>
                <Text style={styles.teamTitle}>Team 1</Text>
                <ScoreInput
                  focused={focusedTeam === 1}
                  label="Team 1 score"
                  onBlur={() => setFocusedTeam(null)}
                  onChangeScore={setTeamOneScore}
                  onFocus={() => setFocusedTeam(1)}
                  score={teamOneScore}
                />
              </View>
              {renderPlayerPicker(0, "Player 1")}
              {renderPlayerPicker(1, "Player 2")}
            </View>

            <View style={styles.versusRow}>
              <View accessibilityElementsHidden importantForAccessibility="no" style={styles.versusLine} />
              <Text accessibilityLabel="versus" style={styles.versus}>
                VS
              </Text>
              <View accessibilityElementsHidden importantForAccessibility="no" style={styles.versusLine} />
            </View>

            <View style={styles.teamPanel}>
              <View style={styles.teamHeading}>
                <Text style={styles.teamTitle}>Team 2</Text>
                <ScoreInput
                  focused={focusedTeam === 2}
                  label="Team 2 score"
                  onBlur={() => setFocusedTeam(null)}
                  onChangeScore={setTeamTwoScore}
                  onFocus={() => setFocusedTeam(2)}
                  score={teamTwoScore}
                />
              </View>
              {renderPlayerPicker(2, "Player 3")}
              {renderPlayerPicker(3, "Player 4")}
            </View>

            {submissionError ? (
              <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                {submissionError}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <ActionButton
                disabled={submitting}
                label="Cancel"
                onPress={onClose}
                style={styles.actionButton}
                variant="text"
              />
              <ActionButton
                disabled={!canSubmit}
                label={submitting ? "Saving..." : "Save score"}
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

function ScoreInput({
  focused,
  label,
  onBlur,
  onChangeScore,
  onFocus,
  score
}: {
  focused: boolean;
  label: string;
  onBlur: () => void;
  onChangeScore: (value: string) => void;
  onFocus: () => void;
  score: string;
}) {
  return (
    <View style={[styles.scoreInputFrame, focused ? styles.scoreInputFrameFocused : null]}>
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        onBlur={onBlur}
        onChangeText={(value) => onChangeScore(value.replace(/\D/g, ""))}
        onFocus={onFocus}
        placeholder="0"
        placeholderTextColor={theme.color.text.secondary}
        selectionColor={theme.color.action.primary}
        selectTextOnFocus
        style={styles.scoreInput}
        value={score}
      />
    </View>
  );
}

function replaceTupleValue<T>(tuple: [T, T, T, T], index: PlayerSlot, value: T): [T, T, T, T] {
  const nextTuple: [T, T, T, T] = [...tuple];
  nextTuple[index] = value;
  return nextTuple;
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
  availabilityMessage: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error
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
    gap: theme.layout.stackDefault,
    padding: theme.layout.screenInset,
    width: "100%"
  },
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error
  },
  helpText: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary,
    textAlign: "center"
  },
  modalContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.layout.screenInset
  },
  noResults: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  playerLabel: {
    ...theme.type.metricDetail,
    color: theme.color.text.secondary
  },
  playerPicker: {
    gap: theme.space[4]
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
  searchResults: {
    borderBottomColor: theme.color.border.subtle,
    borderBottomWidth: theme.border.quiet
  },
  selectedLabel: {
    ...theme.type.bodySecondary,
    color: theme.color.text.selected
  },
  teamHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  teamPanel: {
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
    padding: theme.space[12]
  },
  teamTitle: {
    ...theme.type.headingSection,
    color: theme.color.text.primary
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
