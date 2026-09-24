# Update cột không tồn tại + try/except rộng = code chết ÂM THẦM (nhìn như đã chạy)

**Related files:** `backend/sepay_routes.py` (`_try_fill_payoo_funded_date`)

**Problem:** Auto-fill `funded_date` cho Payoo có code, có test, đã deploy — nhưng thực tế **chưa bao giờ chạy** trên prod (mọi cục Payoo funded_date=NULL, phải backfill tay từng đợt).

**Trap:** Tin rằng "hàm tồn tại + có unit test + đã merge = đang chạy prod". Hàm update `{"funded_date":…, "settlement_code":…, "updated_at": _iso_now()}` trên `gateway_transactions` — nhưng bảng này **KHÔNG có cột `updated_at`** (nó có ở `bank_transactions` cùng file, dễ copy nhầm). PostgREST trả lỗi `PGRST204 Could not find the 'updated_at' column` → nhưng update bọc trong `try/except: return 0` → **nuốt lỗi, không log rõ, trông như "không match" bình thường**. Unit test dùng FakeSB không kiểm cột thật nên vẫn xanh → bug lọt.

**Insight:** PostgREST `.update()` với KEY lạ là lỗi cứng (không bỏ qua key thừa như một số ORM). Một `except Exception: return 0` biến lỗi-cứng đó thành **nhánh "no-op" im lặng** — dead code mặc áo "đã triển khai". Test giả lập DB (không enforce schema) là điểm mù: chỉ raw SQL / prod mới lộ. Đây là lý do 15/24 dòng funded hiện có đều do backfill SQL tay (omit `updated_at`), KHÔNG do webhook.

**Rule:** Khi `.update()`/`.insert()` qua PostgREST, mọi key phải là cột THẬT của ĐÚNG bảng đó — grep `information_schema`/migration trước, đừng copy dict update giữa 2 bảng. Đừng để `try/except` rộng nuốt lỗi ghi mà không phân biệt "không match" với "ghi lỗi": log kèm `exc`. Nghi một fill/auto-hook "không chạy" dù đã deploy → thử 1 update raw để xem PostgREST có ném cột-lạ không, đừng chỉ đọc code.

**Verify:** `cd backend && grep -A45 'def _try_fill_payoo_funded_date' sepay_routes.py | grep -c updated_at` → phải `0` (hàm không được ghi `updated_at` vào `gateway_transactions`).
