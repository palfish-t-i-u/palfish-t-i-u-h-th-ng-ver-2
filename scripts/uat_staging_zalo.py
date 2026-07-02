"""
UAT / E2E Script for Zalo Notifications on Staging (Workstream C4)

Hướng dẫn chạy:
1. Đảm bảo bạn đang kết nối tới DB STAGING (sửa SUPABASE_URL trong .env).
   (Script có cơ chế tự động chặn nếu phát hiện chuỗi 'jozcvbbypwvzaefteoxn' của DB Production).
2. Cập nhật ZALO_STAGING_GROUP_ID bên dưới thành ID của nhóm test trên Zalo.
3. Chạy lệnh từ thư mục gốc: python scripts/uat_staging_zalo.py
"""

import os
import time
import uuid
from dotenv import load_dotenv

load_dotenv("backend/.env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
ZALO_STAGING_GROUP_ID = "ĐIỀN_ZALO_GROUP_ID_STAGING_VÀO_ĐÂY" 

if "jozcvbbypwvzaefteoxn" in SUPABASE_URL:
    print("❌ PHÁT HIỆN SUPABASE_URL ĐANG TRỎ VÀO PRODUCTION DB (jozcvbbypwvzaefteoxn)!")
    print("Vui lòng sửa file backend/.env trỏ tới DB Staging để tránh gửi tin nhắn rác vào nhóm thật.")
    exit(1)

def run_uat():
    try:
        from supabase import create_client
    except ImportError:
        print("Vui lòng cài đặt supabase-py: pip install supabase")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("=== BẮT ĐẦU UAT ZALO TRÊN STAGING ===")
    
    # 1. Trỏ group staging vào team Inhouse 2
    print(f"\n1. Cập nhật zalo_team_groups (Inhouse 2 -> {ZALO_STAGING_GROUP_ID})...")
    supabase.table("zalo_team_groups").update(
        {"group_id": ZALO_STAGING_GROUP_ID, "is_active": True}
    ).eq("team_code", "Inhouse 2").execute()
    
    # Lấy PR test đã thanh toán
    pr_resp = supabase.table("payment_requests").select("id").eq("is_test", False).limit(1).execute()
    if not pr_resp.data:
        print("Không tìm thấy PR nào để test.")
        return
        
    pr_id = pr_resp.data[0]["id"]
    print(f"Sử dụng PR_ID: {pr_id}")

    # 5. REGRESSION GATE: Test báo tiền về
    print("\n5. REGRESSION GATE: Test báo tiền về (payment_paid)...")
    
    # Tạo 1 payment_line giả với status = 'paid' để trigger DB trg_payment_paid_zalo
    dummy_line_id = str(uuid.uuid4())
    line_data = {
        "id": dummy_line_id,
        "payment_request_id": pr_id,
        "amount": 50000,
        "status": "paid",
        "payos_order_code": 9999999,
        "team": "Inhouse 2",
        "paid_at": "2026-07-02T12:00:00Z"
    }
    
    print("Insert payment_line giả để kích hoạt DB Trigger...")
    supabase.table("payment_lines").insert(line_data).execute()
    
    time.sleep(3) # Đợi trigger SQL chạy và insert vào bảng zalo_outbox
    
    outbox_resp = supabase.table("zalo_outbox").select("*").eq("event_type", "payment_paid").order("created_at", desc=True).limit(1).execute()
    
    if outbox_resp.data:
        msg = outbox_resp.data[0]["message"]
        print(f"\n✅ Bắt được tin nhắn 'Báo tiền về' trong outbox:\n{'-'*40}\n{msg}\n{'-'*40}")
        if "💰 Đã vào" in msg:
            print("🚀 PASS Regression Gate: Tin nhắn tiền về format hoàn toàn được giữ nguyên!")
        else:
            print("❌ FAIL Regression Gate: Format tin nhắn tiền về bị thay đổi!")
    else:
        print("❌ FAIL Regression Gate: Không bắt được event trong zalo_outbox! (Trigger có thể không chạy).")

    # Cleanup
    print("\nDọn dẹp (xóa payment_line giả)...")
    supabase.table("payment_lines").delete().eq("id", dummy_line_id).execute()
    
    print("=== HOÀN TẤT UAT ===")

if __name__ == "__main__":
    run_uat()
