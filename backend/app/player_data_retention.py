from __future__ import annotations

import asyncio
import logging

from .config import Settings
from .supabase_gateway import SupabaseGateway


logger = logging.getLogger(__name__)


async def run_player_data_retention_loop(
    settings: Settings,
    interval_seconds: int = 60 * 60,
) -> None:
    """Purge due player data and retry profile-image cleanup every hour."""

    while True:
        try:
            result = await SupabaseGateway(settings).purge_deactivated_players()
            if result["purged_players"] or result["deleted_profile_images"]:
                logger.info(
                    "Player data retention completed: %s players purged, %s profile images deleted.",
                    result["purged_players"],
                    result["deleted_profile_images"],
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Player data retention failed; it will retry in one hour.")

        await asyncio.sleep(interval_seconds)
