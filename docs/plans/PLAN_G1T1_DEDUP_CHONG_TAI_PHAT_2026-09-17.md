# PLAN G1-T1 — Chặn dup Sổ doanh thu tái phát tại nguồn (dedup chéo nguồn khoan dung, **0 xoá nhầm**)

> Mục tiêu: đơn qua app + import All File KHÔNG còn tạo 2 dòng cho cùng 1 đơn. Xây từ 8 case đối soát tay 17/9. **Nguyên tắc tối cao: KHÔNG BAO GIỜ tự xoá; chỉ MERGE/skip; mơ hồ → gắn cờ cho người soi.** Liên quan: SOP `docs/DOI_SOAT_DOANH_THU_So_vs_AllFile.md` §7, [[project_bao-don-vs-allfile-recon]].

## 1. Gốc rễ (đã xác minh 17/9)
Sổ (`so_doanh_thu`) có 2 đường ghi:
- **Auto**: `backend/revenue_routes.py:sync_ledger_from_ar_course` (~1111) — báo đơn/tạo gói; có `crm_order_id`, `loai_nhap='tu_dong'`. Gọi bởi `sync_ledger_for_pr` (~1374) + `backfill_ledger_from_active_requests` (~1331).
- **Import**: `backend/gsheet_ledger_import.py:sync_gsheet_to_ledger` (618) → `ledger_recon.reconcile` (187). Không crm, `loai_nhap='tay'`, hay trống UID.

**Import path dedup TỐT** (reconcile: tier exact→loose→blank(guard `_same_person`)→day_vnd→uid_day; chỉ INSERT `sheet_only`). **Auto path dedup YẾU**: `revenue_routes.py:1244-1318` chỉ khớp `crm_order_id` (import không có) rồi `loose_match` EXACT `uid+ngay_tien_ve+so_tien_vnd` khi `len==1`. → TRƯỢT khi import vào trước, auto vào sau với **lệch ngày** (import=bank_day vs auto=pay_time), **net/gross**, hoặc UID trống/rác. **Backfill 16/9** (`backfill_ledger_from_active_requests`) tạo loạt auto đè lên import cuối T8 → 4 dup.

## 1b. ⚠️ Tổng hợp TOÀN BỘ đợt đối soát (không chỉ phiên 17/9)
Nguồn: SOP §2 (5 loại lỗi), learning `docs/learnings/2026-08-11-bq-so-doanh-thu-dual-source-dup.md`, handoff `docs/handoffs/KETLUAN_GMV_DUPLICATE_ROWS_2026-08-11.md`, memory [[project_so-doanh-thu-dup-auto-import]] (10-12/9, ~40 dòng xử), [[project_nghi-trung-tab]] (13/8), [[project_so-nguon-tu-dong-gap]], phiên 17/9.

**❗ Bài học nền tảng — vì sao KHÔNG dùng heuristic tháng để XOÁ:** handoff đề xuất *"uid có ≥1 dòng crm trong tháng → mọi dòng tay không-crm của uid đó = trùng → loại"*. Cái này **CHỈ đúng cho BQ view (read, non-destructive, over-drop chấp nhận được)**. Với **write-path/xoá thật thì KHÔNG an toàn**: 1 uid có thể có 1 đơn app (crm) + 1 đơn tay-thật RIÊNG (gói khác, không qua app) trong cùng tháng → heuristic xoá nhầm đơn tay thật. ⇒ Write-path PHẢI khớp **CHÍNH XÁC theo đơn** (crm → uid/phone/course + tiền±tol + ngày±window, DUY NHẤT 1 ứng viên), KHÔNG dùng heuristic-tháng để xoá.

**Danh mục pattern (gộp mọi đợt):**
- **DUP (dedup/cờ):** ① auto+import cùng đơn · ② double-import (1 trống hoặc lệch ngày, vd Trang Nhi 31/7+15/8) · ③ **UID rác** (uid có chữ/nhét SĐT/thiếu số → 1 đơn thành 2 dòng uid khác, amount-match trượt; vd Nhật Băng "C Trang-Nhật Băng 5t 3316451938", chị Liên uid=SĐT, thiếu số 330338570) · UID lệch app≠file cùng bé (Khánh Linh) · **net vs gross** (import gross, auto net; Bảo Trúc 9,58 vs 9,34) · **import tách gói** (Phong Anh app gộp 13,9 vs import 4,6+9,3).
- **KHÔNG dup (cấm xoá):** ④ đơn nhiều gói/bé N dòng (Lopez/Đô Đô/Huê Bùi/Bùi Tuệ Nhung) · 1 KH 2 đơn thật cùng tháng (đều có crm, vd 3314034328) · renew cùng giá khác ngày · tên con(file) vs tên mẹ(app) · lệch 1-2 ngày cùng đơn · All File multi-bé trống UID.
- **Sổ THIẾU (bổ sung/sửa, NGOÀI scope G1-T1 dedup):** ⑤ số stale/lần-TT-huỷ (Giang 4.680.750→4.681.750) · báo đơn chưa đủ (Đỗ Uyên 18,32→26,2) · dòng cũ chưa cập nhật upsale (Ba Quang Vinh) · app thiếu 1 gói (Lopez/Đô Đô). → G1-T1 chỉ lo DUP; nhóm này để reconcile báo "file-only/lệch tiền" cho người xử.

## 2. Ma trận quyết định — hành vi model (0 xoá nhầm)
| # | Case (17/9) | Dấu hiệu máy | Model làm gì |
|---|---|---|---|
| 1 | Nhật Trường/Hà/Khang/Tư Thành (auto+import 1 đơn) | 1 dòng crm + 1 dòng import, **uid+tiền+ngày khớp (±window)** | **MERGE**: link `crm_order_id`+note vào dòng import, KHÔNG chèn auto mới (giữ hành vi 1255-1261) |
| 2 | Khánh Linh (uid app≠file) | cùng tiền/gói/sale, uid khác; **phone9 hoặc course_code khớp** | MERGE qua tier phone9/course; nếu chỉ uid khác mà không neo phụ nào khớp → KHÔNG merge, chèn+cờ |
| 3 | Bùi Tuệ Nhung (import trống định danh) | import uid+sđt+tên TRỐNG | **KHÔNG match được** (không neo) → chặn ở G1-T3: import bỏ/cờ dòng trống-hoàn-toàn; hoặc để reconcile blank-guard (đã có) + cờ review. KHÔNG auto-xoá |
| 4 | Chị Huê Bùi / Lopez / Phan (2 gói cùng tiền) | cùng uid, N dòng = N course_code khác nhau (CRM/AR N gói) | **GIỮ N dòng** — số dòng ≤ số gói AR ⇒ hợp lệ, KHÔNG dedup |
| 5 | RE#285 (sale paste nhầm UID) | uid gắn KH khác; CRM uid đó không có gói | Không thuộc write-path (đây là RE sheet HCM); với Sổ: nếu uid rác (`!~ ^3\d{9}$` hoặc CRM rỗng) → cờ review, KHÔNG merge |
| 6 | RE#663 (nhầm ngày ±1) | cùng uid+tiền, ngày lệch ≤ window | MERGE (window ±5 ngày bắt được) |
| 7 | RE#64/#872 (net vs gross, lệch tiền nhỏ) | cùng uid+ngày, tiền lệch ≤ ngưỡng% | G1-T2 ghi NET 2 nguồn → hết lệch; nếu vẫn lệch > ngưỡng → cờ review (KHÔNG merge, KHÔNG xoá) |
| 8 | Renew cùng giá khác ngày (dương-tính-giả) | cùng uid+tiền, **>1 ứng viên** trong window | **KHÔNG merge** (mơ hồ) → chèn dòng mới; đây là 2 đơn thật |

**Rút ra 3 luật cứng:**
- **L1 — chỉ MERGE khi DUY NHẤT 1 ứng viên** khớp chắc (crm, hoặc uid/phone9/course + tiền±tol + ngày±window). ≥2 ứng viên → KHÔNG merge (case 8).
- **L2 — trọng tài số dòng = số gói AR/CRM**: không bao giờ giảm số dòng xuống dưới số course thật của UID (case 4).
- **L3 — mơ hồ/thiếu neo/uid rác → chèn + gắn cờ review, KHÔNG xoá, KHÔNG merge** (case 3,5,7-lệch-lớn).

## 3. Thay đổi code
### G1-T1a — Nâng dedup auto path (đòn bẩy chính)
`backend/revenue_routes.py:sync_ledger_from_ar_course`, đoạn `if uid:` `loose_match` (1280-1318):
- Thay khớp EXACT `uid+ngay_tien_ve+so_tien_vnd` bằng **matcher khoan dung dùng chung** `find_ledger_twin(sb, {uid, phone9, course_code, so_tien_vnd, ngay})`:
  - tier1 `crm_order_id` (nếu order_id đã set ở dòng khác) — idempotency.
  - tier2 `uid` == AND `|so_tien_vnd| ±<=THRESH` AND `|ngày| <= WINDOW(5)` — chỉ dòng `loai_nhap IN ('tay','hoan')` chưa có crm.
  - tier3 `phone9` == (thay uid) + cùng điều kiện tiền/ngày (bắt case 2 uid lệch).
  - **Chuẩn hoá neo**: uid dùng khi hợp lệ `^3\d{9}$`; uid rác (có chữ/nhét SĐT/thiếu số) → BỎ uid, chỉ dùng phone9 (tier3) — chính là cách bắt case③ Nhật Băng. phone9 = 9 số cuối, bỏ 84-/81-/ký tự ẩn.
  - so `course_code`/`ma_don_hang` khi cả 2 có: KHÁC course → KHÔNG phải twin (chặn gộp nhầm 2 gói cùng tiền, L2).
  - **Trả về DUY NHẤT 1 id** nếu đúng 1 ứng viên; `None` nếu 0; **ném "AMBIGUOUS"** nếu ≥2 (→ caller chèn mới + set cờ, KHÔNG merge).
- Khi có twin (tay/hoan): giữ nguyên hành vi hiện tại (1255-1261) = set `crm_order_id`+`note`, KHÔNG flip `loai_nhap` (tránh "bug 130 dòng"), return id. → không chèn dòng 2.
- Tách matcher ra `backend/utils/ledger_dedup.py` (thuần, test được) — dùng chung cho cả reconcile nếu muốn sau.

### G1-T1b — Guard số-gói (L2)
Trước khi chèn auto mới cho 1 course: nếu số dòng Sổ hiện có của `uid` (cùng tháng) ≥ số course của uid trong AR → vẫn cho chèn (mỗi course 1 dòng, case 4 hợp lệ); chỉ dùng số-gói để KHÔNG merge nhầm 2 course thành 1 (matcher L1 phải so cả `course_code`/`ma_don_hang` khi có, để 2 gói cùng tiền không merge vào nhau).

### G1-T1c — Cờ review thay vì xoá (L3)
Thêm cột `dup_review` (bool/text lý do) trên `so_doanh_thu` (migration nhẹ, default null). Khi matcher trả AMBIGUOUS hoặc uid rác/thiếu neo → chèn dòng + set `dup_review='<lý do>'`. Tab "Nghi trùng" (đã có kế hoạch `docs/plans/PLAN_TAB_NGHI_TRUNG...`) đọc cột này cho chị Hiền soi + xoá tay. **Không tự xoá.**

### G1-T2 — Ghi NET 2 nguồn (giảm lệch tiền)
Auto path (`sync_ledger_from_ar_course:1173` — `so_tien_vnd`=giá gói) ghi **NET** (khớp cách import lấy Real Pay). Giảm case 7 (net/gross làm matcher trượt).

### Backfill an toàn
`backfill_ledger_from_active_requests` (1331) vốn gọi `sync_ledger_from_ar_course` → tự hưởng dedup mới. Thêm: chạy backfill ở chế độ **dry-run log trước** (đếm would-insert vs would-merge) để không lặp sự cố 16/9.

## 4. Guardrail (bất biến)
- KHÔNG có lệnh DELETE nào trong path. Chỉ INSERT / UPDATE(link crm) / set cờ.
- Matcher chỉ merge khi **đúng 1** ứng viên (L1). ≥2 → AMBIGUOUS → chèn+cờ.
- Không merge 2 dòng khác `course_code` (L2 — 2 gói thật).
- Đơn cũ (đã có) không bị đụng; migration cột `dup_review` default null.
- Không đổi schema so_doanh_thu ngoài 1 cột nullable; không đụng gmv_all/ECS (view tự phản ánh).

## 5. Test (mỗi pattern lịch sử = ≥1 test, `backend/tests/test_ledger_dedup.py` mới)
Phủ TẤT CẢ pattern mục 1b (không chỉ 8 case 17/9):
- **case① auto+import**: import (tay,no-crm, ngày lệch ≤5, tiền=) sẵn + auto đến → twin trả id đó → MERGE, tổng dòng không tăng.
- **case UID lệch app≠file** (Khánh Linh): import uid=A, auto uid=B, phone9 trùng + tiền= + ngày≤5 → merge qua tier phone9.
- **case③ UID rác**: dòng uid="C Trang-Nhật Băng 5t 3316451938" (rác) + dòng sạch cùng phone9+tiền → nhận diện uid rác (`!~ ^3\d{9}$`) → khớp qua phone9, MERGE (giữ dòng crm/sạch). Nếu không có neo sạch → cờ review.
- **case net/gross** (Bảo Trúc): sau G1-T2 (NET 2 nguồn) tiền BẰNG → merge. Test cả nhánh chưa-NET: tiền lệch > THRESH → KHÔNG merge → cờ.
- **case④ nhiều gói** (Huê Bùi/Lopez): 2 dòng cùng uid+tiền KHÁC `course_code`/`ma_don_hang` → twin KHÔNG coi là trùng → giữ 2. **Test then chốt cho "0 xoá nhầm".**
- **case 2 đơn thật cùng tháng** (uid có 2 crm khác nhau) → không đụng (cả 2 có crm) → giữ 2.
- **case⑧ renew cùng giá khác ngày**: 2 ứng viên tay trong window cùng uid+tiền → AMBIGUOUS → chèn + cờ, KHÔNG merge.
- **case② double-import trống**: import trống định danh (no uid/phone/name) → không neo → KHÔNG merge/xoá → cờ review (chờ người).
- **case import tách gói** (Phong Anh: app gộp 13,9 vs import 4,6+9,3): sum(import cùng uid+ngày)=amount app → phát hiện tách/gộp → **cờ review** (không auto-resolve, giữ nguyên).
- **idempotency**: chạy auto 2 lần → không nhân đôi (crm tier).
- **heuristic-tháng KHÔNG xoá đơn tay-thật riêng**: uid có 1 crm + 1 tay khác gói/ngày ngoài window → tay KHÔNG bị merge/xoá (chứng minh khác biệt với BQ view heuristic).
- **Regression**: `test_lead_source_map.py`, `test_revenue_22h_rule.py:347` (loai từ lead_source) vẫn pass.

## 6. Rollout an toàn
1. Deploy matcher + tests (không đụng data).
2. Chạy **dry-run**: log would-merge/would-insert/would-flag trên prod (read-only) 1 tuần — đối chiếu tay mẫu.
3. Bật write-path dedup.
4. Chạy backfill 1 lần (đã có dedup) dọn dồn tích + so tổng T7/T8/T9 vs All File = 0.

## 7. Tham số chốt (cần anh Minh/Hiền duyệt)
- `WINDOW` ngày = **±5** (SOP dùng ±5). `THRESH` tiền = **0** (chỉ merge khi tiền BẰNG sau khi NET-hoá) hay cho ±ngưỡng nhỏ? (đề xuất: bằng tuyệt đối sau G1-T2, an toàn nhất).
- Cột cờ: `dup_review text` hay tách bảng?
- Tab Nghi trùng: build cùng đợt hay sau?

## 8. Đánh giá 5 tiêu chí
1. **Triệt để** — ✅ vá đúng auto path (gốc), áp mọi đường chèn qua nó.
2. **Không lỗi con** — ✅ L1/L2/L3 + matcher chỉ merge khi duy nhất; test phủ 8 case + dương-tính-giả.
3. **Không tăng hạ tầng** — ✅ 1 cột nullable + 1 util thuần; không service mới.
4. **Tối ưu token/tài nguyên** — ✅ dùng lại reconcile logic; matcher query có index (uid, ngay_tien_ve).
5. **Bền vững qua compact** — ✅ plan self-contained (path:line + hành vi + test).

## 9. Phân bổ thực thi
- G1-T1a matcher + test = task self-contained cho **Sonnet** (util thuần + sửa 1 hàm, đã ghi path:line).
- G1-T1c migration cột + G1-T2 NET = cần review kỹ (đụng ghi tiền) → **Opus** hoặc reviewer.
- Backfill dry-run + bật = ops, người chạy (không giao agent).
