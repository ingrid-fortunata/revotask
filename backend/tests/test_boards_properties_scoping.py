"""Parameterized tests for boards-membership Properties 15, 16 and 17 (task 2.18).

Each test runs over an enumerated fixture matrix from `design.md`. The matrices are fixed lists of
parameters, so every run checks the same cases and no random generator is used (R8). Every row a
test creates goes through `board_tracker`, which removes it afterward, even when an assertion
fails. The app is built from TEST_DATABASE_URL through the conftest fixtures.

Guideline BE07 applies: each test checks the response, the authorization outcome and the resulting
database state.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

import pytest
from sqlalchemy import select, update

from app.extensions import db
from app.models.base import utcnow
from app.models.board import Board
from app.models.board_member import BoardMember
from app.models.card import Card
from tests.auth_helpers import bearer, unique_email


@pytest.fixture
def client(app, schema_at_head):
    return app.test_client()


def _auth(board_tracker, user_id: uuid.UUID) -> dict[str, str]:
    return bearer(board_tracker.token_for(user_id))


def _outcome(response) -> str | None:
    """The error code of a failed response, or None for a success envelope."""
    body = response.get_json()
    return body["error"]["code"] if "error" in body else None


def _soft_delete_card(app, card_id: uuid.UUID) -> None:
    with app.app_context():
        try:
            db.session.execute(update(Card).where(Card.id == card_id).values(deleted_at=utcnow()))
            db.session.commit()
        finally:
            db.session.remove()


def _card_states(
    app, card_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[uuid.UUID | None, object]]:
    """Each card as (assignee_id, deleted_at), read from the database in a fresh session."""
    with app.app_context():
        try:
            rows = db.session.execute(
                select(Card.id, Card.assignee_id, Card.deleted_at).where(Card.id.in_(card_ids))
            ).all()
            return {row.id: (row.assignee_id, row.deleted_at) for row in rows}
        finally:
            db.session.remove()


def _membership_deleted_at(app, board_id: uuid.UUID, user_id: uuid.UUID):
    with app.app_context():
        try:
            return db.session.scalar(
                select(BoardMember.deleted_at).where(
                    BoardMember.board_id == board_id, BoardMember.user_id == user_id
                )
            )
        finally:
            db.session.remove()


def _snapshot(app, board_id: uuid.UUID) -> tuple[str, object, list[tuple]]:
    """Board name, board `deleted_at` and every membership as (user, role, deleted_at)."""
    with app.app_context():
        try:
            name, deleted_at = db.session.execute(
                select(Board.name, Board.deleted_at).where(Board.id == board_id)
            ).one()
            rows = db.session.execute(
                select(BoardMember.user_id, BoardMember.role, BoardMember.deleted_at)
                .where(BoardMember.board_id == board_id)
                .order_by(BoardMember.user_id)
            ).all()
            return name, deleted_at, [tuple(row) for row in rows]
        finally:
            db.session.remove()


# ---------------------------------------------------------------------------
# Property 15: Removal clears only this board's assignments
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Arrangement:
    """How many cards of each kind a test seeds. Every count is a number of rows."""

    # Active, assigned to the removed user, on the board the user is removed from.
    target_on_board: int = 0
    # Soft-deleted, assigned to the removed user, on the board the user is removed from.
    target_deleted_on_board: int = 0
    # Active, assigned to the removed user, on another board where the user stays a member.
    target_other_board: int = 0
    # Active, assigned to the removed user, on a board the user never joined.
    target_unlinked_board: int = 0
    # Active, assigned to another member of the removed board.
    other_user_on_board: int = 0
    # Active, assigned to another member of the other board.
    other_user_other_board: int = 0
    # Active, assigned to the board admin.
    admin_on_board: int = 0
    # Active, with no assignee.
    unassigned_on_board: int = 0


ARRANGEMENTS = [
    pytest.param(
        Arrangement(
            target_on_board=2,
            target_deleted_on_board=1,
            target_other_board=1,
            other_user_on_board=1,
            other_user_other_board=1,
            admin_on_board=1,
        ),
        id="design-two-board-example",
    ),
    pytest.param(
        Arrangement(target_other_board=3, target_unlinked_board=2, other_user_other_board=2),
        id="no-active-cards-on-removed-board",
    ),
    pytest.param(
        Arrangement(target_deleted_on_board=2, target_other_board=1),
        id="only-soft-deleted-cards-on-removed-board",
    ),
    pytest.param(Arrangement(target_on_board=1), id="single-card-on-removed-board"),
    pytest.param(
        Arrangement(
            target_on_board=5,
            target_deleted_on_board=1,
            target_other_board=3,
            target_unlinked_board=1,
            other_user_on_board=2,
            other_user_other_board=2,
            admin_on_board=2,
            unassigned_on_board=2,
        ),
        id="many-cards-of-every-kind",
    ),
    pytest.param(
        Arrangement(other_user_on_board=2, unassigned_on_board=1, admin_on_board=1),
        id="removed-user-has-no-cards",
    ),
    pytest.param(Arrangement(), id="no-cards-at-all"),
]


@dataclass
class RemovalSeed:
    """Boards, members and card groups for one Property 15 case.

    `groups` maps each Arrangement field name to the card IDs seeded for that field.
    """

    admin_id: uuid.UUID
    target_id: uuid.UUID
    other_id: uuid.UUID
    board_id: uuid.UUID
    other_board_id: uuid.UUID
    groups: dict[str, list[uuid.UUID]] = field(default_factory=dict)


def _seed_removal(board_tracker, app, counts: Arrangement) -> RemovalSeed:
    """Create two boards the target shares, one board they never joined, and the seeded cards.

    The board being removed from has two columns. The other board has two columns. The unlinked
    board has one column.
    """
    admin = board_tracker.make_user(name="P15 admin")
    target = board_tracker.make_user(name="P15 removed member")
    other = board_tracker.make_user(name="P15 other member")
    board = board_tracker.make_board(admin.id, name="P15 removal board")
    other_board = board_tracker.make_board(admin.id, name="P15 other board")
    unlinked = board_tracker.make_board(other.id, name="P15 unlinked board")

    board_tracker.make_membership(board, admin.id, "admin")
    board_tracker.make_membership(board, target.id, "member")
    board_tracker.make_membership(board, other.id, "member")
    board_tracker.make_membership(other_board, admin.id, "admin")
    board_tracker.make_membership(other_board, target.id, "member")
    board_tracker.make_membership(other_board, other.id, "member")
    board_tracker.make_membership(unlinked, other.id, "admin")

    board_columns = [
        board_tracker.make_column(board, "Todo", 1.0),
        board_tracker.make_column(board, "Doing", 2.0),
    ]
    other_columns = [
        board_tracker.make_column(other_board, "Todo", 1.0),
        board_tracker.make_column(other_board, "Doing", 2.0),
    ]
    unlinked_columns = [board_tracker.make_column(unlinked, "Todo", 1.0)]

    plan = {
        "target_on_board": (counts.target_on_board, board_columns, target.id),
        "target_deleted_on_board": (counts.target_deleted_on_board, board_columns, target.id),
        "target_other_board": (counts.target_other_board, other_columns, target.id),
        "target_unlinked_board": (counts.target_unlinked_board, unlinked_columns, target.id),
        "other_user_on_board": (counts.other_user_on_board, board_columns, other.id),
        "other_user_other_board": (counts.other_user_other_board, other_columns, other.id),
        "admin_on_board": (counts.admin_on_board, board_columns, admin.id),
        "unassigned_on_board": (counts.unassigned_on_board, board_columns, None),
    }
    seed = RemovalSeed(
        admin_id=admin.id,
        target_id=target.id,
        other_id=other.id,
        board_id=board,
        other_board_id=other_board,
    )
    for group, (count, columns, assignee_id) in plan.items():
        seed.groups[group] = []
        for index in range(count):
            card_id = board_tracker.make_card(
                columns[index % len(columns)],
                title=f"{group} {index}",
                assignee_id=assignee_id,
                order=float(index + 1),
            )
            seed.groups[group].append(card_id)
    for card_id in seed.groups["target_deleted_on_board"]:
        _soft_delete_card(app, card_id)
    return seed


@pytest.mark.parametrize("counts", ARRANGEMENTS)
def test_property_15_removal_clears_only_this_boards_active_assignments(
    client, board_tracker, app, counts
):
    """Feature: boards-membership, Property 15: Removal clears only this board's assignments.

    **Validates: Requirements 5.1, 5.9**
    """
    seed = _seed_removal(board_tracker, app, counts)
    all_card_ids = [card_id for ids in seed.groups.values() for card_id in ids]
    before = _card_states(app, all_card_ids)

    response = client.delete(
        f"/api/boards/{seed.board_id}/members/{seed.target_id}",
        headers=_auth(board_tracker, seed.admin_id),
    )

    assert response.status_code == 200
    assert response.get_json() == {"data": None}
    # Only the target's active cards on the removed board change, and they become unassigned.
    # Their deleted_at values stay the same. Every other card keeps its assignee and deleted_at.
    expected = dict(before)
    for card_id in seed.groups["target_on_board"]:
        expected[card_id] = (None, before[card_id][1])
    assert _card_states(app, all_card_ids) == expected
    # The membership on the removed board is soft-deleted. The target's membership on the other
    # board, the other member's membership and the admin's membership are untouched.
    assert _membership_deleted_at(app, seed.board_id, seed.target_id) is not None
    assert _membership_deleted_at(app, seed.other_board_id, seed.target_id) is None
    assert _membership_deleted_at(app, seed.board_id, seed.other_id) is None
    assert _membership_deleted_at(app, seed.board_id, seed.admin_id) is None


# ---------------------------------------------------------------------------
# Property 16: Request order of authentication, validation and authorization
# ---------------------------------------------------------------------------

CALLERS = ("anonymous", "nonmember", "member", "admin")
BOARD_KINDS = ("existing", "missing")

INVALID_BODY_CASES = [
    pytest.param("E08", "empty-object", id="E08-empty-object"),
    pytest.param("E08", "blank-name", id="E08-blank-name"),
    pytest.param("E08", "name-too-long", id="E08-name-too-long"),
    pytest.param("E08", "unknown-field", id="E08-unknown-field"),
    pytest.param("E08", "not-an-object", id="E08-not-an-object"),
    pytest.param("E11", "empty-object", id="E11-empty-object"),
    pytest.param("E11", "malformed-email", id="E11-malformed-email"),
    pytest.param("E11", "null-email", id="E11-null-email"),
    pytest.param("E11", "registered-email-unknown-field", id="E11-registered-email-unknown-field"),
    pytest.param("E11", "not-an-object", id="E11-not-an-object"),
]

VALID_BODY_CASES = [
    pytest.param("E08", None, id="E08-rename"),
    pytest.param("E11", "unregistered", id="E11-unregistered-email"),
    pytest.param("E11", "registered", id="E11-registered-email"),
]


@dataclass
class RequestSeed:
    """One board with an admin and a member, plus a nonmember and a registered user."""

    board_id: uuid.UUID
    admin_id: uuid.UUID
    member_id: uuid.UUID
    nonmember_id: uuid.UUID
    registered_id: uuid.UUID
    registered_email: str


def _seed_request_order(board_tracker) -> RequestSeed:
    admin = board_tracker.make_user(name="P16 admin")
    member = board_tracker.make_user(name="P16 member")
    nonmember = board_tracker.make_user(name="P16 nonmember")
    registered_email = unique_email("p16-registered")
    registered = board_tracker.make_user(email=registered_email, name="P16 registered")
    board_id = board_tracker.make_board(admin.id, name="P16 board")
    board_tracker.make_membership(board_id, admin.id, "admin")
    board_tracker.make_membership(board_id, member.id, "member")
    return RequestSeed(
        board_id=board_id,
        admin_id=admin.id,
        member_id=member.id,
        nonmember_id=nonmember.id,
        registered_id=registered.id,
        registered_email=registered_email,
    )


def _caller_headers(board_tracker, seed: RequestSeed, caller: str) -> dict[str, str]:
    """Headers for one caller. The anonymous caller sends no Authorization header."""
    user_id = {
        "nonmember": seed.nonmember_id,
        "member": seed.member_id,
        "admin": seed.admin_id,
    }.get(caller)
    if user_id is None:
        return {}
    return bearer(board_tracker.token_for(user_id))


def _target_board_id(seed: RequestSeed, board_kind: str) -> uuid.UUID:
    return seed.board_id if board_kind == "existing" else uuid.uuid4()


def _send(client, endpoint: str, board_id: uuid.UUID, headers: dict[str, str], body):
    if endpoint == "E08":
        return client.patch(f"/api/boards/{board_id}", json=body, headers=headers)
    return client.post(f"/api/boards/{board_id}/members", json=body, headers=headers)


def _invalid_body(endpoint: str, kind: str, registered_email: str):
    """Bodies that fail schema validation. The registered-email case proves that a real email
    does not skip validation or reach a lookup."""
    bodies = {
        ("E08", "empty-object"): {},
        ("E08", "blank-name"): {"name": "   "},
        ("E08", "name-too-long"): {"name": "x" * 101},
        ("E08", "unknown-field"): {"name": "P16 valid", "role": "admin"},
        ("E08", "not-an-object"): ["P16 valid"],
        ("E11", "empty-object"): {},
        ("E11", "malformed-email"): {"email": "not-an-email"},
        ("E11", "null-email"): {"email": None},
        ("E11", "registered-email-unknown-field"): {"email": registered_email, "role": "admin"},
        ("E11", "not-an-object"): [registered_email],
    }
    return bodies[(endpoint, kind)]


def _valid_body(endpoint: str, email_kind: str | None, seed: RequestSeed):
    if endpoint == "E08":
        return {"name": "P16 renamed"}
    email = seed.registered_email if email_kind == "registered" else unique_email("p16-missing")
    return {"email": email}


def _expected_valid_outcome(
    endpoint: str, caller: str, board_kind: str, email_kind: str | None
) -> tuple[int, str | None]:
    """The status and error code that Property 16 requires for a valid body."""
    if caller == "anonymous":
        return 401, "AUTH_REQUIRED"
    if board_kind == "missing" or caller == "nonmember":
        return 404, "NOT_FOUND"
    if caller == "member":
        return 403, "FORBIDDEN"
    # The caller is an admin of the existing board.
    if endpoint == "E08":
        return 200, None
    if email_kind == "unregistered":
        return 404, "USER_NOT_FOUND"
    return 201, None


@pytest.mark.parametrize("caller", CALLERS)
@pytest.mark.parametrize("board_kind", BOARD_KINDS)
@pytest.mark.parametrize(("endpoint", "kind"), INVALID_BODY_CASES)
def test_property_16_invalid_body_is_rejected_before_any_board_or_user_lookup(
    client, board_tracker, app, endpoint, kind, board_kind, caller
):
    """Feature: boards-membership, Property 16: Request order of authentication,
    validation and authorization.

    **Validates: Requirements 4.5, 4.6, 7.9**
    """
    seed = _seed_request_order(board_tracker)
    before = _snapshot(app, seed.board_id)
    body = _invalid_body(endpoint, kind, seed.registered_email)

    response = _send(
        client,
        endpoint,
        _target_board_id(seed, board_kind),
        _caller_headers(board_tracker, seed, caller),
        body,
    )

    if caller == "anonymous":
        assert response.status_code == 401
        assert _outcome(response) == "AUTH_REQUIRED"
    else:
        assert response.status_code == 400
        assert _outcome(response) == "VALIDATION_ERROR"
    assert _snapshot(app, seed.board_id) == before


@pytest.mark.parametrize("caller", CALLERS)
@pytest.mark.parametrize("board_kind", BOARD_KINDS)
@pytest.mark.parametrize(("endpoint", "email_kind"), VALID_BODY_CASES)
def test_property_16_valid_body_is_authorized_against_the_board(
    client, board_tracker, app, endpoint, email_kind, board_kind, caller
):
    """Feature: boards-membership, Property 16: Request order of authentication,
    validation and authorization.

    **Validates: Requirements 4.5, 4.6, 7.9**
    """
    seed = _seed_request_order(board_tracker)
    before = _snapshot(app, seed.board_id)
    body = _valid_body(endpoint, email_kind, seed)
    expected_status, expected_code = _expected_valid_outcome(
        endpoint, caller, board_kind, email_kind
    )

    response = _send(
        client,
        endpoint,
        _target_board_id(seed, board_kind),
        _caller_headers(board_tracker, seed, caller),
        body,
    )

    assert response.status_code == expected_status
    assert _outcome(response) == expected_code
    # USER_NOT_FOUND may only reach an admin of the target board.
    if expected_code == "USER_NOT_FOUND":
        assert caller == "admin" and board_kind == "existing"

    after = _snapshot(app, seed.board_id)
    if expected_status >= 400:
        assert after == before
    elif endpoint == "E08":
        assert after[0] == body["name"]
    else:
        assert (seed.registered_id, "member", None) in after[2]


# ---------------------------------------------------------------------------
# Property 17: Duplicate board names are accepted
# ---------------------------------------------------------------------------

NAME_CASES = [
    pytest.param("Sprint", id="plain"),
    pytest.param("  Sprint  ", id="padded-trims-to-plain-name"),
    pytest.param("A", id="one-character"),
    pytest.param("x" * 100, id="one-hundred-characters"),
    pytest.param("Équipe Ω café", id="non-ascii"),
    pytest.param("Team  Board 2", id="internal-double-space"),
]


def _create_board(client, board_tracker, user_id: uuid.UUID, name: str) -> uuid.UUID:
    """Create a board through E06 as `user_id` and return its tracked ID."""
    response = client.post(
        "/api/boards", json={"name": name}, headers=_auth(board_tracker, user_id)
    )
    return board_tracker.record_board_from_response(response)


@pytest.mark.parametrize("owner_kind", ["same-owner", "other-owner"])
@pytest.mark.parametrize("name", NAME_CASES)
def test_property_17_create_accepts_a_name_an_active_board_already_uses(
    client, board_tracker, name, owner_kind
):
    """Feature: boards-membership, Property 17: Duplicate board names are accepted.

    **Validates: Requirements 1.9**
    """
    owner = board_tracker.make_user(name="P17 owner")
    existing_owner = (
        owner if owner_kind == "same-owner" else board_tracker.make_user(name="P17 other")
    )
    existing_id = _create_board(client, board_tracker, existing_owner.id, name)

    response = client.post(
        "/api/boards", json={"name": name}, headers=_auth(board_tracker, owner.id)
    )

    assert response.status_code == 201
    created = response.get_json()["data"]
    board_tracker.board_ids.append(uuid.UUID(created["id"]))
    assert created["name"] == name.strip()
    assert created["role"] == "admin"
    assert uuid.UUID(created["id"]) != existing_id


@pytest.mark.parametrize("name", NAME_CASES)
def test_property_17_rename_accepts_a_name_another_active_board_already_uses(
    client, board_tracker, name
):
    """Feature: boards-membership, Property 17: Duplicate board names are accepted.

    **Validates: Requirements 1.9**
    """
    owner = board_tracker.make_user(name="P17 owner")
    other = board_tracker.make_user(name="P17 other")
    _create_board(client, board_tracker, other.id, name)
    board_id = _create_board(client, board_tracker, owner.id, "P17 original name")

    response = client.patch(
        f"/api/boards/{board_id}",
        json={"name": name},
        headers=_auth(board_tracker, owner.id),
    )

    assert response.status_code == 200
    renamed = response.get_json()["data"]
    assert renamed["name"] == name.strip()
    assert renamed["role"] == "admin"


@pytest.mark.parametrize("name", NAME_CASES)
def test_property_17_list_orders_same_named_boards_of_the_caller_by_id(client, board_tracker, name):
    """Feature: boards-membership, Property 17: Duplicate board names are accepted.

    **Validates: Requirements 1.9, 1.3**
    """
    owner = board_tracker.make_user(name="P17 owner")
    other = board_tracker.make_user(name="P17 other")
    first = _create_board(client, board_tracker, owner.id, name)
    second = _create_board(client, board_tracker, owner.id, name)
    renamed = _create_board(client, board_tracker, owner.id, "P17 to rename")
    rename = client.patch(
        f"/api/boards/{renamed}",
        json={"name": name},
        headers=_auth(board_tracker, owner.id),
    )
    assert rename.status_code == 200
    # A board with the same name owned by someone else must not appear in the owner's list.
    _create_board(client, board_tracker, other.id, name)

    response = client.get("/api/boards", headers=_auth(board_tracker, owner.id))

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert [board["name"] for board in data] == [name.strip()] * 3
    assert [uuid.UUID(board["id"]) for board in data] == sorted([first, second, renamed])
