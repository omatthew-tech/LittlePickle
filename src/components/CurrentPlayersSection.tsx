import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ActionButton } from "./ActionButton";
import { PlayerRow } from "./PlayerRow";
import { SearchField } from "./SearchField";
import { theme } from "../design/theme";
import type { Player } from "../data/sampleClub";

type CurrentPlayersSectionProps = {
  addNewPlayerToSession: (displayName: string) => Promise<boolean>;
  live: boolean;
  loading: boolean;
  players: Player[];
  readOnly?: boolean;
  setPlayerInSession: (playerId: string, inSession: boolean) => Promise<unknown>;
};

export function CurrentPlayersSection({
  addNewPlayerToSession,
  live,
  loading,
  players,
  readOnly = false,
  setPlayerInSession
}: CurrentPlayersSectionProps) {
  const [playerQuery, setPlayerQuery] = useState("");
  const [addPlayerError, setAddPlayerError] = useState<string | null>(null);
  const normalizedPlayerQuery = normalizeDisplayName(playerQuery);

  const visiblePlayers = useMemo(() => {
    const normalizedQuery = normalizedPlayerQuery.toLowerCase();

    if (!normalizedQuery) {
      return players;
    }

    return players.filter((player) => player.name.toLowerCase().includes(normalizedQuery));
  }, [normalizedPlayerQuery, players]);

  const shouldUseLastNameCompletion = Boolean(normalizedPlayerQuery && visiblePlayers.length === 0);
  const newPlayerName = normalizedPlayerQuery;
  const queryHasFirstAndLastName = hasFirstAndLastName(newPlayerName);
  const exactPlayerNameExists = useMemo(
    () => players.some((player) => normalizeDisplayName(player.name).toLowerCase() === newPlayerName.toLowerCase()),
    [newPlayerName, players]
  );
  const shouldShowAddPlayerPanel = Boolean(
    normalizedPlayerQuery &&
      visiblePlayers.length === 0 &&
      !exactPlayerNameExists
  );

  async function handlePlayerMembership(playerId: string, inSession: boolean) {
    await setPlayerInSession(playerId, inSession);
  }

  function handlePlayerQueryChange(query: string) {
    setPlayerQuery(normalizePlayerQueryInput(query));
    setAddPlayerError(null);
  }

  async function handleAddQueriedPlayer() {
    if (!queryHasFirstAndLastName) {
      setAddPlayerError("Enter the player's first and last name.");
      return;
    }

    if (exactPlayerNameExists) {
      setAddPlayerError("That player is already in the league. Add them from the list.");
      return;
    }

    setAddPlayerError(null);
    const added = await addNewPlayerToSession(newPlayerName);

    if (added) {
      setPlayerQuery("");
    }
  }

  return (
    <View style={styles.playersSection}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Current players
      </Text>
      {!readOnly ? (
        <SearchField
          completionPlaceholder={shouldUseLastNameCompletion ? "Last name" : null}
          label="Add player"
          onChangeText={handlePlayerQueryChange}
          onSubmit={() => undefined}
          placeholder="Add player"
          scope="player"
          value={playerQuery}
        />
      ) : null}
      <View accessibilityLabel="Current players" accessibilityRole="list" style={styles.playerList}>
        {visiblePlayers.map((player) => (
          <PlayerRow
            action={readOnly || (live && player.isPlaying) ? "none" : player.inSession ? "remove" : "add"}
            avatarInitials={player.initials}
            avatarUrl={player.avatarUrl}
            key={player.id}
            meta={player.isPlaying ? "Playing" : null}
            name={player.name}
            onAction={(action) => void handlePlayerMembership(player.id, action === "add")}
            onSelectionChange={readOnly ? undefined : (selected) => void handlePlayerMembership(player.id, selected)}
            selected={Boolean(player.inSession)}
          />
        ))}
      </View>
      {!readOnly && shouldShowAddPlayerPanel ? (
        <View style={styles.addPlayerPanel}>
          {addPlayerError ? (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {addPlayerError}
            </Text>
          ) : null}
          <ActionButton
            disabled={loading || !queryHasFirstAndLastName}
            label="Add new player"
            onPress={() => void handleAddQueriedPlayer()}
            style={styles.addPlayerButton}
          />
        </View>
      ) : null}
    </View>
  );
}

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizePlayerQueryInput(value: string) {
  return value.trimStart().replace(/\s+/g, " ");
}

function hasFirstAndLastName(value: string) {
  return normalizeDisplayName(value).split(" ").filter(Boolean).length >= 2;
}

const styles = StyleSheet.create({
  addPlayerButton: {
    alignSelf: "stretch"
  },
  addPlayerPanel: {
    gap: theme.layout.stackCompact,
    paddingVertical: theme.space[6]
  },
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error,
    marginTop: theme.space[8]
  },
  playerList: {
    gap: theme.layout.stackCompact
  },
  playersSection: {
    gap: theme.layout.stackDefault
  },
  sectionTitle: {
    ...theme.type.headingSection,
    color: theme.color.text.primary
  }
});
