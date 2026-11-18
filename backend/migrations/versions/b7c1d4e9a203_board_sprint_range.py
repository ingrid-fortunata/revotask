"""board sprint range

Revision ID: b7c1d4e9a203
Revises: a265fb5e7047
Create Date: 2026-11-18 10:00:00.000000

Adds the optional sprint range to boards (boards-membership Revision 2, DS1, C41). Existing rows
keep both columns null, so the check holds without a backfill.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b7c1d4e9a203"
down_revision = "a265fb5e7047"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("boards", sa.Column("sprint_start", sa.Date(), nullable=True), schema="revotask")
    op.add_column("boards", sa.Column("sprint_end", sa.Date(), nullable=True), schema="revotask")
    op.create_check_constraint(
        op.f("ck_boards_sprint_range_valid"),
        "boards",
        "(sprint_start IS NULL AND sprint_end IS NULL) OR "
        "(sprint_start IS NOT NULL AND sprint_end IS NOT NULL "
        "AND sprint_end >= sprint_start AND sprint_end - sprint_start <= 89)",
        schema="revotask",
    )


def downgrade():
    op.drop_constraint(
        op.f("ck_boards_sprint_range_valid"), "boards", type_="check", schema="revotask"
    )
    op.drop_column("boards", "sprint_end", schema="revotask")
    op.drop_column("boards", "sprint_start", schema="revotask")
