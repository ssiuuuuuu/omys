from __future__ import annotations

import asyncio
import base64
import re
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone

import httpx

from .config import get_settings
from .geo import distance_meters
from .schemas import PlaceResult


CATEGORIES = [
    "게임·실내 놀거리",
    "운동·액티비티",
    "관광·산책",
    "쇼핑·구경",
    "데이트코스·이색 체험",
]

CATEGORY_QUERY = {
    "게임·실내 놀거리": "보드게임 방탈출",
    "운동·액티비티": "스포츠 액티비티",
    "관광·산책": "관광 명소 공원",
    "쇼핑·구경": "쇼핑 구경",
    "데이트코스·이색 체험": "데이트 이색 체험",
}

CATEGORY_DISCOVERY_QUERIES = {
    "게임·실내 놀거리": ["보드게임카페", "방탈출"],
    "운동·액티비티": ["볼링장", "실내 클라이밍"],
    "관광·산책": ["공원", "전망대"],
    "쇼핑·구경": ["쇼핑몰", "소품샵"],
    "데이트코스·이색 체험": ["공방", "아쿠아리움"],
}

# 장소 API의 키워드 검색은 검색어와 직접 관련 없는 음식점 등을 함께 반환할 수 있다.
# 공급자별 카테고리명과 장소명을 함께 확인해 OMYS 카테고리에 맞는 결과만 사용한다.
CATEGORY_MATCH_TERMS = {
    "게임·실내 놀거리": (
        "게임",
        "방탈출",
        "피시방",
        "pc방",
        "오락실",
        "만화카페",
        "vr",
        "가상현실",
        "스크린야구",
        "스크린골프",
        "양궁",
        "사격",
        "당구",
        "포켓볼",
        "다트",
        "노래방",
        "홀덤",
        "낚시카페",
        "레이저태그",
        "서바이벌",
        "퍼즐카페",
    ),
    "운동·액티비티": (
        "스포츠",
        "액티비티",
        "볼링",
        "클라이밍",
        "스케이트",
        "배드민턴",
        "탁구",
        "테니스",
        "풋살",
        "농구",
        "수영",
        "러닝",
        "자전거",
        "등산",
        "트램펄린",
        "카트",
        "승마",
        "짚라인",
        "카약",
        "서핑",
        "패러글라이딩",
        "체육",
    ),
    "관광·산책": (
        "관광",
        "산책",
        "공원",
        "전망대",
        "수목원",
        "식물원",
        "둘레길",
        "산책로",
        "해변",
        "궁궐",
        "한옥마을",
        "성곽",
        "유적",
        "벽화마을",
        "유람선",
        "크루즈",
        "야경",
        "전통시장",
        "특색",
        "드라이브",
    ),
    "쇼핑·구경": (
        "쇼핑",
        "백화점",
        "아울렛",
        "복합문화공간",
        "소품",
        "편집숍",
        "편집샵",
        "빈티지",
        "서점",
        "레코드",
        "캐릭터숍",
        "캐릭터샵",
        "팝업스토어",
        "플리마켓",
        "전통시장",
        "지하상가",
        "문구",
        "마트",
        "가구",
        "인테리어",
        "식물가게",
        "꽃집",
        "전자제품",
    ),
    "데이트코스·이색 체험": (
        "체험",
        "공방",
        "도자기",
        "향수",
        "반지",
        "가죽공예",
        "터프팅",
        "베이킹",
        "쿠킹",
        "드로잉",
        "플라워",
        "캔들",
        "퍼스널컬러",
        "사진관",
        "한복대여",
        "교복대여",
        "찜질방",
        "아쿠아리움",
        "수족관",
        "동물카페",
        "천문대",
        "놀이공원",
    ),
}

FOOD_CATEGORY_TERMS = (
    "음식점",
    "한식",
    "양식",
    "중식",
    "일식",
    "분식",
    "패스트푸드",
    "치킨",
    "피자",
    "술집",
    "주점",
    "맛집",
    "디저트",
)

# Real estate/housing listings (e.g. "궁궐빌라") often carry an OMYS-sounding word in their
# business name without being a place anyone would visit — exclude the same way food is.
NON_LEISURE_CATEGORY_TERMS = FOOD_CATEGORY_TERMS + (
    "부동산",
    "주거시설",
    "빌라",
    "주택",
    "아파트",
    "오피스텔",
    "원룸",
)

# Places that read as outdoor regardless of OMYS category (a park is "관광·산책", but a
# campsite or beach might get discovered under other categories too).
OUTDOOR_TERMS = (
    "공원",
    "산책",
    "산책로",
    "둘레길",
    "전망대",
    "수목원",
    "식물원",
    "해변",
    "해수욕장",
    "야외",
    "노천",
    "캠핑",
    "캠핑장",
    "글램핑",
    "낚시터",
    "물놀이",
    "워터파크",
    "등산",
    "한강",
    "광장",
)

# Rough per-person price estimate (KRW) by OMYS category, used when a provider doesn't
# return a price_level (Kakao never does). Intentionally coarse — only meant to catch
# budgets that are wildly off, same tolerance as the existing price_level-based check.
CATEGORY_PRICE_ESTIMATE = {
    "관광·산책": 0,
    "게임·실내 놀거리": 2,
    "운동·액티비티": 2,
    "쇼핑·구경": 1,
    "데이트코스·이색 체험": 3,
}


# Some OMYS activity chip labels (frontend/PlaceSearch.tsx) are descriptive phrases that
# don't match anything in Kakao's keyword search (it matches fairly literally, not
# semantically) even though real places for the activity exist. Rewrite those specific
# labels to a query text that actually returns results, verified against Kakao's API.
ACTIVITY_QUERY_OVERRIDES = {
    "VR 체험장": "VR",
    "일반 노래방": "노래방",
    "실내 서바이벌": "서바이벌",
    "추리게임카페": "방탈출",
    "자전거 타기": "자전거대여",
    "카트 체험": "카트",
    "하천 산책로": "산책로",
    "야경 명소": "야경",
    "역사 유적지": "유적지",
    "캠퍼스 산책": "대학교",
    "레코드숍": "레코드",
    "캐릭터숍": "캐릭터",
    "가구·인테리어숍": "인테리어",
    "대형마트 구경": "대형마트",
    "교복 대여 체험": "교복대여",
    "천문대·별 관측": "천문대",
}


def resolve_search_query(query: str) -> str:
    return ACTIVITY_QUERY_OVERRIDES.get(query.strip(), query)


# Tourist/date-course spots are sparser than gyms or shops, so a fixed 10km radius (Kakao's
# default) leaves smaller/non-metro departure points with too few candidates.
CATEGORY_RADIUS_METERS = {
    "게임·실내 놀거리": 10_000,
    "운동·액티비티": 10_000,
    "관광·산책": 20_000,
    "쇼핑·구경": 10_000,
    "데이트코스·이색 체험": 15_000,
}
DEFAULT_SEARCH_RADIUS_METERS = 10_000


def resolve_search_radius(category: str | None) -> int:
    return CATEGORY_RADIUS_METERS.get(category or "", DEFAULT_SEARCH_RADIUS_METERS)


def _normalized(value: str) -> str:
    return re.sub(r"[\s·,>/_\-]+", "", value.casefold())


def place_matches_category(place: PlaceResult, category: str | None) -> bool:
    """Return whether a provider result really belongs to the requested OMYS category."""
    if not category or category == "완전 랜덤":
        return True
    terms = CATEGORY_MATCH_TERMS.get(category)
    if not terms:
        return False
    if place.category == category:
        return True

    provider_category = _normalized(place.category)
    normalized_terms = tuple(_normalized(term) for term in terms)

    # Match on Kakao's own category path only, not the free-form business name — a name
    # containing a keyword by coincidence (a "러닝센터" tutoring franchise, a "궁궐빌라"
    # apartment) isn't actually the kind of place the category describes.
    if any(
        _normalized(term) in provider_category for term in NON_LEISURE_CATEGORY_TERMS
    ) and not any(term in provider_category for term in normalized_terms):
        return False
    return any(term in provider_category for term in normalized_terms)


def _build_category_by_discovery_query() -> dict[str, str]:
    mapping: dict[str, str] = {}
    for category, queries in CATEGORY_DISCOVERY_QUERIES.items():
        for query in queries:
            mapping[_normalized(query)] = category
    return mapping


# Maps a known discovery query string (e.g. "보드게임카페") back to its OMYS category, so
# category filtering still applies when a client searches by free text without also
# passing `category` explicitly.
CATEGORY_BY_DISCOVERY_QUERY = _build_category_by_discovery_query()


def infer_category(query: str, category: str | None) -> str | None:
    if category:
        return category
    return CATEGORY_BY_DISCOVERY_QUERY.get(_normalized(query))


def search_query_matches_provider_category(query: str, place: PlaceResult) -> bool:
    """Trust Kakao's own category label when the search text literally names it.

    Our OMYS category whitelist can't anticipate every real search (e.g. "카페" isn't
    one of our 5 categories), so when the query text is itself present in Kakao's
    controlled category path — not the free-form business name — treat it as relevant
    regardless of which OMYS category chip happens to be selected.
    """
    query_norm = _normalized(query)
    if not query_norm:
        return False
    return query_norm in _normalized(place.category)


def query_matches_place(query: str, place: PlaceResult) -> bool:
    """Fallback relevance check for free-text queries with no resolvable category.

    Kakao's keyword search does its own (loose) server-side matching, so unrelated
    popular chains can leak into results for a specific query like "보드게임카페". Require
    the query text itself to actually appear in the result's name or category. Unlike
    `place_matches_category`, this runs when no OMYS category was resolvable at all, so
    there's no keyword whitelist to fall back on — the literal query text is all we have.
    """
    query_norm = _normalized(query)
    if not query_norm:
        return True
    provider_category = _normalized(place.category)
    if any(_normalized(term) in provider_category for term in NON_LEISURE_CATEGORY_TERMS):
        return False
    return query_norm in _normalized(place.name) or query_norm in provider_category


def is_food_place(place: PlaceResult) -> bool:
    category = _normalized(place.category)
    return any(_normalized(term) in category for term in FOOD_CATEGORY_TERMS)


def is_outdoor_place(place: PlaceResult) -> bool:
    if place.is_public_outdoor:
        return True
    name = _normalized(place.name)
    category = _normalized(place.category)
    return any(_normalized(term) in name or _normalized(term) in category for term in OUTDOOR_TERMS)


def resolve_place_category(place: PlaceResult) -> str | None:
    """Best-effort OMYS category for a place, inferred from its provider category/name."""
    for category in CATEGORY_MATCH_TERMS:
        if place_matches_category(place, category):
            return category
    return None


def estimate_price_level(place: PlaceResult) -> int | None:
    """Fall back to a category-based rough price estimate when the provider gives none
    (Kakao never returns price_level; Google sometimes does)."""
    if place.price_level is not None:
        return place.price_level
    if place.is_public_outdoor:
        return 0
    return CATEGORY_PRICE_ESTIMATE.get(resolve_place_category(place))


class PlacesProvider(ABC):
    @abstractmethod
    async def search(
        self,
        query: str,
        latitude: float,
        longitude: float,
        category: str | None = None,
        radius: int | None = None,
        page_count: int = 1,
    ) -> list[PlaceResult]: ...

    @abstractmethod
    async def verify(self, external_place_id: str) -> PlaceResult | None: ...


class MockPlacesProvider(PlacesProvider):
    def __init__(self):
        now = datetime.now(timezone.utc)
        close = now + timedelta(hours=4)
        self.places = [
            PlaceResult(
                external_place_id="mock-seongsu-cafe",
                name="성수 실내 클라이밍",
                category="운동·액티비티",
                address="서울 성동구 서울숲길",
                latitude=37.5459,
                longitude=127.0431,
                price_level=2,
                business_status="OPERATIONAL",
                open_now=True,
                next_close_time=close,
                place_url="https://maps.google.com/?q=37.5459,127.0431",
                phone="02-000-1001",
            ),
            PlaceResult(
                external_place_id="mock-art-museum",
                name="도심 복합문화공간",
                category="쇼핑·구경",
                address="서울 중구 을지로",
                latitude=37.5662,
                longitude=126.9911,
                price_level=2,
                business_status="OPERATIONAL",
                open_now=True,
                next_close_time=close,
                place_url="https://maps.google.com/?q=37.5662,126.9911",
                phone="02-000-1002",
            ),
            PlaceResult(
                external_place_id="mock-han-river",
                name="반포 한강공원 달빛광장",
                category="관광·산책",
                address="서울 서초구 신반포로11길",
                latitude=37.5100,
                longitude=126.9958,
                price_level=0,
                business_status="OPERATIONAL",
                open_now=True,
                next_close_time=None,
                is_public_outdoor=True,
                place_url="https://maps.google.com/?q=37.5100,126.9958",
            ),
            PlaceResult(
                external_place_id="mock-pottery",
                name="연남 도자기 작업실",
                category="데이트코스·이색 체험",
                address="서울 마포구 동교로",
                latitude=37.5627,
                longitude=126.9255,
                price_level=3,
                business_status="OPERATIONAL",
                open_now=True,
                next_close_time=close,
                place_url="https://maps.google.com/?q=37.5627,126.9255",
                phone="02-000-1003",
            ),
            PlaceResult(
                external_place_id="mock-boardgame",
                name="혜화 미스터리 보드게임",
                category="게임·실내 놀거리",
                address="서울 종로구 대학로",
                latitude=37.5821,
                longitude=127.0017,
                price_level=2,
                business_status="OPERATIONAL",
                open_now=True,
                next_close_time=close,
                place_url="https://maps.google.com/?q=37.5821,127.0017",
                phone="02-000-1005",
            ),
            PlaceResult(
                external_place_id="mock-closed",
                name="오늘 쉬는 비밀 상점",
                category="쇼핑·구경",
                address="서울 용산구 한강대로",
                latitude=37.5298,
                longitude=126.9648,
                price_level=2,
                business_status="CLOSED_TEMPORARILY",
                open_now=False,
                next_close_time=None,
                place_url="https://maps.google.com/?q=37.5298,126.9648",
            ),
        ]

    async def search(
        self,
        query: str,
        latitude: float,
        longitude: float,
        category: str | None = None,
        radius: int | None = None,
        page_count: int = 1,
    ) -> list[PlaceResult]:
        query_lower = query.strip().lower()
        matches = [
            place.model_copy(
                update={
                    "distance_meters": round(
                        distance_meters(latitude, longitude, place.latitude, place.longitude)
                    )
                }
            )
            for place in self.places
            if (not category or category == "완전 랜덤" or place.category == category)
            and (
                radius is None
                or distance_meters(latitude, longitude, place.latitude, place.longitude) <= radius
            )
            and (
                not query_lower
                or query_lower in place.name.lower()
                or query_lower in place.category.lower()
            )
        ]
        if not matches and query_lower:
            matches = [
                place.model_copy(
                    update={
                        "distance_meters": round(
                            distance_meters(latitude, longitude, place.latitude, place.longitude)
                        )
                    }
                )
                for place in self.places
                if not category or category == "완전 랜덤" or place.category == category
                if radius is None
                or distance_meters(latitude, longitude, place.latitude, place.longitude) <= radius
            ]
        return sorted(matches, key=lambda place: place.distance_meters or 0)[: 12 * page_count]

    async def verify(self, external_place_id: str) -> PlaceResult | None:
        await asyncio.sleep(0)
        place = next(
            (item for item in self.places if item.external_place_id == external_place_id), None
        )
        if not place:
            return None
        # Mock opening data is refreshed on every final verification.
        if place.open_now and not place.is_public_outdoor:
            return place.model_copy(
                update={"next_close_time": datetime.now(timezone.utc) + timedelta(hours=4)}
            )
        return place


class GooglePlacesProvider(PlacesProvider):
    base_url = "https://places.googleapis.com/v1"

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("GOOGLE_PLACES_API_KEY가 필요합니다.")
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=8.0)

    @property
    def headers(self) -> dict[str, str]:
        return {"X-Goog-Api-Key": self.api_key}

    def _parse(self, item: dict, fallback_category: str = "완전 랜덤") -> PlaceResult:
        location = item.get("location", {})
        hours = item.get("currentOpeningHours") or {}
        name = (item.get("displayName") or {}).get("text", "이름 없는 장소")
        primary = (item.get("primaryTypeDisplayName") or {}).get("text") or fallback_category
        close = hours.get("nextCloseTime")
        return PlaceResult(
            external_place_id=item["id"],
            name=name,
            category=primary,
            address=item.get("formattedAddress", "주소 정보 없음"),
            latitude=location.get("latitude", 0),
            longitude=location.get("longitude", 0),
            price_level=_price_level(item.get("priceLevel")),
            business_status=item.get("businessStatus"),
            open_now=hours.get("openNow"),
            next_close_time=datetime.fromisoformat(close.replace("Z", "+00:00")) if close else None,
            place_url=item.get("googleMapsUri"),
            phone=item.get("nationalPhoneNumber"),
        )

    async def search(
        self,
        query: str,
        latitude: float,
        longitude: float,
        category: str | None = None,
        radius: int | None = None,
        page_count: int = 1,
    ) -> list[PlaceResult]:
        text_query = query.strip() or CATEGORY_QUERY.get(category or "완전 랜덤", "가볼만한 곳")
        fields = "places.id,places.displayName,places.primaryTypeDisplayName,places.formattedAddress,places.location,places.priceLevel,places.businessStatus,places.currentOpeningHours,places.googleMapsUri,places.nationalPhoneNumber"
        response = await self.client.post(
            f"{self.base_url}/places:searchText",
            headers={**self.headers, "X-Goog-FieldMask": fields},
            json={
                "textQuery": text_query,
                "locationBias": {
                    "circle": {
                        "center": {"latitude": latitude, "longitude": longitude},
                        "radius": float(min(radius or 10_000, 50_000)),
                    }
                },
                "maxResultCount": min(20, 12 * page_count),
                "languageCode": "ko",
            },
        )
        response.raise_for_status()
        return [
            self._parse(item, category or "완전 랜덤").model_copy(
                update={
                    "distance_meters": round(
                        distance_meters(
                            latitude,
                            longitude,
                            item["location"]["latitude"],
                            item["location"]["longitude"],
                        )
                    )
                }
            )
            for item in response.json().get("places", [])
        ]

    async def verify(self, external_place_id: str) -> PlaceResult | None:
        fields = "id,displayName,primaryTypeDisplayName,formattedAddress,location,priceLevel,businessStatus,currentOpeningHours,googleMapsUri,nationalPhoneNumber"
        response = await self.client.get(
            f"{self.base_url}/places/{external_place_id}",
            headers={**self.headers, "X-Goog-FieldMask": fields},
            params={"languageCode": "ko"},
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return self._parse(response.json())


class KakaoPlacesProvider(PlacesProvider):
    base_url = "https://dapi.kakao.com/v2/local/search/keyword.json"

    def __init__(self, rest_api_key: str):
        if not rest_api_key:
            raise ValueError("KAKAO_REST_API_KEY가 필요합니다.")
        self.client = httpx.AsyncClient(
            timeout=8.0,
            headers={"Authorization": f"KakaoAK {rest_api_key}"},
        )

    @staticmethod
    def _external_id(item: dict) -> str:
        latitude = float(item["y"])
        longitude = float(item["x"])
        name = item["place_name"]
        prefix = f"kakao:{item['id']}:{latitude:.6f}:{longitude:.6f}:"
        encoded_name = base64.urlsafe_b64encode(name.encode("utf-8")).decode().rstrip("=")
        while len(prefix) + len(encoded_name) > 160 and name:
            name = name[:-1]
            encoded_name = base64.urlsafe_b64encode(name.encode("utf-8")).decode().rstrip("=")
        return prefix + encoded_name

    @staticmethod
    def _decode_external_id(external_place_id: str) -> tuple[str, float, float, str] | None:
        parts = external_place_id.split(":", 4)
        if len(parts) != 5 or parts[0] != "kakao":
            return None
        try:
            encoded_name = parts[4]
            padding = "=" * (-len(encoded_name) % 4)
            name = base64.urlsafe_b64decode(encoded_name + padding).decode("utf-8")
            return parts[1], float(parts[2]), float(parts[3]), name
        except (ValueError, UnicodeDecodeError):
            return None

    def _parse(self, item: dict, latitude: float, longitude: float) -> PlaceResult:
        place_latitude = float(item["y"])
        place_longitude = float(item["x"])
        category = item.get("category_name") or item.get("category_group_name") or "장소"
        raw_distance = item.get("distance")
        return PlaceResult(
            external_place_id=self._external_id(item),
            name=item["place_name"],
            category=category[-80:],
            address=item.get("road_address_name") or item.get("address_name") or "주소 정보 없음",
            latitude=place_latitude,
            longitude=place_longitude,
            business_status="UNKNOWN_KAKAO",
            open_now=None,
            next_close_time=None,
            place_url=item.get("place_url"),
            phone=item.get("phone") or None,
            distance_meters=(
                int(raw_distance)
                if raw_distance
                else round(
                    distance_meters(
                        latitude,
                        longitude,
                        place_latitude,
                        place_longitude,
                    )
                )
            ),
        )

    async def _keyword_search(
        self,
        query: str,
        latitude: float,
        longitude: float,
        radius: int = 10_000,
        page_count: int = 1,
    ) -> list[PlaceResult]:
        results: list[PlaceResult] = []
        for page in range(1, min(max(page_count, 1), 3) + 1):
            response = await self.client.get(
                self.base_url,
                params={
                    "query": query,
                    "x": longitude,
                    "y": latitude,
                    "radius": min(max(radius, 1), 20_000),
                    "size": 15,
                    "page": page,
                    "sort": "distance",
                },
            )
            response.raise_for_status()
            payload = response.json()
            results.extend(
                self._parse(item, latitude, longitude)
                for item in payload.get("documents", [])
            )
            if payload.get("meta", {}).get("is_end", True):
                break
        return results

    async def search(
        self,
        query: str,
        latitude: float,
        longitude: float,
        category: str | None = None,
        radius: int | None = None,
        page_count: int = 1,
    ) -> list[PlaceResult]:
        text_query = query.strip() or CATEGORY_QUERY.get(category or "완전 랜덤", "가볼만한 곳")
        return await self._keyword_search(
            text_query,
            latitude,
            longitude,
            radius=radius or 10_000,
            page_count=page_count,
        )

    async def verify(self, external_place_id: str) -> PlaceResult | None:
        decoded = self._decode_external_id(external_place_id)
        if not decoded:
            return None
        kakao_id, latitude, longitude, name = decoded
        places = await self._keyword_search(name, latitude, longitude, radius=2_000)
        return next(
            (place for place in places if place.external_place_id.startswith(f"kakao:{kakao_id}:")),
            None,
        )


def _price_level(value: str | None) -> int | None:
    mapping = {
        "PRICE_LEVEL_FREE": 0,
        "PRICE_LEVEL_INEXPENSIVE": 1,
        "PRICE_LEVEL_MODERATE": 2,
        "PRICE_LEVEL_EXPENSIVE": 3,
        "PRICE_LEVEL_VERY_EXPENSIVE": 4,
    }
    return mapping.get(value) if value else None


class CachedPlacesProvider(PlacesProvider):
    def __init__(self, provider: PlacesProvider, ttl: int):
        self.provider = provider
        self.ttl = ttl
        self.cache: dict[str, tuple[float, list[PlaceResult]]] = {}

    async def search(
        self,
        query: str,
        latitude: float,
        longitude: float,
        category: str | None = None,
        radius: int | None = None,
        page_count: int = 1,
    ) -> list[PlaceResult]:
        key = (
            f"{query}:{round(latitude, 3)}:{round(longitude, 3)}:"
            f"{category}:{radius}:{page_count}"
        )
        cached = self.cache.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        if radius is None and page_count == 1:
            result = await self.provider.search(query, latitude, longitude, category)
        else:
            result = await self.provider.search(
                query,
                latitude,
                longitude,
                category,
                radius=radius,
                page_count=page_count,
            )
        effective_category = infer_category(query, category)
        if effective_category in CATEGORY_MATCH_TERMS:
            result = [
                place
                for place in result
                if place_matches_category(place, effective_category)
                or search_query_matches_provider_category(query, place)
            ]
        elif query.strip():
            result = [place for place in result if query_matches_place(query, place)]
        self.cache[key] = (time.monotonic() + self.ttl, result)
        return result

    async def verify(self, external_place_id: str) -> PlaceResult | None:
        # Deliberately bypass cache for the final provider verification.
        return await self.provider.verify(external_place_id)


def build_provider() -> PlacesProvider:
    settings = get_settings()
    if settings.places_provider == "google":
        base: PlacesProvider = GooglePlacesProvider(settings.google_places_api_key)
    elif settings.places_provider == "kakao":
        base = KakaoPlacesProvider(settings.kakao_rest_api_key)
    else:
        base = MockPlacesProvider()
    return CachedPlacesProvider(base, settings.search_cache_seconds)


places_provider = build_provider()
