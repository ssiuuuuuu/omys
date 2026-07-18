from math import asin, cos, radians, sin, sqrt


def distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth = 6_371_000
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * earth * asin(sqrt(a))


SPEED_KMH = {"walk": 4.2, "transit": 18.0, "car": 24.0}


def travel_minutes(distance: float, mode: str) -> int:
    speed = SPEED_KMH.get(mode, SPEED_KMH["walk"])
    return max(1, round((distance / 1000) / speed * 60))


def navigation_hint(from_lat: float, from_lon: float, to_lat: float, to_lon: float) -> str:
    vertical = "북쪽" if to_lat >= from_lat else "남쪽"
    horizontal = "동쪽" if to_lon >= from_lon else "서쪽"
    return f"{vertical} · {horizontal} 방향으로 이동하세요"
