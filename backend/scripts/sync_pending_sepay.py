import asyncio
import os
import sys
from pathlib import Path

# Thêm đường dẫn backend vào sys.path để có thể import các module
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_BACKEND_DIR = _REPO_ROOT / "backend"
sys.path.insert(0, str(_BACKEND_DIR))

from dotenv import load_dotenv

# Load env
load_dotenv(_REPO_ROOT / "api_pipe" / ".env")
load_dotenv(_BACKEND_DIR / ".env", override=True)

import httpx

async def run_sync():
    """
    Cronjob script: Trigger endpoint /api/v1/sepay/sync-pending
    để tự động quét giao dịch SePay bị miss từ Webhook.
    Nên chạy bằng cronjob hệ thống 5-10 phút một lần.
    """
    # Lấy URL của backend, mặc định localhost:8000
    backend_url = os.getenv("BACKEND_INTERNAL_URL", "http://localhost:8000")
    endpoint = f"{backend_url.rstrip('/')}/api/v1/sepay/sync-pending"
    
    print(f"Bắt đầu trigger Cronjob sync SePay: {endpoint}")
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                endpoint,
                # Nếu endpoint yêu cầu auth, cấu hình ở đây:
                # headers={"Authorization": f"Bearer {CRON_SECRET}"}
            )
            resp.raise_for_status()
            data = resp.json()
            
            print(f"Sync thành công!")
            print(f"- Đồng bộ mới: {data.get('synced_count', 0)}")
            print(f"- Bỏ qua (đã tồn tại): {data.get('skipped_count', 0)}")
            print(f"- Lỗi: {data.get('error_count', 0)}")
            
            if data.get("errors"):
                print("Chi tiết lỗi:", data.get("errors"))
                
    except httpx.HTTPStatusError as exc:
        print(f"Lỗi HTTP {exc.response.status_code} khi gọi endpoint: {exc.response.text}")
        sys.exit(1)
    except Exception as exc:
        print(f"Lỗi kết nối hoặc xử lý: {exc}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run_sync())
