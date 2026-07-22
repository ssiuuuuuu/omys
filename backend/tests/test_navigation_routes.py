import pytest

from app.navigation import (
    NavigationRouteState,
    ProviderRoute,
    _coordinates_from_kakao_directions,
    _coordinates_from_tmap_pedestrian,
    _finalize_route,
    _route_from_tmap_pedestrian,
    closest_route_match,
    resolve_navigation_state,
)


def test_tmap_pedestrian_parses_linestring_features_as_lat_lon():
    payload = {
        "features": [
            {
                "geometry": {"type": "Point", "coordinates": [126.978, 37.5665]},
                "properties": {"totalDistance": 1677, "totalTime": 467},
            },
            {
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [126.978, 37.5665],
                        [126.979, 37.5670],
                        [126.979, 37.5670],
                        [126.980, 37.5675],
                    ],
                }
            },
        ]
    }
    route = _coordinates_from_tmap_pedestrian(payload)
    assert route == [
        (37.5665, 126.978),
        (37.5670, 126.979),
        (37.5675, 126.980),
    ]

    provider_route = _route_from_tmap_pedestrian(
        payload,
        (37.5665, 126.978),
        (37.5675, 126.980),
    )
    assert provider_route is not None
    assert provider_route.distance_meters == 1677
    assert provider_route.duration_seconds == 467
    assert provider_route.source == "tmap"


def test_tmap_pedestrian_ignores_missing_features():
    assert _coordinates_from_tmap_pedestrian({}) == []
    assert _coordinates_from_tmap_pedestrian({"features": []}) == []


def test_kakao_directions_still_parses_vertexes_as_lat_lon():
    payload = {
        "routes": [
            {
                "sections": [
                    {
                        "roads": [
                            {"vertexes": [126.978, 37.5665, 126.979, 37.5670]},
                        ]
                    }
                ]
            }
        ]
    }
    assert _coordinates_from_kakao_directions(payload) == [
        (37.5665, 126.978),
        (37.5670, 126.979),
    ]


def test_finalize_route_prepends_and_appends_missing_endpoints():
    origin = (37.5, 127.0)
    destination = (37.6, 127.1)
    route = _finalize_route([(37.52, 127.02), (37.55, 127.05)], origin, destination)
    assert route == [origin, (37.52, 127.02), (37.55, 127.05), destination]


def test_finalize_route_rejects_route_with_fewer_than_two_points():
    assert _finalize_route([], (37.5, 127.0), (37.6, 127.1)) is None
    assert _finalize_route([(37.5, 127.0)], (37.5, 127.0), (37.6, 127.1)) is None


def test_route_matching_measures_distance_to_segment_instead_of_sparse_vertices():
    route = [(37.0, 127.0), (37.002, 127.0)]
    match = closest_route_match(route, (37.001, 127.00001))

    assert match.segment_index == 0
    assert 0.49 < match.fraction < 0.51
    assert match.distance_meters < 2


@pytest.mark.asyncio
async def test_navigation_uses_tmap_total_distance_and_time():
    origin = (37.0, 127.0)
    destination = (37.002, 127.0)
    provider_route = ProviderRoute(
        [origin, (37.001, 127.0), destination],
        distance_meters=1600,
        duration_seconds=1200,
        source="tmap",
        mode="walk",
    )

    async def fetcher(*_args):
        return provider_route

    state = NavigationRouteState()
    snapshot = await resolve_navigation_state(
        state,
        origin,
        destination,
        "walk",
        10,
        now=100,
        fetcher=fetcher,
    )

    assert snapshot.remaining_meters == 1600
    assert snapshot.eta_minutes == 20
    assert snapshot.source == "tmap"
    assert state.initial_distance_meters == 1600

    halfway = await resolve_navigation_state(
        state,
        (37.001, 127.0),
        destination,
        "walk",
        10,
        now=101,
        fetcher=fetcher,
    )
    assert 795 <= halfway.remaining_meters <= 805
    assert halfway.eta_minutes == 10


@pytest.mark.asyncio
async def test_failed_reroute_preserves_last_known_tmap_route():
    route_origin = (37.0, 127.0)
    destination = (37.003, 127.0)
    provider_route = ProviderRoute(
        [route_origin, (37.001, 127.0), (37.002, 127.0), destination],
        distance_meters=500,
        duration_seconds=360,
        source="tmap",
        mode="walk",
    )
    state = NavigationRouteState(route=provider_route, initial_distance_meters=500)
    off_route_position = (37.001, 127.002)

    async def failed_fetcher(*_args):
        return None

    snapshot = await resolve_navigation_state(
        state,
        off_route_position,
        destination,
        "walk",
        10,
        now=100,
        fetcher=failed_fetcher,
    )

    assert state.route is provider_route
    assert state.retry_after == 115
    assert snapshot.source == "tmap"
    assert len(snapshot.path_ahead) >= 3
    assert snapshot.path_ahead[-1] == destination
    assert snapshot.path_ahead != [off_route_position, destination]


@pytest.mark.asyncio
async def test_inaccurate_gps_does_not_trigger_reroute():
    route_origin = (37.0, 127.0)
    destination = (37.003, 127.0)
    provider_route = ProviderRoute(
        [route_origin, (37.001, 127.0), (37.002, 127.0), destination],
        distance_meters=500,
        duration_seconds=360,
        source="tmap",
        mode="walk",
    )
    state = NavigationRouteState(route=provider_route, initial_distance_meters=500)
    calls = 0

    async def fetcher(*_args):
        nonlocal calls
        calls += 1
        return None

    snapshot = await resolve_navigation_state(
        state,
        (37.001, 127.002),
        destination,
        "walk",
        150,
        now=100,
        fetcher=fetcher,
    )

    assert calls == 0
    assert state.retry_after == 0
    assert snapshot.source == "tmap"


@pytest.mark.asyncio
async def test_initial_provider_failure_retries_after_cooldown_without_caching_direct_line():
    origin = (37.0, 127.0)
    destination = (37.003, 127.0)
    state = NavigationRouteState()
    calls = 0

    async def failed_fetcher(*_args):
        nonlocal calls
        calls += 1
        return None

    first = await resolve_navigation_state(
        state,
        origin,
        destination,
        "walk",
        10,
        now=100,
        fetcher=failed_fetcher,
    )
    second = await resolve_navigation_state(
        state,
        origin,
        destination,
        "walk",
        10,
        now=101,
        fetcher=failed_fetcher,
    )

    assert calls == 1
    assert state.route is None
    assert state.retry_after == 115
    assert first.source == second.source == "fallback"
