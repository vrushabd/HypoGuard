from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


InsulinType = Literal["rapid", "regular", "long", "unknown"]


class InsulinDose(BaseModel):
    type: InsulinType = "rapid"
    units: float = Field(ge=0)
    minutes_since: int = Field(ge=0, description="Minutes since injection")


class MealInfo(BaseModel):
    minutes_since: int | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    skipped_or_light: bool = False


class ActivityInfo(BaseModel):
    minutes_since: int | None = Field(default=None, ge=0)
    duration_minutes: int | None = Field(default=None, ge=0)
    intensity: Literal["none", "light", "moderate", "intense"] = "none"


class Symptoms(BaseModel):
    shakiness: bool = False
    sweating: bool = False
    confusion: bool = False
    hunger: bool = False


class HypoGuardInput(BaseModel):
    """Real-time bundle for one assessment tick."""

    glucose_mg_dl: float = Field(..., ge=0, le=600)
    roc_mg_dl_per_min: float = Field(
        ...,
        description="CGM rate of change, mg/dL per minute (negative = falling)",
    )
    insulin_doses: list[InsulinDose] = Field(default_factory=list)
    meal: MealInfo | None = None
    activity: ActivityInfo | None = None
    local_hour: int = Field(..., ge=0, le=23)
    local_minute: int = Field(default=0, ge=0, le=59)
    symptoms: Symptoms | None = None
    sleep_quality_0_100: int | None = Field(default=None, ge=0, le=100)
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    stress_or_illness: bool = False
    historical_hypo_bias_0_100: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Learned personal tendency toward hypo (higher = more prior hypos)",
    )

    @field_validator("glucose_mg_dl", mode="before")
    @classmethod
    def round_glucose(cls, v: float) -> float:
        return float(v)


class FactorOut(BaseModel):
    name: str = Field(..., max_length=22)
    impact: int = Field(..., ge=0, le=100)
    direction: Literal["increasing", "decreasing", "neutral"]
    note: str


PreventionCategory = Literal["nutrition", "activity", "monitoring", "safety", "insulin", "support"]


class PreventionSuggestion(BaseModel):
    """Ranked, actionable prevention step with heuristic impact on the risk score."""

    id: str = Field(..., max_length=40)
    rank: int = Field(..., ge=1)
    category: PreventionCategory
    title: str = Field(..., max_length=90)
    detail: str
    risk_reduction_percent: int = Field(
        ...,
        ge=0,
        le=100,
        description="Estimated % of current snapshot risk score this step may offset (heuristic).",
    )


class HypoGuardOutput(BaseModel):
    score: int = Field(..., ge=0, le=100)
    level: Literal["low", "moderate", "high", "critical"]
    window_minutes: int = Field(..., ge=0)
    predicted_glucose_30min: int
    factors: list[FactorOut]
    recommendation: str
    summary: str
    alert_caregiver: bool
    safe_to_exercise: bool
    safe_to_drive: bool
    follow_up_minutes: int = Field(..., ge=1, le=120)
    prevention_suggestions: list[PreventionSuggestion] = Field(default_factory=list)
    prevention_engine_note: str = Field(
        default="",
        description="Disclaimer for ranked prevention / impact estimates.",
    )
