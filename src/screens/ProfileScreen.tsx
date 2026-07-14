import { useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RallyIcon } from "../components/RallyIcon";
import { theme } from "../design/theme";
import { useAuth } from "../lib/auth";
import { updatePlayerDisplayName, updatePlayerProfileImage } from "../lib/littlePickleData";
import {
  getActiveLocalPlayerProfile,
  saveActiveLocalPlayerProfile,
  type LocalPlayerProfile
} from "../lib/localGuestProfile";
import { publicProfileImageUrl, uploadProfileImage } from "../lib/profileImages";

type SupportedProfileImageType = "image/jpeg" | "image/png" | "image/webp";

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { configured, ensureAnonymousSession } = useAuth();
  const [activeProfile, setActiveProfile] = useState<LocalPlayerProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameDraft, setNameDraft] = useState("");

  const activeAvatarUrl = useMemo(
    () => (activeProfile?.avatarPath ? publicProfileImageUrl(activeProfile.avatarPath) : null),
    [activeProfile?.avatarPath]
  );

  const normalizedNameDraft = normalizeDisplayName(nameDraft);

  useEffect(() => {
    void loadLocalProfileData();
  }, []);

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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save name.");
    } finally {
      setLoading(false);
    }
  }

  return (
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
          </View>
        </>
      ) : null}

      {errorMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}
    </ScrollView>
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
  }
});
