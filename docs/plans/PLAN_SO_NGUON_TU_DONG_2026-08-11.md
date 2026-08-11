# Sổ doanh thu — Ghi Nguồn cho đơn tự động + rạch ròi Thủ công/Tự động

**Ngày:** 2026-08-11 · **Trạng thái:** PLAN (chưa thực thi) · **Chạm data prod:** CÓ (xoá dedup + retag + backfill → cần backup + xác nhận Minh)
**Liên quan:** [[project_so-nguon-tu-dong-gap]], C-T1 (`PLAN_CT1_NGAY_TIEN_VE_DON_THE_2026-08-08.md`, dùng chung `sync_ledger_from_ar_course`), BC02 (`_build_key_data_pivot`), phiếu lương GĐ2 (cần số nguồn chuẩn để mô phỏng)
**Learning bắt buộc đọc:** `docs/learnings/2026-08-08-ct1-*` — backfill Sổ CHỈ đụng cột được phép, TUYỆT ĐỐI không sửa `ngay_tien_ve`/`pay_time`/`gmv_rmb`/`so_tien_vnd`.

---

## 1. Vấn đề (ngôn ngữ vận hành)

Cột **Nguồn (Type)** trên Sổ doanh thu của các đơn **app tự sinh** (kích hoạt gói B3) đang **để trống** — 177/194 dòng. Suốt từ 2022 tới nay, Nguồn trên Sổ **100% do chị Thu Hiền phân loại tay** trong "All File Thu"; app chưa bao giờ tự ghi. Hệ quả: đơn nào app tự tạo mà rơi vào khe trống thì **không được tính vào đúng nhóm nguồn** trên báo cáo BC02 (rơi cột "Khác").

Ngoài ra có **2 bug đi kèm** lộ ra khi điều tra:
- **Tag sai:** 130 dòng import từ file Hiền bị app gắn nhầm tag **"Tự động"** (đúng ra là Thủ công).
- **Nhân đôi:** vì chị Hiền **vẫn nhập tay song song** (chưa chuyển sang dùng Sổ app), một số đơn B3 có **2 dòng** trong Sổ (1 app trống + 1 sheet có nguồn) → **đếm GMV 2 lần** (~5–17 ca, xác nhận 5 ca thật ≈ 76tr VND).

**Mục tiêu:** (1) rạch ròi Thủ công vs Tự động; (2) đơn app tự sinh **tự ghi Nguồn** đúng; (3) dọn data cũ (dedup + backfill 177 dòng) để số nguồn chuẩn — phục vụ cả mô phỏng phiếu lương.

---

## 2. Nguyên nhân (đã verify trên data prod `jozcvbbypwvzaefteoxn`)

Đường ghi Sổ tự động **duy nhất**: `sync_ledger_from_ar_course()` (`backend/revenue_routes.py:1110`). Mọi trigger (gán CRM order_id ở B3, PR đủ tiền QR/thẻ/trả góp, backfill) đều đi qua đây.

| Đường tạo dòng | Set `loai`? | `loai_nhap` | File:line |
|---|---|---|---|
| Import GSheet (SM Hanoi / HCM REV) | ✅ (cột Type sheet) | `'tay'` | `gsheet_ledger_import.py:405,448` |
| Nút tạo tay trên Sổ | ✅ (từ form) | `'tay'` | `revenue_routes.py:1727` |
| Hoàn/ghi giảm | ✅ (mirror gốc) | `'hoan'` | `revenue_routes.py:2095` |
| **App-auto B3** | ❌ **KHÔNG** | `'tu_dong'` | `revenue_routes.py:1200-1222` (payload thiếu `loai`) |

**Tag sai (130 dòng):** import tạo dòng `'tay'` trước; sau đó nhánh **`loose_match`** của app (`revenue_routes.py:1246-1266`) khớp theo `uid + ngay_tien_ve + so_tien_vnd` — **không lọc `loai_nhap`** — rồi UPDATE **lật `loai_nhap='tu_dong'`** + stamp `crm_order_id`. `loai` sống sót vì UPDATE không đụng `loai`.

**Nhân đôi:** import chạy `reconcile()` 6 tầng (`gsheet_ledger_import.py:663`) khớp trùng rồi **SKIP** (không enrich). 2 kịch bản:
- Khớp được → SKIP → phân loại của Hiền bị bỏ, dòng app ở lại trống (gốc 177 dòng trống).
- Khớp **hụt** (fingerprint `pay_time`/`sale`/`sdt` lệch) → INSERT → **2 dòng/1 đơn** (5 ca xác nhận: uid `3315449340`/`3315450216`/`3315739934`/`3315749406` ngày 7/8, uid `3309414666` ngày 9/8).

**Trạng thái data (prod):**
- SHEET (Hiền tay): 16.488 dòng (2022 → nay), `loai_nhap='tay'` + 130 dòng bị lật `'tu_dong'`.
- APP auto (`b3-activation@auto`): 194 dòng (từ 6/2026), 177 trống `loai`, 3 dòng `test.admin@dev` sửa tay 29/6 (có loai — bỏ qua).

---

## 3. Mapping chốt `lead_source → loai` (verify với vocab Hiền + BC02)

`loai` dùng vocab report Trung/Anh (KHÔNG phải key lead_source). Ghi raw key/label VN → rơi "Khác" trên BC02.

| lead_source key | → `loai` | cột BC02 |
|---|---|---|
| `quang_cao` (kênh ≠ 300431) | `广告` | ads |
| `quang_cao` + kênh **300431** (FB-Livestream) | `Lives` | lives |
| `gioi_thieu` | `转介绍` | refer |
| `offline` | `Offline` | offline |
| `koc` | `KOC` | koc |
| `gia_han` | `续费` | renew |
| `kho_chung` | `公海` | public_pool |
| `khac` | `Other` | other |

- **Nguồn giá trị:** ưu tiên `course.lead_source`, fallback `pr.lead_source` (PR phủ 100%).
- **`loai_2` → NULL** luôn (sheet cũng 100% trống; nhánh đọc loai_2 là dead code).
- **Bất biến báo cáo:** map thô của app == nhãn mịn của Hiền ở **cấp bucket BC02** (`LEDGER_TYPE_FIXX_MAP` `revenue_routes.py:612`: Resell→续费, Booth→Offline, GD→公海, PNS/FB/Partnership→广告, Lives+Livestream→Lives). Nên G2 tự phân loại → **số BC02 vẫn đúng**, chỉ mất nhãn chi tiết khi hiển thị.

---

## 4. CẤN đã chốt (user, 11/8)

1. **Phạm vi:** GIỮ NGUYÊN — chỉ ghi Sổ khi course có CRM order_id (qua B3, đã phủ QR/thẻ/trả góp). Không mở rộng.
2. **130 dòng gsheet-tu_dong:** chuyển về `'tay'` (thủ công).
3. **Backfill:** cả 177 dòng kể cả tháng 7 (T7 đã gửi báo cáo nhưng KHÔNG phụ thuộc số app GMV; cần số chuẩn cho mô phỏng phiếu lương) → **bỏ floor ngày**.
4. **Livestream (300431):** map `Lives` (theo cách Hiền tách riêng).
5. **Nhân đôi (dual-entry):** DỌN 1 LẦN (G0), chấp nhận rủi ro dup nhỏ tái phát; KHÔNG hardening dedup, KHÔNG làm lộ trình chuyển giao đợt này.

---

## 4b. PHÂN BIỆT "ĐIỀN TRÙNG" vs "SAI CỘT" (đọc trước khi làm)

Verify data (11/8) cho thấy 2 vấn đề **tách biệt**, đừng gộp:

| | Số lượng | Bản chất | Ảnh hưởng tổng BC02 | Việc xử lý |
|---|---|---|---|---|
| **Sai cột** | 177 dòng (T7: 365.308 RMB ≈ 19% GMV, cột lớn thứ 3) | Đếm **1 lần**, nằm nhầm cột "Khác" (import đã khớp bản Hiền rồi SKIP) | **KHÔNG đổi** tổng | G3 backfill (total-preserving, reversible) |
| **Trùng thật** | 5 chắc + ~12 nghi | Đếm **2 lần** (app trống + sheet có loai) ≈ 76M VND | Tổng đang **cao hơn** thực ~76M | G0 dedup (tách riêng, review tay) |

→ **Backfill (việc chính) KHÔNG liên quan trùng lặp** — 177 dòng đếm 1 lần, chỉ dời cột. Cả 2 việc đều kéo BC02 **về gần** số chị Hiền báo cáo, không đi xa.
**Vì sao Hiền thấy BC02 "khá khớp":** tổng đúng (177 đếm 1 lần) + chị soi tổng/số-đơn-theo-ngày (bắt được lệch 3–4 = C-T1), chưa soi kỹ cột "Khác".
**✅ Pre-step ĐÃ CHỐT (user 11/8):** chị Hiền so **tổng GMV** (không so từng cột). Hệ quả: (1) **Backfill KHÔNG đụng tổng chị đã verify** → an toàn tuyệt đối; (2) **Dedup là thứ duy nhất chạm tổng** — giảm ~76M VND (sửa đúng, hiện tổng cao hơn thực) → **báo chị trước** rằng tổng giảm nhẹ đúng phần trùng.

---

## 4c. FALLBACK / ROLLBACK (ưu tiên số 1 — bắt buộc)

Mọi thao tác chạm data đều phải **hoàn tác được**. 3 lớp:

**Lớp 1 — Backup full bảng (khôi phục toàn bộ):**
```sql
CREATE TABLE so_doanh_thu_backup_nguon_20260811 AS SELECT * FROM so_doanh_thu;
-- Khôi phục hoàn toàn (nếu cần):
--   BEGIN; DELETE FROM so_doanh_thu;
--   INSERT INTO so_doanh_thu SELECT * FROM so_doanh_thu_backup_nguon_20260811; COMMIT;
--   (hoặc restore từng dòng theo id — xem lớp 2)
```

**Lớp 2 — Undo phẫu thuật từng bước (mỗi bước gắn dấu riêng):**
```sql
-- Undo G3 backfill:  UPDATE so_doanh_thu SET loai=NULL WHERE updated_by_email='nguon-backfill';
-- Undo G1-N2 retag:  UPDATE so_doanh_thu SET loai_nhap='tu_dong' WHERE updated_by_email='nguon-retag';
-- Undo G0 dedup:     INSERT INTO so_doanh_thu SELECT * FROM so_doanh_thu_backup_nguon_20260811 b
--                     WHERE b.id IN (<id các dòng đã xoá>) AND NOT EXISTS (select 1 from so_doanh_thu x where x.id=b.id);
```

**Lớp 3 — Quy trình an toàn:** test rollback trên sandbox trước → làm **từng bước, verify sau mỗi bước** (§9), KHÔNG chạy 1 phát. Nếu bất kỳ bước nào lệch kỳ vọng → rollback bước đó, dừng lại.

---

## 5. G0 — Dọn nhân đôi (TÁCH RIÊNG, có thể làm sau — SQL một lần)

> **Không bắt buộc bó chung với backfill.** Đây là fix nhỏ (~5–17 đơn, ~76M) cho double-count có sẵn từ trước, không chặn việc chính. Có thể làm sau khi backfill xong + verify. Xoá dòng **app trống trùng**, giữ dòng **Hiền có loai**. Chỉ xoá cặp trùng **chặt** (uid + tiền + **ngày**, đã verify 5 ca là cùng 1 đơn); cặp **lỏng** (uid+tiền khác ngày) chỉ **liệt kê để review tay**, KHÔNG tự xoá.

```sql
-- BƯỚC 1: backup (bắt buộc)
CREATE TABLE so_doanh_thu_backup_nguon_20260811 AS SELECT * FROM so_doanh_thu;

-- BƯỚC 2: xem trước cặp trùng CHẶT sẽ xoá (kỳ vọng ~5 dòng app)
SELECT a.id AS app_id, a.uid, a.so_tien_vnd, a.ngay_tien_ve, a.crm_order_id,
       s.id AS sheet_id, s.loai
FROM so_doanh_thu a
JOIN so_doanh_thu s
  ON s.created_by_email LIKE 'import:gsheet:%'
 AND s.uid = a.uid AND s.so_tien_vnd = a.so_tien_vnd AND s.ngay_tien_ve = a.ngay_tien_ve
WHERE a.created_by_email = 'b3-activation@auto'
  AND (a.loai IS NULL OR btrim(a.loai) = '')
  AND a.is_test = false;

-- BƯỚC 3: xoá dòng app trùng chặt (chạy sau khi BƯỚC 2 đúng kỳ vọng)
DELETE FROM so_doanh_thu a
USING so_doanh_thu s
WHERE a.created_by_email = 'b3-activation@auto'
  AND (a.loai IS NULL OR btrim(a.loai) = '')
  AND a.is_test = false
  AND s.created_by_email LIKE 'import:gsheet:%'
  AND s.uid = a.uid AND s.so_tien_vnd = a.so_tien_vnd AND s.ngay_tien_ve = a.ngay_tien_ve;

-- BƯỚC 4: liệt kê cặp LỎNG (uid+tiền, khác ngày) để review tay — KHÔNG tự xoá
SELECT a.id AS app_id, a.ngay_tien_ve AS app_ngay, s.id AS sheet_id,
       s.ngay_tien_ve AS sheet_ngay, a.uid, a.so_tien_vnd, s.loai
FROM so_doanh_thu a
JOIN so_doanh_thu s
  ON s.created_by_email LIKE 'import:gsheet:%'
 AND s.uid = a.uid AND s.so_tien_vnd = a.so_tien_vnd AND s.ngay_tien_ve <> a.ngay_tien_ve
WHERE a.created_by_email = 'b3-activation@auto'
  AND (a.loai IS NULL OR btrim(a.loai) = '') AND a.is_test = false;
```

> ⚠ Trade-off: đơn được dọn sẽ còn lại **dòng Hiền** (`loai_nhap='tay'`, không có crm_order_id) → trên UI hiện "Thủ công" dù bản chất là đơn B3. Chấp nhận (chỉ ~5 ca). G1 (code) đã deploy trước sẽ chặn app tái tạo dòng cho các đơn này.

---

## 6. G1 — Rạch ròi `loai_nhap` (chặn lật tag + dedup + FE)

### G1-T1 · **Match-branch theo `loai_nhap`** (`backend/revenue_routes.py`, trong `sync_ledger_from_ar_course`)

> KHÔNG thêm thẳng `.eq(loai_nhap,'tu_dong')` vào query match (app sẽ không thấy dòng sheet → chèn trùng). Thay vào đó: **vẫn tìm thấy dòng trùng để dedup**, nhưng chỉ lật tag/cập nhật khi dòng đó là `'tu_dong'`; nếu là `'tay'`/`'hoan'` → return id, KHÔNG đụng.

`order_match` (hiện `:1228-1244`) — đổi `select("id")` → `select("id, loai_nhap, loai")`:
```python
if order_match.data:
    hit = order_match.data[0]
    match_id = str(hit["id"])
    if hit.get("loai_nhap") in ("tay", "hoan"):
        return match_id                      # dòng thủ công/hoàn: dedup, KHÔNG lật tag
    upd = {"ma_don_hang": course_code, "loai_nhap": "tu_dong",
           "don_hang_id": None, "note": f"AR {ar_id}", "updated_by_email": actor_email}
    if not (hit.get("loai") or "").strip():  # G2-T3: fill loai chỉ khi trống
        upd["loai"] = loai_val or None
    sb.table("so_doanh_thu").update(upd).eq("id", match_id).execute()
    return match_id
```

`loose_match` (hiện `:1246-1266`) — đổi `select("id")` → `select("id, loai_nhap, loai")`, áp cùng logic branch:
```python
if len(loose_match.data) == 1:
    hit = loose_match.data[0]
    match_id = str(hit["id"])
    if hit.get("loai_nhap") in ("tay", "hoan"):
        return match_id                      # << chặn bug lật 130 dòng + dedup cross-source
    upd = {"crm_order_id": order_id, "ma_don_hang": course_code, "loai_nhap": "tu_dong",
           "don_hang_id": None, "note": f"AR {ar_id}", "updated_by_email": actor_email}
    if not (hit.get("loai") or "").strip():
        upd["loai"] = loai_val or None
    sb.table("so_doanh_thu").update(upd).eq("id", match_id).execute()
    return match_id
```
> `loai_val` tính ở G2-T2 (§7), đặt TRƯỚC 2 nhánh match.

### G1-N2 · **Retag 130 dòng** (SQL một lần)
```sql
UPDATE so_doanh_thu
SET loai_nhap = 'tay', updated_by_email = 'nguon-retag'
WHERE created_by_email LIKE 'import:gsheet:%' AND loai_nhap = 'tu_dong';
-- ~130 dòng. Giữ nguyên crm_order_id (link vô hại). Chạy SAU khi G1-T1 deploy để không bị lật lại.
```

### G1-T3 · **FE subtitle** (`frontend/src/pages/MainPage.tsx:186`)
```
"Pay Time · GMV RMB = VND÷3700 — Tự động + Thủ công"   // bỏ "+ Sync sheet"
```
> Badge (`SoDoanhThuTab.tsx:152`, `LedgerRowCards.tsx:61`) + filter (`SoDoanhThuTab.tsx:714`) đã map 2 nhóm đúng sẵn (`tu_dong`→Tự động, còn lại→Thủ công). Sau retag, 130 dòng tự hiện "Thủ công". Không cần sửa thêm.

---

## 7. G2 — App tự ghi `loai` (going-forward, triệt để)

### G2-T1 · **Hàm map** (`backend/utils/lead_source_map.py`)
```python
_LEAD_SOURCE_TO_LOAI: dict[str, str] = {
    "quang_cao": "广告", "gioi_thieu": "转介绍", "offline": "Offline",
    "koc": "KOC", "gia_han": "续费", "kho_chung": "公海", "khac": "Other",
}
_LIVESTREAM_CHANNELS = frozenset({"300431"})  # FB-Livestream → cột "Lives" BC02

def resolve_loai_from_lead_source(lead_source: str | None,
                                  lead_channel: str | None = None) -> str | None:
    key = (lead_source or "").strip()
    if not key:
        return None
    if key == "quang_cao" and (lead_channel or "").strip() in _LIVESTREAM_CHANNELS:
        return "Lives"
    return _LEAD_SOURCE_TO_LOAI.get(key)
```

### G2-T2 · **Tính `loai_val` + payload** (`revenue_routes.py`, quanh `:1198-1222`)
```python
from utils.lead_source_map import resolve_loai_from_lead_source  # đầu file

# đặt TRƯỚC order_match/loose_match:
src_key = (course.get("lead_source") or (pr.get("lead_source") if pr else "") or "")
src_ch  = (course.get("lead_channel") or (pr.get("lead_channel") if pr else "") or "")
loai_val = resolve_loai_from_lead_source(src_key, src_ch)

# thêm vào dict payload insert:
"loai": loai_val or None,
"loai_2": None,
```

### G2-T3 · **UPDATE only-if-blank** — đã gộp vào G1-T1 (chỉ fill `loai` khi dòng cũ trống → không đè loai đúng của sheet).

### G2-T4 · **Test** (`backend/tests/test_revenue_22h_rule.py`, mục AR path)
- assert `loai='广告'` khi lead_source=`quang_cao`; `='Lives'` khi kênh=300431; `='转介绍'` khi `gioi_thieu`.
- assert fill-when-empty: dòng cũ có loai → KHÔNG bị đè; dòng cũ trống → được fill.
- assert dòng `loai_nhap='tay'` khớp loose_match → KHÔNG bị lật sang tu_dong.

---

## 8. G3 — Backfill 177 dòng (SAU G0 + deploy code)

Chạy endpoint có sẵn — reuse logic G2, an toàn ngày (order_match update KHÔNG đụng `ngay_tien_ve`/`pay_time`/`gmv`):
```
POST /revenue/ledger/backfill-b3     (revenue_routes.py:1983 → backfill_ledger_from_active_requests :1278)
```
Cơ chế: mỗi course có order_id → `sync_ledger_from_ar_course` → order_match trúng dòng `tu_dong` loai trống → fill `loai`. 177/177 đều có crm_order_id.

**Nghiệm thu backfill:**
```sql
SELECT count(*) FILTER (WHERE loai IS NULL OR btrim(loai)='') AS con_trong
FROM so_doanh_thu WHERE created_by_email='b3-activation@auto' AND is_test=false;
-- kỳ vọng: con_trong = 0 (trừ dòng lead_source rỗng, nếu có — kiểm riêng)
```

---

## 9. Verify cross-sum BC02 (bắt buộc — chống đổi tổng)

Snapshot **trước/sau** cho T7 + T8. Kỳ vọng: **tổng GMV & số đơn/ngày BẤT BIẾN**, chỉ **tỉ trọng cột nguồn dịch** (177 dòng rời "Khác" về nguồn thật).
```sql
-- Tổng bất biến (chạy trước và sau, so khớp từng ngày)
SELECT ngay_tien_ve, count(*) AS so_don, sum(gmv_rmb) AS tong_gmv
FROM so_doanh_thu
WHERE is_test=false AND ngay_tien_ve BETWEEN '2026-07-01' AND '2026-08-31'
GROUP BY 1 ORDER BY 1;
```
- [ ] Sau **G3 backfill** (chưa dedup): `so_don` + `tong_gmv` mỗi ngày **BẤT BIẾN** (backfill total-preserving). Chỉ cột "Khác" T7 giảm ~365K RMB, các cột nguồn tăng bù.
- [ ] Sau **G0 dedup** (bước tách riêng): `tong_gmv` giảm đúng ~76M VND, `so_don` giảm đúng số ca đã xoá (5 + ca lỏng được duyệt).
- [ ] **Cross-check số chị Hiền báo cáo:** cả 2 thay đổi phải kéo breakdown/tổng BC02 **gần hơn** số Hiền, không xa hơn. Nếu xa hơn → rollback + điều tra. (Pre-step §4b: xác nhận chị so tổng hay so từng cột.)

---

## Guardrails
- **G-a — one-way door:** chạm data prod (DELETE + UPDATE). `so_doanh_thu_backup_nguon_20260811` PHẢI tồn tại trước G0. Xác nhận Minh trước khi chạy DELETE.
- **G-b — sandbox trước:** deploy G1+G2 lên sandbox (`pxgybyfiwywksesyogti`), chạy G0/G3 sandbox (15 dòng), test 1 ca kích hoạt → Sổ ra đúng loai + không sinh dòng trùng. Rồi mới prod.
- **G-c — thứ tự bắt buộc:** deploy code (G1+G2) → G1-N2 retag → **G3 backfill (total-preserving, reversible) → §9 verify** → (rồi mới, TÁCH RIÊNG) G0 dedup → verify lại. Code trước để retag không bị app lật lại. Backfill trước dedup vì backfill an toàn hơn; dedup chỉ chạy sau khi §9 xác nhận tổng đúng như kỳ vọng.
- **G-f — verify sau MỖI bước:** không chạy liên tiếp; sau mỗi thao tác chạm data, chạy §9, khớp kỳ vọng mới đi tiếp. Lệch → rollback (§4c) + dừng.
- **G-d — không đụng giá trị/ngày:** mọi thao tác CHỈ đụng `loai`/`loai_2`/`loai_nhap` (+ DELETE dòng dup). TUYỆT ĐỐI không sửa `ngay_tien_ve`/`pay_time`/`gmv_rmb`/`so_tien_vnd`.
- **G-e — deploy:** BE `bash scripts/deploy.sh sandbox|prod` (Render auto-deploy OFF). FE push nhánh (Vercel auto).

## Rủi ro
- **R1 — dup lỏng (uid+tiền khác ngày):** ~12 ca có thể là đơn thật khác nhau → §5 BƯỚC 4 chỉ liệt kê, **review tay**, không tự xoá.
- **R2 — lead_source rỗng:** vài dòng cũ PR có lead_source null → backfill để trống (resolve trả None). Kiểm riêng sau G3; nếu có, xử lý tay.
- **R3 — dual-entry tái phát:** chị Hiền còn nhập tay → dup mới sẽ tích luỹ chậm (reconcile thỉnh thoảng khớp hụt). Đã chấp nhận (CẤN #5). Gốc rễ = chị Hiền ngừng nhập tay đơn B3 (org change, đợt sau).
- **R4 — cap 50k dòng:** verify §9 giới hạn range T7–T8 để không dính cap `fetch_rows_capped`.

## Triển khai (thứ tự) + Deadline

| # | Milestone | Nội dung | Ước lượng |
|---|---|---|---|
| 0 | — | **Backup full bảng** (§4c lớp 1) + xác nhận Minh | 0.1 ngày |
| 1 | G2 + G1-T1 | Hàm map + payload + match-branch (BE) + test | 0.5 ngày |
| 2 | G1-T3 | FE subtitle (1 dòng) | 0.1 ngày |
| 3 | — | Deploy sandbox + test kích hoạt + **test rollback sandbox** | 0.25 ngày |
| 4 | G1-N2 | Retag 130 dòng (sandbox → prod) + verify | 0.15 ngày |
| 5 | G3 | Backfill (sandbox → prod) + **§9 verify (tổng bất biến)** | 0.25 ngày |
| 6 | — | Deploy prod BE (`deploy.sh prod`) + smoke | 0.15 ngày |
| 7 | G0 | **(TÁCH RIÊNG)** dedup 5 ca chặt + review ~12 ca lỏng + verify | 0.25 ngày |
| | | **Tổng (1 dev)** | **~1.5–2 ngày** |

## Đánh giá 5 tiêu chí
- **Triệt để** ✅ — G2 sửa 1 hàm phủ mọi trigger/mọi bé-gói; đơn mới tự đúng nguồn, hết nợ.
- **Không lỗi con** ✅ — match-branch theo `loai_nhap` (vừa dedup vừa chặn lật tag) + fill only-if-blank (không đè loai Hiền) + G0 chỉ xoá dup chặt, dup lỏng review tay.
- **Không tăng gánh hạ tầng** ✅ — 0 bảng/service/cron; backfill dùng endpoint sẵn; map là hằng số Python.
- **Tối ưu token** ✅ — tập trung 1 hàm BE + 1 hàm util + 1 dòng FE + 3 câu SQL.
- **Self-contained cho Sonnet** ✅ — 4 CẤN đã chốt, path:line + code snippet + SQL + thứ tự deploy cụ thể.
