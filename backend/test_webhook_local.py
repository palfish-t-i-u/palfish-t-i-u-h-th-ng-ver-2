import hashlib
import hmac
import time
import urllib.request
import urllib.error
import os

def load_env():
    # Đọc file .env ở thư mục backend hoặc root
    backend_dir = os.path.dirname(__file__)
    env_path = os.path.join(backend_dir, ".env")
    if not os.path.exists(env_path):
        env_path = os.path.join(backend_dir, ".env.example")
    
    env = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    return env

def main():
    env = load_env()
    secret = env.get("SEPAY_WEBHOOK_SECRET", "").strip()
    print(f"Loaded SEPAY_WEBHOOK_SECRET: '{secret}'")

    url = "http://localhost:8000/webhook/sepay"
    timestamp = str(int(time.time()))
    
    # Payload mẫu giao dịch chuyển khoản thành công có nội dung FHB9T (mã test)
    payload_data = """{
        "id": 123456789,
        "gateway": "MBBank",
        "transactionDate": "2026-06-13 15:30:00",
        "accountNumber": "0123456789",
        "subAccount": null,
        "transferType": "in",
        "transferAmount": 5000000,
        "accumulated": 150000000,
        "code": null,
        "content": "84989778983 Minh FHB9T",
        "referenceCode": "FT26164ABC",
        "description": "84989778983 Minh FHB9T"
    }"""
    
    # Tính toán chữ ký HMAC-SHA256 theo chuẩn SePay
    msg = timestamp.encode("utf-8") + b"." + payload_data.encode("utf-8")
    sig_hex = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    signature = f"sha256={sig_hex}"

    headers = {
        "Content-Type": "application/json",
        "X-SePay-Signature": signature,
        "X-SePay-Timestamp": timestamp
    }

    print(f"Sending POST request to {url}...")
    print(f"Headers: {headers}")
    print(f"Payload: {payload_data}")
    
    req = urllib.request.Request(
        url, 
        data=payload_data.encode("utf-8"), 
        headers=headers,
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            status_code = response.status
            body = response.read().decode("utf-8")
            print("\n=== RESPONSE FROM SERVER ===")
            print(f"Status Code: {status_code}")
            print(f"Response Body: {body}")
    except urllib.error.HTTPError as e:
        print("\n=== RESPONSE FROM SERVER (ERROR) ===")
        print(f"HTTP Status: {e.code}")
        print(f"Error Body: {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"\nConnection failed: {e}")
        print("-> Bạn đã khởi động backend FastAPI chưa? Chạy 'cd backend && uvicorn main:app --reload' trước nhé.")

if __name__ == "__main__":
    main()
