from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from math import ceil, cos, radians

import httpx

from .config import get_settings
from .geo import Coordinate, SPEED_KMH, distance_meters, path_length, travel_minutes


logger = logging.getLogger(__name__)

EARTH_RADIUS_METERS = 6_371_000
OFF_ROUTE_METERS = 80
MAX_REROUTE_ACCURACY_METERS = 50
ROUTE_RETRY_SECONDS = 15


@dataclass(slots=True)
class ProviderRoute:
    path: list[Coordinate]
    distance_meters: float
    duration_seconds: float
    source: str
    mode: str
    geometry_meters: float = field(init=False)

    def __post_init__(self) -> None:
        self.geometry_meters = max(1.0, path_length(self.path))

    @property
    def destination(self) -> Coordinate:
        return self.path[-1]


@dataclass(slots=True)
class NavigationRouteState:
    route: ProviderRoute | None = None
    consumed_index: int = 0
    retry_after: float = 0.0
    initial_distance_meters: float | None = None


@dataclass(slots=True)
class RouteMatch:
    segment_index: int
    fraction: float
    projected: Coordinate
    distance_meters: float


@dataclass(slots=True)
class NavigationSnapshot:
    path_ahead: list[Coordinate]
    remaining_meters: int
    eta_minutes: int
    source: str
    consumed_index: int


RouteFetcher = Callable[[Coordinate, Coordinate, str], Awaitable[ProviderRoute | None]]


def _positive_number(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


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
    finalized = list(route)
    if finalized[0] != origin:
        finalized.insert(0, origin)
    if finalized[-1] != destination:
        finalized.append(destination)
    return finalized


def _tmap_totals(payload: dict) -> tuple[float, float] | None:
    line_distance = 0.0
    line_time = 0.0
    for feature in payload.get("features") or []:
        properties = feature.get("properties") or {}
        total_distance = _positive_number(properties.get("totalDistance"))
        total_time = _positive_number(properties.get("totalTime"))
        if total_distance is not None and total_time is not None:
            return total_distance, total_time

        geometry = feature.get("geometry") or {}
        if geometry.get("type") == "LineString":
            line_distance += _positive_number(properties.get("distance")) or 0
            line_time += _positive_number(properties.get("time")) or 0

    if line_distance > 0 and line_time > 0:
        return line_distance, line_time
    return None


def _route_from_tmap_pedestrian(
    payload: dict, origin: Coordinate, destination: Coordinate
) -> ProviderRoute | None:
    path = _finalize_route(_coordinates_from_tmap_pedestrian(payload), origin, destination)
    totals = _tmap_totals(payload)
    if path is None or totals is None:
        return None
    distance, duration = totals
    return ProviderRoute(path, distance, duration, "tmap", "walk")


def _route_from_kakao_directions(
    payload: dict, origin: Coordinate, destination: Coordinate
) -> ProviderRoute | None:
    routes = payload.get("routes") or []
    summary = (routes[0].get("summary") or {}) if routes else {}
    distance = _positive_number(summary.get("distance"))
    duration = _positive_number(summary.get("duration"))
    path = _finalize_route(_coordinates_from_kakao_directions(payload), origin, destination)
    if path is None or distance is None or duration is None:
        return None
    return ProviderRoute(path, distance, duration, "kakao", "car")


async def _kakao_driving_route(
    settings, origin: Coordinate, destination: Coordinate
) -> ProviderRoute | None:
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
        return _route_from_kakao_directions(response.json(), origin, destination)


async def _tmap_pedestrian_route(
    settings, origin: Coordinate, destination: Coordinate
) -> ProviderRoute | None:
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
        return _route_from_tmap_pedestrian(response.json(), origin, destination)


async def navigation_route(
    origin: Coordinate, destination: Coordinate, mode: str = "walk"
) -> ProviderRoute | None:
    settings = get_settings()
    if settings.environment == "test":
        return None

    try:
        if mode == "car" and settings.kakao_rest_api_key:
            route = await _kakao_driving_route(settings, origin, destination)
        elif mode == "walk" and settings.tmap_api_key:
            route = await _tmap_pedestrian_route(settings, origin, destination)
        else:
            return None
    except (httpx.HTTPError, TypeError, ValueError, KeyError) as exc:
        status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
        logger.warning(
            "Navigation route provider failed; preserving cached route "
            "(mode=%s, error=%s, status=%s)",
            mode,
            type(exc).__name__,
            status,
        )
        return None

    if route is None:
        logger.warning(
            "Navigation route provider returned an unusable response; preserving cached route "
            "(mode=%s)",
            mode,
        )
    return route


def closest_route_match(
    path: list[Coordinate], point: Coordinate, start_index: int = 0
) -> RouteMatch:
    if len(path) < 2:
        only = path[0] if path else point
        return RouteMatch(0, 0.0, only, distance_meters(*point, *only))

    first_segment = max(0, min(start_index, len(path) - 2))
    latitude_scale = cos(radians(point[0]))
    best: RouteMatch | None = None

    for index in range(first_segment, len(path) - 1):
        start = path[index]
        end = path[index + 1]
        start_x = EARTH_RADIUS_METERS * radians(start[1] - point[1]) * latitude_scale
        start_y = EARTH_RADIUS_METERS * radians(start[0] - point[0])
        end_x = EARTH_RADIUS_METERS * radians(end[1] - point[1]) * latitude_scale
        end_y = EARTH_RADIUS_METERS * radians(end[0] - point[0])
        delta_x = end_x - start_x
        delta_y = end_y - start_y
        denominator = delta_x * delta_x + delta_y * delta_y
        fraction = (
            0.0 if denominator <= 0 else -(start_x * delta_x + start_y * delta_y) / denominator
        )
        fraction = max(0.0, min(1.0, fraction))
        projected = (
            start[0] + (end[0] - start[0]) * fraction,
            start[1] + (end[1] - start[1]) * fraction,
        )
        candidate = RouteMatch(
            index,
            fraction,
            projected,
            distance_meters(point[0], point[1], projected[0], projected[1]),
        )
        if best is None or candidate.distance_meters < best.distance_meters:
            best = candidate

    return best or RouteMatch(first_segment, 0.0, path[first_segment], 0.0)


def _path_ahead(
    route: ProviderRoute, origin: Coordinate, match: RouteMatch
) -> tuple[list[Coordinate], float]:
    remaining_points = route.path[match.segment_index + 1 :]
    path_from_projection = [match.projected, *remaining_points]
    remaining_geometry = path_length(path_from_projection)

    path = [origin]
    if distance_meters(*origin, *match.projected) > 1:
        path.append(match.projected)
    for coordinate in remaining_points:
        if path[-1] != coordinate:
            path.append(coordinate)
    if len(path) == 1:
        path.append(route.destination)
    return path, remaining_geometry


def _snapshot_from_route(
    state: NavigationRouteState, origin: Coordinate, mode: str
) -> NavigationSnapshot:
    route = state.route
    if route is None:
        raise ValueError("A provider route is required")

    match = closest_route_match(route.path, origin, state.consumed_index)
    if match.distance_meters <= OFF_ROUTE_METERS:
        state.consumed_index = max(state.consumed_index, match.segment_index)

    path_ahead, remaining_geometry = _path_ahead(route, origin, match)
    route_fraction = max(0.0, min(1.0, remaining_geometry / route.geometry_meters))
    connector_distance = match.distance_meters
    remaining = route.distance_meters * route_fraction + connector_distance
    connector_speed = SPEED_KMH.get(mode, SPEED_KMH["walk"]) * 1000 / 3600
    remaining_seconds = (
        route.duration_seconds * route_fraction + connector_distance / connector_speed
    )
    return NavigationSnapshot(
        path_ahead=path_ahead,
        remaining_meters=max(0, round(remaining)),
        eta_minutes=max(1, ceil(remaining_seconds / 60)),
        source=route.source,
        consumed_index=state.consumed_index,
    )


def _fallback_snapshot(
    origin: Coordinate, destination: Coordinate, mode: str
) -> NavigationSnapshot:
    remaining = distance_meters(*origin, *destination)
    return NavigationSnapshot(
        path_ahead=[origin, destination],
        remaining_meters=round(remaining),
        eta_minutes=travel_minutes(remaining, mode),
        source="fallback",
        consumed_index=0,
    )


async def resolve_navigation_state(
    state: NavigationRouteState,
    origin: Coordinate,
    destination: Coordinate,
    mode: str,
    accuracy_meters: float | None,
    *,
    now: float | None = None,
    fetcher: RouteFetcher | None = None,
) -> NavigationSnapshot:
    current_time = time.monotonic() if now is None else now
    fetch_route = fetcher or navigation_route

    if state.route and (state.route.destination != destination or state.route.mode != mode):
        state.route = None
        state.consumed_index = 0
        state.retry_after = 0.0
        state.initial_distance_meters = None

    if state.route is None:
        if current_time >= state.retry_after:
            route = await fetch_route(origin, destination, mode)
            if route is not None:
                state.route = route
                state.consumed_index = 0
                state.retry_after = 0.0
                state.initial_distance_meters = route.distance_meters
            else:
                state.retry_after = current_time + ROUTE_RETRY_SECONDS
        if state.route is None:
            return _fallback_snapshot(origin, destination, mode)

    match = closest_route_match(state.route.path, origin, state.consumed_index)
    reliable_accuracy = accuracy_meters is None or accuracy_meters <= MAX_REROUTE_ACCURACY_METERS
    should_reroute = (
        match.distance_meters > OFF_ROUTE_METERS
        and reliable_accuracy
        and current_time >= state.retry_after
    )
    if should_reroute:
        replacement = await fetch_route(origin, destination, mode)
        if replacement is not None:
            state.route = replacement
            state.consumed_index = 0
            state.retry_after = 0.0
        else:
            # Keep the last known provider route instead of replacing it with a direct line.
            state.retry_after = current_time + ROUTE_RETRY_SECONDS

    return _snapshot_from_route(state, origin, mode)
