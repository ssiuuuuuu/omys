from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .geo import Coordinate, distance_meters, travel_minutes
from .models import PlaceCandidate, Room, Selection
from .places import PlacesProvider
from .schemas import PlaceResult


logger = logging.getLogger(__name__)


NO_CANDIDATE_MESSAGE = (
    "조건에 맞는 비밀 스팟을 찾지 못했습니다. 최대 이동 시간을 늘리거나 "
    "카테고리·공간 선호 같은 조건을 조금 완화해 주세요."
)


def _coordinates_from_kakao_directions(payload: dict) -> list[Coordinate]:
    routes = payload.get("routes") or []
    if not routes:
        return []

    coordinates: list[Coordinate] = []
    for section in routes[0].get("sections") or []:
        for road in section.get("roads") or []:
            vertices = road.get("vertexes") or []
            for index in range(0, len(vertices) - 1, 2):
                point = (float(vertices[index + 1]), float(vertices[index]))
                if not coordinates or coordinates[-1] != point:
                    coordinates.append(point)
    return coordinates


def _coordinates_from_tmap_pedestrian(payload: dict) -> list[Coordinate]:
    coordinates: list[Coordinate] = []
    for feature in payload.get("features") or []:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "LineString":
            continue
        for longitude, latitude in geometry.get("coordinates") or []:
            point = (float(latitude), float(longitude))
            if not coordinates or coordinates[-1] != point:
                coordinates.append(point)
    return coordinates


def _finalize_route(
    route: list[Coordinate], origin: Coordinate, destination: Coordinate
) -> list[Coordinate] | None:
    if len(route) < 2:
        return None
    if route[0] != origin:
        route.insert(0, origin)
    if route[-1] != destination:
        route.append(destination)
    return route


async def _kakao_driving_route(
    settings, origin: Coordinate, destination: Coordinate
) -> list[Coordinate] | None:
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.get(
            "https://apis-navi.kakaomobility.com/v1/directions",
            headers={"Authorization": f"KakaoAK {settings.kakao_rest_api_key}"},
            params={
                "origin": f"{origin[1]},{origin[0]}",
                "destination": f"{destination[1]},{destination[0]}",
                "priority": "RECOMMEND",
                "summary": "false",
            },
        )
        response.raise_for_status()
        return _coordinates_from_kakao_directions(response.json())


async def _tmap_pedestrian_route(
    settings, origin: Coordinate, destination: Coordinate
) -> list[Coordinate] | None:
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.post(
            "https://apis.openapi.sk.com/tmap/routes/pedestrian",
            params={"version": "1"},
            headers={
                "appKey": settings.tmap_api_key,
                "Content-Type": "application/json",
            },
            json={
                "startX": str(origin[1]),
                "startY": str(origin[0]),
                "endX": str(destination[1]),
                "endY": str(destination[0]),
                "startName": "출발",
                "endName": "도착",
            },
        )
        response.raise_for_status()
        return _coordinates_from_tmap_pedestrian(response.json())


async def navigation_route(
    origin: Coordinate, destination: Coordinate, mode: str = "walk"
) -> list[Coordinate]:
    settings = get_settings()
    fallback = [origin, destination]
    if settings.environment == "test":
        return fallback

    # Kakao Mobility's directions endpoint only returns car/driving routes and Tmap's
    # pedestrian endpoint only returns walking routes, so each provider is scoped to the
    # transport mode it actually supports. Transit has no routed-path provider yet.
    try:
        if mode == "car" and settings.kakao_rest_api_key:
            route = await _kakao_driving_route(settings, origin, destination)
        elif mode == "walk" and settings.tmap_api_key:
            route = await _tmap_pedestrian_route(settings, origin, destination)
        else:
            return fallback
    except (httpx.HTTPError, TypeError, ValueError, KeyError) as exc:
        # Do not log provider credentials or request headers.
        logger.warning(
            "Navigation route provider failed; using straight-line fallback "
            "(mode=%s, error=%s)",
            mode,
            type(exc).__name__,
        )
        return fallback

    return _finalize_route(route or [], origin, destination) or fallback


def opening_is_viable(place: PlaceResult, eta_minutes: int) -> bool:
    # Kakao Local search does not return opening hours. Keep these places eligible,
    # but surface them as requiring a phone/detail-page check in the UI.
    if place.business_status == "UNKNOWN_KAKAO":
        return True
    if place.is_public_outdoor and place.business_status not in {
        "CLOSED_TEMPORARILY",
        "CLOSED_PERMANENTLY",
    }:
        return True
    if place.business_status != "OPERATIONAL" or place.open_now is not True:
        return False
    if place.next_close_time is None:
        return False
    close_time = place.next_close_time
    if close_time.tzinfo is None:
        close_time = close_time.replace(tzinfo=timezone.utc)
    needed_until = datetime.now(timezone.utc) + timedelta(
        minutes=eta_minutes + get_settings().min_stay_minutes
    )
    return close_time >= needed_until


def candidate_from_place(
    room_id: str, place: PlaceResult, participant_id: str | None = None
) -> PlaceCandidate:
    return PlaceCandidate(
        room_id=room_id,
        participant_id=participant_id,
        external_place_id=place.external_place_id,
        name=place.name,
        category=place.category,
        address=place.address,
        latitude=place.latitude,
        longitude=place.longitude,
        price_level=place.price_level,
        business_status=place.business_status,
        open_now=place.open_now,
        next_close_time=place.next_close_time,
        is_public_outdoor=place.is_public_outdoor,
        place_url=place.place_url,
        phone=place.phone,
    )


def sync_verification(candidate: PlaceCandidate, verified: PlaceResult) -> None:
    candidate.name = verified.name
    candidate.category = verified.category
    candidate.address = verified.address
    candidate.latitude = verified.latitude
    candidate.longitude = verified.longitude
    candidate.price_level = verified.price_level
    candidate.business_status = verified.business_status
    candidate.open_now = verified.open_now
    candidate.next_close_time = verified.next_close_time
    candidate.is_public_outdoor = verified.is_public_outdoor
    candidate.place_url = verified.place_url
    candidate.phone = verified.phone
    candidate.last_verified_at = datetime.now(timezone.utc)


async def lock_selection(
    db: Session, room: Room, provider: PlacesProvider, redraw: bool = False
) -> PlaceCandidate:
    # PostgreSQL turns this into SELECT ... FOR UPDATE. SQLite safely serializes the write transaction.
    locked_room = db.scalar(select(Room).where(Room.id == room.id).with_for_update())
    if not locked_room:
        raise HTTPException(404, "방을 찾을 수 없습니다.")
    room = locked_room

    if not redraw and room.selected_place_id:
        return db.get(PlaceCandidate, room.selected_place_id)
    if redraw:
        if not room.redraw_allowed or room.redraw_count >= 1:
            raise HTTPException(409, "다시 뽑기 기회를 모두 사용했습니다.")
        if room.status != "drawn":
            raise HTTPException(409, "출발 전 추첨 완료 상태에서만 다시 뽑을 수 있습니다.")

    selected_before = set(
        db.scalars(select(Selection.place_candidate_id).where(Selection.room_id == room.id)).all()
    )
    candidates = list(
        db.scalars(select(PlaceCandidate).where(PlaceCandidate.room_id == room.id)).all()
    )
    candidates = [candidate for candidate in candidates if candidate.id not in selected_before]
    secrets.SystemRandom().shuffle(candidates)
    mode = room.condition.transport_mode if room.condition else "walk"

    chosen = None
    for candidate in candidates:
        if candidate.business_status == "UNKNOWN_KAKAO":
            verified = PlaceResult(
                external_place_id=candidate.external_place_id,
                name=candidate.name,
                category=candidate.category,
                address=candidate.address,
                latitude=candidate.latitude,
                longitude=candidate.longitude,
                price_level=candidate.price_level,
                business_status=candidate.business_status,
                open_now=None,
                next_close_time=None,
                is_public_outdoor=candidate.is_public_outdoor,
                place_url=candidate.place_url,
                phone=candidate.phone,
            )
        else:
            try:
                verified = await provider.verify(candidate.external_place_id)
            except Exception:
                continue
        if not verified:
            continue
        eta = travel_minutes(
            distance_meters(
                room.departure_latitude,
                room.departure_longitude,
                verified.latitude,
                verified.longitude,
            ),
            mode,
        )
        sync_verification(candidate, verified)
        if opening_is_viable(verified, eta):
            chosen = candidate
            break

    if not chosen:
        raise HTTPException(422, NO_CANDIDATE_MESSAGE)

    if room.selected_place_id:
        old = db.get(PlaceCandidate, room.selected_place_id)
        if old:
            old.is_selected = False
        for selection in room.selections:
            selection.active = False

    attempt = len(room.selections) + 1
    selection = Selection(
        room_id=room.id, place_candidate_id=chosen.id, attempt=attempt, active=True
    )
    chosen.is_selected = True
    room.selected_place_id = chosen.id
    room.status = "drawn"
    if redraw:
        room.redraw_count += 1
    db.add(selection)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        fresh = db.scalar(select(Room).where(Room.id == room.id))
        if fresh and fresh.selected_place_id and not redraw:
            return db.get(PlaceCandidate, fresh.selected_place_id)
        raise HTTPException(409, "이미 처리된 추첨 요청입니다.")
    db.refresh(chosen)
    return chosen


def place_payload(
    place: PlaceCandidate, origin_lat: float | None = None, origin_lon: float | None = None
) -> dict:
    payload = {
        "external_place_id": place.external_place_id,
        "name": place.name,
        "category": place.category,
        "address": place.address,
        "latitude": place.latitude,
        "longitude": place.longitude,
        "price_level": place.price_level,
        "business_status": place.business_status,
        "open_now": place.open_now,
        "next_close_time": place.next_close_time,
        "is_public_outdoor": place.is_public_outdoor,
        "place_url": place.place_url,
        "phone": place.phone,
        "verified_at": place.last_verified_at,
    }
    if origin_lat is not None and origin_lon is not None:
        payload["distance_meters"] = round(
            distance_meters(origin_lat, origin_lon, place.latitude, place.longitude)
        )
    return payload
