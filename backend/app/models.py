from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OrganizationSnapshot(BaseModel):
    id: UUID | str
    number_of_courts: int = Field(gt=0)


class SessionSnapshot(BaseModel):
    id: UUID | str
    status: str = "open"
    current_round: int = Field(default=0, ge=0)


class PlayerSnapshot(BaseModel):
    id: UUID | str
    name: str
    skill: float = Field(gt=0)
    profile_image_path: str | None = None
    rounds_waiting: int = Field(default=0, ge=0)
    queue_position: int = Field(ge=0)
    games_played: int = Field(default=0, ge=0)


class RecommendationSnapshot(BaseModel):
    organization: OrganizationSnapshot
    session: SessionSnapshot
    players: list[PlayerSnapshot]


class RecommendationPlayer(BaseModel):
    player_id: UUID | str
    team_number: int = Field(ge=1, le=2)
    slot_number: int = Field(ge=1, le=2)
    name: str
    skill: float
    profile_image_path: str | None = None
    rounds_waiting: int
    queue_position: int
    games_played: int


class MatchRecommendation(BaseModel):
    id: UUID | str | None = None
    rank: int = Field(gt=0)
    court_number: int | None = None
    quality_score: float
    team_average_skill_difference: float
    player_skill_spread: float
    predicted_team_one_win_probability: float
    fairness_score: int
    players: list[RecommendationPlayer]


class RecommendationResponse(BaseModel):
    algorithm_version: str
    session_id: UUID | str
    recommendation_count: int
    recommendations: list[MatchRecommendation]
    batch_id: UUID | str | None = None


class CompleteMatchRequest(BaseModel):
    team_one_score: int = Field(ge=0)
    team_two_score: int = Field(ge=0)


class PassPlayerRequest(BaseModel):
    player_id: UUID
    session_id: UUID


class AcceptRecommendationRequest(BaseModel):
    court_number: int | None = Field(default=None, gt=0)


class AcceptRecommendationResponse(BaseModel):
    match_id: UUID | str


class SendLeagueQrEmailRequest(BaseModel):
    league_name: str = Field(min_length=1)
    qr_png_base64: str = Field(min_length=1)
    qr_value: str = Field(min_length=1)
    recipient_email: str = Field(min_length=3)


class SendLeagueQrEmailResponse(BaseModel):
    sent: bool


class SupabaseRpcError(BaseModel):
    model_config = ConfigDict(extra="allow")

    code: str | None = None
    message: str | None = None
    details: str | None = None
    hint: str | None = None
