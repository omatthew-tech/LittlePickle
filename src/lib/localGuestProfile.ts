import AsyncStorage from "@react-native-async-storage/async-storage";

const legacyGuestProfilesKey = "littlepickle.guestLeagueProfiles.v1";
const activePlayerProfileKey = "littlepickle.activePlayerProfile.v1";
const playedLeaguesKey = "littlepickle.playedLeagues.v1";

export type LocalPlayedLeague = {
  leagueId: string;
  leagueName: string;
  locationText?: string | null;
  numberOfCourts?: number | null;
  sessionId?: string | null;
  slug?: string | null;
  updatedAt: string;
};

export type LocalPlayerProfile = {
  avatarPath?: string | null;
  displayName: string;
  leagueId: string;
  leagueName: string;
  playerId: string;
  rating?: number | null;
  sessionId?: string | null;
  updatedAt: string;
};

export type LocalGuestLeagueProfile = LocalPlayerProfile & {
  sessionId: string;
};

type SavedPlayerProfileInput = Omit<LocalPlayerProfile, "updatedAt">;
type SavedLeagueInput = Omit<LocalPlayedLeague, "updatedAt">;

export async function getActiveLocalPlayerProfile() {
  await migrateLegacyGuestProfiles();

  const activeProfile = normalizePlayerProfile(await readJson(activePlayerProfileKey));
  return activeProfile ?? null;
}

export async function saveActiveLocalPlayerProfile(profile: SavedPlayerProfileInput) {
  const nextProfile: LocalPlayerProfile = {
    ...profile,
    updatedAt: new Date().toISOString()
  };

  await AsyncStorage.setItem(activePlayerProfileKey, JSON.stringify(nextProfile));
  await saveLocalPlayedLeague({
    leagueId: profile.leagueId,
    leagueName: profile.leagueName,
    sessionId: profile.sessionId ?? null
  });

  return nextProfile;
}

export async function getLocalPlayedLeagues() {
  await migrateLegacyGuestProfiles();

  const storedLeagues = normalizePlayedLeagues(await readJson(playedLeaguesKey));
  return mergePlayedLeagues(storedLeagues);
}

export async function saveLocalPlayedLeague(league: SavedLeagueInput) {
  const nextLeague: LocalPlayedLeague = {
    ...league,
    updatedAt: new Date().toISOString()
  };
  const leagues = await getLocalPlayedLeagues();
  const nextLeagues = mergePlayedLeagues([
    nextLeague,
    ...leagues.filter((previousLeague) => previousLeague.leagueId !== league.leagueId)
  ]);

  await AsyncStorage.setItem(playedLeaguesKey, JSON.stringify(nextLeagues));
  return nextLeague;
}

export async function getLocalGuestLeagueProfiles() {
  const activeProfile = await getActiveLocalPlayerProfile();
  return activeProfile?.sessionId ? [activeProfile as LocalGuestLeagueProfile] : [];
}

export async function getLocalGuestLeagueProfile(leagueId: string) {
  const activeProfile = await getActiveLocalPlayerProfile();

  if (activeProfile?.leagueId === leagueId && activeProfile.sessionId) {
    return activeProfile as LocalGuestLeagueProfile;
  }

  return null;
}

export async function saveLocalGuestLeagueProfile(profile: Omit<LocalGuestLeagueProfile, "updatedAt">) {
  return (await saveActiveLocalPlayerProfile(profile)) as LocalGuestLeagueProfile;
}

async function getLegacyGuestLeagueProfiles() {
  const rawProfiles = await readJson(legacyGuestProfilesKey);
  return Array.isArray(rawProfiles) ? rawProfiles.map(normalizePlayerProfile).filter(isLocalPlayerProfile) : [];
}

async function migrateLegacyGuestProfiles() {
  const legacyProfiles = await getLegacyGuestLeagueProfiles();

  if (legacyProfiles.length === 0) {
    return;
  }

  const activeProfile = normalizePlayerProfile(await readJson(activePlayerProfileKey));
  const storedLeagues = normalizePlayedLeagues(await readJson(playedLeaguesKey));
  const nextLeagues = mergePlayedLeagues([
    ...storedLeagues,
    ...legacyProfiles.map(leagueFromLegacyProfile)
  ]);

  if (!activeProfile) {
    await AsyncStorage.setItem(activePlayerProfileKey, JSON.stringify(legacyProfiles[0]));
  }

  await AsyncStorage.setItem(playedLeaguesKey, JSON.stringify(nextLeagues));
  await AsyncStorage.removeItem(legacyGuestProfilesKey);
}

async function readJson(key: string) {
  const rawValue = await AsyncStorage.getItem(key);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return null;
  }
}

function normalizePlayedLeagues(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizePlayedLeague).filter(isLocalPlayedLeague);
}

function normalizePlayedLeague(value: unknown): LocalPlayedLeague | null {
  if (!isRecord(value)) {
    return null;
  }

  const leagueId = stringValue(value.leagueId);
  const leagueName = stringValue(value.leagueName);

  if (!leagueId || !leagueName) {
    return null;
  }

  return {
    leagueId,
    leagueName,
    locationText: nullableStringValue(value.locationText),
    numberOfCourts: nullableNumberValue(value.numberOfCourts),
    sessionId: nullableStringValue(value.sessionId),
    slug: nullableStringValue(value.slug),
    updatedAt: stringValue(value.updatedAt) ?? new Date(0).toISOString()
  };
}

function normalizePlayerProfile(value: unknown): LocalPlayerProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  const displayName = stringValue(value.displayName);
  const leagueId = stringValue(value.leagueId);
  const leagueName = stringValue(value.leagueName);
  const playerId = stringValue(value.playerId);

  if (!displayName || !leagueId || !leagueName || !playerId) {
    return null;
  }

  return {
    avatarPath: nullableStringValue(value.avatarPath),
    displayName,
    leagueId,
    leagueName,
    playerId,
    rating: nullableNumberValue(value.rating),
    sessionId: nullableStringValue(value.sessionId),
    updatedAt: stringValue(value.updatedAt) ?? new Date(0).toISOString()
  };
}

function leagueFromLegacyProfile(profile: LocalPlayerProfile): LocalPlayedLeague {
  return {
    leagueId: profile.leagueId,
    leagueName: profile.leagueName,
    sessionId: profile.sessionId ?? null,
    updatedAt: profile.updatedAt
  };
}

function mergePlayedLeagues(leagues: LocalPlayedLeague[]) {
  const leaguesById = new Map<string, LocalPlayedLeague>();

  for (const league of leagues) {
    const previousLeague = leaguesById.get(league.leagueId);

    if (!previousLeague || previousLeague.updatedAt < league.updatedAt) {
      leaguesById.set(league.leagueId, league);
    }
  }

  return [...leaguesById.values()].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

function isLocalPlayedLeague(value: LocalPlayedLeague | null): value is LocalPlayedLeague {
  return Boolean(value);
}

function isLocalPlayerProfile(value: LocalPlayerProfile | null): value is LocalPlayerProfile {
  return Boolean(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
