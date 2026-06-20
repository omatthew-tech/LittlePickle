import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../components/ActionButton";
import { MatchCard } from "../components/MatchCard";
import { PlayerRow } from "../components/PlayerRow";
import { SearchField } from "../components/SearchField";
import { currentPlayers, recommendedMatch } from "../data/sampleClub";
import { theme } from "../design/theme";

export function PlayScreen() {
  const insets = useSafeAreaInsets();
  const [playerQuery, setPlayerQuery] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set(["maya-chen"]));

  const visiblePlayers = useMemo(() => {
    const normalizedQuery = playerQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return currentPlayers;
    }

    return currentPlayers.filter((player) => player.name.toLowerCase().includes(normalizedQuery));
  }, [playerQuery]);

  function togglePlayer(playerId: string, selected: boolean) {
    setSelectedPlayerIds((previous) => {
      const next = new Set(previous);

      if (selected) {
        next.add(playerId);
      } else {
        next.delete(playerId);
      }

      return next;
    });
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
      <View style={styles.matchList}>
        <MatchCard
          matchId={recommendedMatch.id}
          onPassPlayer={(_, playerId) => Alert.alert("Pass", `Passed on ${friendlyPlayerName(playerId)}.`)}
          onReportScore={() => Alert.alert("Report score", "Score reporting will connect to Supabase match records.")}
          teams={recommendedMatch.teams}
        />
      </View>

      <View style={styles.playersSection}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Current players
        </Text>
        <SearchField
          label="Search players"
          onChangeText={setPlayerQuery}
          onSubmit={() => undefined}
          placeholder="Search players"
          scope="player"
          value={playerQuery}
        />
        <View accessibilityLabel="Current players" accessibilityRole="list" style={styles.playerList}>
          {visiblePlayers.map((player) => (
            <PlayerRow
              action="add"
              avatarInitials={player.initials}
              key={player.id}
              name={player.name}
              onAction={() => togglePlayer(player.id, true)}
              onSelectionChange={(selected) => togglePlayer(player.id, selected)}
              selected={selectedPlayerIds.has(player.id)}
            />
          ))}
        </View>
        <ActionButton
          icon="history"
          label="View match history"
          onPress={() => Alert.alert("Match history", "Match history will open once historical score data is connected.")}
          variant="text"
        />
      </View>
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
  matchList: {
    gap: theme.layout.stackCompact,
    marginTop: theme.layout.stackDefault
  },
  pageTitle: {
    ...theme.type.headingPage,
    color: theme.color.text.primary
  },
  playerList: {
    gap: theme.layout.stackCompact
  },
  playersSection: {
    gap: theme.layout.stackDefault,
    marginTop: theme.layout.sectionGap
  },
  sectionTitle: {
    ...theme.type.headingSection,
    color: theme.color.text.primary
  }
});
