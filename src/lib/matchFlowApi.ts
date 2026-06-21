import { supabase } from "./supabase";
import type {
  AcceptRecommendationRequest,
  AcceptRecommendationResponse,
  CompleteMatchRequest,
  PassPlayerRequest,
  RecommendationResponse,
  RecommendationSnapshot
} from "../types/matchFlow";

const matchFlowApiUrl = process.env.EXPO_PUBLIC_MATCH_FLOW_API_URL;

export const isMatchFlowApiConfigured = Boolean(matchFlowApiUrl);

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
  if (!matchFlowApiUrl) {
    throw new Error("EXPO_PUBLIC_MATCH_FLOW_API_URL is not configured.");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (options.authenticated) {
    headers.authorization = await getAuthorizationHeader();
  }

  const response = await fetch(`${matchFlowApiUrl}${path}`, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
    method: options.method
  });

  if (!response.ok) {
    const detail = await readError(response);
    throw new Error(detail);
  }

  return (await response.json()) as TResponse;
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
