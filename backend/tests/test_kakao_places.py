import httpx
import pytest

from app.places import KakaoPlacesProvider
from app.services import opening_is_viable


@pytest.mark.asyncio
async def test_kakao_search_and_verification_use_origin_and_place_id():
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.headers["Authorization"] == "KakaoAK test-key"
        return httpx.Response(
            200,
            json={
                "documents": [
                    {
                        "id": "12345",
                        "place_name": "시청 보드게임",
                        "category_name": "문화,예술 > 게임 > 보드게임카페",
                        "category_group_name": "",
                        "phone": "02-000-0000",
                        "address_name": "서울 중구 태평로",
                        "road_address_name": "서울 중구 세종대로",
                        "x": "126.9784",
                        "y": "37.5667",
                        "place_url": "https://place.map.kakao.com/12345",
                        "distance": "42",
                    }
                ]
            },
        )

    provider = KakaoPlacesProvider("test-key")
    await provider.client.aclose()
    provider.client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        headers={"Authorization": "KakaoAK test-key"},
    )

    places = await provider.search("보드게임", 37.5665, 126.9780, "게임·실내 놀거리")
    place = places[0]

    assert place.name == "시청 보드게임"
    assert place.distance_meters == 42
    assert place.external_place_id.startswith("kakao:12345:")
    assert len(place.external_place_id) <= 160
    assert requests[0].url.params["sort"] == "distance"
    assert requests[0].url.params["radius"] == "10000"
    assert opening_is_viable(place, 30) is True

    verified = await provider.verify(place.external_place_id)
    assert verified is not None
    assert verified.name == place.name
    assert requests[1].url.params["radius"] == "2000"

    await provider.client.aclose()
