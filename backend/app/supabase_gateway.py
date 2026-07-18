from __future__ import annotations

from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException, status

from .config import Settings
from .models import (
    AcceptRecommendationResponse,
    CompleteMatchRequest,
    CustomMatchRequest,
    PassPlayerRequest,
    RecommendationResponse,
    RecommendationSnapshot,
)


class SupabaseGateway:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def complete_match(
        self,
        match_id: UUID,
        request: CompleteMatchRequest,
        access_token: str,
    ) -> RecommendationSnapshot:
        payload = {
            "p_match_id": str(match_id),
            "p_result_mode": request.result_mode,
            "p_team_one_score": request.team_one_score,
            "p_team_two_score": request.team_two_score,
            "p_winning_team": request.winning_team,
        }
        data = await self._rpc_as_user(
            "complete_match_result_for_recommendations",
            payload,
            access_token,
        )
        return RecommendationSnapshot.model_validate(data)

    async def complete_custom_match(
        self,
        session_id: UUID,
        request: CustomMatchRequest,
        access_token: str,
    ) -> tuple[UUID, RecommendationSnapshot]:
        payload = {
            "p_session_id": str(session_id),
            "p_team_one_player_one_id": str(request.team_one_player_ids[0]),
            "p_team_one_player_two_id": str(request.team_one_player_ids[1]),
            "p_team_two_player_one_id": str(request.team_two_player_ids[0]),
            "p_team_two_player_two_id": str(request.team_two_player_ids[1]),
            "p_result_mode": request.result_mode,
            "p_team_one_score": request.team_one_score,
            "p_team_two_score": request.team_two_score,
            "p_winning_team": request.winning_team,
        }
        data = await self._rpc_as_user(
            "complete_custom_match_result_for_recommendations",
            payload,
            access_token,
        )
        return (
            UUID(str(data["match_id"])),
            RecommendationSnapshot.model_validate(data["snapshot"]),
        )

    async def pass_player(
        self,
        recommendation_id: UUID,
        request: PassPlayerRequest,
        access_token: str,
    ) -> RecommendationSnapshot:
        payload = {
            "p_session_id": str(request.session_id),
            "p_player_id": str(request.player_id),
            "p_recommendation_id": str(recommendation_id),
        }
        data = await self._rpc_as_user("pass_player", payload, access_token)
        return RecommendationSnapshot.model_validate(data)

    async def regenerate_session(
        self,
        session_id: UUID,
        access_token: str,
    ) -> RecommendationSnapshot:
        data = await self._rpc_as_user(
            "session_recommendation_snapshot",
            {"p_session_id": str(session_id)},
            access_token,
        )
        return RecommendationSnapshot.model_validate(data)

    async def accept_recommendation(
        self,
        recommendation_id: UUID,
        court_number: int | None,
        access_token: str,
    ) -> AcceptRecommendationResponse:
        data = await self._rpc_as_user(
            "accept_recommendation",
            {
                "p_recommendation_id": str(recommendation_id),
                "p_court_number": court_number,
            },
            access_token,
        )
        return AcceptRecommendationResponse(match_id=data)

    async def require_league_admin(
        self,
        organization_id: UUID,
        access_token: str,
    ) -> None:
        organizations = await self._rpc_as_user("my_organizations", {}, access_token)

        if not isinstance(organizations, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not validate league admin access.",
            )

        for organization in organizations:
            if (
                isinstance(organization, dict)
                and str(organization.get("id")) == str(organization_id)
                and organization.get("role") == "admin"
            ):
                return

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only league admins can send this QR email.",
        )

    async def store_recommendations(
        self,
        response: RecommendationResponse,
        generated_after_match_id: UUID | None = None,
    ) -> RecommendationResponse:
        payload = {
            "p_session_id": str(response.session_id),
            "p_generated_after_match_id": str(generated_after_match_id)
            if generated_after_match_id
            else None,
            "p_algorithm_version": response.algorithm_version,
            "p_recommendations": [
                recommendation.model_dump(mode="json")
                for recommendation in response.recommendations
            ],
        }
        stored = await self._rpc_as_service("replace_recommendation_batch", payload)
        batch_id = stored.get("batch_id") if isinstance(stored, dict) else stored
        ids_by_rank = {
            item["rank"]: item["id"]
            for item in stored.get("recommendation_ids", [])
        } if isinstance(stored, dict) else {}
        recommendations = [
            recommendation.model_copy(update={"id": ids_by_rank.get(recommendation.rank)})
            for recommendation in response.recommendations
        ]
        return response.model_copy(
            update={
                "batch_id": batch_id,
                "recommendations": recommendations,
            }
        )

    async def _rpc_as_user(
        self,
        function_name: str,
        payload: dict[str, Any],
        access_token: str,
    ) -> Any:
        self._require_supabase()
        return await self._rpc(
            function_name=function_name,
            payload=payload,
            api_key=self.settings.supabase_anon_key or "",
            bearer_token=access_token,
        )

    async def _rpc_as_service(
        self,
        function_name: str,
        payload: dict[str, Any],
    ) -> Any:
        self._require_supabase()
        service_key = self.settings.supabase_service_role_key or ""
        return await self._rpc(
            function_name=function_name,
            payload=payload,
            api_key=service_key,
            bearer_token=service_key,
        )

    async def _rpc(
        self,
        function_name: str,
        payload: dict[str, Any],
        api_key: str,
        bearer_token: str,
    ) -> Any:
        supabase_url = str(self.settings.supabase_url).rstrip("/")
        url = f"{supabase_url}/rest/v1/rpc/{function_name}"
        headers = {
            "apikey": api_key,
            "authorization": f"Bearer {bearer_token}",
            "content-type": "application/json",
        }

        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(url, headers=headers, json=payload)

        if response.status_code >= 400:
            raise HTTPException(
                status_code=_map_supabase_status(response.status_code),
                detail={
                    "supabase_status": response.status_code,
                    "function": function_name,
                    "error": _safe_json(response),
                },
            )

        return _safe_json(response)

    def _require_supabase(self) -> None:
        if not self.settings.supabase_configured:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Supabase is not configured. Set SUPABASE_URL, "
                    "SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
                ),
            )


def bearer_token_from_header(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expected Authorization: Bearer <Supabase access token>.",
        )
    return token


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text


def _map_supabase_status(status_code: int) -> int:
    if status_code in (401, 403, 404, 409):
        return status_code
    if 400 <= status_code < 500:
        return status.HTTP_400_BAD_REQUEST
    return status.HTTP_502_BAD_GATEWAY
