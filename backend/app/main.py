from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from .activities import ACTIVITIES, ACTIVITY_BY_ID, MOODS, choose_activity
from .config import get_settings
from .database import Base, engine, get_db
from .geo import distance_meters, navigation_hint, travel_minutes
from .models import (
    ActivitySession,
    AnalyticsEvent,
    OmysCondition,
    Participant,
    PlaceCandidate,
    Room,
)
from .places import CATEGORIES, CATEGORY_DISCOVERY_QUERIES, places_provider
from .schemas import (
    AnalyticsCreate,
    ActivityComplete,
    ActivityDraw,
    ActivitySessionCreate,
    CandidateSubmit,
    ConditionsCreate,
    JoinRequest,
    LocationUpdate,
    RevealRequest,
    RoomCreate,
)
from .security import (
    clean_text,
    get_participant,
    invite_code,
    participant_token,
    require_host,
    token_header,
)
from .services import (
    NO_CANDIDATE_MESSAGE,
    candidate_from_place,
    lock_selection,
    opening_is_viable,
    place_payload,
)


settings = get_settings()
EVENTS = {
    "landing_view",
    "mode_selected",
    "room_created",
    "invite_link_copied",
    "participant_joined",
    "place_submitted",
    "draw_started",
    "spot_selected",
    "navigation_started",
    "spot_revealed",
    "result_shared",
    "redraw_requested",
    "no_candidate_found",
    "activity_tab_opened",
    "activity_mood_selected",
    "activity_drawn",
    "activity_skipped",
    "activity_started",
    "activity_completed",
    "activity_abandoned",
    "activity_shared",
}


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.environment == "test" or settings.database_url.startswith("sqlite"):
        Base.metadata.create_all(engine)
    if settings.database_url.startswith("sqlite"):
        with engine.begin() as connection:
            room_columns = {column["name"] for column in inspect(connection).get_columns("rooms")}
            if "hide_until_arrival" not in room_columns:
                connection.execute(
                    text(
                        "ALTER TABLE rooms ADD COLUMN hide_until_arrival BOOLEAN NOT NULL DEFAULT 1"
                    )
                )
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "X-Participant-Token", "X-Admin-Key"],
)

request_windows: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if request.url.path == "/api/health":
        return await call_next(request)
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window = request_windows[key]
    while window and window[0] < now - 60:
        window.popleft()
    if len(window) >= 120:
        from fastapi.responses import JSONResponse

        return JSONResponse(
            {"detail": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."}, status_code=429
        )
    window.append(now)
    return await call_next(request)


def room_by_code(db: Session, code: str) -> Room:
    room = db.scalar(select(Room).where(Room.invite_code == code.upper()))
    if not room:
        raise HTTPException(404, "초대 코드를 확인해 주세요.")
    return room


def add_event(
    db: Session,
    event_name: str,
    room_id: str | None = None,
    session_id: str = "server-generated",
    metadata: dict | None = None,
):
    db.add(
        AnalyticsEvent(
            anonymous_session_id=session_id,
            room_id=room_id,
            event_name=event_name,
            event_metadata=metadata or {},
        )
    )


def activity_session_by_id(db: Session, session_id: str) -> ActivitySession:
    session = db.get(ActivitySession, session_id)
    if not session:
        raise HTTPException(404, "활동 세션을 찾지 못했어요.")
    return session


def activity_session_payload(session: ActivitySession) -> dict:
    current = ACTIVITY_BY_ID.get(session.current_activity_id or "")

    def timestamp(value: datetime | None) -> str | None:
        if not value:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()

    return {
        "id": session.id,
        "anonymous_session_id": session.anonymous_session_id,
        "selected_mood": session.selected_mood,
        "current_activity_id": session.current_activity_id,
        "previously_drawn_activity_ids": session.previously_drawn_activity_ids or [],
        "status": session.status,
        "started_at": timestamp(session.started_at),
        "completed_at": timestamp(session.completed_at),
        "result": session.result,
        "party_size": session.party_size,
        "activity": current,
    }


def draw_activity_for_session(
    db: Session,
    session: ActivitySession,
    mood: str,
    skipped: bool = False,
) -> tuple[dict, bool]:
    previous_mood = session.selected_mood
    history = list(session.previously_drawn_activity_ids or [])
    if session.current_activity_id and session.current_activity_id not in history:
        history.append(session.current_activity_id)

    selected, reset = choose_activity(mood, set(history))
    if reset:
        last_id = session.current_activity_id if previous_mood == mood else None
        history = []
        selected, _ = choose_activity(mood, {last_id} if last_id else set())

    if previous_mood != mood:
        add_event(
            db,
            "activity_mood_selected",
            session_id=session.anonymous_session_id,
            metadata={"mood": mood},
        )
    if skipped and session.current_activity_id:
        add_event(
            db,
            "activity_skipped",
            session_id=session.anonymous_session_id,
            metadata={"mood": previous_mood, "activity_id": session.current_activity_id},
        )

    session.selected_mood = mood
    session.current_activity_id = selected["id"]
    session.previously_drawn_activity_ids = history
    session.status = "drawn"
    session.started_at = None
    session.completed_at = None
    session.result = None
    session.party_size = None
    add_event(
        db,
        "activity_drawn",
        session_id=session.anonymous_session_id,
        metadata={"mood": mood, "activity_id": selected["id"]},
    )
    db.commit()
    db.refresh(session)
    return selected, reset


def serialize_room(room: Room, participant: Participant) -> dict:
    selected = db_place = next(
        (item for item in room.candidates if item.id == room.selected_place_id), None
    )
    revealed = room.status == "revealed"
    guide = bool(db_place and db_place.participant_id == participant.id and room.mode == "friends")
    can_see_place = revealed or guide
    own_candidates = [place_payload(item) for item in participant.candidates]
    return {
        "invite_code": room.invite_code,
        "title": room.title,
        "mode": room.mode,
        "status": room.status,
        "departure_location": room.departure_location,
        "departure_latitude": room.departure_latitude,
        "departure_longitude": room.departure_longitude,
        "redraw_allowed": room.redraw_allowed,
        "hide_until_arrival": room.hide_until_arrival,
        "redraw_count": room.redraw_count,
        "can_redraw": participant.is_host
        and room.redraw_allowed
        and room.redraw_count < 1
        and room.status == "drawn",
        "is_host": participant.is_host,
        "participant_id": participant.id,
        "participants": [
            {
                "id": item.id,
                "nickname": item.nickname,
                "is_host": item.is_host,
                "submission_completed": item.submission_completed,
            }
            for item in room.participants
        ],
        "own_candidates": own_candidates,
        "selection_locked": selected is not None,
        "you_are_guide": guide,
        "selected_place": place_payload(db_place, room.departure_latitude, room.departure_longitude)
        if can_see_place and db_place
        else None,
        "opening_verified_at": db_place.last_verified_at if db_place else None,
        "started_at": room.started_at,
        "revealed_at": room.revealed_at,
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "provider": settings.places_provider}


@app.get("/api/categories")
def categories():
    return {"categories": CATEGORIES}


@app.get("/api/activities")
def activities():
    return {"moods": MOODS, "activities": ACTIVITIES}


@app.post("/api/activity-sessions", status_code=201)
def create_activity_session(payload: ActivitySessionCreate, db: Session = Depends(get_db)):
    session = ActivitySession(anonymous_session_id=payload.anonymous_session_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return activity_session_payload(session)


@app.get("/api/activity-sessions/{session_id}")
def get_activity_session(session_id: str, db: Session = Depends(get_db)):
    return activity_session_payload(activity_session_by_id(db, session_id))


@app.post("/api/activity-sessions/{session_id}/draw")
def draw_activity(
    session_id: str,
    payload: ActivityDraw,
    db: Session = Depends(get_db),
):
    session = activity_session_by_id(db, session_id)
    _, reset = draw_activity_for_session(db, session, payload.mood)
    response = activity_session_payload(session)
    response["list_reset"] = reset
    return response


@app.post("/api/activity-sessions/{session_id}/skip")
def skip_activity(session_id: str, db: Session = Depends(get_db)):
    session = activity_session_by_id(db, session_id)
    if not session.selected_mood or not session.current_activity_id:
        raise HTTPException(409, "먼저 느낌을 선택해 활동을 뽑아 주세요.")
    _, reset = draw_activity_for_session(db, session, session.selected_mood, skipped=True)
    response = activity_session_payload(session)
    response["list_reset"] = reset
    return response


@app.post("/api/activity-sessions/{session_id}/start")
def start_activity(session_id: str, db: Session = Depends(get_db)):
    session = activity_session_by_id(db, session_id)
    if not session.current_activity_id:
        raise HTTPException(409, "먼저 활동을 뽑아 주세요.")
    if session.status == "started" and session.started_at:
        return activity_session_payload(session)
    if session.status not in {"drawn", "started"}:
        raise HTTPException(409, "지금은 이 활동을 시작할 수 없어요.")
    session.status = "started"
    session.started_at = datetime.now(timezone.utc)
    add_event(
        db,
        "activity_started",
        session_id=session.anonymous_session_id,
        metadata={
            "mood": session.selected_mood,
            "activity_id": session.current_activity_id,
        },
    )
    db.commit()
    db.refresh(session)
    return activity_session_payload(session)


@app.post("/api/activity-sessions/{session_id}/complete")
def complete_activity(
    session_id: str,
    payload: ActivityComplete,
    db: Session = Depends(get_db),
):
    session = activity_session_by_id(db, session_id)
    if not session.current_activity_id:
        raise HTTPException(409, "완료할 활동이 없어요.")
    if session.status in {"completed", "abandoned"} and session.result == payload.result:
        return activity_session_payload(session)
    if session.status != "started":
        raise HTTPException(409, "활동을 시작한 뒤 결과를 남겨 주세요.")

    history = list(session.previously_drawn_activity_ids or [])
    if session.current_activity_id not in history:
        history.append(session.current_activity_id)
    session.previously_drawn_activity_ids = history
    session.status = "abandoned" if payload.result == "abandoned" else "completed"
    session.completed_at = datetime.now(timezone.utc)
    session.result = payload.result
    session.party_size = payload.party_size
    event_name = "activity_abandoned" if payload.result == "abandoned" else "activity_completed"
    add_event(
        db,
        event_name,
        session_id=session.anonymous_session_id,
        metadata={
            "mood": session.selected_mood,
            "activity_id": session.current_activity_id,
            "result": payload.result,
        },
    )
    db.commit()
    db.refresh(session)
    return activity_session_payload(session)


@app.post("/api/rooms", status_code=201)
def create_room(payload: RoomCreate, db: Session = Depends(get_db)):
    code = invite_code()
    while db.scalar(select(Room.id).where(Room.invite_code == code)):
        code = invite_code()
    room = Room(
        invite_code=code,
        title=clean_text(payload.title),
        mode=payload.mode,
        departure_location=clean_text(payload.departure.label),
        departure_latitude=payload.departure.latitude,
        departure_longitude=payload.departure.longitude,
        redraw_allowed=payload.redraw_allowed,
        hide_until_arrival=payload.hide_until_arrival,
        join_closed=payload.join_closed,
    )
    host = Participant(
        nickname=clean_text(payload.host_nickname),
        participant_token=participant_token(),
        is_host=True,
    )
    room.participants.append(host)
    db.add(room)
    db.flush()
    add_event(db, "room_created", room.id)
    db.commit()
    return {
        "invite_code": code,
        "participant_token": host.participant_token,
        "participant_id": host.id,
        "invite_url": f"{settings.frontend_url}/join/{code}",
    }


@app.post("/api/rooms/{code}/join", status_code=201)
def join_room(code: str, payload: JoinRequest, db: Session = Depends(get_db)):
    room = room_by_code(db, code)
    if room.join_closed or room.status != "waiting":
        raise HTTPException(409, "이 방은 더 이상 참가할 수 없습니다.")
    participant = Participant(
        room_id=room.id,
        nickname=clean_text(payload.nickname),
        participant_token=participant_token(),
    )
    db.add(participant)
    add_event(db, "participant_joined", room.id)
    db.commit()
    return {
        "invite_code": room.invite_code,
        "participant_token": participant.participant_token,
        "participant_id": participant.id,
    }


@app.get("/api/rooms/{code}")
def get_room(code: str, token: str | None = Depends(token_header), db: Session = Depends(get_db)):
    room = room_by_code(db, code)
    participant = get_participant(db, room, token)
    return serialize_room(room, participant)


@app.get("/api/rooms/{code}/places/search")
async def search_places(
    code: str,
    q: str = Query(default="", max_length=80),
    category: str | None = Query(default=None, max_length=40),
    token: str | None = Depends(token_header),
    db: Session = Depends(get_db),
):
    room = room_by_code(db, code)
    get_participant(db, room, token)
    if category and category not in CATEGORIES:
        raise HTTPException(422, "지원하지 않는 카테고리입니다.")
    try:
        places = await places_provider.search(
            q, room.departure_latitude, room.departure_longitude, category
        )
    except (httpx.HTTPError, TimeoutError):
        raise HTTPException(
            503, "장소 검색 서비스 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요."
        )
    return {
        "places": [place.model_dump(mode="json") for place in places],
        "provider": settings.places_provider,
    }


@app.post("/api/rooms/{code}/candidates", status_code=201)
async def submit_candidate(
    code: str,
    payload: CandidateSubmit,
    token: str | None = Depends(token_header),
    db: Session = Depends(get_db),
):
    room = room_by_code(db, code)
    participant = get_participant(db, room, token)
    if room.mode != "friends" or room.status != "waiting":
        raise HTTPException(409, "지금은 장소를 제출할 수 없습니다.")
    submitted_place = payload.place
    if submitted_place.external_place_id.startswith("kakao:"):
        kakao_id = submitted_place.external_place_id.removeprefix("kakao:")
        expected_urls = {
            f"http://place.map.kakao.com/{kakao_id}",
            f"https://place.map.kakao.com/{kakao_id}",
        }
        submitted_distance = distance_meters(
            room.departure_latitude,
            room.departure_longitude,
            submitted_place.latitude,
            submitted_place.longitude,
        )
        if (
            not kakao_id.isdigit()
            or submitted_place.place_url not in expected_urls
            or submitted_distance > 12_000
        ):
            raise HTTPException(422, "출발 위치 주변의 카카오 검색 결과를 선택해 주세요.")
        verified = submitted_place.model_copy(
            update={"business_status": "UNKNOWN_KAKAO", "open_now": None}
        )
    else:
        try:
            verified = await places_provider.verify(submitted_place.external_place_id)
        except httpx.HTTPError:
            raise HTTPException(503, "장소 정보를 확인하지 못했습니다.")
    if not verified:
        raise HTTPException(422, "검색 결과에서 유효한 장소를 선택해 주세요.")
    candidate = candidate_from_place(room.id, verified, participant.id)
    db.add(candidate)
    add_event(db, "place_submitted", room.id)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "이미 제출한 장소입니다.")
    return {"candidate": place_payload(candidate)}


@app.post("/api/rooms/{code}/submission/complete")
def complete_submission(
    code: str, token: str | None = Depends(token_header), db: Session = Depends(get_db)
):
    room = room_by_code(db, code)
    participant = get_participant(db, room, token)
    if not participant.candidates:
        raise HTTPException(422, "장소를 하나 이상 선택해 주세요.")
    participant.submission_completed = True
    db.commit()
    return {"completed": True}


@app.post("/api/rooms/{code}/draw")
async def draw(code: str, token: str | None = Depends(token_header), db: Session = Depends(get_db)):
    room = room_by_code(db, code)
    participant = get_participant(db, room, token)
    require_host(participant)
    if room.mode != "friends":
        raise HTTPException(409, "친구 모드에서만 사용할 수 있습니다.")
    if len(room.participants) < 2 or not all(
        item.submission_completed for item in room.participants
    ):
        raise HTTPException(409, "두 명 이상이 모두 장소 제출을 완료해야 합니다.")
    add_event(db, "draw_started", room.id)
    chosen = await lock_selection(db, room, places_provider)
    add_event(db, "spot_selected", room.id, metadata={"place_id": chosen.id})
    db.commit()
    return serialize_room(room, participant)


@app.post("/api/rooms/{code}/conditions")
async def set_conditions(
    code: str,
    payload: ConditionsCreate,
    token: str | None = Depends(token_header),
    db: Session = Depends(get_db),
):
    room = room_by_code(db, code)
    participant = get_participant(db, room, token)
    require_host(participant)
    if room.mode != "omys" or room.status != "waiting":
        raise HTTPException(409, "조건을 설정할 수 없는 상태입니다.")
    condition = OmysCondition(
        room_id=room.id,
        latitude=room.departure_latitude,
        longitude=room.departure_longitude,
        transport_mode=payload.transport_mode,
        max_travel_minutes=payload.max_travel_minutes,
        budget_per_person=payload.budget_per_person,
        party_size=payload.party_size,
        preferred_categories=payload.preferred_categories,
        indoor_outdoor=payload.indoor_outdoor,
        excluded_activities=[clean_text(item) for item in payload.excluded_activities],
        includes_food=payload.includes_food,
        accessibility=clean_text(payload.accessibility) if payload.accessibility else None,
        total_available_minutes=payload.total_available_minutes,
    )
    room.condition = condition
    db.flush()
    categories_to_search = payload.preferred_categories or CATEGORIES
    search_tasks = [
        asyncio.create_task(
            places_provider.search(
                query,
                room.departure_latitude,
                room.departure_longitude,
                category,
            )
        )
        for category in categories_to_search[:5]
        for query in CATEGORY_DISCOVERY_QUERIES.get(category, [category])
    ]
    done, pending = await asyncio.wait(search_tasks, timeout=10)
    for task in pending:
        task.cancel()

    found = {}
    failed_searches = len(pending)
    for task in done:
        try:
            for place in task.result():
                found[place.external_place_id] = place
        except (httpx.HTTPError, TimeoutError, ValueError, KeyError):
            failed_searches += 1
    if search_tasks and failed_searches == len(search_tasks):
        raise HTTPException(
            503,
            "카카오 장소 검색 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.",
        )

    for place in found.values():
        distance = distance_meters(
            room.departure_latitude, room.departure_longitude, place.latitude, place.longitude
        )
        eta = travel_minutes(distance, payload.transport_mode)
        if eta > payload.max_travel_minutes:
            continue
        if any(
            term.lower() in f"{place.name} {place.category}".lower()
            for term in payload.excluded_activities
        ):
            continue
        if payload.indoor_outdoor == "outdoor" and not (
            place.is_public_outdoor or "관광" in place.category or "산책" in place.category
        ):
            continue
        if payload.indoor_outdoor == "indoor" and place.is_public_outdoor:
            continue
        if payload.includes_food is False and (
            "맛집" in place.category or "디저트" in place.category
        ):
            continue
        if (
            payload.total_available_minutes is not None
            and eta * 2 + settings.min_stay_minutes > payload.total_available_minutes
        ):
            continue
        if payload.budget_per_person is not None and place.price_level is not None:
            rough_price = [0, 12000, 25000, 50000, 90000][min(place.price_level, 4)]
            if rough_price > payload.budget_per_person * 1.5:
                continue
        if not opening_is_viable(place, eta):
            continue
        db.add(candidate_from_place(room.id, place))
    db.flush()
    if not room.candidates:
        add_event(db, "no_candidate_found", room.id)
        db.commit()
        raise HTTPException(422, NO_CANDIDATE_MESSAGE)
    participant.submission_completed = True
    db.commit()
    try:
        chosen = await lock_selection(db, room, places_provider)
    except HTTPException:
        add_event(db, "no_candidate_found", room.id)
        db.commit()
        raise
    add_event(db, "spot_selected", room.id, metadata={"place_id": chosen.id})
    db.commit()
    return serialize_room(room, participant)


@app.post("/api/rooms/{code}/redraw")
async def redraw(
    code: str, token: str | None = Depends(token_header), db: Session = Depends(get_db)
):
    room = room_by_code(db, code)
    participant = get_participant(db, room, token)
    require_host(participant)
    add_event(db, "redraw_requested", room.id)
    chosen = await lock_selection(db, room, places_provider, redraw=True)
    add_event(db, "spot_selected", room.id, metadata={"place_id": chosen.id, "redraw": True})
    db.commit()
    return serialize_room(room, participant)


@app.post("/api/rooms/{code}/start")
def start_navigation(
    code: str, token: str | None = Depends(token_header), db: Session = Depends(get_db)
):
    room = room_by_code(db, code)
    participant = get_participant(db, room, token)
    require_host(participant)
    if room.status != "drawn" or not room.selected_place_id:
        raise HTTPException(409, "선정이 완료된 뒤 출발할 수 있습니다.")
    room.status = "navigating"
    room.started_at = datetime.now(timezone.utc)
    add_event(db, "navigation_started", room.id)
    db.commit()
    return {"status": room.status}


@app.post("/api/rooms/{code}/navigation")
def navigation(
    code: str,
    payload: LocationUpdate,
    token: str | None = Depends(token_header),
    db: Session = Depends(get_db),
):
    room = room_by_code(db, code)
    get_participant(db, room, token)
    if room.status not in {"drawn", "navigating"} or not room.selected_place_id:
        raise HTTPException(409, "이동 중인 방이 아닙니다.")
    place = db.get(PlaceCandidate, room.selected_place_id)
    remaining = distance_meters(
        payload.latitude, payload.longitude, place.latitude, place.longitude
    )
    initial = max(
        1,
        distance_meters(
            room.departure_latitude, room.departure_longitude, place.latitude, place.longitude
        ),
    )
    mode = room.condition.transport_mode if room.condition else "walk"
    threshold = max(100, min(200, (payload.accuracy or 0) + 50))
    reveal_available = not room.hide_until_arrival or remaining <= threshold
    return {
        "remaining_meters": round(remaining),
        "eta_minutes": travel_minutes(remaining, mode),
        "progress_percent": max(0, min(100, round((1 - remaining / initial) * 100))),
        "direction": navigation_hint(
            payload.latitude, payload.longitude, place.latitude, place.longitude
        ),
        "reveal_available": reveal_available,
        "hide_until_arrival": room.hide_until_arrival,
        "accuracy_meters": payload.accuracy,
        "message": (
            "목적지 근처에 도착하면 공개할 수 있습니다"
            if room.hide_until_arrival
            else "공개 버튼을 누르면 목적지를 확인할 수 있습니다"
        ),
    }


@app.post("/api/rooms/{code}/reveal")
def reveal(
    code: str,
    payload: RevealRequest,
    token: str | None = Depends(token_header),
    db: Session = Depends(get_db),
):
    room = room_by_code(db, code)
    participant = get_participant(db, room, token)
    if room.status not in {"drawn", "navigating"} or not room.selected_place_id:
        raise HTTPException(409, "공개할 수 없는 상태입니다.")
    place = db.get(PlaceCandidate, room.selected_place_id)
    if payload.manual_confirm:
        require_host(participant)
    elif room.hide_until_arrival:
        if payload.latitude is None or payload.longitude is None:
            raise HTTPException(422, "현재 위치가 필요합니다.")
        distance = distance_meters(
            payload.latitude, payload.longitude, place.latitude, place.longitude
        )
        threshold = max(100, min(200, (payload.accuracy or 0) + 50))
        if distance > threshold:
            raise HTTPException(409, "목적지에 조금 더 가까이 가면 공개할 수 있어요.")
    room.status = "revealed"
    room.revealed_at = datetime.now(timezone.utc)
    add_event(db, "spot_revealed", room.id)
    db.commit()
    return serialize_room(room, participant)


@app.get("/api/share/{code}")
def public_share(code: str, db: Session = Depends(get_db)):
    room = room_by_code(db, code)
    place = db.get(PlaceCandidate, room.selected_place_id) if room.selected_place_id else None
    return {
        "title": room.title,
        "mode": room.mode,
        "status": room.status,
        "participant_count": len(room.participants),
        "started_at": room.started_at,
        "revealed_at": room.revealed_at,
        "place": place_payload(place, room.departure_latitude, room.departure_longitude)
        if place and room.status == "revealed"
        else None,
    }


@app.post("/api/analytics", status_code=202)
def analytics(payload: AnalyticsCreate, db: Session = Depends(get_db)):
    if payload.event_name not in EVENTS:
        raise HTTPException(422, "지원하지 않는 이벤트입니다.")
    metadata = {
        str(key)[:40]: str(value)[:200] for key, value in list(payload.metadata.items())[:20]
    }
    db.add(
        AnalyticsEvent(
            anonymous_session_id=payload.anonymous_session_id,
            room_id=payload.room_id,
            event_name=payload.event_name,
            event_metadata=metadata,
        )
    )
    db.commit()
    return {"accepted": True}


@app.get("/api/admin/stats")
def admin_stats(x_admin_key: str | None = Header(default=None), db: Session = Depends(get_db)):
    if not settings.admin_api_key or x_admin_key != settings.admin_api_key:
        raise HTTPException(403, "관리자 키를 확인해 주세요.")
    visitors = (
        db.scalar(select(func.count(func.distinct(AnalyticsEvent.anonymous_session_id)))) or 0
    )
    rooms = db.scalar(select(func.count(Room.id))) or 0
    multi_rooms = (
        db.scalar(
            select(func.count()).select_from(
                select(Participant.room_id)
                .group_by(Participant.room_id)
                .having(func.count(Participant.id) >= 2)
                .subquery()
            )
        )
        or 0
    )
    drawn = db.scalar(select(func.count(Room.id)).where(Room.selected_place_id.is_not(None))) or 0
    revealed = db.scalar(select(func.count(Room.id)).where(Room.revealed_at.is_not(None))) or 0
    shares = (
        db.scalar(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.event_name == "result_shared"
            )
        )
        or 0
    )
    return {
        "visitors": visitors,
        "rooms_created": rooms,
        "rooms_with_2_plus": multi_rooms,
        "draw_completed": drawn,
        "revealed": revealed,
        "shares": shares,
        "conversion": {
            "room_to_draw_percent": round(drawn / rooms * 100, 1) if rooms else 0,
            "draw_to_reveal_percent": round(revealed / drawn * 100, 1) if drawn else 0,
        },
    }
