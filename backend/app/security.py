import html
import secrets
import string

from fastapi import Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Participant, Room


ALPHABET = string.ascii_uppercase + string.digits


def invite_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(12))


def participant_token() -> str:
    return secrets.token_urlsafe(32)


def clean_text(value: str) -> str:
    return html.escape(value.strip(), quote=True)


def get_participant(db: Session, room: Room, token: str | None) -> Participant:
    if not token:
        raise HTTPException(401, "참가자 토큰이 필요합니다.")
    participant = db.scalar(
        select(Participant).where(
            Participant.room_id == room.id, Participant.participant_token == token
        )
    )
    if not participant:
        raise HTTPException(403, "이 방에 접근할 권한이 없습니다.")
    return participant


def require_host(participant: Participant) -> None:
    if not participant.is_host:
        raise HTTPException(403, "방장만 할 수 있습니다.")


async def token_header(x_participant_token: str | None = Header(default=None)) -> str | None:
    return x_participant_token
