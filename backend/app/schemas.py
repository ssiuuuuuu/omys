from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Location(BaseModel):
    label: str = Field(min_length=1, max_length=160)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RoomCreate(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    mode: Literal["friends", "omys"]
    host_nickname: str = Field(min_length=1, max_length=20)
    departure: Location
    redraw_allowed: bool = True
    hide_until_arrival: bool = True
    join_closed: bool = False


class JoinRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=20)


class PlaceResult(BaseModel):
    external_place_id: str
    name: str
    category: str
    address: str
    latitude: float
    longitude: float
    price_level: int | None = None
    business_status: str | None = None
    open_now: bool | None = None
    next_close_time: datetime | None = None
    is_public_outdoor: bool = False
    place_url: str | None = None
    phone: str | None = None
    distance_meters: int | None = None


class CandidateSubmit(BaseModel):
    place: PlaceResult


class ConditionsCreate(BaseModel):
    transport_mode: Literal["walk", "transit", "car"] = "walk"
    max_travel_minutes: int = Field(ge=5, le=180)
    budget_per_person: int | None = Field(default=None, ge=0, le=1_000_000)
    party_size: int = Field(default=2, ge=1, le=20)
    preferred_categories: list[str] = Field(default_factory=list, max_length=10)
    indoor_outdoor: Literal["indoor", "outdoor", "any"] | None = "any"
    excluded_activities: list[str] = Field(default_factory=list, max_length=10)
    includes_food: bool | None = None
    accessibility: str | None = Field(default=None, max_length=120)
    total_available_minutes: int | None = Field(default=None, ge=30, le=720)


class LocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0, le=5000)


class RevealRequest(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0, le=5000)
    manual_confirm: bool = False
    admin_key: str | None = Field(default=None, min_length=1, max_length=40)


class AnalyticsCreate(BaseModel):
    anonymous_session_id: str = Field(min_length=8, max_length=64)
    room_id: str | None = None
    event_name: str = Field(min_length=1, max_length=40)
    metadata: dict = Field(default_factory=dict)


class ActivitySessionCreate(BaseModel):
    anonymous_session_id: str = Field(min_length=8, max_length=64)


class ActivityDraw(BaseModel):
    mood: Literal["light", "funny", "dopamine"]


class ActivityComplete(BaseModel):
    result: Literal["success", "failure", "abandoned"]
    party_size: int | None = Field(default=None, ge=1, le=50)


class PublicShare(BaseModel):
    title: str
    mode: str
    status: str
    participant_count: int
    started_at: datetime | None
    revealed_at: datetime | None
    place: PlaceResult | None = None
