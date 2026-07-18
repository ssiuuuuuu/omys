import os

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_omys.db")
os.environ.setdefault("PLACES_PROVIDER", "mock")
os.environ.setdefault("ADMIN_API_KEY", "change-me-before-production")

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app, request_windows


@pytest.fixture(autouse=True)
def clean_database():
    request_windows.clear()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def auth(token: str) -> dict[str, str]:
    return {"X-Participant-Token": token}
