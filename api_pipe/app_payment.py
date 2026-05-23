# app_payment.py
import os
import re
import datetime
import httpx
from typing import Any
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env", override=True)

def _supabase():
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        return None
    try:
        from supabase import create_client
        return create_client(url, key)
    except Exception as exc:
        print(f"Lỗi khởi tạo Supabase: {exc}")
        return None

def _parse_amount(value: Any) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    digits = re.sub(r"\D", "", str(value or ""))
    return int(digits) if digits else 0

app = FastAPI(title="PalFish Gate Pipeline - PayOS Verified")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_APP_URL = os.getenv("BACKEND_APP_URL", "http://localhost:8000")

@app.post("/webhook/payos")
async def receive_payos_webhook(request: Request):
    try:
        payload = await request.json()
        data = payload.get("data", {})
        
        if not data:
            return {"error": 1, "message": "Không có dữ liệu Payload"}
        
        order_code = data.get("orderCode")
        amount = data.get("amount")
        description = data.get("description", "")
        
        clean_description = description.replace('\xa0', ' ').strip()
        
        ma_don_raw = None
        info_code = clean_description
        
        match = re.search(r'(KH|DH)\s*\d+', clean_description, re.IGNORECASE)
        if match:
            ma_don_raw = match.group(0).replace(" ", "").upper()
            info_code = f"Thanh toan {ma_don_raw}"

        sb = _supabase()
        don_hang_id = None
        trang_thai_doi_soat = "CHUA_XU_LY"
        trang_thai_hien_thi = "🔴 Chưa xử lý"
        
        if sb:
            try:
                # --- ĐÃ SỬA: TÌM XUYÊN THẤU BẰNG CỘT info_code ---
                if ma_don_raw:
                    don_hang_resp = sb.table("don_hang").select("*").ilike("info_code", f"%{ma_don_raw}%").execute()
                else:
                    don_hang_resp = sb.table("don_hang").select("*").eq("info_code", info_code).execute()
                
                if don_hang_resp.data and len(don_hang_resp.data) > 0:
                    don_hang_data = don_hang_resp.data[0]
                    don_hang_id = don_hang_data["id"]
                    
                    so_tien_can_thu = _parse_amount(don_hang_data.get("so_tien_can_thu", 0))
                    so_tien_nhan_duoc = _parse_amount(amount)
                    
                    if so_tien_nhan_duoc >= so_tien_can_thu:
                        trang_thai_doi_soat = "DA_KHOP"
                        trang_thai_hien_thi = "🟢 Đã khớp (Thành công)"
                        sb.table("don_hang").update({
                            "tien_ve": True,
                            "trang_thai": "da_thanh_toan"
                        }).eq("id", don_hang_id).execute()
                    else:
                        trang_thai_doi_soat = "SAI_SO_TIEN"
                        trang_thai_hien_thi = f"⚠️ Sai số tiền (Cần: {so_tien_can_thu:,}đ)"
                else:
                    trang_thai_hien_thi = "❌ Sai / Thiếu mã đơn (Không có trong DB)"
            except Exception as e:
                print(f"❌ Luồng kiểm tra Supabase gặp sự cố: {e}")
                trang_thai_hien_thi = f"⚠️ Lỗi DB: {e}"

        if sb:
            try:
                thoi_gian_gd = datetime.datetime.now(datetime.timezone.utc).isoformat()
                sb.table("giao_dich").insert({
                    "ma_giao_dich_bank": str(order_code),
                    "so_tien_nhan": int(amount),
                    "noi_dung_chuyen_khoan": description,
                    "info_code_thuc_te": info_code,
                    "thoi_gian_giao_dich": thoi_gian_gd,
                    "trang_thai_doi_soat": trang_thai_doi_soat,
                    "don_hang_id": don_hang_id
                }).execute()
            except Exception as e:
                print(f"❌ Lỗi ghi log lịch sử giao_dich: {e}")

        now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        amount_formatted = f"{int(amount):,} VND"

        print("\n" + "="*90)
        print("📊 [KẾT QUẢ ĐỐI SOÁT BIẾN ĐỘNG SỐ DƯ REAL-TIME]")
        print("="*90)
        print(f"| Thời gian | Số tiền | Nội dung chuyển khoản | Mã GD | Trạng thái |")
        print(f"| :--- | :--- | :--- | :--- | :--- |")
        print(f"| {now_str} | {amount_formatted} | {description} | {order_code} | {trang_thai_hien_thi} |")
        print("="*90 + "\n")

       

        return {"error": 0, "message": "Xử lý thành công"}

    except Exception as e:
        print(f"❌ LỖI HỆ THỐNG: {e}")
        return {"error": 1, "message": str(e)}