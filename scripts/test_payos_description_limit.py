"""
Test giới hạn ký tự description PayOS.

Cách chạy:
    cd backend
    python ../scripts/test_payos_description_limit.py

Script sẽ tạo payment link với description dài dần (10, 15, 20, 25, 30, 40, 50 ký tự)
rồi cancel ngay — không ảnh hưởng giao dịch thật.

Yêu cầu: backend/.env phải có PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY
"""

import hashlib
import hmac
import os
import random
import sys
import time

import httpx
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api_pipe", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"), override=True)

CLIENT_ID = os.getenv("PAYOS_CLIENT_ID", "").strip()
API_KEY = os.getenv("PAYOS_API_KEY", "").strip()
CHECKSUM_KEY = os.getenv("PAYOS_CHECKSUM_KEY", "").strip()

if not all([CLIENT_ID, API_KEY, CHECKSUM_KEY]):
    print("ERROR: Thieu PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY trong .env")
    sys.exit(1)

HEADERS = {
    "x-client-id": CLIENT_ID,
    "x-api-key": API_KEY,
    "Content-Type": "application/json",
}

TEST_LENGTHS = [9, 15, 20, 25, 30, 40, 50]
AMOUNT = 2000
RETURN_URL = "https://palfish-gmv-manager.vercel.app/"


def make_description(length: int) -> str:
    base = "4912 BeHa TT00200100000000000000000000000000000000"
    return base[:length]


def sign(amount: int, cancel_url: str, description: str, order_code: int, return_url: str) -> str:
    raw = f"amount={amount}&cancelUrl={cancel_url}&description={description}&orderCode={order_code}&returnUrl={return_url}"
    return hmac.new(CHECKSUM_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()


def cancel_link(order_code: int):
    try:
        httpx.post(
            f"https://api-merchant.payos.vn/v2/payment-requests/{order_code}/cancel",
            json={"cancellationReason": "test limit"},
            headers=HEADERS,
            timeout=10,
        )
    except Exception:
        pass


def test_description(length: int) -> dict:
    desc = make_description(length)
    order_code = (int(time.time() * 1000) * 1000 + random.randint(0, 999)) % 9_007_199_254_740_991

    payload = {
        "orderCode": order_code,
        "amount": AMOUNT,
        "description": desc,
        "returnUrl": RETURN_URL,
        "cancelUrl": RETURN_URL,
        "signature": sign(AMOUNT, RETURN_URL, desc, order_code, RETURN_URL),
    }

    try:
        resp = httpx.post(
            "https://api-merchant.payos.vn/v2/payment-requests",
            json=payload,
            headers=HEADERS,
            timeout=15,
        )
        data = resp.json()
        success = data.get("code") == "00"
        result = {
            "length": length,
            "description": desc,
            "success": success,
            "code": data.get("code"),
            "message": data.get("desc") or data.get("message", ""),
        }
        if success:
            cancel_link(order_code)
        return result
    except Exception as e:
        return {"length": length, "description": desc, "success": False, "code": "error", "message": str(e)}


def main():
    print("=" * 70)
    print("Test gioi han description PayOS")
    print(f"Account: {CLIENT_ID[:8]}...")
    print("=" * 70)
    print()

    max_ok = 0
    for length in TEST_LENGTHS:
        result = test_description(length)
        status = "OK" if result["success"] else "FAIL"
        print(f"  {length:3d} ky tu  [{status}]  desc=\"{result['description']}\"")
        if not result["success"]:
            print(f"             PayOS: code={result['code']} — {result['message']}")
        else:
            max_ok = length
        time.sleep(1)

    print()
    print("-" * 70)
    if max_ok > 0:
        print(f"KET QUA: Description toi da {max_ok} ky tu (trong cac muc test {TEST_LENGTHS})")
        if max_ok >= 40:
            print("=> Format day du SĐT + ten + ma TT kha thi!")
        elif max_ok >= 25:
            print("=> Can rut gon SĐT hoac ten")
        else:
            print(f"=> Chi {max_ok} ky tu — rat han che")
    else:
        print("KET QUA: Tat ca deu fail — kiem tra credentials")


if __name__ == "__main__":
    main()
