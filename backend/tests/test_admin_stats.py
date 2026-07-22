def admin_headers():
    return {"X-Admin-Key": "change-me-before-production"}


def test_admin_stats_groups_recent_landing_views(client):
    for session_id in ("visitor-a", "visitor-a", "visitor-b"):
        response = client.post(
            "/api/analytics",
            json={
                "anonymous_session_id": session_id,
                "event_name": "landing_view",
                "metadata": {},
            },
        )
        assert response.status_code == 202

    response = client.get("/api/admin/stats?range=6h", headers=admin_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["visitors"] == 2
    assert body["pageviews"] == 3
    assert body["period"]["range"] == "6h"
    assert body["period"]["timezone"] == "Asia/Seoul"
    assert body["period"]["bucket_hours"] == 1
    assert len(body["period"]["series"]) == 6
    assert body["period"]["totals"]["visitors"] == 2
    assert body["period"]["totals"]["pageviews"] == 3
    assert sum(point["pageviews"] for point in body["period"]["series"]) == 3


def test_admin_stats_groups_activity_views(client):
    for session_id, event_name in (
        ("activity-a", "activity_tab_opened"),
        ("activity-a", "activity_page_view"),
        ("activity-b", "activity_page_view"),
    ):
        response = client.post(
            "/api/analytics",
            json={
                "anonymous_session_id": session_id,
                "event_name": event_name,
                "metadata": {},
            },
        )
        assert response.status_code == 202

    response = client.get("/api/admin/stats?range=6h", headers=admin_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["activity_visitors"] == 2
    assert body["activity_pageviews"] == 3
    assert body["period"]["totals"]["activity_visitors"] == 2
    assert body["period"]["totals"]["activity_pageviews"] == 3


def test_admin_stats_groups_utm_traffic_and_attributed_actions(client):
    instagram_metadata = {
        "utm_source": "instagram",
        "utm_campaign": "launch",
        "utm_content": "profile",
    }
    events = (
        ("instagram-a", "landing_view", instagram_metadata),
        ("instagram-a", "landing_view", instagram_metadata),
        ("instagram-a", "create_started", instagram_metadata),
        ("instagram-b", "landing_view", instagram_metadata),
        ("instagram-b", "activity_tab_opened", instagram_metadata),
        ("direct-a", "landing_view", {"utm_source": "direct"}),
    )
    for session_id, event_name, metadata in events:
        response = client.post(
            "/api/analytics",
            json={
                "anonymous_session_id": session_id,
                "event_name": event_name,
                "metadata": metadata,
            },
        )
        assert response.status_code == 202

    response = client.get("/api/admin/stats?range=6h", headers=admin_headers())

    assert response.status_code == 200
    sources = response.json()["period"]["traffic_sources"]
    instagram = next(source for source in sources if source["source"] == "instagram")
    assert instagram == {
        "source": "instagram",
        "campaign": "launch",
        "content": "profile",
        "visitors": 2,
        "pageviews": 3,
        "create_starts": 1,
        "activity_starts": 1,
        "conversion_percent": 50.0,
    }


def test_three_day_stats_use_six_hour_buckets(client):
    response = client.get("/api/admin/stats?range=3d", headers=admin_headers())

    assert response.status_code == 200
    period = response.json()["period"]
    assert period["bucket_hours"] == 6
    assert len(period["series"]) == 12


def test_admin_stats_reject_unknown_range(client):
    response = client.get("/api/admin/stats?range=30d", headers=admin_headers())
    assert response.status_code == 422
