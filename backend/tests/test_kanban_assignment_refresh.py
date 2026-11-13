"""Assignment refresh after a member removal (task 5.10; Requirements 6.8, 11.10).

After E12 the board read (E07) shows the removed member's cards as unassigned, which is what the
UI shows after its refetch. The version is unchanged, because E12 is not a position change.
"""

from __future__ import annotations

import pytest

from tests.kanban_helpers import (
    board_version,
    e07_columns,
    make_kanban,
    seed_cards,
)


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def _card(columns, card_id):
    for column in columns:
        for card in column["cards"]:
            if card["id"] == str(card_id):
                return card
    raise AssertionError("card not found")


def test_e07_shows_cleared_assignments_after_e12_and_keeps_other_boards(client, board_tracker, app):
    kanban = make_kanban(board_tracker, app)
    t = seed_cards(kanban)
    member = kanban.add_member("member", name="Mia")
    assigned = board_tracker.make_card(
        t.todo, "Assigned to Mia", assignee_id=member.id, order=3072.0
    )
    other = make_kanban(board_tracker, app, "Other board")
    other_cols = seed_cards(other)
    board_tracker.make_membership(other.board_id, member.id, "member")
    other_card = board_tracker.make_card(
        other_cols.todo, "Mia elsewhere", assignee_id=member.id, order=3072.0
    )

    before = _card(e07_columns(client, kanban.headers(), kanban.board_id), assigned)
    assert (before["assignee_id"], before["assignee_name"]) == (str(member.id), "Mia")
    version = board_version(app, kanban.board_id)

    removal = client.delete(
        f"/api/boards/{kanban.board_id}/members/{member.id}", headers=kanban.headers()
    )
    assert removal.status_code == 200

    after = _card(e07_columns(client, kanban.headers(), kanban.board_id), assigned)
    assert (after["assignee_id"], after["assignee_name"]) == (None, None)
    assert board_version(app, kanban.board_id) == version
    elsewhere = _card(e07_columns(client, other.headers(), other.board_id), other_card)
    assert (elsewhere["assignee_id"], elsewhere["assignee_name"]) == (str(member.id), "Mia")
