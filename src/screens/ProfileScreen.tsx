import { useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../components/ActionButton";
import { MatchHistoryModal } from "../components/MatchHistoryModal";
import { PlayerRow } from "../components/PlayerRow";
import { RallyIcon } from "../components/RallyIcon";
import { ScoreReportModal } from "../components/ScoreReportModal";
import { SearchField } from "../components/SearchField";
import { theme } from "../design/theme";
import { useAuth } from "../lib/auth";
import {
  deactivatePlayer,
  getPlayerCompletedMatches,
  getPlayerProfileOverview,
  searchLeaguePlayerNames,
  updateCompletedMatchResult,
  updatePlayerDisplayName,
  updatePlayerProfileImage,
  type LeaguePlayerNameMatch,
  type NearbyPlayer,
  type PlayerMatchHistoryResponse,
  type ProfileOverview
} from "../lib/littlePickleData";
import {
  clearActiveLocalPlayerProfile,
  getActiveLocalPlayerProfile,
  saveActiveLocalPlayerProfile,
  type LocalPlayerProfile
} from "../lib/localGuestProfile";
import { activeMatchTeams } from "../lib/matchRecommendationMapping";
import { publicProfileImageUrl, uploadProfileImage } from "../lib/profileImages";
import type { CompletedMatch, MatchResultInput } from "../types/matchFlow";

type SupportedProfileImageType = "image/jpeg" | "image/png" | "image/webp";

type ProfileScreenProps = {
  onActiveProfileChanged?: (profile: LocalPlayerProfile) => void;
  onActiveProfileDeactivated?: () => void;
};

export function ProfileScreen({
  onActiveProfileChanged,
  onActiveProfileDeactivated
}: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { configured, ensureAnonymousSession } = useAuth();
  const [activeProfile, setActiveProfile] = useState<LocalPlayerProfile | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [matchHistory, setMatchHistory] = useState<PlayerMatchHistoryResponse | null>(null);
  const [matchHistoryLoading, setMatchHistoryLoading] = useState(false);
  const [matchHistoryOpen, setMatchHistoryOpen] = useState(false);
  const [historyEditMatchId, setHistoryEditMatchId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameEditError, setNameEditError] = useState<string | null>(null);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [overview, setOverview] = useState<ProfileOverview | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switchLoading, setSwitchLoading] = useState(false);
  const [switchPlayers, setSwitchPlayers] = useState<LeaguePlayerNameMatch[]>([]);
  const [switchQuery, setSwitchQuery] = useState("");
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const profileDisplayName = overview?.player.display_name ?? activeProfile?.displayName ?? "";
  const profileAvatarPath = overview?.player.profile_image_path ?? activeProfile?.avatarPath ?? null;
  const activeAvatarUrl = profileAvatarPath ? publicProfileImageUrl(profileAvatarPath) : null;
  const nearbyPlayers = overview?.nearby_players ?? [];
  const normalizedNameDraft = normalizeDisplayName(nameDraft);
  const historyEditMatch = useMemo(
    () => matchHistory?.matches.find((match) => match.id === historyEditMatchId) ?? null,
    [historyEditMatchId, matchHistory?.matches]
  );
  const historyEditTeams = useMemo(
    () => (historyEditMatch ? activeMatchTeams(historyEditMatch) : null),
    [historyEditMatch]
  );

  useEffect(() => {
    void loadLocalProfileData();
  }, []);

  useEffect(() => {
    if (!switcherOpen || !activeProfile || !configured) {
      return undefined;
    }

    let cancelled = false;
    const searchTimer = setTimeout(() => {
      setSwitchLoading(true);
      setSwitchError(null);

      searchLeaguePlayerNames(activeProfile.leagueId, switchQuery)
        .then((players) => {
          if (!cancelled) {
            setSwitchPlayers(players);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setSwitchError(error instanceof Error ? error.message : "Could not load players.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSwitchLoading(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(searchTimer);
    };
  }, [activeProfile, configured, switchQuery, switcherOpen]);

  async function loadLocalProfileData() {
    setProfileLoading(true);
    setErrorMessage(null);

    try {
      const profile = await getActiveLocalPlayerProfile();
      setActiveProfile(profile);
      setNameDraft(profile?.displayName ?? "");

      if (profile) {
        await refreshOverview(profile);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function refreshOverview(profile: LocalPlayerProfile = activeProfile!) {
    if (!profile) {
      return null;
    }

    if (!configured) {
      setErrorMessage("Supabase is not configured.");
      return null;
    }

    setDashboardLoading(true);
    setErrorMessage(null);

    try {
      const nextOverview = await getPlayerProfileOverview(profile.leagueId, profile.playerId);
      setOverview(nextOverview);

      const profileChanged =
        profile.avatarPath !== nextOverview.player.profile_image_path ||
        profile.displayName !== nextOverview.player.display_name ||
        profile.rating !== nextOverview.player.rating;

      if (profileChanged) {
        const syncedProfile = await saveActiveLocalPlayerProfile({
          avatarPath: nextOverview.player.profile_image_path,
          displayName: nextOverview.player.display_name,
          leagueId: profile.leagueId,
          leagueName: profile.leagueName,
          playerId: profile.playerId,
          rating: nextOverview.player.rating,
          sessionId: profile.sessionId ?? null
        });

        setActiveProfile(syncedProfile);
        setNameDraft(syncedProfile.displayName);
        onActiveProfileChanged?.(syncedProfile);
      }

      return nextOverview;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load profile details.";

      if (isUnavailablePlayerMessage(message)) {
        await clearActiveProfile();
        return null;
      }

      setErrorMessage(message);
      return null;
    } finally {
      setDashboardLoading(false);
    }
  }

  async function handlePickProfileImage() {
    if (!configured) {
      setErrorMessage("Supabase is not configured.");
      return;
    }

    if (!activeProfile) {
      setErrorMessage("Choose a player before editing your profile.");
      return;
    }

    setErrorMessage(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setErrorMessage("Photo library access is required.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ["images"],
        quality: 0.85
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      setProfileBusy(true);
      await ensureAnonymousSession();

      const upload = await uploadProfileImage({
        contentType: contentTypeForImageAsset(result.assets[0]),
        uri: result.assets[0].uri
      });
      const updatedPlayer = await updatePlayerProfileImage(activeProfile.playerId, upload.path);
      const updatedProfile = await saveActiveLocalPlayerProfile({
        avatarPath: updatedPlayer.profile_image_path,
        displayName: updatedPlayer.display_name,
        leagueId: activeProfile.leagueId,
        leagueName: activeProfile.leagueName,
        playerId: activeProfile.playerId,
        rating: updatedPlayer.rating,
        sessionId: activeProfile.sessionId ?? null
      });

      setActiveProfile(updatedProfile);
      setNameDraft(updatedProfile.displayName);
      onActiveProfileChanged?.(updatedProfile);
      await refreshOverview(updatedProfile);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save profile photo.");
    } finally {
      setProfileBusy(false);
    }
  }

  function openNameEditor() {
    setNameDraft(profileDisplayName);
    setNameEditError(null);
    setNameEditorOpen(true);
  }

  function closeNameEditor() {
    Keyboard.dismiss();
    setNameDraft(profileDisplayName);
    setNameEditError(null);
    setNameEditorOpen(false);
  }

  async function saveNameEdit() {
    Keyboard.dismiss();

    if (!configured) {
      setNameEditError("Supabase is not configured.");
      return;
    }

    if (!activeProfile) {
      setNameEditError("Choose a player before editing your profile.");
      return;
    }

    if (normalizedNameDraft.split(" ").filter(Boolean).length < 2) {
      setNameEditError("Enter your first and last name.");
      return;
    }

    if (normalizedNameDraft === profileDisplayName) {
      closeNameEditor();
      return;
    }

    setProfileBusy(true);
    setNameEditError(null);

    try {
      await ensureAnonymousSession();

      const updatedPlayer = await updatePlayerDisplayName(activeProfile.playerId, normalizedNameDraft);
      const updatedProfile = await saveActiveLocalPlayerProfile({
        avatarPath: updatedPlayer.profile_image_path ?? activeProfile.avatarPath ?? null,
        displayName: updatedPlayer.display_name,
        leagueId: activeProfile.leagueId,
        leagueName: activeProfile.leagueName,
        playerId: activeProfile.playerId,
        rating: updatedPlayer.rating,
        sessionId: activeProfile.sessionId ?? null
      });

      setActiveProfile(updatedProfile);
      setNameDraft(updatedProfile.displayName);
      setNameEditorOpen(false);
      onActiveProfileChanged?.(updatedProfile);
      await refreshOverview(updatedProfile);
    } catch (error) {
      setNameEditError(error instanceof Error ? error.message : "Could not save name.");
    } finally {
      setProfileBusy(false);
    }
  }

  function openPlayerSwitcher() {
    if (!configured) {
      setErrorMessage("Supabase is not configured.");
      return;
    }

    setSwitchError(null);
    setSwitchPlayers([]);
    setSwitchQuery("");
    setSwitcherOpen(true);
  }

  function closePlayerSwitcher() {
    setSwitcherOpen(false);
    setSwitchError(null);
    setSwitchLoading(false);
  }

  async function switchToPlayer(player: LeaguePlayerNameMatch) {
    if (!activeProfile) {
      return;
    }

    if (player.id === activeProfile.playerId) {
      closePlayerSwitcher();
      return;
    }

    setSwitchLoading(true);
    setSwitchError(null);

    try {
      const updatedProfile = await saveActiveLocalPlayerProfile({
        avatarPath: player.profile_image_path,
        displayName: player.display_name,
        leagueId: activeProfile.leagueId,
        leagueName: activeProfile.leagueName,
        playerId: player.id,
        rating: player.rating,
        sessionId: activeProfile.sessionId ?? null
      });

      setActiveProfile(updatedProfile);
      setHistoryEditMatchId(null);
      setMatchHistory(null);
      setMatchHistoryOpen(false);
      setNameDraft(updatedProfile.displayName);
      setOverview(null);
      onActiveProfileChanged?.(updatedProfile);
      closePlayerSwitcher();
      await refreshOverview(updatedProfile);
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "Could not switch players.");
      setSwitchLoading(false);
    }
  }

  async function fetchPlayerHistory(profile: LocalPlayerProfile = activeProfile!) {
    if (!profile) {
      return null;
    }

    if (!configured) {
      setErrorMessage("Supabase is not configured.");
      return null;
    }

    setMatchHistoryLoading(true);
    setErrorMessage(null);

    try {
      const response = await getPlayerCompletedMatches(profile.leagueId, profile.playerId);
      setMatchHistory(response);
      return response;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load match history.");
      return null;
    } finally {
      setMatchHistoryLoading(false);
    }
  }

  async function handleOpenMatchHistory() {
    const response = await fetchPlayerHistory();

    if (response) {
      setMatchHistoryOpen(true);
    }
  }

  async function handleEditHistoryMatch(match: CompletedMatch) {
    const refreshedHistory = await fetchPlayerHistory();

    if (!refreshedHistory) {
      Alert.alert("Could not edit result", "Check your connection and try again.");
      return;
    }

    const refreshedMatch = refreshedHistory.matches.find((candidate) => candidate.id === match.id);

    if (!refreshedMatch) {
      Alert.alert("Match unavailable", "This match is no longer available.");
      return;
    }

    setMatchHistoryOpen(false);
    setHistoryEditMatchId(refreshedMatch.id);
  }

  function handleCloseHistoryEdit() {
    setHistoryEditMatchId(null);
    setMatchHistoryOpen(true);
  }

  async function handleSubmitHistoryEdit(result: MatchResultInput) {
    if (!historyEditMatchId || !activeProfile) {
      return false;
    }

    try {
      await ensureAnonymousSession();
      await updateCompletedMatchResult(
        historyEditMatchId,
        result.resultMode === "score"
          ? {
              result_mode: "score",
              team_one_score: result.teamOneScore,
              team_two_score: result.teamTwoScore
            }
          : {
              result_mode: "win_loss",
              winning_team: result.winningTeam
            }
      );

      setHistoryEditMatchId(null);
      await Promise.all([fetchPlayerHistory(activeProfile), refreshOverview(activeProfile)]);
      setMatchHistoryOpen(true);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update the match result.";
      setErrorMessage(message);
      Alert.alert("Result not saved", message);
      await fetchPlayerHistory(activeProfile);
      return false;
    }
  }

  function confirmDeactivatePlayer() {
    if (!activeProfile || profileBusy) {
      return;
    }

    Alert.alert(
      "Delete profile?",
      "This account will be immediately unavailable and will no longer be visible in the app. " +
        "The player's information will be permanently deleted in 30 days unless support@littlepickle.com " +
        "or a league admin is notified.",
      [
        {
          style: "cancel",
          text: "Cancel"
        },
        {
          onPress: () => void handleDeactivatePlayer(),
          style: "destructive",
          text: "Delete profile"
        }
      ]
    );
  }

  async function handleDeactivatePlayer() {
    if (!activeProfile) {
      return;
    }

    if (!configured) {
      setErrorMessage("Supabase is not configured.");
      return;
    }

    setProfileBusy(true);
    setErrorMessage(null);

    try {
      await ensureAnonymousSession();
      await deactivatePlayer(activeProfile.playerId);
      await clearActiveProfile();
      Alert.alert(
        "Player deactivated",
        "The player is no longer available. Contact support@littlepickle.com or a league admin within 30 days to restore it."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not deactivate the player.";
      setErrorMessage(message);
      Alert.alert("Player not deactivated", message);
    } finally {
      setProfileBusy(false);
    }
  }

  async function clearActiveProfile() {
    await clearActiveLocalPlayerProfile();
    setActiveProfile(null);
    setHistoryEditMatchId(null);
    setMatchHistory(null);
    setMatchHistoryOpen(false);
    setNameDraft("");
    setOverview(null);
    setSwitcherOpen(false);
    onActiveProfileDeactivated?.();
  }

  return (
    <>
      <ScrollView
        accessibilityLabel="Profile"
        alwaysBounceVertical={false}
        bounces={false}
        contentContainerStyle={[
          styles.screen,
          {
            paddingBottom: theme.size.navigationBottomHeight + insets.bottom + theme.space[24],
            paddingTop: insets.top + theme.space[32]
          }
        ]}
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" style={styles.pageTitle}>
          Profile
        </Text>

        {profileLoading && !activeProfile ? (
          <ActivityIndicator color={theme.color.action.primary} style={styles.loading} />
        ) : null}

        {!profileLoading && !activeProfile ? (
          <Text style={styles.emptyStateText}>Join a queue to access your profile settings</Text>
        ) : null}

        {activeProfile ? (
          <>
            <View style={styles.identityCard}>
              <View style={styles.identityRow}>
                <Pressable
                  accessibilityLabel="Change profile photo"
                  accessibilityRole="button"
                  disabled={profileBusy}
                  onPress={() => void handlePickProfileImage()}
                  style={({ pressed }) => [styles.avatarButton, pressed ? styles.avatarPressed : null]}
                >
                  <ProfileAvatar
                    avatarUrl={activeAvatarUrl}
                    displayName={profileDisplayName}
                    size={profileAvatarSize}
                    textStyle={styles.profileAvatarInitials}
                  />
                  <View style={styles.cameraBadge}>
                    <RallyIcon color={theme.color.action.primary} name="camera" size={theme.size.iconDefault} />
                  </View>
                </Pressable>

                <View style={styles.identityDetails}>
                  <View style={styles.nameRow}>
                    <Text numberOfLines={2} style={styles.profileName}>
                      {profileDisplayName}
                    </Text>
                    <Pressable
                      accessibilityLabel="Edit display name"
                      accessibilityRole="button"
                      disabled={profileBusy}
                      hitSlop={theme.space[12]}
                      onPress={openNameEditor}
                      style={({ pressed }) => [styles.pencilButton, pressed ? styles.iconPressed : null]}
                    >
                      <RallyIcon color={theme.color.action.primary} name="pencil" size={theme.size.iconCompact} />
                    </Pressable>
                  </View>
                  <View accessibilityElementsHidden importantForAccessibility="no" style={styles.identityDivider} />
                  <ActionButton
                    disabled={profileBusy}
                    icon="profile"
                    label="Switch player"
                    onPress={openPlayerSwitcher}
                    style={styles.switchPlayerButton}
                    variant="text"
                  />
                </View>
              </View>
            </View>

            <View style={styles.statsSection}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Your Stats
              </Text>
              <View style={styles.statsCard}>
                <View style={styles.statsRow}>
                  <ProfileStat label="Rank" value={overview ? `#${overview.stats.rank}` : "--"} />
                  <View accessibilityElementsHidden importantForAccessibility="no" style={styles.statDivider} />
                  <ProfileStat label="Hours played" value={overview ? String(overview.stats.hours_played) : "--"} />
                  <View accessibilityElementsHidden importantForAccessibility="no" style={styles.statDivider} />
                  <Pressable
                    accessibilityLabel={`Matches, ${overview?.stats.match_count ?? "loading"}`}
                    accessibilityRole="button"
                    disabled={matchHistoryLoading}
                    onPress={() => void handleOpenMatchHistory()}
                    style={({ pressed }) => [
                      styles.stat,
                      styles.matchesStat,
                      pressed ? styles.matchesStatPressed : null
                    ]}
                  >
                    <Text adjustsFontSizeToFit numberOfLines={1} style={styles.statValue}>
                      {overview ? String(overview.stats.match_count) : "--"}
                    </Text>
                    <View style={styles.matchesLabelRow}>
                      <Text numberOfLines={1} style={styles.statLabel}>
                        Matches
                      </Text>
                      {matchHistoryLoading ? (
                        <ActivityIndicator color={theme.color.text.primary} size="small" />
                      ) : (
                        <View style={styles.chevron}>
                          <RallyIcon color={theme.color.text.primary} name="back" size={theme.size.iconCompact} />
                        </View>
                      )}
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>

            {dashboardLoading && !overview ? (
              <NearbyPlayersPlaceholder />
            ) : nearbyPlayers.length > 0 ? (
              <NearbyPlayers players={nearbyPlayers} />
            ) : null}

            <View style={styles.accountSection}>
              <Pressable
                accessibilityLabel="Delete profile"
                accessibilityRole="button"
                disabled={profileBusy}
                onPress={confirmDeactivatePlayer}
                style={({ pressed }) => [
                  styles.deleteProfileButton,
                  pressed ? styles.deleteProfileButtonPressed : null
                ]}
              >
                <Text style={[styles.deleteProfileText, profileBusy ? styles.deleteProfileTextDisabled : null]}>
                  {profileBusy ? "Deleting..." : "Delete profile"}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {errorMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!profileBusy) {
            closeNameEditor();
          }
        }}
        transparent
        visible={nameEditorOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.nameEditorBackdrop}
        >
          <View pointerEvents="none" style={styles.nameEditorTint} />
          <View accessibilityViewIsModal style={styles.nameEditorDialog}>
            <View style={styles.nameEditorHeader}>
              <Text accessibilityRole="header" style={styles.nameEditorTitle}>
                Edit display name
              </Text>
              <Text style={styles.nameEditorHelp}>Enter the player&apos;s first and last name.</Text>
            </View>
            <TextInput
              accessibilityLabel="Display name"
              autoCapitalize="words"
              autoFocus
              editable={!profileBusy}
              onChangeText={setNameDraft}
              onSubmitEditing={() => void saveNameEdit()}
              placeholder="Display name"
              placeholderTextColor={theme.color.text.secondary}
              returnKeyType="done"
              selectionColor={theme.color.action.primary}
              style={styles.nameInput}
              value={nameDraft}
            />
            {nameEditError ? (
              <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                {nameEditError}
              </Text>
            ) : null}
            <View style={styles.nameEditorActions}>
              <ActionButton disabled={profileBusy} label="Cancel" onPress={closeNameEditor} variant="text" />
              <ActionButton disabled={profileBusy} label="Save" onPress={() => void saveNameEdit()} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="slide" onRequestClose={closePlayerSwitcher} visible={switcherOpen}>
        <View
          accessibilityViewIsModal
          style={[
            styles.switcherScreen,
            {
              paddingBottom: insets.bottom + theme.space[20],
              paddingTop: insets.top + theme.space[20]
            }
          ]}
        >
          <View style={styles.switcherHeader}>
            <Text accessibilityRole="header" style={styles.switcherTitle}>
              Switch player
            </Text>
            <ActionButton label="Close" onPress={closePlayerSwitcher} variant="text" />
          </View>
          <Text style={styles.switcherHelp}>
            Choose a player from {activeProfile?.leagueName ?? "this league"}.
          </Text>
          <SearchField
            label="Search players"
            onChangeText={setSwitchQuery}
            onSubmit={() => undefined}
            placeholder="Search players"
            scope="player"
            value={switchQuery}
          />
          {switchError ? (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {switchError}
            </Text>
          ) : null}
          {switchLoading ? <ActivityIndicator color={theme.color.action.primary} /> : null}
          <ScrollView
            contentContainerStyle={styles.switcherList}
            keyboardShouldPersistTaps="handled"
            style={styles.switcherResults}
          >
            {switchPlayers.map((player) => {
              const current = player.id === activeProfile?.playerId;

              return (
                <PlayerRow
                  avatarInitials={initialsFor(player.display_name)}
                  avatarUrl={player.profile_image_path ? publicProfileImageUrl(player.profile_image_path) : null}
                  key={player.id}
                  meta={current ? "Current player" : null}
                  name={player.display_name}
                  onSelectionChange={switchLoading ? undefined : () => void switchToPlayer(player)}
                  selected={current}
                />
              );
            })}
            {!switchLoading && switchPlayers.length === 0 && !switchError ? (
              <Text style={styles.emptyStateText}>No players found.</Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <MatchHistoryModal
        matches={matchHistory?.matches ?? []}
        onClose={() => setMatchHistoryOpen(false)}
        onEditMatch={(match) => void handleEditHistoryMatch(match)}
        scoreModeEnabled={matchHistory?.score_mode_enabled ?? false}
        visible={matchHistoryOpen}
      />

      {historyEditMatch && historyEditTeams ? (
        <ScoreReportModal
          initialTeamOneScore={
            matchHistory?.score_mode_enabled && historyEditMatch.result_mode === "score"
              ? historyEditMatch.team_one_score
              : null
          }
          initialTeamTwoScore={
            matchHistory?.score_mode_enabled && historyEditMatch.result_mode === "score"
              ? historyEditMatch.team_two_score
              : null
          }
          initialWinningTeam={!matchHistory?.score_mode_enabled ? historyEditMatch.winning_team : null}
          onClose={handleCloseHistoryEdit}
          onSubmit={handleSubmitHistoryEdit}
          resultMode={matchHistory?.score_mode_enabled ? "score" : "win_loss"}
          teams={historyEditTeams}
          title={matchHistory?.score_mode_enabled ? "Edit score" : "Edit result"}
          visible
        />
      ) : null}
    </>
  );
}

function ProfileAvatar({
  avatarUrl,
  displayName,
  size,
  textStyle
}: {
  avatarUrl: string | null;
  displayName: string;
  size: number;
  textStyle: object;
}) {
  return (
    <View
      style={[
        styles.avatarFrame,
        {
          borderRadius: size / 2,
          height: size,
          width: size
        }
      ]}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
      ) : (
        <Text numberOfLines={1} style={textStyle}>
          {initialsFor(displayName)}
        </Text>
      )}
    </View>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.stat}>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

function NearbyPlayers({ players }: { players: NearbyPlayer[] }) {
  return (
    <View style={styles.nearbySection}>
      <Text style={styles.sectionTitle}>Players near your level</Text>
      <View style={styles.nearbyPlayersRow}>
        {players.map((player) => {
          const avatarUrl = player.profile_image_path
            ? publicProfileImageUrl(player.profile_image_path)
            : null;

          return (
            <View
              accessibilityLabel={`${player.display_name}, player near your level`}
              accessible
              key={player.id}
              style={styles.nearbyPlayer}
            >
              <ProfileAvatar
                avatarUrl={avatarUrl}
                displayName={player.display_name}
                size={nearbyAvatarSize}
                textStyle={styles.nearbyAvatarInitials}
              />
              <Text adjustsFontSizeToFit numberOfLines={1} style={styles.nearbyPlayerName}>
                {firstNameFor(player.display_name)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function NearbyPlayersPlaceholder() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.nearbySection}
    >
      <Text style={styles.sectionTitle}>Players near your level</Text>
      <View style={styles.nearbyPlayersRow}>
        {[0, 1, 2].map((placeholder) => (
          <View key={placeholder} style={styles.nearbyPlayer}>
            <View style={styles.nearbyAvatarPlaceholder} />
            <View style={styles.nearbyNamePlaceholder} />
          </View>
        ))}
      </View>
    </View>
  );
}

function contentTypeForImageAsset(asset: ImagePicker.ImagePickerAsset): SupportedProfileImageType {
  const mimeType = asset.mimeType?.toLowerCase();

  if (mimeType === "image/png" || mimeType === "image/webp" || mimeType === "image/jpeg") {
    return mimeType;
  }

  const uri = asset.uri.toLowerCase();

  if (uri.endsWith(".png")) {
    return "image/png";
  }

  if (uri.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

function initialsFor(value: string | null | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return "LP";
  }

  return normalizedValue
    .split(/[ @._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function firstNameFor(value: string) {
  return normalizeDisplayName(value).split(" ")[0] ?? value;
}

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isUnavailablePlayerMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("active player") && normalizedMessage.includes("not found");
}

const profileAvatarSize = 96;
const nearbyAvatarSize = 80;
const cameraBadgeSize = 40;

const styles = StyleSheet.create({
  accountSection: {
    marginTop: theme.space[40]
  },
  avatarButton: {
    height: profileAvatarSize + theme.space[8],
    width: profileAvatarSize + theme.space[8]
  },
  avatarFrame: {
    alignItems: "center",
    backgroundColor: theme.color.surface.info,
    borderColor: theme.color.border.subtle,
    borderWidth: theme.border.quiet,
    justifyContent: "center",
    overflow: "hidden"
  },
  avatarImage: {
    height: "100%",
    width: "100%"
  },
  avatarPressed: {
    opacity: 0.72
  },
  cameraBadge: {
    alignItems: "center",
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: cameraBadgeSize / 2,
    borderWidth: theme.border.quiet,
    bottom: theme.space[2],
    height: cameraBadgeSize,
    justifyContent: "center",
    position: "absolute",
    right: theme.space[0],
    width: cameraBadgeSize,
    ...theme.shadow.card
  },
  deleteProfileButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    justifyContent: "center",
    marginLeft: -theme.space[12],
    minHeight: theme.size.targetMinimum,
    paddingHorizontal: theme.space[12]
  },
  deleteProfileButtonPressed: {
    opacity: 0.55
  },
  deleteProfileText: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  deleteProfileTextDisabled: {
    opacity: 0.55
  },
  chevron: {
    transform: [{ rotate: "180deg" }]
  },
  emptyStateText: {
    ...theme.type.bodyDefault,
    color: theme.color.text.secondary,
    marginTop: theme.space[40]
  },
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error,
    marginTop: theme.space[12]
  },
  iconPressed: {
    opacity: 0.64
  },
  identityCard: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    marginTop: theme.space[20],
    padding: theme.space[16]
  },
  identityDetails: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0
  },
  identityDivider: {
    backgroundColor: theme.color.border.subtle,
    height: theme.border.quiet,
    marginVertical: theme.space[8],
    width: "100%"
  },
  identityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.space[16]
  },
  loading: {
    marginTop: theme.space[40]
  },
  matchesLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.space[2],
    justifyContent: "center"
  },
  matchesStat: {
    borderRadius: theme.radius.control
  },
  matchesStatPressed: {
    backgroundColor: "rgba(255, 253, 248, 0.35)"
  },
  nameEditorActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.space[12],
    justifyContent: "flex-end"
  },
  nameEditorBackdrop: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: theme.layout.screenInset
  },
  nameEditorDialog: {
    ...theme.shadow.card,
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.space[20],
    maxWidth: 480,
    padding: theme.space[24],
    width: "100%"
  },
  nameEditorHeader: {
    gap: theme.space[4]
  },
  nameEditorHelp: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  nameEditorTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(34, 40, 58, 0.45)"
  },
  nameEditorTitle: {
    ...theme.type.headingSection,
    color: theme.color.text.primary
  },
  nameInput: {
    ...theme.type.bodyDefault,
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.control,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.interactive,
    color: theme.color.text.primary,
    height: theme.size.controlMinimumHeight,
    includeFontPadding: false,
    lineHeight: theme.space[24],
    minHeight: theme.size.controlMinimumHeight,
    paddingHorizontal: theme.space[16],
    textAlignVertical: "center"
  },
  nameRow: {
    alignItems: "center",
    flexDirection: "row",
    minWidth: 0
  },
  nearbyAvatarInitials: {
    color: theme.color.action.primary,
    fontFamily: theme.font.interfaceSemibold,
    fontSize: 32,
    fontWeight: "600",
    lineHeight: 40
  },
  nearbyAvatarPlaceholder: {
    backgroundColor: theme.color.surface.info,
    borderColor: theme.color.border.subtle,
    borderRadius: nearbyAvatarSize / 2,
    borderWidth: theme.border.quiet,
    height: nearbyAvatarSize,
    opacity: 0.56,
    width: nearbyAvatarSize
  },
  nearbyNamePlaceholder: {
    backgroundColor: theme.color.border.subtle,
    borderRadius: theme.radius.pill,
    height: theme.space[12],
    opacity: 0.56,
    width: theme.space[48]
  },
  nearbyPlayer: {
    alignItems: "center",
    flex: 1,
    gap: theme.space[8],
    minWidth: 0
  },
  nearbyPlayerName: {
    ...theme.type.bodyDefault,
    color: theme.color.text.primary,
    maxWidth: "100%"
  },
  nearbyPlayersRow: {
    flexDirection: "row",
    gap: theme.space[12],
    justifyContent: "space-between",
    marginTop: theme.space[24]
  },
  nearbySection: {
    marginTop: theme.space[40]
  },
  pageTitle: {
    ...theme.type.headingPage,
    color: theme.color.text.primary
  },
  pencilButton: {
    alignItems: "center",
    height: theme.size.targetMinimum,
    justifyContent: "center",
    marginLeft: theme.space[4],
    width: theme.size.targetMinimum
  },
  profileAvatarInitials: {
    color: theme.color.action.primary,
    fontFamily: theme.font.interfaceSemibold,
    fontSize: 36,
    fontWeight: "600",
    lineHeight: 44
  },
  profileName: {
    ...theme.type.headingSection,
    color: theme.color.text.primary,
    flexShrink: 1
  },
  screen: {
    backgroundColor: theme.color.surface.canvas,
    flexGrow: 1,
    paddingHorizontal: theme.layout.screenInset
  },
  sectionTitle: {
    ...theme.type.headingSection,
    color: theme.color.text.primary
  },
  stat: {
    alignItems: "center",
    flex: 1,
    gap: theme.space[4],
    justifyContent: "center",
    minHeight: 80,
    minWidth: 0,
    paddingHorizontal: theme.space[4]
  },
  statDivider: {
    alignSelf: "stretch",
    backgroundColor: "rgba(34, 40, 58, 0.18)",
    width: theme.border.quiet
  },
  statLabel: {
    ...theme.type.bodySecondary,
    color: theme.color.text.primary,
    flexShrink: 1
  },
  statsCard: {
    backgroundColor: theme.color.surface.social,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    marginTop: theme.space[16],
    paddingHorizontal: theme.space[20],
    paddingVertical: theme.space[16]
  },
  statsRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: theme.space[12]
  },
  statsSection: {
    marginTop: theme.space[32]
  },
  statValue: {
    ...theme.type.metricScore,
    color: theme.color.text.primary,
    includeFontPadding: false,
    maxWidth: "100%"
  },
  switcherHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  switcherHelp: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  switcherList: {
    gap: theme.layout.stackCompact,
    paddingBottom: theme.space[20]
  },
  switcherResults: {
    flex: 1
  },
  switcherScreen: {
    backgroundColor: theme.color.surface.canvas,
    flex: 1,
    gap: theme.layout.stackDefault,
    paddingHorizontal: theme.layout.screenInset
  },
  switcherTitle: {
    ...theme.type.headingPage,
    color: theme.color.text.primary
  },
  switchPlayerButton: {
    alignSelf: "flex-start",
    marginLeft: -theme.space[12]
  }
});
