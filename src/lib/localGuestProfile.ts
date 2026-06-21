import AsyncStorage from "@react-native-async-storage/async-storage";

const guestProfilesKey = "littlepickle.guestLeagueProfiles.v1";

export type LocalGuestLeagueProfile = {
  avatarPath?: string | null;
  displayName: string;
  leagueId: string;
  leagueName: string;
  playerId: string;
  sessionId: string;
  updatedAt: string;
};

export async function getLocalGuestLeagueProfiles() {
  const rawProfiles = await AsyncStorage.getItem(guestProfilesKey);

  if (!rawProfiles) {
    return [];
  }

  try {
    const profiles = JSON.parse(rawProfiles) as LocalGuestLeagueProfile[];
    return Array.isArray(profiles) ? profiles : [];
  } catch {
    return [];
  }
}

export async function getLocalGuestLeagueProfile(leagueId: string) {
  const profiles = await getLocalGuestLeagueProfiles();
  return profiles.find((profile) => profile.leagueId === leagueId) ?? null;
}

export async function saveLocalGuestLeagueProfile(profile: Omit<LocalGuestLeagueProfile, "updatedAt">) {
  const profiles = await getLocalGuestLeagueProfiles();
  const nextProfile: LocalGuestLeagueProfile = {
    ...profile,
    updatedAt: new Date().toISOString()
  };
  const nextProfiles = [
    nextProfile,
    ...profiles.filter((previousProfile) => previousProfile.leagueId !== profile.leagueId)
  ];

  await AsyncStorage.setItem(guestProfilesKey, JSON.stringify(nextProfiles));
  return nextProfile;
}
