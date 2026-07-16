import { Platform } from "react-native";
import { supabase } from "./supabase";
import type {
  AcceptRecommendationRequest,
  AcceptRecommendationResponse,
  CompleteMatchRequest,
  CustomMatchRequest,
  PassPlayerRequest,
  RecommendationResponse,
  RecommendationSnapshot
} from "../types/matchFlow";

const rawMatchFlowApiUrl = process.env.EXPO_PUBLIC_MATCH_FLOW_API_URL;
const androidEmulatorMatchFlowApiUrl = process.env.EXPO_PUBLIC_ANDROID_EMULATOR_MATCH_FLOW_API_URL;

export const matchFlowApiConfigKey = getMatchFlowApiBaseUrl() ?? "unconfigured";
export const isMatchFlowApiConfigured = matchFlowApiConfigKey !== "unconfigured";

export function getMatchFlowApiBaseUrl() {
  return resolveMatchFlowApiUrl();
}

export async function previewRecommendations(snapshot: RecommendationSnapshot) {
  return requestMatchFlow<RecommendationResponse>("/recommendations/preview", {
    body: snapshot,
    authenticated: false,
    method: "POST"
  });
}

export async function completeMatch(matchId: string, request: CompleteMatchRequest) {
  return requestMatchFlow<RecommendationResponse>(`/matches/${matchId}/complete`, {
    body: request,
    authenticated: true,
    method: "POST"
  });
}

export async function completeCustomMatch(sessionId: string, request: CustomMatchRequest) {
  return requestMatchFlow<RecommendationResponse>(`/sessions/${sessionId}/matches/custom`, {
    body: request,
    authenticated: true,
    method: "POST"
  });
}

export async function passPlayer(recommendationId: string, request: PassPlayerRequest) {
  return requestMatchFlow<RecommendationResponse>(`/recommendations/${recommendationId}/pass-player`, {
    body: request,
    authenticated: true,
    method: "POST"
  });
}

export async function acceptRecommendation(
  recommendationId: string,
  request: AcceptRecommendationRequest = {}
) {
  return requestMatchFlow<AcceptRecommendationResponse>(`/recommendations/${recommendationId}/accept`, {
    body: request,
    authenticated: true,
    method: "POST"
  });
}

export async function regenerateSessionRecommendations(sessionId: string) {
  return requestMatchFlow<RecommendationResponse>(`/sessions/${sessionId}/recommendations/regenerate`, {
    authenticated: true,
    method: "POST"
  });
}

export async function sendLeagueQrEmail(
  leagueId: string,
  request: {
    league_name: string;
    qr_png_base64: string;
    qr_value: string;
    recipient_email: string;
  }
) {
  return requestMatchFlow<{ sent: boolean }>(`/leagues/${leagueId}/qr-email`, {
    authenticated: true,
    body: request,
    method: "POST"
  });
}

type MatchFlowRequest = {
  authenticated: boolean;
  body?: unknown;
  method: "POST";
};

async function requestMatchFlow<TResponse>(path: string, options: MatchFlowRequest): Promise<TResponse> {
  const matchFlowApiUrl = getMatchFlowApiBaseUrl();

  if (!matchFlowApiUrl) {
    throw new Error("EXPO_PUBLIC_MATCH_FLOW_API_URL is not configured.");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (options.authenticated) {
    headers.authorization = await getAuthorizationHeader();
  }

  let response: Response;

  try {
    response = await fetch(`${matchFlowApiUrl}${path}`, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers,
      method: options.method
    });
  } catch (error) {
    throw new Error(
      `Could not reach the match flow API at ${matchFlowApiUrl}. ` +
        "If you are using the Android emulator, set EXPO_PUBLIC_MATCH_FLOW_API_URL to http://10.0.2.2:8000 and make sure the backend is running."
    );
  }

  if (!response.ok) {
    const detail = await readError(response);
    throw new Error(detail);
  }

  return (await response.json()) as TResponse;
}

function resolveMatchFlowApiUrl() {
  if (Platform.OS === "android" && androidEmulatorMatchFlowApiUrl) {
    return normalizeUrl(androidEmulatorMatchFlowApiUrl);
  }

  if (!rawMatchFlowApiUrl) {
    return undefined;
  }

  if (Platform.OS === "android") {
    return normalizeUrl(resolveAndroidLocalhostBridge(rawMatchFlowApiUrl));
  }

  return normalizeUrl(rawMatchFlowApiUrl);
}

function resolveAndroidLocalhostBridge(url: string) {
  const trimmedUrl = url.trim();
  const match = /^(https?:\/\/)([^/:?#]+)(:\d+)?([/?#].*)?$/i.exec(trimmedUrl);

  if (!match) {
    return url;
  }

  const [, protocol, hostname, port = "", rest = ""] = match;

  return hostname && isLocalDevelopmentHost(hostname.toLowerCase())
    ? `${protocol}10.0.2.2${port}${rest}`
    : trimmedUrl;
}

function isLocalDevelopmentHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

async function getAuthorizationHeader() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("Sign in before calling the match flow API.");
  }

  return `Bearer ${accessToken}`;
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { detail?: unknown };
    return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? data);
  } catch {
    return `Match flow API request failed with ${response.status}.`;
  }
}
