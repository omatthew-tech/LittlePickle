from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .models import (
    AcceptRecommendationRequest,
    AcceptRecommendationResponse,
    AccountDeletionResponse,
    CompleteMatchRequest,
    CustomMatchRequest,
    MatchRecommendation,
    PassPlayerRequest,
    RecommendationResponse,
    RecommendationSnapshot,
    SendLeagueQrEmailRequest,
    SendLeagueQrEmailResponse,
)
from .recommendations import build_recommendation_response
from .email_delivery import send_league_qr_email
from .player_data_retention import run_player_data_retention_loop
from .supabase_gateway import (
    StaleRecommendationVersionError,
    SupabaseGateway,
    bearer_token_from_header,
)


async def generate_and_store_recommendations(
    gateway: SupabaseGateway,
    snapshot: RecommendationSnapshot,
    algorithm_version: str,
    access_token: str,
    generated_after_match_id: UUID | None = None,
) -> RecommendationResponse:
    response = build_recommendation_response(
        snapshot=snapshot,
        algorithm_version=algorithm_version,
    )
    try:
        return await gateway.store_recommendations(
            response,
            expected_recommendation_version=snapshot.session.recommendation_version,
            generated_after_match_id=generated_after_match_id,
        )
    except StaleRecommendationVersionError:
        latest_snapshot = await gateway.regenerate_session(
            snapshot.session.id,
            access_token,
        )
        latest_response = build_recommendation_response(
            snapshot=latest_snapshot,
            algorithm_version=algorithm_version,
        )
        try:
            return await gateway.store_recommendations(
                latest_response,
                expected_recommendation_version=(
                    latest_snapshot.session.recommendation_version
                ),
                generated_after_match_id=generated_after_match_id,
            )
        except StaleRecommendationVersionError as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The queue changed again; refresh recommendations and retry.",
            ) from error


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(current_app: FastAPI):
        retention_task = None

        if settings.supabase_configured:
            retention_task = asyncio.create_task(
                run_player_data_retention_loop(settings)
            )
            current_app.state.player_data_retention_task = retention_task

        yield

        if retention_task is not None:
            retention_task.cancel()
            with suppress(asyncio.CancelledError):
                await retention_task

    app = FastAPI(title=settings.api_title, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=settings.allow_credentials,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["authorization", "content-type"],
    )

    @app.get("/health")
    async def health() -> dict[str, bool | str]:
        return {
            "ok": True,
            "supabase_configured": settings.supabase_configured,
            "email_configured": settings.email_configured,
            "algorithm_version": settings.algorithm_version,
        }

    @app.post("/account/deletion", response_model=AccountDeletionResponse)
    async def request_account_deletion(
        authorization: str | None = Header(default=None),
        current_settings: Settings = Depends(get_settings),
    ) -> AccountDeletionResponse:
        access_token = bearer_token_from_header(authorization)
        return await SupabaseGateway(current_settings).request_account_deletion(
            access_token
        )

    @app.post("/recommendations/preview", response_model=RecommendationResponse)
    async def preview_recommendations(
        snapshot: RecommendationSnapshot,
        current_settings: Settings = Depends(get_settings),
    ) -> RecommendationResponse:
        return build_recommendation_response(
            snapshot=snapshot,
            algorithm_version=current_settings.algorithm_version,
        )

    @app.post("/matches/{match_id}/complete", response_model=RecommendationResponse)
    async def complete_match(
        match_id: UUID,
        request: CompleteMatchRequest,
        authorization: str | None = Header(default=None),
        current_settings: Settings = Depends(get_settings),
    ) -> RecommendationResponse:
        access_token = bearer_token_from_header(authorization)
        gateway = SupabaseGateway(current_settings)
        snapshot = await gateway.complete_match(match_id, request, access_token)
        return await generate_and_store_recommendations(
            gateway=gateway,
            snapshot=snapshot,
            algorithm_version=current_settings.algorithm_version,
            access_token=access_token,
            generated_after_match_id=match_id,
        )

    @app.post(
        "/sessions/{session_id}/matches/custom",
        response_model=RecommendationResponse,
    )
    async def complete_custom_match(
        session_id: UUID,
        request: CustomMatchRequest,
        authorization: str | None = Header(default=None),
        current_settings: Settings = Depends(get_settings),
    ) -> RecommendationResponse:
        access_token = bearer_token_from_header(authorization)
        gateway = SupabaseGateway(current_settings)
        match_id, snapshot = await gateway.complete_custom_match(
            session_id,
            request,
            access_token,
        )
        return await generate_and_store_recommendations(
            gateway=gateway,
            snapshot=snapshot,
            algorithm_version=current_settings.algorithm_version,
            access_token=access_token,
            generated_after_match_id=match_id,
        )

    @app.post(
        "/recommendations/{recommendation_id}/pass-player",
        response_model=RecommendationResponse,
    )
    async def pass_player(
        recommendation_id: UUID,
        request: PassPlayerRequest,
        authorization: str | None = Header(default=None),
        current_settings: Settings = Depends(get_settings),
    ) -> RecommendationResponse:
        access_token = bearer_token_from_header(authorization)
        gateway = SupabaseGateway(current_settings)
        snapshot = await gateway.pass_player(recommendation_id, request, access_token)
        return await generate_and_store_recommendations(
            gateway=gateway,
            snapshot=snapshot,
            algorithm_version=current_settings.algorithm_version,
            access_token=access_token,
        )

    @app.post(
        "/recommendations/{recommendation_id}/accept",
        response_model=AcceptRecommendationResponse,
    )
    async def accept_recommendation(
        recommendation_id: UUID,
        request: AcceptRecommendationRequest,
        authorization: str | None = Header(default=None),
        current_settings: Settings = Depends(get_settings),
    ) -> AcceptRecommendationResponse:
        access_token = bearer_token_from_header(authorization)
        gateway = SupabaseGateway(current_settings)
        return await gateway.accept_recommendation(
            recommendation_id=recommendation_id,
            court_number=request.court_number,
            access_token=access_token,
        )

    @app.post(
        "/sessions/{session_id}/recommendations/regenerate",
        response_model=RecommendationResponse,
    )
    async def regenerate_session_recommendations(
        session_id: UUID,
        authorization: str | None = Header(default=None),
        current_settings: Settings = Depends(get_settings),
    ) -> RecommendationResponse:
        access_token = bearer_token_from_header(authorization)
        gateway = SupabaseGateway(current_settings)
        snapshot = await gateway.regenerate_session(session_id, access_token)
        return await generate_and_store_recommendations(
            gateway=gateway,
            snapshot=snapshot,
            algorithm_version=current_settings.algorithm_version,
            access_token=access_token,
        )

    @app.post(
        "/leagues/{league_id}/qr-email",
        response_model=SendLeagueQrEmailResponse,
    )
    async def send_league_qr_code_email(
        league_id: UUID,
        request: SendLeagueQrEmailRequest,
        authorization: str | None = Header(default=None),
        current_settings: Settings = Depends(get_settings),
    ) -> SendLeagueQrEmailResponse:
        access_token = bearer_token_from_header(authorization)
        gateway = SupabaseGateway(current_settings)
        await gateway.require_league_admin(league_id, access_token)
        send_league_qr_email(
            league_name=request.league_name,
            qr_png_base64=request.qr_png_base64,
            qr_value=request.qr_value,
            recipient_email=request.recipient_email,
            settings=current_settings,
        )
        return SendLeagueQrEmailResponse(sent=True)

    return app


app = create_app()
