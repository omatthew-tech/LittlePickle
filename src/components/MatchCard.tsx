import { StyleSheet, Text, View } from "react-native";
import { theme } from "../design/theme";
import { ActionButton } from "./ActionButton";
import { PlayerRow } from "./PlayerRow";

export type MatchPlayer = {
  avatarUrl?: string | null;
  id: string;
  name: string;
  meta?: string;
};

export type MatchTeam = {
  id: string;
  players: MatchPlayer[];
};

type MatchCardProps = {
  canReportScore?: boolean;
  courtLabel?: string | null;
  matchId: string;
  onPassPlayer: (matchId: string, playerId: string) => void;
  onReportScore: (matchId: string) => void;
  playerAction?: "pass" | "none";
  primaryActionLabel?: string;
  startsAtLabel?: string | null;
  teams: [MatchTeam, MatchTeam];
};

export function MatchCard({
  canReportScore = true,
  courtLabel,
  matchId,
  onPassPlayer,
  onReportScore,
  playerAction = "pass",
  primaryActionLabel = "Report score",
  startsAtLabel,
  teams
}: MatchCardProps) {
  const metadata = [courtLabel, startsAtLabel].filter(Boolean).join(" | ");

  return (
    <View style={styles.container}>
      <View
        accessibilityLabel={`Recommended match, ${teamNames(teams[0])} versus ${teamNames(teams[1])}`}
        accessibilityRole="summary"
        style={styles.card}
      >
        {metadata ? <Text style={styles.metadata}>{metadata}</Text> : null}
        <View style={styles.team}>
          {teams[0].players.map((player) => (
            <PlayerRow
              action={playerAction}
              avatarInitials={playerInitials(player.name)}
              avatarUrl={player.avatarUrl}
              density="compact"
              key={player.id}
              meta={player.meta}
              name={player.name}
              onAction={() => onPassPlayer(matchId, player.id)}
              showDivider={false}
            />
          ))}
        </View>
        <View style={styles.versusRow}>
          <View accessibilityElementsHidden importantForAccessibility="no" style={styles.versusLine} />
          <Text accessibilityLabel="versus" style={styles.versus}>
            VS
          </Text>
          <View accessibilityElementsHidden importantForAccessibility="no" style={styles.versusLine} />
        </View>
        <View style={styles.team}>
          {teams[1].players.map((player) => (
            <PlayerRow
              action={playerAction}
              avatarInitials={playerInitials(player.name)}
              avatarUrl={player.avatarUrl}
              density="compact"
              key={player.id}
              meta={player.meta}
              name={player.name}
              onAction={() => onPassPlayer(matchId, player.id)}
              showDivider={false}
            />
          ))}
        </View>
      </View>
      <View style={styles.reportDock}>
        <ActionButton
          disabled={!canReportScore}
          icon="score"
          label={primaryActionLabel}
          onPress={() => onReportScore(matchId)}
          style={styles.reportButton}
        />
      </View>
    </View>
  );
}

function playerInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function teamNames(team: MatchTeam) {
  return team.players.map((player) => player.name).join(" and ");
}

const styles = StyleSheet.create({
  card: {
    ...theme.shadow.card,
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
    padding: theme.layout.cardPadding,
    width: "100%"
  },
  container: {
    width: "100%"
  },
  metadata: {
    ...theme.type.metricDetail,
    color: theme.color.text.secondary
  },
  reportButton: {
    borderBottomWidth: theme.border.quiet,
    borderColor: theme.color.border.subtle,
    borderLeftWidth: theme.border.quiet,
    borderRightWidth: theme.border.quiet,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    width: "100%"
  },
  reportDock: {
    alignItems: "center",
    width: "100%"
  },
  team: {
    gap: theme.space[0]
  },
  versus: {
    ...theme.type.labelAction,
    color: theme.color.text.secondary
  },
  versusLine: {
    backgroundColor: theme.color.border.subtle,
    flex: 1,
    height: theme.border.quiet,
    maxWidth: 112
  },
  versusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.space[8],
    justifyContent: "center"
  }
});
