"""Import every model so `db.metadata` is complete for Alembic and the tests (DB01)."""

from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.board_event import BoardEvent
from app.models.board_member import BoardMember
from app.models.card import Card
from app.models.card_comment import CardComment
from app.models.notification import Notification
from app.models.revoked_token import RevokedToken
from app.models.user import User

__all__ = [
    "Board",
    "BoardColumn",
    "BoardEvent",
    "BoardMember",
    "Card",
    "CardComment",
    "Notification",
    "RevokedToken",
    "User",
]
