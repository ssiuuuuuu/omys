from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invite_code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(60))
    mode: Mapped[str] = mapped_column(String(16), index=True)
    departure_location: Mapped[str] = mapped_column(String(160))
    departure_latitude: Mapped[float] = mapped_column(Float)
    departure_longitude: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(24), default="waiting", index=True)
    join_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    redraw_allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    hide_until_arrival: Mapped[bool] = mapped_column(Boolean, default=True)
    redraw_count: Mapped[int] = mapped_column(Integer, default=0)
    selected_place_id: Mapped[str | None] = mapped_column(
        ForeignKey("place_candidates.id", name="fk_room_selected_place", use_alter=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    participants: Mapped[list[Participant]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )
    candidates: Mapped[list[PlaceCandidate]] = relationship(
        back_populates="room", cascade="all, delete-orphan", foreign_keys="PlaceCandidate.room_id"
    )
    condition: Mapped[OmysCondition | None] = relationship(
        back_populates="room", cascade="all, delete-orphan", uselist=False
    )
    selections: Mapped[list[Selection]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (UniqueConstraint("room_id", "token_hash", name="uq_participant_room_token"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    nickname: Mapped[str] = mapped_column(String(20))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    is_host: Mapped[bool] = mapped_column(Boolean, default=False)
    submission_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    room: Mapped[Room] = relationship(back_populates="participants")
    candidates: Mapped[list[PlaceCandidate]] = relationship(back_populates="participant")


class PlaceCandidate(Base):
    __tablename__ = "place_candidates"
    __table_args__ = (
        UniqueConstraint(
            "room_id", "participant_id", "external_place_id", name="uq_candidate_submission"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    participant_id: Mapped[str | None] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE"), nullable=True
    )
    external_place_id: Mapped[str] = mapped_column(String(160))
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80))
    address: Mapped[str] = mapped_column(String(240))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    price_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    business_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    open_now: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    next_close_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_public_outdoor: Mapped[bool] = mapped_column(Boolean, default=False)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=False)
    place_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)

    room: Mapped[Room] = relationship(back_populates="candidates", foreign_keys=[room_id])
    participant: Mapped[Participant | None] = relationship(back_populates="candidates")


class OmysCondition(Base):
    __tablename__ = "omys_conditions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), unique=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    transport_mode: Mapped[str] = mapped_column(String(20), default="walk")
    max_travel_minutes: Mapped[int] = mapped_column(Integer)
    budget_per_person: Mapped[int | None] = mapped_column(Integer, nullable=True)
    party_size: Mapped[int] = mapped_column(Integer, default=2)
    preferred_categories: Mapped[list[str]] = mapped_column(JSON, default=list)
    indoor_outdoor: Mapped[str | None] = mapped_column(String(20), nullable=True)
    excluded_activities: Mapped[list[str]] = mapped_column(JSON, default=list)
    includes_food: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    accessibility: Mapped[str | None] = mapped_column(String(120), nullable=True)
    total_available_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    room: Mapped[Room] = relationship(back_populates="condition")


class Selection(Base):
    __tablename__ = "selections"
    __table_args__ = (
        UniqueConstraint("room_id", "attempt", name="uq_selection_room_attempt"),
        UniqueConstraint("room_id", "place_candidate_id", name="uq_selection_room_place"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    place_candidate_id: Mapped[str] = mapped_column(ForeignKey("place_candidates.id"))
    attempt: Mapped[int] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    room: Mapped[Room] = relationship(back_populates="selections")


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    anonymous_session_id: Mapped[str] = mapped_column(String(64), index=True)
    room_id: Mapped[str | None] = mapped_column(
        ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_name: Mapped[str] = mapped_column(String(40), index=True)
    event_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ActivitySession(Base):
    __tablename__ = "activity_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    anonymous_session_id: Mapped[str] = mapped_column(String(64), index=True)
    session_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    selected_mood: Mapped[str | None] = mapped_column(String(20), nullable=True)
    current_activity_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    previously_drawn_activity_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="choosing", index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result: Mapped[str | None] = mapped_column(String(20), nullable=True)
    party_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


Index("ix_rooms_status_mode", Room.status, Room.mode)
