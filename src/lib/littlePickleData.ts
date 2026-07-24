import { supabase } from "./supabase";
import type {
  ActiveMatchesResponse,
  CompleteMatchRequest,
  CompletedMatchesResponse,
  RecommendationResponse,
  RecommendationSnapshot,
  SessionPlayerOption
} from "../types/matchFlow";

export type CreateOrganizationInput = {
  locationText?: string | null;
  name: string;
  slug: string;
  numberOfCourts: number;
};

export type UpdateOrganizationInput = CreateOrganizationInput & {
  organizationId: string;
};

export type CreatePlayerInput = {
  organizationId: string;
  displayName: string;
  rating?: number;
};

export type CreateSessionQueuedPlayerInput = {
  displayName: string;
  rating?: number;
  sessionId: string;
};

export type UpdateOrganizationPlayerInput = {
  active: boolean;
  displayName: string;
  playerId: string;
  rating: number;
};

export type OrganizationMemberRole = "admin" | "player";

export type UpdatedCompletedMatchResult = {
  match_id: string;
  result_mode: "score" | "win_loss";
  team_one_score: number | null;
  team_two_score: number | null;
  winning_team: 1 | 2 | null;
};

export type OrganizationSummary = {
  id: string;
  location_text?: string | null;
  name: string;
  slug: string;
  number_of_courts: number;
  role: OrganizationMemberRole;
  score_mode_enabled: boolean;
};

export type OrganizationSearchResult = {
  already_member: boolean;
  id: string;
  location_text?: string | null;
  name: string;
  number_of_courts: number;
  slug: string;
};

export type OrganizationMemberSummary = {
  created_at: string;
  display_name: string;
  email: string | null;
  player_id: string | null;
  player_name: string | null;
  rating: number | null;
  role: OrganizationMemberRole;
  user_id: string;
};

export type OrganizationPlayerSummary = {
  active: boolean;
  created_at: string;
  display_name: string;
  id: string;
  profile_image_path: string | null;
  rating: number;
};

export type OrganizationOpenSessionSummary = {
  active_match_count: number;
  active_player_count: number;
  court_count_snapshot: number;
  current_round: number;
  id: string;
  started_at: string;
};

export type MyProfile = {
  avatar_path: string | null;
  display_name: string;
  email: string | null;
  id: string;
};

export type LeagueCodeResult = {
  id: string;
  location_text: string | null;
  name: string;
  number_of_courts: number;
  slug: string;
};

export type LeaguePlayerNameMatch = {
  created_at: string;
  display_name: string;
  id: string;
  profile_image_path: string | null;
  rating: number;
};

export type NearbyPlayer = {
  display_name: string;
  id: string;
  profile_image_path: string | null;
  rating: number;
};

export type ProfileOverview = {
  nearby_players: NearbyPlayer[];
  organization_id: string;
  player: {
    display_name: string;
    id: string;
    profile_image_path: string | null;
    rating: number;
  };
  stats: {
    hours_played: number;
    match_count: number;
    rank: number;
  };
};

export type PlayerMatchHistoryResponse = {
  matches: CompletedMatchesResponse["matches"];
  organization_id: string;
  player_id: string;
  score_mode_enabled: boolean;
};

export type JoinLeagueQueueInput = {
  allowDuplicateName?: boolean;
  displayName: string;
  organizationId: string;
  playerId?: string | null;
  profileImagePath?: string | null;
};

export type JoinLeagueQueueResult = {
  organization: LeagueCodeResult;
  player: {
    display_name: string;
    id: string;
    profile_image_path: string | null;
    rating: number;
  };
  session_id: string;
};

export async function getMyProfile() {
  return rpc<MyProfile>("my_profile", {});
}

export async function updateMyProfile(displayName: string, avatarPath?: string | null) {
  return rpc<MyProfile>("update_my_profile", {
    p_display_name: displayName,
    p_avatar_path: avatarPath ?? undefined
  });
}

export async function ensureCurrentUserPlayer(organizationId: string) {
  return rpc<string>("ensure_current_user_player", {
    p_organization_id: organizationId
  });
}

export async function getMyOrganizations() {
  return rpc<OrganizationSummary[]>("my_organizations", {});
}

export async function searchOrganizations(query: string) {
  return rpc<OrganizationSearchResult[]>("search_organizations", {
    p_query: query
  });
}

export async function joinOrganization(organizationId: string) {
  return rpc<string>("join_organization", {
    p_organization_id: organizationId
  });
}

export async function getOrganizationMembersForAdmin(organizationId: string) {
  return rpc<OrganizationMemberSummary[]>("organization_members_for_admin", {
    p_organization_id: organizationId
  });
}

export async function getOrganizationPlayersForAdmin(organizationId: string) {
  return rpc<OrganizationPlayerSummary[]>("organization_players_for_admin", {
    p_organization_id: organizationId
  });
}

export async function updateOrganizationSettings(input: UpdateOrganizationInput) {
  return rpc<OrganizationSummary>("update_organization_settings", {
    p_organization_id: input.organizationId,
    p_name: input.name,
    p_slug: input.slug,
    p_number_of_courts: input.numberOfCourts
  });
}

export async function setOrganizationScoreMode(organizationId: string, scoreModeEnabled: boolean) {
  return rpc<OrganizationSummary>("set_organization_score_mode", {
    p_organization_id: organizationId,
    p_score_mode_enabled: scoreModeEnabled
  });
}

export async function setOrganizationMemberRole(
  organizationId: string,
  userId: string,
  role: OrganizationMemberRole
) {
  return rpc<OrganizationMemberSummary[]>("set_organization_member_role", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_role: role
  });
}

export async function createOrganization(input: CreateOrganizationInput) {
  return rpc<string>("create_organization", {
    p_name: input.name,
    p_slug: input.slug,
    p_number_of_courts: input.numberOfCourts
  });
}

export async function createLeague(input: Required<Pick<CreateOrganizationInput, "name" | "numberOfCourts" | "slug">> & Pick<CreateOrganizationInput, "locationText">) {
  return rpc<OrganizationSummary>("create_league", {
    p_location_text: input.locationText ?? null,
    p_name: input.name,
    p_number_of_courts: input.numberOfCourts,
    p_slug: input.slug
  });
}

export async function createPlayer(input: CreatePlayerInput) {
  return rpc<string>("create_player", {
    p_organization_id: input.organizationId,
    p_display_name: input.displayName,
    p_rating: input.rating ?? 3
  });
}

export async function createSessionQueuedPlayer(input: CreateSessionQueuedPlayerInput) {
  return rpc<string>("create_session_queued_player", {
    p_display_name: input.displayName,
    p_rating: input.rating ?? 3,
    p_session_id: input.sessionId
  });
}

export async function updateOrganizationPlayer(input: UpdateOrganizationPlayerInput) {
  return rpc<OrganizationPlayerSummary[]>("update_organization_player", {
    p_player_id: input.playerId,
    p_display_name: input.displayName,
    p_rating: input.rating,
    p_active: input.active
  });
}

export async function createPlaySession(organizationId: string, courtCount?: number) {
  return rpc<string>("create_play_session", {
    p_organization_id: organizationId,
    p_court_count: courtCount
  });
}

export async function getOrCreateOpenPlaySession(organizationId: string, courtCount?: number) {
  return rpc<string>("get_or_create_open_play_session", {
    p_organization_id: organizationId,
    p_court_count: courtCount
  });
}

export async function getOrganizationOpenSessions(organizationId: string) {
  return rpc<OrganizationOpenSessionSummary[]>("organization_open_sessions", {
    p_organization_id: organizationId
  });
}

export async function addPlayerToSession(sessionId: string, playerId: string) {
  return rpc<RecommendationSnapshot>("add_player_to_session", {
    p_session_id: sessionId,
    p_player_id: playerId
  });
}

export async function removePlayerFromSession(sessionId: string, playerId: string) {
  return rpc<RecommendationSnapshot>("remove_player_from_session", {
    p_session_id: sessionId,
    p_player_id: playerId
  });
}

export async function getSessionRecommendationSnapshot(sessionId: string) {
  return rpc<RecommendationSnapshot>("session_recommendation_snapshot", {
    p_session_id: sessionId
  });
}

export async function getActiveRecommendations(sessionId: string) {
  return rpc<RecommendationResponse>("active_recommendations", {
    p_session_id: sessionId
  });
}

export async function getActiveMatches(sessionId: string) {
  return rpc<ActiveMatchesResponse>("active_matches", {
    p_session_id: sessionId
  });
}

export async function getCompletedMatches(sessionId: string) {
  return rpc<CompletedMatchesResponse>("completed_matches", {
    p_session_id: sessionId
  });
}

export async function updateCompletedMatchResult(matchId: string, request: CompleteMatchRequest) {
  return rpc<UpdatedCompletedMatchResult>("update_completed_match_result", {
    p_match_id: matchId,
    p_result_mode: request.result_mode,
    p_team_one_score: request.result_mode === "score" ? request.team_one_score : null,
    p_team_two_score: request.result_mode === "score" ? request.team_two_score : null,
    p_winning_team: request.result_mode === "win_loss" ? request.winning_team : null
  });
}

export async function getSessionPlayerOptions(sessionId: string) {
  return rpc<SessionPlayerOption[]>("session_player_options", {
    p_session_id: sessionId
  });
}

export async function getLeagueByCode(code: string) {
  return rpc<LeagueCodeResult>("league_by_code", {
    p_code: code
  });
}

export async function searchLeaguePlayerNames(organizationId: string, query: string) {
  return rpc<LeaguePlayerNameMatch[]>("league_player_name_matches", {
    p_organization_id: organizationId,
    p_query: query
  });
}

export async function getPlayerProfileOverview(organizationId: string, playerId: string) {
  return rpc<ProfileOverview>("player_profile_overview", {
    p_organization_id: organizationId,
    p_player_id: playerId
  });
}

export async function getPlayerCompletedMatches(organizationId: string, playerId: string) {
  return rpc<PlayerMatchHistoryResponse>("player_completed_matches", {
    p_organization_id: organizationId,
    p_player_id: playerId
  });
}

export async function updatePlayerProfileImage(playerId: string, profileImagePath: string) {
  return rpc<LeaguePlayerNameMatch>("update_player_profile_image", {
    p_player_id: playerId,
    p_profile_image_path: profileImagePath
  });
}

export async function updatePlayerDisplayName(playerId: string, displayName: string) {
  return rpc<LeaguePlayerNameMatch>("update_player_display_name", {
    p_display_name: displayName,
    p_player_id: playerId
  });
}

export async function joinLeagueQueue(input: JoinLeagueQueueInput) {
  return rpc<JoinLeagueQueueResult>("join_league_queue", {
    p_allow_duplicate_name: input.allowDuplicateName ?? false,
    p_display_name: input.displayName,
    p_organization_id: input.organizationId,
    p_player_id: input.playerId ?? null,
    p_profile_image_path: input.profileImagePath ?? null
  });
}

async function rpc<TResult>(functionName: string, args: Record<string, unknown>) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc(functionName, args);

  if (error) {
    throw new Error(friendlyRpcMessage(functionName, error));
  }

  return data as TResult;
}

type RpcError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

function friendlyRpcMessage(functionName: string, error: RpcError) {
  const message = error.message ?? "";
  const details = error.details ?? "";
  const hint = error.hint ?? "";
  const searchable = [error.code, message, details, hint].filter(Boolean).join(" ").toLowerCase();

  if (searchable.includes("could not find the function") || searchable.includes("function public.") || error.code === "PGRST202") {
    return `Supabase is missing the ${functionName} RPC. Apply all Supabase migrations, then try again.`;
  }

  if (searchable.includes("column") && searchable.includes("does not exist")) {
    return `Supabase schema is out of date for ${functionName}. Apply all Supabase migrations, then try again.`;
  }

  if (searchable.includes("authentication required")) {
    return "Your email was verified, but the app could not use the new session yet. Try pressing Create league again.";
  }

  if (searchable.includes("not allowed") || error.code === "42501") {
    return "You do not have permission to make that league change.";
  }

  if (searchable.includes("score mode changed") || error.code === "40001") {
    return "League score mode changed. Reopen the result form and try again.";
  }

  return [message, details, hint].filter(Boolean).join(" ") || `Could not call ${functionName}.`;
}
