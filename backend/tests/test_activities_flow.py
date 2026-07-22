import pytest
from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import ActivitySession, AnalyticsEvent
from app.security import hash_token


def session_auth(token: str) -> dict[str, str]:
    return {"X-Session-Token": token}


def create_session(client, anonymous_id: str = "anonymous-activity-user") -> dict:
    response = client.post(
        "/api/activity-sessions",
        json={"anonymous_session_id": anonymous_id},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["session_token"]
    return body


def test_activity_catalog_contains_supported_moods_and_safe_items(client):
    response = client.get("/api/activities")
    assert response.status_code == 200
    body = response.json()
    assert set(body["moods"]) == {"light", "funny", "dopamine"}
    assert all(item["mood"] in body["moods"] for item in body["activities"])
    counts = {
        mood: sum(item["mood"] == mood for item in body["activities"]) for mood in body["moods"]
    }
    assert counts == {
        "light": 10,
        "funny": 10,
        "dopamine": 10,
    }

    activity_text = " ".join(
        f"{item['title']} {item['description']}" for item in body["activities"]
    )
    for unsafe_term in ["폭죽", "뜨거운 국물", "날계란", "전기파리채"]:
        assert unsafe_term not in activity_text


def test_draw_skip_start_complete_and_restore_activity_session(client):
    session = create_session(client)
    session_id = session["id"]
    token = session["session_token"]
    headers = session_auth(token)

    first = client.post(
        f"/api/activity-sessions/{session_id}/draw",
        json={"mood": "light"},
        headers=headers,
    )
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["activity"]["mood"] == "light"
    assert first_body["session_token"] is None

    second = client.post(f"/api/activity-sessions/{session_id}/skip", headers=headers)
    assert second.status_code == 200, second.text
    second_body = second.json()
    assert second_body["activity"]["id"] != first_body["activity"]["id"]

    started = client.post(f"/api/activity-sessions/{session_id}/start", headers=headers)
    assert started.status_code == 200
    assert started.json()["status"] == "started"
    assert started.json()["started_at"]

    restored = client.get(f"/api/activity-sessions/{session_id}", headers=headers)
    assert restored.status_code == 200
    assert restored.json()["activity"]["id"] == second_body["activity"]["id"]
    assert restored.json()["status"] == "started"

    completed = client.post(
        f"/api/activity-sessions/{session_id}/complete",
        json={"result": "success", "party_size": 3},
        headers=headers,
    )
    assert completed.status_code == 200
    assert completed.json()["result"] == "success"
    assert completed.json()["party_size"] == 3

    repeated = client.post(
        f"/api/activity-sessions/{session_id}/complete",
        json={"result": "success", "party_size": 3},
        headers=headers,
    )
    assert repeated.status_code == 200

    with SessionLocal() as db:
        completed_events = db.scalar(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.event_name == "activity_completed"
            )
        )
        assert completed_events == 1


def test_activity_session_requires_matching_token(client):
    session = create_session(client)
    session_id = session["id"]
    raw_token = session["session_token"]

    assert client.get(f"/api/activity-sessions/{session_id}").status_code == 401
    assert (
        client.get(
            f"/api/activity-sessions/{session_id}", headers=session_auth("wrong-token")
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/activity-sessions/{session_id}", headers=session_auth(raw_token)
        ).status_code
        == 200
    )

    with SessionLocal() as db:
        stored = db.get(ActivitySession, session_id)
        assert stored is not None
        assert stored.session_token_hash == hash_token(raw_token)
        assert stored.session_token_hash != raw_token


@pytest.mark.parametrize(
    ("result", "expected_status", "event_name"),
    [
        ("failure", "completed", "activity_completed"),
        ("abandoned", "abandoned", "activity_abandoned"),
    ],
)
def test_activity_result_variants(client, result, expected_status, event_name):
    session = create_session(client, f"anonymous-{result}-user")
    session_id = session["id"]
    headers = session_auth(session["session_token"])
    assert (
        client.post(
            f"/api/activity-sessions/{session_id}/draw",
            json={"mood": "funny"},
            headers=headers,
        ).status_code
        == 200
    )
    started = client.post(f"/api/activity-sessions/{session_id}/start", headers=headers)
    assert started.status_code == 200
    response = client.post(
        f"/api/activity-sessions/{session_id}/complete",
        json={"result": result},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == expected_status

    with SessionLocal() as db:
        assert (
            db.scalar(
                select(func.count(AnalyticsEvent.id)).where(AnalyticsEvent.event_name == event_name)
            )
            == 1
        )


def test_all_activities_can_reset_without_immediate_repeat(client):
    session = create_session(client, "anonymous-exhaust-user")
    session_id = session["id"]
    headers = session_auth(session["session_token"])
    response = client.post(
        f"/api/activity-sessions/{session_id}/draw",
        json={"mood": "dopamine"},
        headers=headers,
    )
    seen = {response.json()["activity"]["id"]}
    previous = response.json()["activity"]["id"]

    for _ in range(9):
        response = client.post(f"/api/activity-sessions/{session_id}/skip", headers=headers)
        assert response.status_code == 200
        current = response.json()["activity"]["id"]
        assert current != previous
        seen.add(current)
        previous = current

    assert len(seen) == 10
    reset = client.post(f"/api/activity-sessions/{session_id}/skip", headers=headers)
    assert reset.status_code == 200
    assert reset.json()["list_reset"] is True
    assert reset.json()["activity"]["id"] != previous
