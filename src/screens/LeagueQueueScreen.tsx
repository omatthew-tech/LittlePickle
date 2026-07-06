import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CurrentPlayersSection } from "../components/CurrentPlayersSection";
import { RallyIcon } from "../components/RallyIcon";
import { theme } from "../design/theme";
import { usePlaySession } from "../lib/usePlaySession";
import type { Player } from "../data/sampleClub";

const playersPerMatch = 4;
const estimatedMinutesPerMatch = 8;

export type LeagueQueueProfile = {
  avatarPath?: string | null;
  displayName: string;
  leagueName: string;
  playerId: string;
  rating?: number | null;
  sessionId: string;
};

type LeagueQueueScreenProps = {
  onBack: () => void;
  onLeftQueue: () => void;
  onQueueMembershipChanged: () => void;
  profile: LeagueQueueProfile;
};

export function LeagueQueueScreen({ onBack, onLeftQueue, onQueueMembershipChanged, profile }: LeagueQueueScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    activeMatches,
    addNewPlayerToSession,
    errorMessage,
    live,
    loading,
    players,
    setPlayerInSession
  } = usePlaySession(profile.sessionId);
  const [updatingMembership, setUpdatingMembership] = useState(false);
  const queuedPlayer = useMemo(
    () => players.find((player) => player.id === profile.playerId) ?? null,
    [players, profile.playerId]
  );
  const displayName = queuedPlayer?.name ?? profile.displayName;
  const isQueued = Boolean(queuedPlayer?.inSession);
  const rank = formatRank(queuedPlayer?.skill ?? profile.rating ?? null);
  const wait = loading && !queuedPlayer ? "--" : isQueued ? queueWaitLabel(queuedPlayer, activeMatches.length) : "--";
  const upAfter = loading && !queuedPlayer ? "--" : isQueued ? upAfterLabel(queuedPlayer, activeMatches.length) : "--";
  const membershipActionLabel = isQueued ? "Leave queue" : "Join queue";

  async function handleQueueMembership() {
    const nextInSession = !isQueued;

    setUpdatingMembership(true);
    const updated = await setPlayerInSession(profile.playerId, nextInSession);
    setUpdatingMembership(false);

    if (!updated) {
      return;
    }

    if (nextInSession) {
      onQueueMembershipChanged();
      return;
    }

    onLeftQueue();
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
      <View style={styles.headerStack}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={theme.space[8]}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
        >
          <RallyIcon color={theme.color.action.primary} name="back" size={theme.size.iconCompact} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.leagueTitle}>
          {profile.leagueName}
        </Text>
      </View>
      <View style={styles.queueCard}>
        <View style={styles.queueIdentityRow}>
          <View style={styles.queueAvatar}>
            <Text numberOfLines={1} style={styles.queueAvatarText}>
              {initialsFor(displayName)}
            </Text>
          </View>
          <Text numberOfLines={2} style={styles.queueName}>
            {displayName}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={updatingMembership || loading}
            onPress={() => void handleQueueMembership()}
            style={({ pressed }) => [
              styles.queueAction,
              pressed ? styles.queueActionPressed : null,
              updatingMembership || loading ? styles.queueActionDisabled : null
            ]}
          >
            <Text style={styles.queueActionText}>{membershipActionLabel}</Text>
          </Pressable>
        </View>
        <View style={styles.queueDivider} />
        <View style={styles.queueStats}>
          <QueueStat label="Up after" value={upAfter} />
          <View style={styles.statDivider} />
          <QueueStat label="Rank" value={rank} />
          <View style={styles.statDivider} />
          <QueueStat label="Wait" value={wait} />
        </View>
      </View>
      {errorMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}
      {loading ? <ActivityIndicator color={theme.color.action.primary} style={styles.loading} /> : null}
      <CurrentPlayersSection
        addNewPlayerToSession={addNewPlayerToSession}
        live={live}
        loading={loading}
        players={players}
        setPlayerInSession={setPlayerInSession}
      />
    </ScrollView>
  );
}

function QueueStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

function formatRank(rank: number | null) {
  return typeof rank === "number" && Number.isFinite(rank) ? rank.toFixed(2) : "--";
}

function upAfterLabel(player: Player | null, activeMatchCount: number) {
  if (player?.isPlaying) {
    return "Playing";
  }

  const matchCount = matchesBeforeTurn(player, activeMatchCount);

  if (matchCount === 0) {
    return "Now";
  }

  return `${matchCount} ${matchCount === 1 ? "match" : "matches"}`;
}

function queueWaitLabel(player: Player | null, activeMatchCount: number) {
  if (player?.isPlaying) {
    return "Now";
  }

  const matchCount = matchesBeforeTurn(player, activeMatchCount);
  return `${matchCount * estimatedMinutesPerMatch} min`;
}

function matchesBeforeTurn(player: Player | null, activeMatchCount: number) {
  const queuePosition = player?.queuePosition;

  if (typeof queuePosition !== "number") {
    return activeMatchCount > 0 ? 1 : 0;
  }

  const queuedGroupsAhead = Math.floor(Math.max(queuePosition, 0) / playersPerMatch);
  return queuedGroupsAhead + (activeMatchCount > 0 ? 1 : 0);
}

function initialsFor(name: string) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "P";
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: theme.color.surface.canvas,
    flexGrow: 1,
    gap: theme.layout.sectionGap,
    paddingHorizontal: theme.layout.screenInset
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: theme.radius.control,
    flexDirection: "row",
    gap: theme.space[4],
    minHeight: theme.size.targetMinimum,
    paddingHorizontal: theme.space[4]
  },
  backButtonPressed: {
    backgroundColor: theme.color.surface.info
  },
  backText: {
    ...theme.type.labelAction,
    color: theme.color.action.primary
  },
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error
  },
  headerStack: {
    gap: theme.space[8]
  },
  leagueTitle: {
    ...theme.type.headingBrand,
    color: theme.color.text.primary
  },
  loading: {
    marginTop: -theme.layout.stackDefault
  },
  queueAction: {
    alignItems: "center",
    borderRadius: theme.radius.control,
    justifyContent: "center",
    marginLeft: "auto",
    minHeight: theme.size.targetMinimum,
    paddingHorizontal: theme.space[8]
  },
  queueActionDisabled: {
    opacity: 0.6
  },
  queueActionPressed: {
    backgroundColor: theme.color.surface.card
  },
  queueActionText: {
    ...theme.type.labelAction,
    color: theme.color.action.primary
  },
  queueAvatar: {
    alignItems: "center",
    backgroundColor: theme.color.surface.social,
    borderRadius: theme.radius.pill,
    height: theme.size.targetMinimum,
    justifyContent: "center",
    width: theme.size.targetMinimum
  },
  queueAvatarText: {
    ...theme.type.titleCard,
    color: theme.color.text.primary
  },
  queueCard: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.surface.social,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
    padding: theme.layout.cardPadding
  },
  queueDivider: {
    backgroundColor: theme.color.border.subtle,
    height: theme.border.quiet
  },
  queueIdentityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.inlineDefault
  },
  queueName: {
    ...theme.type.titleCard,
    color: theme.color.text.primary,
    flex: 1
  },
  queueStats: {
    alignItems: "stretch",
    flexDirection: "row"
  },
  stat: {
    alignItems: "center",
    flex: 1,
    gap: theme.space[4],
    minWidth: 0
  },
  statDivider: {
    backgroundColor: theme.color.border.subtle,
    width: theme.border.quiet
  },
  statLabel: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary,
    textAlign: "center"
  },
  statValue: {
    ...theme.type.metricRecord,
    color: theme.color.text.primary,
    textAlign: "center"
  }
});
