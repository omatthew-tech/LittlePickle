from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class OrganizationSnapshot(BaseModel):
    id: UUID | str
    number_of_courts: int = Field(gt=0)
    score_mode_enabled: bool = True


class SessionSnapshot(BaseModel):
    id: UUID | str
    status: str = "open"
    current_round: int = Field(default=0, ge=0)
    recommendation_version: int = Field(default=0, ge=0)


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
    open_court_numbers: list[int] = Field(default_factory=list)
    players: list[PlayerSnapshot]

    @model_validator(mode="before")
    @classmethod
    def default_open_courts(cls, data: object) -> object:
        if not isinstance(data, dict) or "open_court_numbers" in data:
            return data

        organization = data.get("organization")
        if not isinstance(organization, dict):
            return data

        court_count = organization.get("number_of_courts")
        if not isinstance(court_count, int) or court_count < 1:
            return data

        return {
            **data,
            "open_court_numbers": list(range(1, court_count + 1)),
        }

    @model_validator(mode="after")
    def require_valid_open_courts(self) -> "RecommendationSnapshot":
        courts = self.open_court_numbers
        if len(courts) != len(set(courts)):
            raise ValueError("open_court_numbers must be unique")
        if courts != sorted(courts):
            raise ValueError("open_court_numbers must be sorted")
        if any(
            court < 1 or court > self.organization.number_of_courts
            for court in courts
        ):
            raise ValueError("open_court_numbers must belong to the session")
        return self


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
    result_mode: Literal["score", "win_loss"] = "score"
    team_one_score: int | None = Field(default=None, ge=0)
    team_two_score: int | None = Field(default=None, ge=0)
    winning_team: Literal[1, 2] | None = None

    @model_validator(mode="after")
    def require_valid_result(self) -> "CompleteMatchRequest":
        if self.result_mode == "score":
            if self.team_one_score is None or self.team_two_score is None:
                raise ValueError("both scores are required in score mode")
            if self.team_one_score == self.team_two_score:
                raise ValueError("scores cannot be tied")
            if self.winning_team is not None:
                raise ValueError("winning_team is only accepted in win/loss mode")
            return self

        if self.winning_team is None:
            raise ValueError("winning_team is required in win/loss mode")
        if self.team_one_score is not None or self.team_two_score is not None:
            raise ValueError("scores are not accepted in win/loss mode")
        return self


class CustomMatchRequest(CompleteMatchRequest):
    team_one_player_ids: list[UUID] = Field(min_length=2, max_length=2)
    team_two_player_ids: list[UUID] = Field(min_length=2, max_length=2)

    @model_validator(mode="after")
    def require_four_distinct_players(self) -> "CustomMatchRequest":
        player_ids = self.team_one_player_ids + self.team_two_player_ids

        if len(set(player_ids)) != 4:
            raise ValueError("custom matches require four distinct players")

        return self


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
