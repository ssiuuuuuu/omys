import pytest
from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import AnalyticsEvent


def create_session(client, anonymous_id="anonymous-activity-user"):
    response = client.post(
        "/api/activity-sessions",
        json={"anonymous_session_id": anonymous_id},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_activity_catalog_contains_only_supported_moods_and_safe_dopamine_items(client):
    response = client.get("/api/activities")
    assert response.status_code == 200
    body = response.json()
    assert set(body["moods"]) == {"light", "funny", "dopamine"}
    assert all(item["mood"] in body["moods"] for item in body["activities"])

    dopamine_text = " ".join(
        f"{item['title']} {item['description']}"
        for item in body["activities"]
        if item["mood"] == "dopamine"
    )
    for unsafe_term in ["폭죽", "뜨거운 탕", "날계란", "전기파리채"]:
        assert unsafe_term not in dopamine_text


def test_draw_skip_start_complete_and_restore_activity_session(client):
    session = create_session(client)
    session_id = session["id"]

    first = client.post(f"/api/activity-sessions/{session_id}/draw", json={"mood": "light"})
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["activity"]["mood"] == "light"

    second = client.post(f"/api/activity-sessions/{session_id}/skip")
    assert second.status_code == 200, second.text
    second_body = second.json()
    assert second_body["activity"]["id"] != first_body["activity"]["id"]

    started = client.post(f"/api/activity-sessions/{session_id}/start")
    assert started.status_code == 200
    assert started.json()["status"] == "started"
    assert started.json()["started_at"]

    restored = client.get(f"/api/activity-sessions/{session_id}")
    assert restored.status_code == 200
    assert restored.json()["activity"]["id"] == second_body["activity"]["id"]
    assert restored.json()["status"] == "started"

    completed = client.post(
        f"/api/activity-sessions/{session_id}/complete",
        json={"result": "success", "party_size": 3},
    )
    assert completed.status_code == 200
    assert completed.json()["result"] == "success"
    assert completed.json()["party_size"] == 3

    repeated = client.post(
        f"/api/activity-sessions/{session_id}/complete",
        json={"result": "success", "party_size": 3},
    )
    assert repeated.status_code == 200

    with SessionLocal() as db:
        completed_events = db.scalar(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.event_name == "activity_completed"
            )
        )
        assert completed_events == 1


@pytest.mark.parametrize(
    ("result", "expected_status", "event_name"),
    [
        ("failure", "completed", "activity_completed"),
        ("abandoned", "abandoned", "activity_abandoned"),
    ],
)
def test_activity_result_variants(client, result, expected_status, event_name):
    session_id = create_session(client, f"anonymous-{result}-user")["id"]
    assert (
        client.post(f"/api/activity-sessions/{session_id}/draw", json={"mood": "funny"}).status_code
        == 200
    )
    assert client.post(f"/api/activity-sessions/{session_id}/start").status_code == 200
    response = client.post(f"/api/activity-sessions/{session_id}/complete", json={"result": result})
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
    session_id = create_session(client, "anonymous-exhaust-user")["id"]
    response = client.post(f"/api/activity-sessions/{session_id}/draw", json={"mood": "dopamine"})
    seen = {response.json()["activity"]["id"]}
    previous = response.json()["activity"]["id"]

    for _ in range(9):
        response = client.post(f"/api/activity-sessions/{session_id}/skip")
        assert response.status_code == 200
        current = response.json()["activity"]["id"]
        assert current != previous
        seen.add(current)
        previous = current

    assert len(seen) == 10
    reset = client.post(f"/api/activity-sessions/{session_id}/skip")
    assert reset.status_code == 200
    assert reset.json()["list_reset"] is True
    assert reset.json()["activity"]["id"] != previous
