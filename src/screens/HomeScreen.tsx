import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../components/ActionButton";
import { FormStepLayout } from "../components/FormStepLayout";
import { QRAction } from "../components/QRAction";
import { SearchField } from "../components/SearchField";
import { theme } from "../design/theme";
import { useAuth } from "../lib/auth";
import { leagueQrValue, parseLeagueQrValue } from "../lib/leagueCodes";
import {
  addPlayerToSession,
  createLeague,
  createPlayer,
  getLeagueByCode,
  getMyOrganizations,
  getMyProfile,
  getOrCreateOpenPlaySession,
  getOrganizationOpenSessions,
  getOrganizationPlayersForAdmin,
  getSessionPlayerOptions,
  joinLeagueQueue,
  searchLeaguePlayerNames,
  searchOrganizations,
  setOrganizationScoreMode,
  updateOrganizationPlayer,
  type LeagueCodeResult,
  type LeaguePlayerNameMatch,
  type OrganizationOpenSessionSummary,
  type OrganizationPlayerSummary,
  type OrganizationSearchResult,
  type OrganizationSummary
} from "../lib/littlePickleData";
import { LeagueQueueScreen, type LeagueQueueProfile } from "./LeagueQueueScreen";
import {
  getActiveLocalPlayerProfile,
  getLocalGuestLeagueProfile,
  getLocalPlayedLeagues,
  saveLocalPlayedLeague,
  saveLocalGuestLeagueProfile,
  type LocalPlayedLeague,
  type LocalGuestLeagueProfile
} from "../lib/localGuestProfile";
import { isMatchFlowApiConfigured, sendLeagueQrEmail } from "../lib/matchFlowApi";
import { publicProfileImageUrl } from "../lib/profileImages";

type HomeScreenProps = {
  activeQueueProfile: LeagueQueueProfile | null;
  onCreationFlowActiveChanged: (active: boolean) => void;
  onQueueProfileChanged: (profile: LeagueQueueProfile | null) => void;
  onSessionSelected: (sessionId: string) => void;
  queueAutoOpenKey: number;
};

type CreateStep = "home" | "intro" | "name" | "courts" | "location" | "verify" | "success";

type LeagueDraft = {
  courtCount: string;
  email: string;
  locationText: string;
  name: string;
  otp: string;
  otpSent: boolean;
};

type PlayerDraft = {
  displayName: string;
};

type QrCodeRef = {
  toDataURL?: (callback: (data: string) => void) => void;
};

type QrEmailStatus = "idle" | "sending" | "sent" | "error";

const defaultMatchmakingRating = 3;

const initialDraft: LeagueDraft = {
  courtCount: "3",
  email: "",
  locationText: "",
  name: "",
  otp: "",
  otpSent: false
};

export function HomeScreen({
  activeQueueProfile,
  onCreationFlowActiveChanged,
  onQueueProfileChanged,
  onSessionSelected,
  queueAutoOpenKey
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    configured,
    ensureAnonymousSession,
    sendEmailOtp,
    session,
    verifyEmailOtp
  } = useAuth();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const qrCodeRef = useRef<QrCodeRef | null>(null);
  const lastQueueAutoOpenKey = useRef<number | null>(null);
  const [createStep, setCreateStep] = useState<CreateStep>("home");
  const [draft, setDraft] = useState<LeagueDraft>(initialDraft);
  const [createdLeague, setCreatedLeague] = useState<OrganizationSummary | null>(null);
  const [qrEmailMessage, setQrEmailMessage] = useState<string | null>(null);
  const [qrEmailStatus, setQrEmailStatus] = useState<QrEmailStatus>("idle");
  const [leagueQuery, setLeagueQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [localLeagues, setLocalLeagues] = useState<LocalPlayedLeague[]>([]);
  const [searchResults, setSearchResults] = useState<OrganizationSearchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerPaused, setScannerPaused] = useState(false);
  const [joinLeague, setJoinLeague] = useState<LeagueCodeResult | null>(null);
  const [joinName, setJoinName] = useState("");
  const [joinMatches, setJoinMatches] = useState<LeaguePlayerNameMatch[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [organizationOpenSessions, setOrganizationOpenSessions] = useState<Record<string, OrganizationOpenSessionSummary[]>>({});
  const [expandedRosterLeagueId, setExpandedRosterLeagueId] = useState<string | null>(null);
  const [organizationPlayers, setOrganizationPlayers] = useState<Record<string, OrganizationPlayerSummary[]>>({});
  const [playerDrafts, setPlayerDrafts] = useState<Record<string, PlayerDraft>>({});
  const [scoreModeUpdatingLeagueId, setScoreModeUpdatingLeagueId] = useState<string | null>(null);

  const visibleOrganizations = useMemo(() => {
    const normalizedQuery = leagueQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return organizations;
    }

    return organizations.filter((organization) => organization.name.toLowerCase().includes(normalizedQuery));
  }, [leagueQuery, organizations]);

  const exactJoinNameMatches = useMemo(
    () =>
      joinMatches.filter(
        (match) => match.display_name.trim().toLowerCase() === joinName.trim().toLowerCase()
      ),
    [joinMatches, joinName]
  );

  const loadHomeData = useCallback(async () => {
    setErrorMessage(null);

    try {
      const nextLeagues = await getLocalPlayedLeagues();
      setLocalLeagues(nextLeagues);

      if (configured && session) {
        const nextOrganizations = await getMyOrganizations();
        setOrganizations(nextOrganizations);
        await loadOpenSessionsForOrganizations(nextOrganizations);
      } else {
        setOrganizations([]);
        setOrganizationOpenSessions({});
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load leagues.");
    }
  }, [configured, session]);

  useEffect(() => {
    void loadHomeData();
  }, [loadHomeData]);

  useEffect(() => {
    onCreationFlowActiveChanged(createStep !== "home");
  }, [createStep, onCreationFlowActiveChanged]);

  useEffect(
    () => () => {
      onCreationFlowActiveChanged(false);
    },
    [onCreationFlowActiveChanged]
  );

  useEffect(() => {
    if (lastQueueAutoOpenKey.current === queueAutoOpenKey) {
      return undefined;
    }

    lastQueueAutoOpenKey.current = queueAutoOpenKey;

    if (!configured || activeQueueProfile || createStep !== "home") {
      return undefined;
    }

    let cancelled = false;

    async function openActiveQueueIfCurrent() {
      try {
        const profile = await getActiveLocalPlayerProfile();

        if (!profile) {
          return;
        }

        const sessionId = profile.sessionId ?? (await readOpenQueueSession(profile.leagueId));

        if (!sessionId) {
          return;
        }

        const playerOptions = await getSessionPlayerOptions(sessionId);
        const currentPlayer = playerOptions.find((player) => player.id === profile.playerId);

        if (!currentPlayer || (!currentPlayer.in_session && !currentPlayer.is_playing)) {
          return;
        }

        const savedProfile = await saveLocalGuestLeagueProfile({
          avatarPath: currentPlayer.profile_image_path ?? profile.avatarPath ?? null,
          displayName: currentPlayer.name,
          leagueId: profile.leagueId,
          leagueName: profile.leagueName,
          playerId: profile.playerId,
          rating: currentPlayer.skill,
          sessionId
        });

        if (cancelled) {
          return;
        }

        onQueueProfileChanged(savedProfile);
        onSessionSelected(sessionId);
      } catch {
        // If the saved profile is stale or the queue cannot be read, leave Home in its normal state.
      }
    }

    void openActiveQueueIfCurrent();

    return () => {
      cancelled = true;
    };
  }, [activeQueueProfile, configured, createStep, onQueueProfileChanged, onSessionSelected, queueAutoOpenKey]);

  useEffect(() => {
    if (!configured || leagueQuery.trim().length < 2 || createStep !== "home") {
      setSearchResults([]);
      return;
    }

    let cancelled = false;

    searchOrganizations(leagueQuery)
      .then((results) => {
        if (!cancelled) {
          setSearchResults(results);
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
  }, [configured, createStep, leagueQuery]);

  useEffect(() => {
    if (!joinLeague || joinName.trim().length < 2) {
      setJoinMatches([]);
      setSelectedPlayerId(null);
      return;
    }

    let cancelled = false;

    searchLeaguePlayerNames(joinLeague.id, joinName)
      .then((matches) => {
        if (!cancelled) {
          setJoinMatches(matches);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setJoinError(error instanceof Error ? error.message : "Could not search player names.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [joinLeague, joinName]);

  useEffect(() => {
    if (createStep !== "success" || !createdLeague || qrEmailStatus !== "idle") {
      return;
    }

    void sendCreatedLeagueQrEmail(createdLeague);
  }, [createStep, createdLeague, qrEmailStatus]);

  async function loadOpenSessionsForOrganizations(nextOrganizations: OrganizationSummary[]) {
    const entries = await Promise.all(
      nextOrganizations.map(async (organization) => [
        organization.id,
        await getOrganizationOpenSessions(organization.id)
      ] as const)
    );

    setOrganizationOpenSessions((previousSessions) => ({
      ...previousSessions,
      ...Object.fromEntries(entries)
    }));
  }

  async function beginScanner() {
    if (!configured) {
      setErrorMessage("Live league QR scanning needs Supabase settings.");
      return;
    }

    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();

      if (!permission.granted) {
        setErrorMessage("Camera access is required to scan a league QR code.");
        return;
      }
    }

    setScannerPaused(false);
    setScannerOpen(true);
  }

  async function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scannerPaused) {
      return;
    }

    setScannerPaused(true);
    setScannerOpen(false);
    await joinLeagueFromQr(result.data);
  }

  async function joinLeagueFromQr(rawValue: string) {
    const leagueKey = parseLeagueQrValue(rawValue);

    if (!configured) {
      setErrorMessage("Live league joining needs Supabase settings.");
      return;
    }

    if (!leagueKey) {
      setErrorMessage("Scan a valid league QR.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const league = await getLeagueByCode(leagueKey);
      await startJoinForLeague(league);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not find that league.");
    } finally {
      setLoading(false);
    }
  }

  async function startJoinForLeague(league: LeagueCodeResult) {
    const localProfile = await getLocalGuestLeagueProfile(league.id);

    if (localProfile) {
      await joinQueue({
        displayName: localProfile.displayName,
        league,
        playerId: localProfile.playerId
      });
      return;
    }

    const activeProfile = await getActiveLocalPlayerProfile();

    if (activeProfile) {
      setJoinLeague(league);
      setJoinName(activeProfile.displayName);
      setJoinMatches([]);
      setSelectedPlayerId(null);
      setJoinError(null);
      return;
    }

    if (session) {
      try {
        const profile = await getMyProfile();
        const displayName = profile.display_name.trim();

        if (displayName && displayName.toLowerCase() !== "player") {
          await joinQueue({
            displayName,
            league,
            playerId: null
          });
          return;
        }
      } catch {
        // Fall through to the name prompt.
      }
    }

    setJoinLeague(league);
    setJoinName("");
    setJoinMatches([]);
    setSelectedPlayerId(null);
    setJoinError(null);
  }

  async function joinQueue({
    allowDuplicateName = false,
    displayName,
    league,
    playerId
  }: {
    allowDuplicateName?: boolean;
    displayName: string;
    league: LeagueCodeResult;
    playerId: string | null;
  }) {
    if (!configured) {
      setJoinError("Live league joining needs Supabase settings.");
      return;
    }

    setLoading(true);
    setJoinError(null);

    try {
      if (!session) {
        await ensureAnonymousSession();
      }

      const joined = await joinLeagueQueue({
        allowDuplicateName,
        displayName,
        organizationId: league.id,
        playerId
      });

      const savedProfile = await saveLocalGuestLeagueProfile({
        avatarPath: joined.player.profile_image_path,
        displayName: joined.player.display_name,
        leagueId: joined.organization.id,
        leagueName: joined.organization.name,
        playerId: joined.player.id,
        rating: joined.player.rating,
        sessionId: joined.session_id
      });
      setJoinLeague(null);
      setJoinName("");
      setSelectedPlayerId(null);
      onQueueProfileChanged({
        ...savedProfile,
        animateStatsReveal: true
      });
      await loadHomeData();
      onSessionSelected(joined.session_id);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Could not join the league queue.");
    } finally {
      setLoading(false);
    }
  }

  async function submitJoinName(allowDuplicateName = false) {
    if (!joinLeague) {
      return;
    }

    const displayName = joinName.trim();
    const hasFirstAndLastName = displayName.split(/\s+/).filter(Boolean).length >= 2;

    if (!hasFirstAndLastName) {
      setJoinError("Enter your first and last name.");
      return;
    }

    const selectedMatch = joinMatches.find((match) => match.id === selectedPlayerId) ?? null;

    if (!selectedMatch && exactJoinNameMatches.length > 0 && !allowDuplicateName) {
      Alert.alert(
        "Name already exists",
        "Choose the existing player if it is you, or confirm this is a different person with the same name.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Add another",
            onPress: () => void submitJoinName(true)
          }
        ]
      );
      return;
    }

    await joinQueue({
      allowDuplicateName,
      displayName: selectedMatch?.display_name ?? displayName,
      league: joinLeague,
      playerId: selectedMatch?.id ?? null
    });
  }

  async function joinSearchResult(organization: OrganizationSearchResult) {
    await startJoinForLeague({
      id: organization.id,
      location_text: organization.location_text ?? null,
      name: organization.name,
      number_of_courts: organization.number_of_courts,
      slug: organization.slug
    });
  }

  async function enterLeague(organization: OrganizationSummary) {
    const profile = await getLocalGuestLeagueProfile(organization.id);

    if (profile) {
      await openQueueForProfile(profile, organization);
      return;
    }

    await startJoinForLeague(leagueFromOrganization(organization));
  }

  async function openQueueForProfile(profile: LocalGuestLeagueProfile, organization?: OrganizationSummary) {
    if (!configured) {
      setErrorMessage("Live league queue needs Supabase settings.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setJoinError(null);

    try {
      if (!session) {
        await ensureAnonymousSession();
      }

      const sessionId = await resolveOpenQueueSession(profile.leagueId, organization?.number_of_courts);
      await addPlayerToSession(sessionId, profile.playerId);
      const savedProfile = await saveLocalGuestLeagueProfile({
        avatarPath: profile.avatarPath ?? null,
        displayName: profile.displayName,
        leagueId: profile.leagueId,
        leagueName: organization?.name ?? profile.leagueName,
        playerId: profile.playerId,
        rating: profile.rating ?? null,
        sessionId
      });

      setJoinLeague(null);
      setJoinName("");
      setSelectedPlayerId(null);
      onQueueProfileChanged({
        ...savedProfile,
        animateStatsReveal: true
      });
      onSessionSelected(sessionId);
      await loadHomeData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not enter the league queue.");
    } finally {
      setLoading(false);
    }
  }

  async function viewQueueForOrganization(organization: OrganizationSummary) {
    await viewQueueForSavedLeague({
      leagueId: organization.id,
      leagueName: organization.name,
      locationText: organization.location_text ?? null,
      numberOfCourts: organization.number_of_courts,
      sessionId: null,
      slug: organization.slug,
      updatedAt: new Date().toISOString()
    });
  }

  async function viewQueueForSavedLeague(league: LocalPlayedLeague) {
    if (!configured) {
      setErrorMessage("Live league queue needs Supabase settings.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setJoinError(null);

    try {
      const activeProfile = await getActiveLocalPlayerProfile();
      const matchingProfile = activeProfile?.leagueId === league.leagueId ? activeProfile : null;
      const sessionId = await readOpenQueueSession(league.leagueId);

      await saveLocalPlayedLeague({
        leagueId: league.leagueId,
        leagueName: league.leagueName,
        locationText: league.locationText ?? null,
        numberOfCourts: league.numberOfCourts ?? null,
        sessionId,
        slug: league.slug ?? null
      });

      setJoinLeague(null);
      setJoinName("");
      setSelectedPlayerId(null);
      onQueueProfileChanged({
        avatarPath: matchingProfile?.avatarPath ?? null,
        displayName: matchingProfile?.displayName ?? "Player",
        leagueId: league.leagueId,
        leagueLocationText: league.locationText ?? null,
        leagueName: league.leagueName,
        leagueNumberOfCourts: league.numberOfCourts ?? null,
        leagueSlug: league.slug ?? null,
        playerId: matchingProfile?.playerId ?? "",
        rating: matchingProfile?.rating ?? null,
        readOnly: true,
        sessionId
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not view the league queue.");
    } finally {
      setLoading(false);
    }
  }

  async function joinViewedQueue(profile: LeagueQueueProfile) {
    onQueueProfileChanged(null);
    await startJoinForLeague({
      id: profile.leagueId,
      location_text: profile.leagueLocationText ?? null,
      name: profile.leagueName,
      number_of_courts: profile.leagueNumberOfCourts ?? 1,
      slug: profile.leagueSlug ?? profile.leagueId
    });
  }

  async function addViewedPlayerToQueue(
    profile: LeagueQueueProfile,
    playerId: string | null,
    displayName: string
  ) {
    if (!configured) {
      throw new Error("Live league queue needs Supabase settings.");
    }

    if (!session) {
      await ensureAnonymousSession();
    }

    const joined = await joinLeagueQueue({
      displayName,
      organizationId: profile.leagueId,
      playerId
    });

    const savedProfile = await saveLocalGuestLeagueProfile({
      avatarPath: joined.player.profile_image_path,
      displayName: joined.player.display_name,
      leagueId: joined.organization.id,
      leagueName: joined.organization.name,
      playerId: joined.player.id,
      rating: joined.player.rating,
      sessionId: joined.session_id
    });

    onQueueProfileChanged({
      ...profile,
      ...savedProfile,
      leagueLocationText: joined.organization.location_text ?? null,
      leagueNumberOfCourts: joined.organization.number_of_courts,
      leagueSlug: joined.organization.slug,
      readOnly: false
    });
    onSessionSelected(joined.session_id);
    await loadHomeData();
    return true;
  }

  async function readOpenQueueSession(organizationId: string) {
    const cachedOpenSessionId = organizationOpenSessions[organizationId]?.[0]?.id;

    if (cachedOpenSessionId) {
      return cachedOpenSessionId;
    }

    try {
      const openSessions = await getOrganizationOpenSessions(organizationId);

      setOrganizationOpenSessions((previousSessions) => ({
        ...previousSessions,
        [organizationId]: openSessions
      }));

      return openSessions[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  async function resolveOpenQueueSession(organizationId: string, courtCount?: number) {
    const cachedOpenSessionId = organizationOpenSessions[organizationId]?.[0]?.id;

    if (cachedOpenSessionId) {
      return cachedOpenSessionId;
    }

    const openSessions = await getOrganizationOpenSessions(organizationId);

    setOrganizationOpenSessions((previousSessions) => ({
      ...previousSessions,
      [organizationId]: openSessions
    }));

    if (openSessions[0]) {
      return openSessions[0].id;
    }

    return getOrCreateOpenPlaySession(organizationId, courtCount);
  }

  function beginCreateLeague() {
    if (!configured) {
      setErrorMessage("Create a league needs Supabase settings.");
      return;
    }

    setDraft({
      ...initialDraft,
      email: session?.user.email ?? ""
    });
    setCreatedLeague(null);
    setQrEmailMessage(null);
    setQrEmailStatus("idle");
    setErrorMessage(null);
    setCreateStep("intro");
  }

  function closeCreateLeague() {
    setErrorMessage(null);
    setCreateStep("home");
  }

  function updateDraft(field: keyof LeagueDraft, value: string | boolean) {
    setDraft((previousDraft) => ({
      ...previousDraft,
      [field]: value
    }));
  }

  async function sendOtp() {
    const email = draft.email.trim();

    if (!email) {
      setErrorMessage("Enter your email address.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await sendEmailOtp(email);
      setDraft((previousDraft) => ({
        ...previousDraft,
        otpSent: true
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not send verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndCreateLeague() {
    if (!session?.user.email) {
      const email = draft.email.trim();
      const otp = draft.otp.trim();

      if (!email || !otp) {
        setErrorMessage("Enter your email and verification code.");
        return;
      }
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      if (!session?.user.email) {
        await verifyEmailOtp(draft.email.trim(), draft.otp.trim());
      }

      const league = await createLeague({
        locationText: draft.locationText.trim(),
        name: draft.name.trim(),
        numberOfCourts: Number.parseInt(draft.courtCount, 10),
        slug: slugify(draft.name)
      });

      setCreatedLeague(league);
      setQrEmailMessage(null);
      setQrEmailStatus("idle");
      setCreateStep("success");
      await loadHomeData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create league.");
    } finally {
      setLoading(false);
    }
  }

  async function saveQrToPhotos() {
    if (!createdLeague) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const permission = await MediaLibrary.requestPermissionsAsync();

      if (!permission.granted) {
        setErrorMessage("Photo library access is required to save the QR code.");
        return;
      }

      const base64Image = await new Promise<string>((resolve, reject) => {
        if (!qrCodeRef.current?.toDataURL) {
          reject(new Error("QR code image is not ready."));
          return;
        }

        qrCodeRef.current.toDataURL(resolve);
      });
      const fileUri = `${FileSystem.cacheDirectory}littlepickle-${createdLeague.slug}.png`;
      await FileSystem.writeAsStringAsync(fileUri, base64Image, {
        encoding: FileSystem.EncodingType.Base64
      });
      await MediaLibrary.saveToLibraryAsync(fileUri);
      Alert.alert("QR saved", "The league QR code was saved to your photos.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save the QR code.");
    } finally {
      setLoading(false);
    }
  }

  async function sendCreatedLeagueQrEmail(league: OrganizationSummary) {
    const recipientEmail = session?.user.email ?? draft.email.trim();

    if (!recipientEmail) {
      setQrEmailStatus("error");
      setQrEmailMessage("The league was created, but no email address was available for the QR code.");
      return;
    }

    if (!isMatchFlowApiConfigured) {
      setQrEmailStatus("error");
      setQrEmailMessage("The league was created, but EXPO_PUBLIC_MATCH_FLOW_API_URL is not configured for QR email delivery.");
      return;
    }

    setQrEmailStatus("sending");
    setQrEmailMessage(null);

    try {
      const qrPngBase64 = await qrCodeDataUrl();
      const qrValue = leagueQrValue(league.slug);
      await sendLeagueQrEmail(league.id, {
        league_name: league.name,
        qr_png_base64: qrPngBase64,
        qr_value: qrValue,
        recipient_email: recipientEmail
      });
      setQrEmailStatus("sent");
      setQrEmailMessage("We also just sent you an email with your new league's QR code.");
    } catch (error) {
      setQrEmailStatus("error");
      setQrEmailMessage(error instanceof Error ? error.message : "Could not send the QR email.");
    }
  }

  async function qrCodeDataUrl() {
    const qrRef = await waitForQrCodeRef();

    return new Promise<string>((resolve, reject) => {
      if (!qrRef.toDataURL) {
        reject(new Error("QR code image is not ready."));
        return;
      }

      qrRef.toDataURL(resolve);
    });
  }

  async function waitForQrCodeRef() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (qrCodeRef.current?.toDataURL) {
        return qrCodeRef.current;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error("QR code image is not ready.");
  }

  async function toggleRoster(organization: OrganizationSummary) {
    if (expandedRosterLeagueId === organization.id) {
      setExpandedRosterLeagueId(null);
      return;
    }

    setExpandedRosterLeagueId(organization.id);
    await loadOrganizationPlayers(organization.id);
  }

  async function loadOrganizationPlayers(organizationId: string) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const players = await getOrganizationPlayersForAdmin(organizationId);
      setOrganizationPlayers((previousPlayers) => ({
        ...previousPlayers,
        [organizationId]: players
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load players.");
    } finally {
      setLoading(false);
    }
  }

  function confirmScoreModeChange(organization: OrganizationSummary, enabled: boolean) {
    Alert.alert(
      enabled ? "Turn score mode on?" : "Turn score mode off?",
      enabled
        ? "Players will enter final scores for new and edited results."
        : "Players will select the winning team instead of entering a final score. Existing scores will remain saved.",
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => void updateScoreMode(organization, enabled),
          text: enabled ? "Turn on" : "Turn off"
        }
      ]
    );
  }

  async function updateScoreMode(organization: OrganizationSummary, enabled: boolean) {
    setScoreModeUpdatingLeagueId(organization.id);
    setErrorMessage(null);

    try {
      const updatedOrganization = await setOrganizationScoreMode(organization.id, enabled);
      setOrganizations((previousOrganizations) =>
        previousOrganizations.map((item) =>
          item.id === organization.id ? updatedOrganization : item
        )
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update score mode.");
    } finally {
      setScoreModeUpdatingLeagueId(null);
    }
  }

  function updatePlayerDraft(organizationId: string, value: string) {
    setPlayerDrafts((previousDrafts) => ({
      ...previousDrafts,
      [organizationId]: {
        ...previousDrafts[organizationId],
        displayName: value
      }
    }));
  }

  async function addOrganizationPlayer(organization: OrganizationSummary) {
    const draftPlayer = playerDrafts[organization.id] ?? { displayName: "" };

    if (!draftPlayer.displayName.trim()) {
      setErrorMessage("Enter a player name.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await createPlayer({
        displayName: draftPlayer.displayName.trim(),
        organizationId: organization.id,
        rating: defaultMatchmakingRating
      });
      setPlayerDrafts((previousDrafts) => ({
        ...previousDrafts,
        [organization.id]: { displayName: "" }
      }));
      await loadOrganizationPlayers(organization.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not add player.");
    } finally {
      setLoading(false);
    }
  }

  async function reactivateOrganizationPlayer(
    organization: OrganizationSummary,
    player: OrganizationPlayerSummary
  ) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const players = await updateOrganizationPlayer({
        active: true,
        displayName: player.display_name,
        playerId: player.id,
        rating: player.rating
      });
      setOrganizationPlayers((previousPlayers) => ({
        ...previousPlayers,
        [organization.id]: players
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reactivate the player.";
      setErrorMessage(message);
      Alert.alert("Player not reactivated", message);
    } finally {
      setLoading(false);
    }
  }

  function renderHome() {
    const homeHeading = organizations.length > 0 ? "Ready to play?" : "Find your league";

    return (
      <View style={styles.homeContent}>
        <Text accessibilityRole="header" style={styles.homeTitle}>
          {homeHeading}
        </Text>
        <View style={styles.entryStack}>
          <QRAction disabled={loading} label="Scan league QR" onPress={() => void beginScanner()} />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.orSeparator}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>
          <SearchField
            label="Search for a league"
            onChangeText={setLeagueQuery}
            onSubmit={() => undefined}
            placeholder="Search for a league"
            scope="league"
            value={leagueQuery}
          />
          {errorMessage ? (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : null}
          {loading ? <ActivityIndicator color={theme.color.action.primary} /> : null}
          {renderSearchResults()}
          {renderLocalGuestLeagues()}
          {renderYourLeagues()}
        </View>
        <View style={styles.createLeagueCta}>
          <Text style={styles.createLeaguePrompt}>Looking to start a league? </Text>
          <Pressable
            accessibilityLabel="Create league"
            accessibilityRole="button"
            disabled={loading}
            onPress={beginCreateLeague}
            style={({ pressed }) => [
              styles.createLeagueLinkTarget,
              pressed ? styles.rowPressed : null,
              loading ? styles.createLeagueLinkDisabled : null
            ]}
          >
            <Text style={styles.createLeagueLink}>Create league</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderSearchResults() {
    if (searchResults.length === 0) {
      return null;
    }

    return (
      <View style={styles.list}>
        <Text style={styles.sectionLabel}>Search results</Text>
        {searchResults.map((organization) => (
          <Pressable
            accessibilityLabel={`Join ${organization.name} queue`}
            accessibilityRole="button"
            key={organization.id}
            onPress={() => void joinSearchResult(organization)}
            style={({ pressed }) => [styles.leagueRow, pressed ? styles.rowPressed : null]}
          >
            <View style={styles.leagueText}>
              <Text style={styles.leagueName}>{organization.name}</Text>
              <Text style={styles.leagueMeta}>
                {organization.number_of_courts} courts
                {organization.location_text ? ` | ${organization.location_text}` : ""}
              </Text>
            </View>
            <Text style={styles.startText}>Join queue</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  function renderLocalGuestLeagues() {
    const hiddenLeagues = localLeagues.filter(
      (league) => !organizations.some((organization) => organization.id === league.leagueId)
    );

    if (hiddenLeagues.length === 0) {
      return null;
    }

    return (
      <View style={styles.list}>
        <Text style={styles.sectionLabel}>Saved on this phone</Text>
        {hiddenLeagues.map((league) => (
          <Pressable
            accessibilityLabel={`View ${league.leagueName} queue`}
            accessibilityRole="button"
            key={league.leagueId}
            onPress={() => void viewQueueForSavedLeague(league)}
            style={({ pressed }) => [styles.leagueRow, pressed ? styles.rowPressed : null]}
          >
            <View style={styles.leagueText}>
              <Text style={styles.leagueName}>{league.leagueName}</Text>
            </View>
            <Text style={styles.startText}>View</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  function renderYourLeagues() {
    if (organizations.length === 0) {
      return null;
    }

    return (
      <View style={[styles.list, styles.yourLeaguesSection]}>
        <Text style={styles.sectionTitle}>Your leagues</Text>
        {visibleOrganizations.map((organization) => {
          const openSessions = organizationOpenSessions[organization.id] ?? [];
          const isExpanded = expandedRosterLeagueId === organization.id;
          const players = organizationPlayers[organization.id] ?? [];
          const playerDraft = playerDrafts[organization.id] ?? { displayName: "" };
          const activePlayers = activePlayersText(openSessions[0]?.active_player_count ?? 0);

          return (
            <View key={organization.id} style={styles.leagueCard}>
              <View style={styles.leagueSummaryRow}>
                <View style={styles.leagueText}>
                  <Text style={styles.leagueName}>{organization.name}</Text>
                  <Text style={styles.leagueMeta}>{activePlayers}</Text>
                </View>
                <View style={styles.rowActions}>
                  {organization.role === "admin" ? (
                    <ActionButton
                      disabled={loading}
                      label={isExpanded ? "Close" : "Manage"}
                      onPress={() => void toggleRoster(organization)}
                      variant="text"
                    />
                  ) : null}
                  <ActionButton
                    disabled={loading}
                    label="View"
                    onPress={() => void viewQueueForOrganization(organization)}
                    variant="text"
                  />
                </View>
              </View>
              {isExpanded ? (
                <View style={styles.rosterPanel}>
                  <View style={styles.scoreModeRow}>
                    <View style={styles.leagueText}>
                      <Text style={styles.memberName}>Score mode</Text>
                      <Text style={styles.leagueMeta}>
                        {organization.score_mode_enabled !== false
                          ? "Players enter final scores."
                          : "Players select the winning team."}
                      </Text>
                    </View>
                    <Switch
                      accessibilityLabel="Score mode"
                      accessibilityHint="Changes how league match results are recorded"
                      disabled={loading || scoreModeUpdatingLeagueId === organization.id}
                      ios_backgroundColor={theme.color.action.disabled}
                      onValueChange={(enabled) => confirmScoreModeChange(organization, enabled)}
                      thumbColor={theme.color.surface.card}
                      trackColor={{
                        false: theme.color.action.disabled,
                        true: theme.color.action.primary
                      }}
                      value={organization.score_mode_enabled !== false}
                    />
                  </View>
                  <View style={styles.addPlayerRow}>
                    <TextInput
                      accessibilityLabel="Player name"
                      onChangeText={(value) => updatePlayerDraft(organization.id, value)}
                      placeholder="First and last name"
                      placeholderTextColor={theme.color.text.secondary}
                      style={[styles.settingsInput, styles.playerNameInput]}
                      value={playerDraft.displayName}
                    />
                  </View>
                  <ActionButton
                    disabled={loading || !playerDraft.displayName.trim()}
                    label="Add player"
                    onPress={() => void addOrganizationPlayer(organization)}
                  />
                  {players.map((player) => (
                    <View key={player.id} style={styles.playerSummaryRow}>
                      <View style={styles.leagueText}>
                        <Text style={styles.memberName}>{player.display_name}</Text>
                        <Text style={styles.leagueMeta}>
                          {player.active
                            ? "Active"
                            : player.deletion_scheduled_at
                              ? `Inactive · deletion ${formatShortDate(player.deletion_scheduled_at)}`
                              : "Inactive"}
                        </Text>
                      </View>
                      {!player.active && !player.personal_data_deleted_at ? (
                        <ActionButton
                          disabled={loading}
                          label="Reactivate"
                          onPress={() => void reactivateOrganizationPlayer(organization, player)}
                          variant="text"
                        />
                      ) : null}
                    </View>
                  ))}
                  {!loading && players.length === 0 ? <Text style={styles.emptyText}>No players yet.</Text> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }

  function renderCreateFlow() {
    switch (createStep) {
      case "intro":
        return (
          <View style={styles.flow}>
            <View style={styles.creationCloseRow}>
              <ActionButton label="Close" onPress={closeCreateLeague} variant="text" />
            </View>
            <Text accessibilityRole="header" style={styles.pageTitle}>Create a league</Text>
            <Text style={styles.bodyText}>
              A league is a fun way to keep track of score at your local pickleball courts. You will get recommended team match ups based on skill level. It also keeps track of who sits out, so everyone gets the same amount of court time. Plus, as an admin, you will get a customizable community page so everyone can view announcements, upcoming events, and more.
            </Text>
            <ActionButton
              label="Create league"
              onPress={() => setCreateStep("name")}
              style={styles.creationPrimaryButton}
            />
          </View>
        );
      case "name":
        return (
          <FormStepLayout
            currentStep={1}
            onBack={() => setCreateStep("intro")}
            onClose={closeCreateLeague}
            onPrimaryPress={() => setCreateStep("courts")}
            primaryDisabled={!draft.name.trim()}
            title="What's the name of your league?"
            totalSteps={4}
          >
            <TextInput
              accessibilityLabel="League name"
              autoCapitalize="words"
              onChangeText={(value) => updateDraft("name", value)}
              placeholder="Glennville Pickleball Association"
              placeholderTextColor={theme.color.text.secondary}
              style={styles.input}
              value={draft.name}
            />
          </FormStepLayout>
        );
      case "courts":
        return (
          <FormStepLayout
            currentStep={2}
            onBack={() => setCreateStep("name")}
            onClose={closeCreateLeague}
            onPrimaryPress={() => setCreateStep("location")}
            primaryDisabled={!validCourtCount(draft.courtCount)}
            title="How many pickleball courts are usually available?"
            totalSteps={4}
          >
            <Text style={styles.helpText}>You can change this later.</Text>
            <TextInput
              accessibilityLabel="Number of courts"
              keyboardType="number-pad"
              onChangeText={(value) => updateDraft("courtCount", value)}
              placeholder="3"
              placeholderTextColor={theme.color.text.secondary}
              style={styles.input}
              value={draft.courtCount}
            />
          </FormStepLayout>
        );
      case "location":
        return (
          <FormStepLayout
            currentStep={3}
            onBack={() => setCreateStep("courts")}
            onClose={closeCreateLeague}
            onPrimaryPress={() => setCreateStep("verify")}
            primaryDisabled={!draft.locationText.trim()}
            title="Where are your pickleball courts located?"
            totalSteps={4}
          >
            <Text style={styles.helpText}>Enter an address or zip code.</Text>
            <TextInput
              accessibilityLabel="Court address or zip code"
              onChangeText={(value) => updateDraft("locationText", value)}
              placeholder="Address or zip code"
              placeholderTextColor={theme.color.text.secondary}
              style={styles.input}
              value={draft.locationText}
            />
          </FormStepLayout>
        );
      case "verify":
        return (
          <FormStepLayout
            currentStep={4}
            onBack={() => setCreateStep("location")}
            onClose={closeCreateLeague}
            onPrimaryPress={() => void verifyAndCreateLeague()}
            primaryDisabled={loading || (!session?.user.email && (!draft.email.trim() || !draft.otp.trim()))}
            primaryLabel="Create league"
            title="Verify your email"
            totalSteps={4}
          >
            {session?.user.email ? (
              <Text style={styles.bodyText}>You are signed in as {session.user.email}.</Text>
            ) : (
              <>
                <TextInput
                  accessibilityLabel="Email address"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={(value) => updateDraft("email", value)}
                  placeholder="Email address"
                  placeholderTextColor={theme.color.text.secondary}
                  style={styles.input}
                  value={draft.email}
                />
                <ActionButton
                  disabled={loading || !draft.email.trim()}
                  label={draft.otpSent ? "Send again" : "Send code"}
                  onPress={() => void sendOtp()}
                  style={styles.formBodyButton}
                />
                {draft.otpSent ? (
                  <TextInput
                    accessibilityLabel="Verification code"
                    keyboardType="number-pad"
                    onChangeText={(value) => updateDraft("otp", value)}
                    placeholder="Verification code"
                    placeholderTextColor={theme.color.text.secondary}
                    style={styles.input}
                    value={draft.otp}
                  />
                ) : null}
              </>
            )}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            {loading ? <ActivityIndicator color={theme.color.action.primary} /> : null}
          </FormStepLayout>
        );
      case "success":
        return renderSuccess();
      case "home":
        return renderHome();
    }
  }

  function renderSuccess() {
    if (!createdLeague) {
      return null;
    }

    const qrValue = leagueQrValue(createdLeague.slug);

    return (
      <View style={styles.flow}>
        <View style={styles.creationCloseRow}>
          <ActionButton label="Close" onPress={closeCreateLeague} variant="text" />
        </View>
        <Text accessibilityRole="header" style={styles.pageTitle}>Congratulations!</Text>
        <Text style={styles.bodyText}>{createdLeague.name} was successfully created.</Text>
        <View style={styles.qrPanel}>
          <QRCode
            getRef={(ref) => {
              qrCodeRef.current = ref as QrCodeRef | null;
            }}
            size={184}
            value={qrValue}
          />
          <Text style={styles.leagueMeta}>{createdLeague.slug}</Text>
        </View>
        <ActionButton disabled={loading} label="Save to photos" onPress={() => void saveQrToPhotos()} />
        <Text style={qrEmailStatus === "error" ? styles.errorText : styles.helpText}>
          {qrEmailStatus === "sending"
            ? "Sending your QR code email..."
            : qrEmailMessage ?? "Preparing your QR code email..."}
        </Text>
        <Text style={styles.sectionTitle}>Your league is ready</Text>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {loading ? <ActivityIndicator color={theme.color.action.primary} /> : null}
        <ActionButton
          label="Get started"
          onPress={() => {
            setCreateStep("home");
            void enterLeague(createdLeague);
          }}
        />
      </View>
    );
  }

  if (activeQueueProfile) {
    return (
      <LeagueQueueScreen
        onAddPlayerToQueue={(playerId, displayName) =>
          addViewedPlayerToQueue(activeQueueProfile, playerId, displayName)
        }
        onBack={() => {
          onQueueProfileChanged(null);
          void loadHomeData();
        }}
        onJoinQueue={() => joinViewedQueue(activeQueueProfile)}
        onLeftQueue={() => {
          onQueueProfileChanged(null);
          void loadHomeData();
        }}
        onQueueMembershipChanged={() => {
          void loadHomeData();
        }}
        onStatsRevealConsumed={() => {
          if (!activeQueueProfile.animateStatsReveal) {
            return;
          }

          onQueueProfileChanged({
            ...activeQueueProfile,
            animateStatsReveal: false
          });
        }}
        onViewedQueueEnded={() => {
          onQueueProfileChanged({
            ...activeQueueProfile,
            sessionId: null
          });
          void loadHomeData();
        }}
        profile={activeQueueProfile}
      />
    );
  }

  return (
    <>
      <ScrollView
        alwaysBounceVertical={false}
        bounces={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              createStep === "home"
                ? theme.size.navigationBottomHeight + insets.bottom + theme.layout.sectionGap
                : insets.bottom + theme.layout.sectionGap,
            paddingTop: insets.top + (createStep === "home" ? theme.space[32] : theme.space[20])
          }
        ]}
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
        scrollEnabled={false}
      >
        {createStep === "home" ? renderHome() : renderCreateFlow()}
      </ScrollView>
      <Modal animationType="fade" transparent visible={scannerOpen} onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.scannerDialog}>
            <Text style={styles.sectionTitle}>Scan league QR</Text>
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(result) => void handleBarcodeScanned(result)}
              style={styles.camera}
            />
            <ActionButton label="Cancel" onPress={() => setScannerOpen(false)} variant="text" />
          </View>
        </View>
      </Modal>
      <Modal animationType="fade" transparent visible={Boolean(joinLeague)} onRequestClose={() => setJoinLeague(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView
            contentContainerStyle={[
              styles.joinDialogScrollContent,
              {
                paddingBottom: insets.bottom + theme.layout.screenInset,
                paddingTop: insets.top + theme.layout.screenInset
              }
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.joinDialog}>
              <Text style={styles.sectionTitle}>Join {joinLeague?.name}</Text>
              <Text style={styles.helpText}>Enter your first and last name. If your name is already in this league, choose it from the list.</Text>
              <TextInput
                accessibilityLabel="First and last name"
                autoCapitalize="words"
                onChangeText={(value) => {
                  setJoinName(value);
                  setSelectedPlayerId(null);
                }}
                placeholder="First and last name"
                placeholderTextColor={theme.color.text.secondary}
                style={styles.input}
                value={joinName}
              />
              {joinMatches.length > 0 ? (
                <View style={styles.matchList}>
                  {joinMatches.map((match) => {
                    const avatarUrl = match.profile_image_path
                      ? publicProfileImageUrl(match.profile_image_path)
                      : null;

                    return (
                      <Pressable
                        accessibilityLabel={`Use ${match.display_name}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: selectedPlayerId === match.id }}
                        key={match.id}
                        onPress={() => {
                          setSelectedPlayerId(match.id);
                          setJoinName(match.display_name);
                        }}
                        style={({ pressed }) => [
                          styles.nameMatchRow,
                          selectedPlayerId === match.id ? styles.nameMatchSelected : null,
                          pressed ? styles.rowPressed : null
                        ]}
                      >
                        <View style={styles.avatar}>
                          {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                          ) : (
                            <Text style={styles.avatarText}>{initialsFor(match.display_name)}</Text>
                          )}
                        </View>
                        <View style={styles.leagueText}>
                          <Text style={styles.memberName}>{match.display_name}</Text>
                          {match.profile_image_path ? <Text style={styles.leagueMeta}>Profile photo</Text> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
              {loading ? <ActivityIndicator color={theme.color.action.primary} /> : null}
              <View style={styles.bottomActions}>
                <ActionButton label="Cancel" onPress={() => setJoinLeague(null)} variant="text" />
                <ActionButton
                  disabled={loading || joinName.trim().split(/\s+/).filter(Boolean).length < 2}
                  label={selectedPlayerId ? "Join queue" : exactJoinNameMatches.length > 0 ? "Add another" : "Join queue"}
                  onPress={() => void submitJoinName()}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function leagueFromOrganization(organization: OrganizationSummary): LeagueCodeResult {
  return {
    id: organization.id,
    location_text: organization.location_text ?? null,
    name: organization.name,
    number_of_courts: organization.number_of_courts,
    slug: organization.slug
  };
}

function validCourtCount(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function activePlayersText(activePlayerCount: number) {
  const playerLabel = activePlayerCount === 1 ? "player" : "players";
  return `${activePlayerCount} ${playerLabel} active`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short"
  }).format(new Date(value));
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const styles = StyleSheet.create({
  addPlayerRow: {
    flexDirection: "row",
    gap: theme.layout.stackCompact
  },
  avatar: {
    alignItems: "center",
    backgroundColor: theme.color.surface.info,
    borderRadius: theme.radius.pill,
    height: theme.size.avatarDefault,
    justifyContent: "center",
    overflow: "hidden",
    width: theme.size.avatarDefault
  },
  avatarImage: {
    height: "100%",
    width: "100%"
  },
  avatarText: {
    ...theme.type.bodySecondary,
    color: theme.color.text.selected,
    fontFamily: theme.font.interfaceSemibold,
    fontWeight: "600"
  },
  bodyText: {
    ...theme.type.bodyDefault,
    color: theme.color.text.primary
  },
  bottomActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.layout.inlineDefault,
    justifyContent: "space-between"
  },
  homeTitle: {
    ...theme.type.headingBrand,
    color: theme.color.text.primary
  },
  camera: {
    aspectRatio: 1,
    borderRadius: theme.radius.control,
    overflow: "hidden",
    width: "100%"
  },
  content: {
    backgroundColor: theme.color.surface.canvas,
    flexGrow: 1,
    paddingHorizontal: theme.layout.screenInset
  },
  createLeagueCta: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: "auto",
    paddingBottom: theme.space[12],
    paddingTop: theme.layout.sectionGap
  },
  createLeaguePrompt: {
    ...theme.type.bodyDefault,
    color: theme.color.text.primary,
    textAlign: "center"
  },
  createLeagueLink: {
    ...theme.type.labelAction,
    color: theme.color.action.primary,
    fontFamily: theme.font.interfaceBold,
    fontWeight: "700",
    textDecorationLine: "underline"
  },
  createLeagueLinkDisabled: {
    opacity: 0.6
  },
  createLeagueLinkTarget: {
    alignItems: "center",
    borderRadius: theme.radius.control,
    justifyContent: "center",
    minHeight: theme.size.targetMinimum,
    minWidth: theme.size.targetMinimum,
    paddingHorizontal: 0,
    paddingVertical: theme.space[8]
  },
  creationCloseRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginRight: -theme.space[12]
  },
  creationPrimaryButton: {
    alignSelf: "stretch"
  },
  emptyText: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  entryStack: {
    gap: theme.layout.stackDefault,
    marginTop: theme.layout.sectionGap
  },
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error
  },
  flow: {
    gap: theme.layout.stackDefault
  },
  formBodyButton: {
    alignSelf: "stretch"
  },
  helpText: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  homeContent: {
    flex: 1
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
  joinDialog: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
    padding: theme.layout.cardPadding
  },
  joinDialogScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: theme.layout.screenInset
  },
  leagueCard: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
    padding: theme.layout.cardPadding
  },
  leagueMeta: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  leagueName: {
    ...theme.type.titleCard,
    color: theme.color.text.primary
  },
  leagueRow: {
    alignItems: "center",
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    flexDirection: "row",
    gap: theme.layout.inlineDefault,
    minHeight: theme.size.playerRowMinimumHeight,
    padding: theme.layout.cardPadding
  },
  leagueSummaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.inlineDefault
  },
  leagueText: {
    flex: 1,
    gap: theme.space[2],
    minWidth: 0
  },
  list: {
    gap: theme.layout.stackCompact
  },
  yourLeaguesSection: {
    marginTop: theme.space[16]
  },
  matchList: {
    gap: theme.layout.stackCompact
  },
  memberName: {
    ...theme.type.bodyDefault,
    color: theme.color.text.primary
  },
  modalBackdrop: {
    backgroundColor: "rgba(34, 40, 58, 0.36)",
    flex: 1,
    justifyContent: "center"
  },
  nameMatchRow: {
    alignItems: "center",
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.quiet,
    flexDirection: "row",
    gap: theme.layout.inlineDefault,
    minHeight: theme.size.targetMinimum,
    padding: theme.space[8]
  },
  nameMatchSelected: {
    backgroundColor: theme.color.surface.social,
    borderColor: theme.color.border.active
  },
  orLine: {
    backgroundColor: theme.color.border.subtle,
    flex: 1,
    height: theme.border.quiet
  },
  orSeparator: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.inlineDefault
  },
  orText: {
    ...theme.type.bodyDefault,
    color: theme.color.text.secondary,
    textAlign: "center"
  },
  pageTitle: {
    ...theme.type.headingPage,
    color: theme.color.text.primary
  },
  playerNameInput: {
    flex: 1
  },
  playerSummaryRow: {
    borderColor: theme.color.border.subtle,
    borderTopWidth: theme.border.quiet,
    paddingTop: theme.space[8]
  },
  qrPanel: {
    alignItems: "center",
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackCompact,
    padding: theme.layout.cardPadding
  },
  rosterPanel: {
    borderColor: theme.color.border.subtle,
    borderTopWidth: theme.border.quiet,
    gap: theme.layout.stackCompact,
    paddingTop: theme.layout.stackDefault
  },
  scoreModeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.inlineDefault,
    minHeight: theme.size.targetMinimum,
    paddingBottom: theme.space[8]
  },
  rowActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  rowPressed: {
    backgroundColor: theme.color.surface.info
  },
  scannerDialog: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.card,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
    margin: theme.layout.screenInset,
    padding: theme.layout.cardPadding
  },
  sectionLabel: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  sectionTitle: {
    ...theme.type.headingSection,
    color: theme.color.text.primary
  },
  settingsInput: {
    ...theme.type.bodyDefault,
    borderColor: theme.color.border.control,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.interactive,
    color: theme.color.text.primary,
    flex: 1,
    height: theme.size.targetMinimum,
    includeFontPadding: false,
    lineHeight: theme.space[20],
    minHeight: theme.size.targetMinimum,
    minWidth: 0,
    paddingBottom: theme.space[2],
    paddingHorizontal: theme.space[12],
    paddingTop: 0,
    textAlignVertical: "center"
  },
  startText: {
    ...theme.type.labelAction,
    color: theme.color.action.primary
  }
});
