"""add hide until arrival option

Revision ID: b4d2c701a9ef
Revises: 75cb4d86fd92
Create Date: 2026-07-18 22:00:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b4d2c701a9ef"
down_revision: Union[str, None] = "75cb4d86fd92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("rooms")}
    if "hide_until_arrival" not in columns:
        op.add_column(
            "rooms",
            sa.Column(
                "hide_until_arrival",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )


def downgrade() -> None:
    op.drop_column("rooms", "hide_until_arrival")
