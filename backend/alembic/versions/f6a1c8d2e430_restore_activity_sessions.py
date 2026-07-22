"""restore activity sessions

Revision ID: f6a1c8d2e430
Revises: e3f7c2a9d456
Create Date: 2026-07-22 00:00:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f6a1c8d2e430"
down_revision: Union[str, None] = "e3f7c2a9d456"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "activity_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("anonymous_session_id", sa.String(length=64), nullable=False),
        sa.Column("session_token_hash", sa.String(length=64), nullable=False),
        sa.Column("selected_mood", sa.String(length=20), nullable=True),
        sa.Column("current_activity_id", sa.String(length=40), nullable=True),
        sa.Column("previously_drawn_activity_ids", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result", sa.String(length=20), nullable=True),
        sa.Column("party_size", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_activity_sessions_anonymous_session_id"),
        "activity_sessions",
        ["anonymous_session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_activity_sessions_status"), "activity_sessions", ["status"], unique=False
    )
    op.create_index(
        op.f("ix_activity_sessions_session_token_hash"),
        "activity_sessions",
        ["session_token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_activity_sessions_session_token_hash"), table_name="activity_sessions")
    op.drop_index(op.f("ix_activity_sessions_status"), table_name="activity_sessions")
    op.drop_index(op.f("ix_activity_sessions_anonymous_session_id"), table_name="activity_sessions")
    op.drop_table("activity_sessions")
