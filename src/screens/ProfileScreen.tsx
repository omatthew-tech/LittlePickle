import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../components/ActionButton";
import { theme } from "../design/theme";
import { useAuth } from "../lib/auth";
import { getMyProfile, updateMyProfile } from "../lib/littlePickleData";
import { getLocalGuestLeagueProfiles, type LocalGuestLeagueProfile } from "../lib/localGuestProfile";
import { publicProfileImageUrl, uploadProfileImage } from "../lib/profileImages";

type SupportedProfileImageType = "image/jpeg" | "image/png" | "image/webp";

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { configured, session, signOut } = useAuth();
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localProfiles, setLocalProfiles] = useState<LocalGuestLeagueProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!configured || !session) {
      setAvatarPath(null);
      setAvatarUrl(null);
      setDisplayName("");
      getLocalGuestLeagueProfiles()
        .then(setLocalProfiles)
        .catch(() => setLocalProfiles([]));
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    getMyProfile()
      .then((profile) => {
        if (!cancelled) {
          setAvatarPath(profile.avatar_path);
          setAvatarUrl(profile.avatar_path ? publicProfileImageUrl(profile.avatar_path) : null);
          setDisplayName(profile.display_name);
          setLocalProfiles([]);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load profile.");
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
  }, [configured, session]);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      Alert.alert("Sign out", error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  async function handlePickProfileImage() {
    if (!displayName.trim()) {
      setErrorMessage("Enter a display name before adding a photo.");
      return;
    }

    setErrorMessage(null);

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

    try {
      const asset = result.assets[0];
      const upload = await uploadProfileImage({
        contentType: contentTypeForImageAsset(asset),
        uri: asset.uri
      });
      const profile = await updateMyProfile(displayName.trim(), upload.path);

      setAvatarPath(profile.avatar_path);
      setAvatarUrl(upload.publicUrl);
      setDisplayName(profile.display_name);
      Alert.alert("Profile", "Photo saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save photo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!displayName.trim()) {
      setErrorMessage("Enter a display name.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const profile = await updateMyProfile(displayName.trim(), avatarPath);
      setAvatarPath(profile.avatar_path);
      setAvatarUrl(profile.avatar_path ? publicProfileImageUrl(profile.avatar_path) : null);
      setDisplayName(profile.display_name);
      Alert.alert("Profile", "Profile saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save profile.");
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
          paddingBottom: theme.size.navigationBottomHeight + insets.bottom,
          paddingTop: insets.top + theme.space[20]
        }
      ]}
      overScrollMode="never"
      scrollEnabled={false}
    >
      <Text accessibilityRole="header" style={styles.pageTitle}>
        Profile
      </Text>
      <View style={styles.panel}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.value}>
          {session?.user.email ?? (session ? "Guest player" : configured ? "Signed out" : "Demo mode")}
        </Text>
      </View>
      {!session && localProfiles.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.label}>Saved on this phone</Text>
          {localProfiles.map((profile) => (
            <View key={profile.leagueId} style={styles.localProfileRow}>
              <Text style={styles.value}>{profile.displayName}</Text>
              <Text style={styles.label}>{profile.leagueName}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {configured && session ? (
        <View style={styles.panel}>
          <View style={styles.avatarRow}>
            <View accessibilityLabel="Profile photo" style={styles.avatarFrame}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{initialsFor(displayName || session.user.email)}</Text>
              )}
            </View>
            <View style={styles.avatarActions}>
              <Text style={styles.label}>Photo</Text>
              <ActionButton
                disabled={loading}
                label={avatarUrl ? "Change photo" : "Add photo"}
                onPress={() => void handlePickProfileImage()}
                variant="text"
              />
            </View>
          </View>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            accessibilityLabel="Display name"
            autoCapitalize="words"
            editable={!loading}
            onChangeText={setDisplayName}
            placeholder="Display name"
            placeholderTextColor={theme.color.text.secondary}
            style={styles.input}
            value={displayName}
          />
          {errorMessage ? (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : null}
          {loading ? <ActivityIndicator color={theme.color.action.primary} /> : null}
          <ActionButton disabled={loading || !displayName.trim()} label="Save profile" onPress={handleSaveProfile} />
        </View>
      ) : null}
      {configured && session ? <ActionButton label="Sign out" onPress={handleSignOut} variant="text" /> : null}
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

const styles = StyleSheet.create({
  avatarActions: {
    flex: 1,
    minWidth: 0
  },
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
  avatarRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.inlineDefault
  },
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error
  },
  input: {
    ...theme.type.bodyDefault,
    borderColor: theme.color.border.control,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.interactive,
    color: theme.color.text.primary,
    height: theme.size.controlMinimumHeight,
    includeFontPadding: false,
    lineHeight: theme.space[20],
    minHeight: theme.size.controlMinimumHeight,
    paddingBottom: theme.space[2],
    paddingHorizontal: theme.space[16],
    paddingTop: 0,
    textAlignVertical: "center"
  },
  label: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  localProfileRow: {
    borderColor: theme.color.border.subtle,
    borderTopWidth: theme.border.quiet,
    gap: theme.space[2],
    paddingTop: theme.space[8]
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
    gap: theme.space[4],
    marginTop: theme.layout.stackDefault,
    padding: theme.layout.cardPadding
  },
  screen: {
    backgroundColor: theme.color.surface.canvas,
    flexGrow: 1,
    gap: theme.layout.stackDefault,
    paddingHorizontal: theme.layout.screenInset
  },
  value: {
    ...theme.type.bodyDefault,
    color: theme.color.text.primary
  }
});
