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
    """Purge due player data and permanently delete scheduled accounts."""

    while True:
        try:
            gateway = SupabaseGateway(settings)
            player_result = await gateway.purge_deactivated_players()
            account_result = await gateway.purge_due_accounts()

            if (
                player_result["purged_players"]
                or player_result["deleted_profile_images"]
                or account_result["deleted_accounts"]
                or account_result["failed_accounts"]
                or account_result["deleted_account_profile_images"]
            ):
                logger.info(
                    (
                        "Data retention completed: %s players purged, "
                        "%s player profile images deleted, %s accounts deleted, "
                        "%s account deletions failed, %s account-owned profile images deleted."
                    ),
                    player_result["purged_players"],
                    player_result["deleted_profile_images"],
                    account_result["deleted_accounts"],
                    account_result["failed_accounts"],
                    account_result["deleted_account_profile_images"],
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Data retention failed; it will retry in one hour.")

        await asyncio.sleep(interval_seconds)
