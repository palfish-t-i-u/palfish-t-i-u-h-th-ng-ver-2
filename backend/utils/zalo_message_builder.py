"""Zalo Message Builder utility."""

import logging
from datetime import datetime
from typing import Any
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

from utils.team_mapper import get_canonical_team

logger = logging.getLogger(__name__)
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

def _format_vnd(amount: Any) -> str:
    """Format money as VND."""
    try:
        val = int(amount)
        return f"{val:,.0f}đ"
    except (ValueError, TypeError):
        return "0đ"

def _format_time(dt: Any) -> str:
    """Format time string safely with UTC+7 adjustment."""
    if not dt:
        return "N/A"
    try:
        if isinstance(dt, str):
            # Parse common ISO formats
            dt_obj = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        elif isinstance(dt, datetime):
            dt_obj = dt
        else:
            return "N/A"
            
        # Ensure it has a timezone (assume UTC if naive)
        if dt_obj.tzinfo is None:
            dt_obj = dt_obj.replace(tzinfo=ZoneInfo("UTC"))
            
        # Cast to Asia/Ho_Chi_Minh
        vn_time = dt_obj.astimezone(VN_TZ)
        return vn_time.strftime("%d/%m/%Y %H:%M")
    except Exception as e:
        logger.warning(f"Failed to parse time {dt}: {e}")
        return "N/A"

def build_payment_paid_message(payment_line_data: dict, sale_info: dict) -> dict[str, str]:
    """
    Builds the Zalo message for a paid payment line.
    Expected format: 💰 PAID — KH {customer} | {amount}đ | sale {sale_name} | {method} | {time}
    """
    if not payment_line_data:
        payment_line_data = {}
    if not sale_info:
        logger.warning("Missing sale_info, falling back to empty values.")
        sale_info = {}
        
    pl_id = payment_line_data.get('id', 'Unknown')
    pr_id = payment_line_data.get('payment_request_id', 'Unknown')

    # Extract customer
    customer = payment_line_data.get('customer_name')
    if not customer:
        logger.warning(f"Missing customer_name for payment {pl_id}, falling back to 'Unknown'")
        customer = "Unknown"

    # Extract amount
    raw_amount = payment_line_data.get('amount')
    if raw_amount is None:
        logger.warning(f"Missing amount for payment {pl_id}, falling back to 0")
        raw_amount = 0
    amount_str = _format_vnd(raw_amount)

    # Extract sale name
    sale_name = sale_info.get('crm_name')
    if not sale_name:
        logger.warning(f"Missing sale_name for PR {pr_id}, falling back to 'Unknown'")
        sale_name = "Unknown"

    # Extract method
    method = payment_line_data.get('method')
    if not method:
        logger.warning(f"Missing method for payment {pl_id}, falling back to 'Unknown'")
        method = "Unknown"

    # Extract time
    paid_at = payment_line_data.get('paid_at')
    if not paid_at:
        logger.warning(f"Missing paid_at for payment {pl_id}, falling back to 'N/A'")
    time_str = _format_time(paid_at)

    message = f"💰 PAID — KH {customer} | {amount_str} | sale {sale_name} | {method} | {time_str}"
    
    raw_team = sale_info.get('team')
    canonical_team = get_canonical_team(raw_team)

    return {
        "message": message,
        "canonical_team_code": canonical_team
    }

def build_course_activated_message(active_request_data: dict, sale_info: dict) -> dict[str, str]:
    """
    Builds the Zalo message for a course activation.
    Expected format: ✅ KÍCH HOẠT — KH {customer} | gói {package} | sale {sale_name}
    """
    if not active_request_data:
        active_request_data = {}
    if not sale_info:
        logger.warning("Missing sale_info, falling back to empty values.")
        sale_info = {}

    req_id = active_request_data.get('id', 'Unknown')

    # Extract customer
    customer = active_request_data.get('customer_name')
    if not customer:
        logger.warning(f"Missing customer_name for activation {req_id}, falling back to 'Unknown'")
        customer = "Unknown"

    # Extract package
    package = active_request_data.get('package_name')
    if not package:
        logger.warning(f"Missing package_name for activation {req_id}, falling back to 'Unknown'")
        package = "Unknown"

    # Extract sale name
    sale_name = sale_info.get('crm_name')
    if not sale_name:
        logger.warning(f"Missing sale_name for activation {req_id}, falling back to 'Unknown'")
        sale_name = "Unknown"

    message = f"✅ KÍCH HOẠT — KH {customer} | gói {package} | sale {sale_name}"

    raw_team = sale_info.get('team')
    canonical_team = get_canonical_team(raw_team)

    return {
        "message": message,
        "canonical_team_code": canonical_team
    }
