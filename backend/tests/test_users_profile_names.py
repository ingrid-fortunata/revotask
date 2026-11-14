"""E31 and names elsewhere (T12, P9): reads that resolve a name take it from the user row."""

from __future__ import annotations

import pytest

from tests.comments_helpers import seed_comment_world
from tests.kanban_helpers import make_kanban
from tests.profile_helpers import patch_me, user_row
from tests.search_helpers import my_tasks_get


@pytest.fixture
def world(board_tracker, app, schema_at_head):
    kanban = make_kanban(board_tracker, app)
    comment_world = seed_comment_world(kanban)
    # Assign the seeded card to the member so E21 has a row with an assignee name.
    from sqlalchemy import update

    from app.extensions import db
    from app.models.card import Card

    with app.app_context():
        db.session.execute(
            update(Card)
            .where(Card.id == comment_world.card)
            .values(assignee_id=comment_world.member.id)
        )
        db.session.commit()
        db.session.remove()
    return comment_world


def test_a_new_name_shows_on_the_next_member_list_task_and_comment_read(world, app, board_tracker):
    kanban, member = world.kanban, world.member
    client = app.test_client()
    assert patch_me(client, board_tracker, member, {"name": "Mia Renamed"}).status_code == 200

    members = client.get(f"/api/boards/{kanban.board_id}/members", headers=kanban.headers())
    names = {m["user_id"]: m["name"] for m in members.get_json()["data"]}
    assert names[str(member.id)] == "Mia Renamed"

    tasks = my_tasks_get(client, kanban.headers(member)).get_json()["data"]
    assert [t["assignee_name"] for t in tasks] == ["Mia Renamed"]

    comments = client.get(f"/api/cards/{world.card}/comments", headers=kanban.headers()).get_json()[
        "data"
    ]
    assert [c["author_name"] for c in comments] == ["Mia Renamed"]


def test_another_users_row_is_unchanged(world, app, board_tracker):
    admin_before = user_row(app, world.kanban.admin.id)
    patch_me(app.test_client(), board_tracker, world.member, {"name": "Only Mia"})
    assert user_row(app, world.kanban.admin.id) == admin_before
