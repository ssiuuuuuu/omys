from conftest import auth
from app.database import SessionLocal
from app.models import PlaceCandidate, Room
from sqlalchemy import select


def create_omys(client, latitude=37.5665, longitude=126.9780, hide_until_arrival=True):
    return client.post(
        "/api/rooms",
        json={
            "title": "오늘의 즉흥",
            "mode": "omys",
            "host_nickname": "탐험가",
            "departure": {"label": "출발지", "latitude": latitude, "longitude": longitude},
            "hide_until_arrival": hide_until_arrival,
        },
    ).json()


def test_destination_hidden_until_arrival_and_manual_fallback(client):
    host = create_omys(client)
    code = host["invite_code"]
    headers = auth(host["participant_token"])
    response = client.post(
        f"/api/rooms/{code}/conditions",
        headers=headers,
        json={
            "transport_mode": "transit",
            "max_travel_minutes": 90,
            "party_size": 2,
            "preferred_categories": ["운동·액티비티", "관광·산책"],
            "budget_per_person": 50000,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["selection_locked"] is True
    assert body["selected_place"] is None
    assert client.get(f"/api/share/{code}").json()["place"] is None
    assert client.post(f"/api/rooms/{code}/start", headers=headers).status_code == 200

    with SessionLocal() as db:
        room = db.scalar(select(Room).where(Room.invite_code == code))
        place = db.get(PlaceCandidate, room.selected_place_id)
        target = {"latitude": place.latitude, "longitude": place.longitude, "accuracy": 20}
        far_target = {
            "latitude": place.latitude - 0.002,
            "longitude": place.longitude,
            "accuracy": 20,
        }

    far_nav = client.post(f"/api/rooms/{code}/navigation", headers=headers, json=far_target)
    assert far_nav.status_code == 200
    far_body = far_nav.json()
    assert far_body["reveal_available"] is False
    assert "destination" not in far_body
    assert len(far_body["route_path"]) >= 2
    assert far_body["route_path"][-1] != {
        "latitude": target["latitude"],
        "longitude": target["longitude"],
    }
    assert (
        client.post(f"/api/rooms/{code}/reveal", headers=headers, json=far_target).status_code
        == 409
    )

    nav = client.post(f"/api/rooms/{code}/navigation", headers=headers, json=target)
    assert nav.status_code == 200
    assert nav.json()["reveal_available"] is True
    assert nav.json()["destination"] == {
        "latitude": target["latitude"],
        "longitude": target["longitude"],
    }
    assert "name" not in nav.text and "address" not in nav.text
    reveal = client.post(f"/api/rooms/{code}/reveal", headers=headers, json=target)
    assert reveal.status_code == 200
    assert reveal.json()["selected_place"]["name"]
    assert client.get(f"/api/share/{code}").json()["place"]["name"]


def test_no_candidate_has_actionable_message(client):
    host = create_omys(client, 35.1796, 129.0756)
    response = client.post(
        f"/api/rooms/{host['invite_code']}/conditions",
        headers=auth(host["participant_token"]),
        json={
            "transport_mode": "walk",
            "max_travel_minutes": 5,
            "party_size": 2,
        },
    )
    assert response.status_code == 422
    assert "이동 시간" in response.json()["detail"]


def test_conditions_can_be_relaxed_and_retried_after_no_candidate(client):
    host = create_omys(client)
    path = f"/api/rooms/{host['invite_code']}/conditions"
    headers = auth(host["participant_token"])

    narrow = client.post(
        path,
        headers=headers,
        json={
            "transport_mode": "walk",
            "max_travel_minutes": 5,
            "party_size": 2,
            "preferred_categories": ["게임·실내 놀거리"],
        },
    )
    assert narrow.status_code == 422

    relaxed = client.post(
        path,
        headers=headers,
        json={
            "transport_mode": "walk",
            "max_travel_minutes": 90,
            "party_size": 2,
            "preferred_categories": ["게임·실내 놀거리"],
        },
    )

    assert relaxed.status_code == 200, relaxed.text
    assert relaxed.json()["selection_locked"] is True


def test_conditions_reject_unsupported_category(client):
    host = create_omys(client)
    response = client.post(
        f"/api/rooms/{host['invite_code']}/conditions",
        headers=auth(host["participant_token"]),
        json={
            "transport_mode": "walk",
            "max_travel_minutes": 30,
            "party_size": 2,
            "preferred_categories": ["맛집"],
        },
    )

    assert response.status_code == 422
    assert "지원하지 않는 카테고리" in response.json()["detail"]


def test_destination_can_be_revealed_with_navigation_admin_key(client):
    host = create_omys(client, hide_until_arrival=False)
    code = host["invite_code"]
    headers = auth(host["participant_token"])
    response = client.post(
        f"/api/rooms/{code}/conditions",
        headers=headers,
        json={
            "transport_mode": "transit",
            "max_travel_minutes": 90,
            "party_size": 2,
            "preferred_categories": ["게임·실내 놀거리"],
            "budget_per_person": 50000,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["hide_until_arrival"] is False
    assert response.json()["selected_place"] is None

    wrong_key = client.post(
        f"/api/rooms/{code}/reveal", headers=headers, json={"admin_key": "9999"}
    )
    assert wrong_key.status_code == 403

    reveal = client.post(
        f"/api/rooms/{code}/reveal", headers=headers, json={"admin_key": "1210"}
    )
    assert reveal.status_code == 200, reveal.text
    assert reveal.json()["selected_place"]["name"]


def test_admin_metrics_require_key(client):
    assert client.get("/api/admin/stats").status_code == 403
    assert (
        client.get(
            "/api/admin/stats", headers={"X-Admin-Key": "change-me-before-production"}
        ).status_code
        == 200
    )
