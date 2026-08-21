# Phone format double-strip khi SĐT local bắt đầu trùng dial code

**Related files:** `frontend/src/components/payment-request/phoneUtils.ts`, `backend/utils/zalo_message_builder.py`, `backend/utils/country_dial.py`, `backend/migrations/2026-08-20-fix-phone-intl-double-strip.sql`

**Problem:** `formatPhoneIntl("VN", "0844976431")` trả `84-4976431` (thiếu 2 số) — Vinaphone đầu số 084 có local part bắt đầu bằng `84`, trùng country code VN.

**Trap:** Dùng magic number cố định (`digits.length > dial.length + 5`) để quyết định strip country code. Con số `+5` không phân biệt được số local 9 digits bắt đầu trùng dial (844976431, `9 > 7` = TRUE) với số quốc tế thật (84904769355, `11 > 7` = TRUE). Cùng bug dính CZ (420), DE (49) — bất kỳ nước nào local number bắt đầu bằng chính dial code.

**Insight:** Phân biệt đúng bằng **expected local length** của từng quốc gia (VN=9, US=10, DE=10...). Chỉ strip khi: (1) tổng digits > expectedLocal VÀ (2) phần còn lại sau strip ≈ expectedLocal (±1 tolerance). Số local 9 digits (`9 > 9` = FALSE) không bao giờ bị strip; số quốc tế 11 digits (`11 > 9` = TRUE, afterDial=9, `|9-9|=0`) strip đúng.

**Rule:** Mọi logic strip country code từ phone digits PHẢI so sánh với expected local length của quốc gia đó, KHÔNG dùng magic number. Hàm `formatPhoneIntl` có 3 mirror (FE `phoneUtils.ts`, BE `zalo_message_builder.py`, SQL `public.format_phone_intl`) — sửa phải sync cả 3. Thêm quốc gia mới vào `COUNTRY_LOCAL_LEN` (BE) / `v_local_len_map` (SQL) khi onboard khách nước đó.

**Verify:** `cd frontend && npx vitest run src/components/payment-request/phoneUtils.test.ts 2>&1 | grep -E "(FAIL|pass)"` — expect 0 FAIL, 27+ pass (bao gồm test "Vinaphone 084")
