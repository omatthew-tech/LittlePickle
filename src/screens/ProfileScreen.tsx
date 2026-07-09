import { useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../components/ActionButton";
import { SearchField } from "../components/SearchField";
import { theme } from "../design/theme";
import { useAuth } from "../lib/auth";
import {
  getOrganizationOpenSessions,
  searchLeaguePlayerNames,
  searchOrganizations,
  updatePlayerProfileImage,
  type LeaguePlayerNameMatch,
  type OrganizationSearchResult
} from "../lib/littlePickleData";
import {
  getActiveLocalPlayerProfile,
  getLocalPlayedLeagues,
  saveActiveLocalPlayerProfile,
  saveLocalPlayedLeague,
  type LocalPlayedLeague,
  type LocalPlayerProfile
} from "../lib/localGuestProfile";
import { publicProfileImageUrl, uploadProfileImage } from "../lib/profileImages";

type SupportedProfileImageType = "image/jpeg" | "image/png" | "image/webp";

type ProfileSwitchLeague = {
  id: string;
  leagueName: string;
  locationText?: string | null;
  numberOfCourts?: number | null;
  sessionId?: string | null;
  slug?: string | null;
};

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { configured, ensureAnonymousSession } = useAuth();
  const [activeProfile, setActiveProfile] = useState<LocalPlayerProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [leagueQuery, setLeagueQuery] = useState("");
  const [leagueResults, setLeagueResults] = useState<OrganizationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [playedLeagues, setPlayedLeagues] = useState<LocalPlayedLeague[]>([]);
  const [playerMatches, setPlayerMatches] = useState<LeaguePlayerNameMatch[]>([]);
  const [playerQuery, setPlayerQuery] = useState("");
  const [selectedLeague, setSelectedLeague] = useState<ProfileSwitchLeague | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);

  const activeAvatarUrl = useMemo(
    () => (activeProfile?.avatarPath ? publicProfileImageUrl(activeProfile.avatarPath) : null),
    [activeProfile?.avatarPath]
  );

  const visiblePlayedLeagues = useMemo(() => {
    const normalizedQuery = leagueQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return playedLeagues;
    }

    return playedLeagues.filter((league) => league.leagueName.toLowerCase().includes(normalizedQuery));
  }, [leagueQuery, playedLeagues]);

  useEffect(() => {
    void loadLocalProfileData();
  }, []);

  useEffect(() => {
    if (!switchOpen || !configured || leagueQuery.trim().length < 2 || selectedLeague) {
      setLeagueResults([]);
      return;
    }

    let cancelled = false;

    searchOrganizations(leagueQuery)
      .then((results) => {
        if (!cancelled) {
          setLeagueResults(results);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Could not search leagues.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configured, leagueQuery, selectedLeague, switchOpen]);

  useEffect(() => {
    if (!switchOpen || !selectedLeague || !configured) {
      setPlayerMatches([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    searchLeaguePlayerNames(selectedLeague.id, playerQuery.trim())
      .then((players) => {
        if (!cancelled) {
          setPlayerMatches(players);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load players.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configured, playerQuery, selectedLeague, switchOpen]);

  async function loadLocalProfileData() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [profile, leagues] = await Promise.all([
        getActiveLocalPlayerProfile(),
        getLocalPlayedLeagues()
      ]);
      setActiveProfile(profile);
      setPlayedLeagues(leagues);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }

  function openSwitchUser() {
    setLeagueQuery("");
    setLeagueResults([]);
    setPlayerMatches([]);
    setPlayerQuery("");
    setSelectedLeague(null);
    setErrorMessage(null);
    setSwitchOpen(true);
  }

  function closeSwitchUser() {
    setSwitchOpen(false);
    setLeagueQuery("");
    setLeagueResults([]);
    setPlayerMatches([]);
    setPlayerQuery("");
    setSelectedLeague(null);
  }

  function selectLeague(league: ProfileSwitchLeague) {
    setSelectedLeague(league);
    setPlayerQuery("");
    setPlayerMatches([]);
    setErrorMessage(null);
  }

  async function selectPlayer(player: LeaguePlayerNameMatch) {
    if (!selectedLeague) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const sessionId = await openSessionIdFor(selectedLeague);
      const profile = await saveActiveLocalPlayerProfile({
        avatarPath: player.profile_image_path,
        displayName: player.display_name,
        leagueId: selectedLeague.id,
        leagueName: selectedLeague.leagueName,
        playerId: player.id,
        rating: player.rating,
        sessionId
      });
      await saveLocalPlayedLeague({
        leagueId: selectedLeague.id,
        leagueName: selectedLeague.leagueName,
        locationText: selectedLeague.locationText ?? null,
        numberOfCourts: selectedLeague.numberOfCourts ?? null,
        sessionId,
        slug: selectedLeague.slug ?? null
      });

      setActiveProfile(profile);
      setPlayedLeagues(await getLocalPlayedLeagues());
      closeSwitchUser();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not switch player.");
    } finally {
      setLoading(false);
    }
  }

  async function openSessionIdFor(league: ProfileSwitchLeague) {
    if (league.sessionId) {
      return league.sessionId;
    }

    try {
      const sessions = await getOrganizationOpenSessions(league.id);
      return sessions[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  async function handlePickProfileImage() {
    if (!configured) {
      setErrorMessage("Supabase is not configured.");
      return;
    }

    if (!activeProfile) {
      setErrorMessage("Switch user before adding a profile photo.");
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

      setLoading(true);

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
      setPlayerMatches((players) =>
        players.map((player) => (player.id === updatedPlayer.id ? updatedPlayer : player))
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save profile photo.");
    } finally {
      setLoading(false);
    }
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
            paddingBottom: theme.size.navigationBottomHeight + insets.bottom,
            paddingTop: insets.top + theme.space[20]
          }
        ]}
        overScrollMode="never"
      >
        <Text accessibilityRole="header" style={styles.pageTitle}>
          Profile
        </Text>
        <View style={styles.panel}>
          <View style={styles.avatarRow}>
            <Pressable
              accessibilityLabel={activeProfile ? "Change profile photo" : "Add profile photo"}
              accessibilityRole="button"
              disabled={loading}
              onPress={() => void handlePickProfileImage()}
              style={({ pressed }) => [styles.avatarFrame, pressed ? styles.avatarPressed : null]}
            >
              {activeAvatarUrl ? (
                <Image source={{ uri: activeAvatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{initialsFor(activeProfile?.displayName)}</Text>
              )}
            </Pressable>
            <View style={styles.profileText}>
              <Text style={styles.value}>{activeProfile?.displayName ?? "No player selected"}</Text>
              {activeProfile ? <Text style={styles.label}>{activeProfile.leagueName}</Text> : null}
            </View>
          </View>
          {errorMessage && !switchOpen ? (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : null}
          {loading && !switchOpen ? <ActivityIndicator color={theme.color.action.primary} /> : null}
          <ActionButton disabled={!configured || loading} label="Switch user" onPress={openSwitchUser} />
        </View>
      </ScrollView>
      <Modal animationType="fade" transparent visible={switchOpen} onRequestClose={closeSwitchUser}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.switchDialog} keyboardShouldPersistTaps="handled">
            {selectedLeague ? renderPlayerPicker() : renderLeaguePicker()}
          </ScrollView>
        </View>
      </Modal>
    </>
  );

  function renderLeaguePicker() {
    return (
      <>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Switch user
        </Text>
        <SearchField
          label="Search for a league"
          onChangeText={setLeagueQuery}
          onSubmit={() => undefined}
          placeholder="Search for a league"
          scope="league"
          value={leagueQuery}
        />
        {visiblePlayedLeagues.length > 0 ? (
          <View style={styles.list}>
            <Text style={styles.label}>My leagues</Text>
            {visiblePlayedLeagues.map((league) => (
              <Pressable
                accessibilityLabel={`Choose ${league.leagueName}`}
                accessibilityRole="button"
                key={league.leagueId}
                onPress={() => selectLeague(leagueFromPlayedLeague(league))}
                style={({ pressed }) => [styles.selectRow, pressed ? styles.rowPressed : null]}
              >
                <Text style={styles.value}>{league.leagueName}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {leagueResults.length > 0 ? (
          <View style={styles.list}>
            <Text style={styles.label}>Search results</Text>
            {leagueResults.map((league) => (
              <Pressable
                accessibilityLabel={`Choose ${league.name}`}
                accessibilityRole="button"
                key={league.id}
                onPress={() => selectLeague(leagueFromSearchResult(league))}
                style={({ pressed }) => [styles.selectRow, pressed ? styles.rowPressed : null]}
              >
                <View style={styles.profileText}>
                  <Text style={styles.value}>{league.name}</Text>
                  <Text style={styles.label}>
                    {league.number_of_courts} courts
                    {league.location_text ? ` | ${league.location_text}` : ""}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {errorMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}
        <ActionButton label="Cancel" onPress={closeSwitchUser} variant="text" />
      </>
    );
  }

  function renderPlayerPicker() {
    if (!selectedLeague) {
      return null;
    }

    return (
      <>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {selectedLeague.leagueName}
        </Text>
        <SearchField
          label="Search players"
          onChangeText={setPlayerQuery}
          onSubmit={() => undefined}
          placeholder="Search players"
          scope="player"
          value={playerQuery}
        />
        {loading ? <ActivityIndicator color={theme.color.action.primary} /> : null}
        {playerMatches.length > 0 ? (
          <View style={styles.list}>
            {playerMatches.map((player) => (
              <Pressable
                accessibilityLabel={`Switch to ${player.display_name}`}
                accessibilityRole="button"
                key={player.id}
                onPress={() => void selectPlayer(player)}
                style={({ pressed }) => [styles.playerRow, pressed ? styles.rowPressed : null]}
              >
                <View style={styles.smallAvatar}>
                  <Text style={styles.smallAvatarText}>{initialsFor(player.display_name)}</Text>
                </View>
                <View style={styles.profileText}>
                  <Text style={styles.value}>{player.display_name}</Text>
                  <Text style={styles.label}>{Number(player.rating).toFixed(2)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : !loading && playerQuery.trim().length > 0 ? (
          <Text style={styles.label}>No players found.</Text>
        ) : null}
        {errorMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}
        <View style={styles.bottomActions}>
          <ActionButton label="Back" onPress={() => setSelectedLeague(null)} variant="text" />
          <ActionButton label="Cancel" onPress={closeSwitchUser} variant="text" />
        </View>
      </>
    );
  }
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

function leagueFromPlayedLeague(league: LocalPlayedLeague): ProfileSwitchLeague {
  return {
    id: league.leagueId,
    leagueName: league.leagueName,
    locationText: league.locationText ?? null,
    numberOfCourts: league.numberOfCourts ?? null,
    sessionId: league.sessionId ?? null,
    slug: league.slug ?? null
  };
}

function leagueFromSearchResult(league: OrganizationSearchResult): ProfileSwitchLeague {
  return {
    id: league.id,
    leagueName: league.name,
    locationText: league.location_text ?? null,
    numberOfCourts: league.number_of_courts,
    slug: league.slug
  };
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

const styles = StyleSheet.create({
  avatarFrame: {
    alignItems: "center",
    backgroundColor: theme.color.surface.info,
    borderColor: theme.color.border.subtle,
    borderRadius: 36,
    borderWidth: theme.border.quiet,
    height: 72,
    justifyContent: "center",
    overflow: "hidden",
    width: 72
  },
  avatarImage: {
    height: "100%",
    width: "100%"
  },
  avatarInitials: {
    ...theme.type.titleCard,
    color: theme.color.text.selected
  },
  avatarPressed: {
    opacity: 0.72
  },
  avatarRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.inlineDefault
  },
  bottomActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error
  },
  label: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  list: {
    gap: theme.layout.stackCompact
  },
  modalBackdrop: {
    backgroundColor: "rgba(34, 40, 58, 0.36)",
    flex: 1,
    justifyContent: "center"
  },
  pageTitle: {
    ...theme.type.headingPage,
    color: theme.color.text.primary
  },
  panel: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
    marginTop: theme.layout.stackDefault,
    padding: theme.layout.cardPadding
  },
  playerRow: {
    alignItems: "center",
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.quiet,
    flexDirection: "row",
    gap: theme.layout.inlineDefault,
    minHeight: theme.size.playerRowMinimumHeight,
    padding: theme.space[8]
  },
  profileText: {
    flex: 1,
    gap: theme.space[2],
    minWidth: 0
  },
  rowPressed: {
    backgroundColor: theme.color.surface.info
  },
  screen: {
    backgroundColor: theme.color.surface.canvas,
    flexGrow: 1,
    gap: theme.layout.stackDefault,
    paddingHorizontal: theme.layout.screenInset
  },
  sectionTitle: {
    ...theme.type.headingSection,
    color: theme.color.text.primary
  },
  selectRow: {
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.quiet,
    minHeight: theme.size.targetMinimum,
    justifyContent: "center",
    padding: theme.space[12]
  },
  smallAvatar: {
    alignItems: "center",
    backgroundColor: theme.color.surface.info,
    borderRadius: theme.radius.pill,
    height: theme.size.avatarDefault,
    justifyContent: "center",
    width: theme.size.avatarDefault
  },
  smallAvatarText: {
    ...theme.type.bodySecondary,
    color: theme.color.text.selected,
    fontWeight: "600"
  },
  switchDialog: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
    margin: theme.layout.screenInset,
    padding: theme.layout.cardPadding
  },
  value: {
    ...theme.type.bodyDefault,
    color: theme.color.text.primary
  }
});
