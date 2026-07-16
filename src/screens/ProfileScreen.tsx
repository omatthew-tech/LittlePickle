import { useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../components/ActionButton";
import { PlayerRow } from "../components/PlayerRow";
import { RallyIcon } from "../components/RallyIcon";
import { SearchField } from "../components/SearchField";
import { theme } from "../design/theme";
import { useAuth } from "../lib/auth";
import {
  searchLeaguePlayerNames,
  updatePlayerDisplayName,
  updatePlayerProfileImage,
  type LeaguePlayerNameMatch
} from "../lib/littlePickleData";
import {
  getActiveLocalPlayerProfile,
  saveActiveLocalPlayerProfile,
  type LocalPlayerProfile
} from "../lib/localGuestProfile";
import { publicProfileImageUrl, uploadProfileImage } from "../lib/profileImages";

type SupportedProfileImageType = "image/jpeg" | "image/png" | "image/webp";

type ProfileScreenProps = {
  onActiveProfileChanged?: (profile: LocalPlayerProfile) => void;
};

export function ProfileScreen({ onActiveProfileChanged }: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { configured, ensureAnonymousSession } = useAuth();
  const [activeProfile, setActiveProfile] = useState<LocalPlayerProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameDraft, setNameDraft] = useState("");
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switchLoading, setSwitchLoading] = useState(false);
  const [switchPlayers, setSwitchPlayers] = useState<LeaguePlayerNameMatch[]>([]);
  const [switchQuery, setSwitchQuery] = useState("");
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const activeAvatarUrl = useMemo(
    () => (activeProfile?.avatarPath ? publicProfileImageUrl(activeProfile.avatarPath) : null),
    [activeProfile?.avatarPath]
  );

  const normalizedNameDraft = normalizeDisplayName(nameDraft);

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
    setLoading(true);
    setErrorMessage(null);

    try {
      const profile = await getActiveLocalPlayerProfile();
      setActiveProfile(profile);
      setNameDraft(profile?.displayName ?? "");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load profile.");
    } finally {
      setLoading(false);
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
      setNameDraft(updatedProfile.displayName);
      onActiveProfileChanged?.(updatedProfile);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save profile photo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDone() {
    Keyboard.dismiss();
    await saveNameEdit();
  }

  async function saveNameEdit() {
    if (!configured) {
      setErrorMessage("Supabase is not configured.");
      return;
    }

    if (!activeProfile) {
      setErrorMessage("Choose a player before editing your profile.");
      return;
    }

    if (normalizedNameDraft.split(" ").filter(Boolean).length < 2) {
      setErrorMessage("Enter your first and last name.");
      return;
    }

    if (normalizedNameDraft === activeProfile.displayName) {
      setErrorMessage(null);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

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
      onActiveProfileChanged?.(updatedProfile);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save name.");
    } finally {
      setLoading(false);
    }
  }

  function openUserSwitcher() {
    if (!configured) {
      setErrorMessage("Supabase is not configured.");
      return;
    }

    setSwitchError(null);
    setSwitchPlayers([]);
    setSwitchQuery("");
    setSwitcherOpen(true);
  }

  function closeUserSwitcher() {
    setSwitcherOpen(false);
    setSwitchError(null);
    setSwitchLoading(false);
  }

  async function switchToPlayer(player: LeaguePlayerNameMatch) {
    if (!activeProfile) {
      return;
    }

    if (player.id === activeProfile.playerId) {
      closeUserSwitcher();
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
      setNameDraft(updatedProfile.displayName);
      onActiveProfileChanged?.(updatedProfile);
      closeUserSwitcher();
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "Could not switch users.");
      setSwitchLoading(false);
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
            paddingBottom: theme.size.navigationBottomHeight + insets.bottom + theme.space[24],
            paddingTop: insets.top + theme.space[32]
          }
        ]}
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
      >
        <View style={styles.headerRow}>
          <Text accessibilityRole="header" style={styles.pageTitle}>
            Profile
          </Text>
        </View>

        {loading && !activeProfile ? <ActivityIndicator color={theme.color.action.primary} style={styles.loading} /> : null}

        {!loading && !activeProfile ? (
          <Text style={styles.emptyStateText}>Join a queue to access your profile settings</Text>
        ) : null}

        {activeProfile ? (
          <>
            <View style={styles.profileHero}>
              <Pressable
                accessibilityLabel="Change profile photo"
                accessibilityRole="button"
                disabled={loading}
                onPress={() => void handlePickProfileImage()}
                style={({ pressed }) => [styles.avatarButton, pressed ? styles.avatarPressed : null]}
              >
                <View style={styles.avatarFrame}>
                  {activeAvatarUrl ? (
                    <Image source={{ uri: activeAvatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarInitials}>{initialsFor(activeProfile.displayName)}</Text>
                  )}
                </View>
                <View style={styles.cameraBadge}>
                  <RallyIcon color={theme.color.action.primary} name="camera" size={theme.size.iconDefault} />
                </View>
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Display name</Text>
              <TextInput
                accessibilityLabel="Display name"
                autoCapitalize="words"
                editable={!loading}
                onChangeText={setNameDraft}
                onSubmitEditing={() => void handleDone()}
                placeholder="Display name"
                placeholderTextColor={theme.color.text.secondary}
                returnKeyType="done"
                selectionColor={theme.color.action.primary}
                style={styles.nameInput}
                value={nameDraft}
              />
              <ActionButton
                disabled={loading}
                icon="profile"
                label="Switch user"
                onPress={openUserSwitcher}
                style={styles.switchUserButton}
                variant="text"
              />
            </View>
          </>
        ) : null}

        {errorMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>

      <Modal animationType="slide" onRequestClose={closeUserSwitcher} visible={switcherOpen}>
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
              Switch user
            </Text>
            <ActionButton label="Close" onPress={closeUserSwitcher} variant="text" />
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
                  meta={current ? "Current user" : null}
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
    </>
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

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

const avatarSize = 128;
const cameraBadgeSize = 48;

const styles = StyleSheet.create({
  avatarButton: {
    height: avatarSize + theme.space[8],
    width: avatarSize + theme.space[8]
  },
  avatarFrame: {
    alignItems: "center",
    backgroundColor: theme.color.surface.info,
    borderColor: theme.color.border.subtle,
    borderRadius: avatarSize / 2,
    borderWidth: theme.border.quiet,
    height: avatarSize,
    justifyContent: "center",
    overflow: "hidden",
    width: avatarSize
  },
  avatarImage: {
    height: "100%",
    width: "100%"
  },
  avatarInitials: {
    color: theme.color.text.selected,
    fontFamily: theme.font.interface,
    fontSize: 40,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 48
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
    bottom: theme.space[6],
    height: cameraBadgeSize,
    justifyContent: "center",
    position: "absolute",
    right: theme.space[2],
    width: cameraBadgeSize,
    ...theme.shadow.card
  },
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error,
    marginTop: theme.space[12]
  },
  emptyStateText: {
    ...theme.type.bodyDefault,
    color: theme.color.text.secondary,
    marginTop: theme.space[40]
  },
  fieldLabel: {
    ...theme.type.bodyDefault,
    color: theme.color.text.secondary
  },
  formGroup: {
    gap: theme.space[8],
    marginTop: theme.space[40]
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  nameInput: {
    ...theme.type.bodyDefault,
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.control,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.interactive,
    color: theme.color.text.primary,
    height: 56,
    includeFontPadding: false,
    lineHeight: theme.space[24],
    minHeight: 56,
    paddingHorizontal: theme.space[16],
    textAlignVertical: "center"
  },
  loading: {
    marginTop: theme.space[40]
  },
  pageTitle: {
    ...theme.type.headingBrand,
    color: theme.color.text.primary
  },
  profileHero: {
    alignItems: "center",
    marginTop: theme.space[40]
  },
  screen: {
    backgroundColor: theme.color.surface.canvas,
    flexGrow: 1,
    paddingHorizontal: theme.space[24]
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
  switchUserButton: {
    alignSelf: "flex-start",
    marginLeft: -theme.space[12]
  }
});
