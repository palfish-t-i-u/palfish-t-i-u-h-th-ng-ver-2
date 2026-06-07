"""Shared payment business rules (no FastAPI deps)."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

GMV_EXCHANGE_RATE = Decimal(os.getenv("GMV_EXCHANGE_RATE", "3700"))
GMV_CUTOFF = datetime(2026, 6, 1, tzinfo=timezone.utc)


def compute_gmv_final(
    pay_time: datetime,
    real_pay_vnd: Decimal,
    gmv_rmb: Decimal | None,
) -> Decimal:
    """Trước 01/06/2026 dùng gmv_rmb; từ 01/06 dùng VND/tỷ giá."""
    pt = pay_time
    if pt.tzinfo is None:
        pt = pt.replace(tzinfo=timezone.utc)
    if pt < GMV_CUTOFF:
        return (gmv_rmb or Decimal(0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if GMV_EXCHANGE_RATE == 0:
        return Decimal(0)
    return (real_pay_vnd / GMV_EXCHANGE_RATE).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
