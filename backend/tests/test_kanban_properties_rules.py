"""Feature: kanban, Properties 1, 2 and 11 over fixed and seeded tables (task 5.11).

Property 1 (Order allocation) is run as a simulation: a seeded random sequence of inserts and
rebalances must always leave a finite, positive, strictly increasing list. Property 2 (request
schemas accept exactly their field set) and Property 11 (response allowlist) run over every schema.
No property-testing library is used (Requirement 11.8).
"""

from __future__ import annotations

import random
import uuid

import pytest

from app.blueprints.boards.schema import CardSchema, ColumnSchema
from app.blueprints.cards.schema import CardCreateSchema, CardPositionSchema, CardUpdateSchema
from app.blueprints.columns.schema import (
    ColumnCreateSchema,
    ColumnPlainSchema,
    ColumnReorderSchema,
    ColumnUpdateSchema,
)
from app.positions import allocate_order, rebalanced_orders
from tests.kanban_helpers import build_body, load_cases

CASES = load_cases()


@pytest.mark.parametrize("seed", range(20))
def test_property_1_seeded_insert_sequences_keep_orders_finite_positive_and_strict(seed):
    """Feature: kanban, Property 1: Order allocation."""
    rng = random.Random(seed)
    orders: list[float] = []
    for _ in range(300):
        index = rng.randint(0, len(orders))
        # Half of the inserts go to the same spot, which exhausts precision and forces a rebalance.
        if orders and rng.random() < 0.5:
            index = min(1, len(orders))
        candidate = allocate_order(orders, index)
        if candidate is None:
            orders = rebalanced_orders(len(orders) + 1)
            continue
        orders.insert(index, candidate)
        assert all(0 < value < float("inf") for value in orders)
        assert all(low < high for low, high in zip(orders, orders[1:], strict=False)), (
            seed,
            orders[:5],
        )


SCHEMAS = {
    "column_create": ColumnCreateSchema,
    "column_update": ColumnUpdateSchema,
    "column_reorder": ColumnReorderSchema,
    "card_create": CardCreateSchema,
    "card_update": CardUpdateSchema,
    "card_position": CardPositionSchema,
}


@pytest.mark.parametrize("form", SCHEMAS)
def test_property_2_every_request_schema_rejects_an_unknown_field(form):
    """Feature: kanban, Property 2: Request schemas accept exactly their field set."""
    from marshmallow import ValidationError

    base = build_body(CASES[form], {"set": {}, "drop": []})
    for extra in ("order", "deleted_at", "board_id", "password"):
        with pytest.raises(ValidationError) as raised:
            SCHEMAS[form]().load({**base, extra: "x"})
        assert raised.value.messages == {extra: ["Unknown field."]}


@pytest.mark.parametrize("form", SCHEMAS)
def test_property_2_every_base_body_loads_with_exactly_its_keys(form):
    base = build_body(CASES[form], {"set": {}, "drop": []})
    assert set(SCHEMAS[form]().load(base)) == set(base)


RESPONSES = [
    (ColumnPlainSchema, {"id", "board_id", "name", "is_done", "order"}),
    (
        CardSchema,
        {"id", "column_id", "title", "description", "assignee_id", "assignee_name", "order"},
    ),
    (ColumnSchema, {"id", "board_id", "name", "is_done", "order", "cards"}),
]


@pytest.mark.parametrize(("schema", "keys"), RESPONSES)
def test_property_11_response_schemas_drop_every_undeclared_key(schema, keys):
    """Feature: kanban, Property 11: Response allowlist."""
    leaky = {key: uuid.uuid4() for key in keys} | {
        "deleted_at": 1,
        "email": "a@b.c",
        "password_hash": "x",
    }
    for key in ("name", "title"):
        if key in keys:
            leaky[key] = "text"
    for key in ("is_done",):
        if key in keys:
            leaky[key] = False
    for key in ("order",):
        if key in keys:
            leaky[key] = 1024.0
    for key in ("description", "assignee_id", "assignee_name"):
        if key in keys:
            leaky[key] = None
    if "cards" in keys:
        leaky["cards"] = []
    assert set(schema().dump(leaky)) == keys
