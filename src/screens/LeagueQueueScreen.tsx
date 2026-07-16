import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CurrentPlayersSection } from "../components/CurrentPlayersSection";
import { RallyIcon } from "../components/RallyIcon";
import { theme } from "../design/theme";
import { usePlaySession } from "../lib/usePlaySession";
import type { Player } from "../data/sampleClub";

const playersPerMatch = 4;
const estimatedMinutesPerMatch = 8;

export type LeagueQueueProfile = {
  animateStatsReveal?: boolean;
  avatarPath?: string | null;
  displayName: string;
  leagueId: string;
  leagueLocationText?: string | null;
  leagueName: string;
  leagueNumberOfCourts?: number | null;
  leagueSlug?: string | null;
  playerId: string;
  rating?: number | null;
  readOnly?: boolean;
  sessionId?: string | null;
};

type LeagueQueueScreenProps = {
  onAddPlayerToQueue: (playerId: string | null, displayName: string) => Promise<boolean>;
  onBack: () => void;
  onJoinQueue: () => Promise<void> | void;
  onLeftQueue: () => void;
  onQueueMembershipChanged: () => void;
  onStatsRevealConsumed: () => void;
  onViewedQueueEnded: () => void;
  profile: LeagueQueueProfile;
};

export function LeagueQueueScreen({
  onAddPlayerToQueue,
  onBack,
  onJoinQueue,
  onLeftQueue,
  onQueueMembershipChanged,
  onStatsRevealConsumed,
  onViewedQueueEnded,
  profile
}: LeagueQueueScreenProps) {
  const insets = useSafeAreaInsets();
  const readOnly = Boolean(profile.readOnly);
  const animateStatsReveal = useRef(Boolean(profile.animateStatsReveal)).current;
  const {
    activeMatches,
    addNewPlayerToSession: addNewPlayerToExistingSession,
    errorMessage,
    live,
    loading,
    players,
    sessionEnded,
    setPlayerInSession: setPlayerInExistingSession
  } = usePlaySession(profile.sessionId, {
    allowMissingSession: readOnly,
    canManageRoster: true,
    leagueId: profile.leagueId,
    readOnly
  });
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [updatingMembership, setUpdatingMembership] = useState(false);
  const [statsContentHeight, setStatsContentHeight] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const statsReveal = useRef(new Animated.Value(readOnly || animateStatsReveal ? 0 : 1)).current;
  const statsRevealConsumed = useRef(false);
  const onStatsRevealConsumedRef = useRef(onStatsRevealConsumed);
  const queuedPlayer = useMemo(
    () => players.find((player) => player.id === profile.playerId) ?? null,
    [players, profile.playerId]
  );
  const displayName = queuedPlayer?.name ?? profile.displayName;
  const isQueued = Boolean(queuedPlayer?.inSession);
  const shouldShowStats = isQueued || (!readOnly && !animateStatsReveal);
  const rank = leagueRankLabel(queuedPlayer, players);
  const wait = loading && !queuedPlayer ? "--" : isQueued ? queueWaitLabel(queuedPlayer, activeMatches.length) : "--";
  const upAfter = loading && !queuedPlayer ? "--" : isQueued ? upAfterLabel(queuedPlayer, activeMatches.length) : "--";
  const membershipActionLabel = isQueued ? "Leave queue" : "Join queue";

  useEffect(() => {
    onStatsRevealConsumedRef.current = onStatsRevealConsumed;
  }, [onStatsRevealConsumed]);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (statsContentHeight === 0) {
      return;
    }

    statsReveal.stopAnimation();

    if (!animateStatsReveal) {
      statsReveal.setValue(shouldShowStats ? 1 : 0);
      return;
    }

    if (!isQueued) {
      statsReveal.setValue(0);
      return;
    }

    if (!statsRevealConsumed.current) {
      statsRevealConsumed.current = true;
      onStatsRevealConsumedRef.current();
    }

    if (reduceMotion) {
      statsReveal.setValue(1);
      return;
    }

    Animated.timing(statsReveal, {
      duration: 360,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [animateStatsReveal, isQueued, reduceMotion, shouldShowStats, statsContentHeight, statsReveal]);

  useEffect(() => {
    if (!sessionEnded) {
      return;
    }

    if (readOnly && profile.sessionId) {
      onViewedQueueEnded();
      return;
    }

    if (!readOnly) {
      onLeftQueue();
    }
  }, [onLeftQueue, onViewedQueueEnded, profile.sessionId, readOnly, sessionEnded]);

  async function handleRosterMembership(playerId: string, inSession: boolean) {
    setRosterError(null);

    try {
      if (profile.sessionId) {
        return await setPlayerInExistingSession(playerId, inSession);
      }

      if (!inSession) {
        return false;
      }

      const player = players.find((candidate) => candidate.id === playerId);

      if (!player) {
        return false;
      }

      return await onAddPlayerToQueue(player.id, player.name);
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : "Could not update the queue.");
      return false;
    }
  }

  async function handleAddNewPlayer(displayName: string) {
    setRosterError(null);

    try {
      if (profile.sessionId) {
        return await addNewPlayerToExistingSession(displayName);
      }

      return await onAddPlayerToQueue(null, displayName);
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : "Could not add the player.");
      return false;
    }
  }

  async function handleQueueMembership() {
    if (readOnly) {
      setUpdatingMembership(true);
      await onJoinQueue();
      setUpdatingMembership(false);
      return;
    }

    const nextInSession = !isQueued;

    setUpdatingMembership(true);
    const updated = await setPlayerInExistingSession(profile.playerId, nextInSession);
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
            <Text style={styles.queueActionText}>{readOnly ? "Join queue" : membershipActionLabel}</Text>
          </Pressable>
        </View>
        <Animated.View
          accessibilityElementsHidden={!shouldShowStats}
          importantForAccessibility={shouldShowStats ? "auto" : "no-hide-descendants"}
          style={[
            styles.queueDetailsMask,
            {
              height: statsReveal.interpolate({
                inputRange: [0, 1],
                outputRange: [0, statsContentHeight]
              })
            }
          ]}
        >
          <Animated.View
            onLayout={(event) => {
              const nextHeight = event.nativeEvent.layout.height;

              if (nextHeight !== statsContentHeight) {
                setStatsContentHeight(nextHeight);
              }
            }}
            style={[
              styles.queueDetailsContent,
              {
                opacity: statsReveal.interpolate({
                  inputRange: [0, 0.3, 1],
                  outputRange: [0, 0, 1]
                }),
                transform: [
                  {
                    translateY: statsReveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-theme.space[12], 0]
                    })
                  }
                ]
              }
            ]}
          >
            <View style={styles.queueDivider} />
            <View style={styles.queueStats}>
              <QueueStat label="Up after" value={upAfter} />
              <View style={styles.statDivider} />
              <QueueStat label="Rank" value={rank} />
              <View style={styles.statDivider} />
              <QueueStat label="Wait" value={wait} />
            </View>
          </Animated.View>
        </Animated.View>
      </View>
      {errorMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}
      {rosterError ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {rosterError}
        </Text>
      ) : null}
      {loading ? <ActivityIndicator color={theme.color.action.primary} style={styles.loading} /> : null}
      <CurrentPlayersSection
        addNewPlayerToSession={handleAddNewPlayer}
        currentPlayerId={profile.playerId}
        live={live}
        loading={loading}
        players={players}
        readOnly={false}
        setPlayerInSession={handleRosterMembership}
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

function leagueRankLabel(player: Player | null, players: Player[]) {
  if (!player || typeof player.skill !== "number" || !Number.isFinite(player.skill)) {
    return "--";
  }

  const playerSkill = player.skill;
  const playersRankedAbove = players.filter(
    (candidate) =>
      typeof candidate.skill === "number" &&
      Number.isFinite(candidate.skill) &&
      candidate.skill > playerSkill
  ).length;

  return `#${playersRankedAbove + 1}`;
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
    padding: theme.layout.cardPadding
  },
  queueDetailsContent: {
    gap: theme.layout.stackDefault,
    paddingTop: theme.layout.stackDefault
  },
  queueDetailsMask: {
    overflow: "hidden"
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
