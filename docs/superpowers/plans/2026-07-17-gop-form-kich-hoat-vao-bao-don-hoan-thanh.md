# Plan: Gộp form kích hoạt vào bước "Báo đơn hoàn thành" + sửa format tin DingTalk

**Ngày:** 17/07/2026
**Trạng thái:** CHỜ DUYỆT (anh Hiếu) — chốt với kế toán (chị Hiền) rồi mới code
**Nguồn yêu cầu:** Chat Minh ↔ chị Hiền 17/07 + feedback format tin

---

## 1. Vấn đề

Kế toán (chị Hiền) yêu cầu tin "báo đơn hoàn thành" (pr_fully_paid) trên DingTalk **bắt buộc phải có tên gói học** để ghi nhận doanh thu. Nhưng hiện tại:

- Tên gói học chỉ được chọn ở bước **Active Request (B4 — kích hoạt)**, xảy ra SAU bước Báo đơn hoàn thành (B3).
- Vậy lúc B3 gửi tin thì chưa có tên gói → tin thiếu thông tin kế toán cần.
- Ngoài ra tin hiện tại thiếu Phone/UID/Nguồn/Sale·Team, và **không đính kèm ảnh bill**.

Chị Hiền cũng xác nhận: sau khi sale báo đơn hoàn thành, chị kích hoạt gói trong 30ph–1h, **không cần** sale nhắn yêu cầu riêng. Nhưng có đơn PH chưa muốn kích hoạt ngay → phải tách "báo đủ tiền" khỏi "kích hoạt".

## 2. Quyết định đã chốt với chị Hiền (17/07)

1. **Gộp form chọn gói vào bước Báo đơn hoàn thành.** Sale chọn gói / số tiền / nguồn / UID / tên bé **ngay tại bước báo đơn hoàn thành** — đúng bộ field như form kích hoạt hiện tại.
2. Tin DingTalk báo đủ tiền có tên gói + đính kèm toàn bộ ảnh bill.
3. **Kích hoạt về sau chỉ là 1 nút "Gửi yêu cầu"** — lấy lại toàn bộ dữ liệu đã nhập ở bước báo đơn, không nhập lại.
4. **Multi-con:** 2 bé đăng ký cùng nhau → PH đóng đủ học phí cả 2 → sale báo **1 lần** (1 report, nhiều dòng gói). KHÔNG tách report theo từng con cho 1 lần đăng ký chung.
5. **Thêm con sau:** PH đăng ký thêm bé khác đợt sau → sale thêm gói, thu thêm tiền, **báo đơn hoàn thành lần 2** (seq 2).

> Thuận lợi lớn: form kích hoạt hiện tại (`arDraftRows`) ĐÃ hỗ trợ nhiều dòng gói + multi-con (`request.children`, merged PR #19). Việc này chủ yếu là **di dời form đã có** sang bước B3, không build UI mới.

## 3. Format tin DingTalk mới

Thay template cũ (`payment_request_routes.py:2156-2165`).

**1 gói (1 con):**
```
✅ ĐƠN ĐÃ ĐỦ TIỀN — PR-2026-0353
Phone: 84-962159360
UID: 3293631914
Khánh Ngân, 2/W- NEW 24 PHI+2 HN
Nguồn: Gia hạn
Tổng: 4.500.000 VND
Sale Le Thi Thuy Van · Team Inhouse 2
```

**Nhiều gói / multi-con** (lặp dòng `<tên bé>, <gói>` theo từng dòng, UID theo con nếu khác nhau):
```
✅ ĐƠN ĐÃ ĐỦ TIỀN — PR-2026-0353
Phone: 84-378948121
Bé A (UID 0123456789), Phil 48+5 fix 2b/tuần
Bé B (UID 0987654321), Phil 48+5 fix 2b/tuần
Nguồn: Gia hạn
Tổng: 18.620.000 VND
Sale ... · Team ...
```
- `Lần #{seq}` gắn vào header khi seq ≥ 2.
- `Tổng` = tổng tiền **đã thanh toán** trong PR (`received`, net) = tổng số tiền phân bổ các gói (allocation guard đảm bảo bằng nhau).
- **Đính bill:** gom mọi ảnh bill của tất cả lần TT trong PR → gửi kèm sau tin text.

> ⚠ **Cần chốt với a Hiếu:** cách trình bày dòng gói khi multi-con (UID trong ngoặc hay xuống dòng riêng). Đề xuất như trên.

## 4. Phương án kỹ thuật

### 4.1 Data model (1 migration nhẹ)
- Thêm cột `items jsonb null` vào `pr_completion_reports`. Mỗi phần tử = 1 dòng gói:
  `{ child_name, uid, package_name, amount, lead_source, lead_channel }` (đúng shape `ArDraftRow`).
- Thêm cột `image_urls jsonb null` vào `dingtalk_outbox` (danh sách URL bill để worker gửi nhiều ảnh). Giữ `image_url` cũ làm fallback.
- Report cũ (backfill seq=1 `system-backfill`) → `items = null`, hiển thị gói "—". Không blocking.

**Vì sao JSONB, không phải bảng riêng:** report items là bản snapshot/nháp nuôi 2 thứ (tin + seed AR); AR vẫn là system-of-record cho kích hoạt (order_id…). JSONB = 1 cột, không tăng gánh hạ tầng (tiêu chí 3). *Nếu kế toán cần báo cáo tổng hợp theo gói về sau → tách bảng `pr_completion_report_items` (flag lại).*

### 4.2 Backend
- `POST /report-complete`: nhận thêm `items: [...]`. Guard:
  - Mọi item có `package_name` + `amount` > 0.
  - `sum(amount) == received` (tái dùng allocation guard của AR).
  - Giữ nguyên guard: PR done/over + mọi lần TT có bill (`assert_all_paid_lines_have_bill`).
  - Giữ nguyên guard seq/race (lần ≥2 bắt lý do; concurrent → 409).
  - Lưu `items` vào report row.
- Build tin theo format mới từ `items` + `pr_row` (phone, uid, sale_name, team).
- Gom bill: tái dùng `_build_bill_assets_from_storage_objects` cho PR → list URL → ghi `dingtalk_outbox.image_urls`.
- **Nút "Gửi yêu cầu kích hoạt" (B4 mới):** endpoint đọc `items` của report mới nhất → build payload AR (uids/courses) → gọi lại luồng tạo AR hiện tại. Không nhập tay.
- Worker `dingtalk_outbox_worker.py`: nếu `image_urls` có → loop `send_group_image` từng ảnh (đã có hàm); lỗi ảnh non-fatal (giữ nguyên).

### 4.3 Frontend
- Chuyển form `arDraftRows` (đang inline trong modal kích hoạt `PaymentRequestDetailDrawer.tsx:2592`) thành form của **CompletionReportModal/Block**. Sale nhập gói tại đây.
- `onReportComplete` gửi kèm `items` (map từ `arDraftRows`).
- Block B4 (`ActiveRequestMiniCardV2`) đổi thành nút **"Gửi yêu cầu kích hoạt"** — disable đến khi có report; bấm → gọi endpoint reuse, không mở modal nhập.
- Timeline: B3 "Báo đơn hoàn thành (chọn gói + đủ tiền)" → B4 "Gửi yêu cầu kích hoạt (dùng lại dữ liệu B3)".
- Giữ nút mờ→rõ (danger box) đã sửa cho hint thiếu bill.

## 5. Guardrails (tiêu chí 2 — không lỗi con)
- Allocation: `sum(items.amount) == received`, chặn submit nếu lệch (giống modal AR cũ).
- Bill-complete: mọi lần TT phải có bill trước khi báo (đã có).
- Multi-con: 1 report nhiều item; không cho tách report cho 1 lần đăng ký chung (UI 1 nút báo/1 lần).
- Idempotent outbox: `source_id = report_id`, unique → re-fire không double.
- Backfill report cũ (`items=null`): AR reuse phải fallback (nếu thiếu items → mở form nhập tay như cũ, không crash).
- Kill-switch: giữ env `REQUIRE_COMPLETION_REPORT_FOR_AR` + `dingtalk_event_enabled('pr_fully_paid')`.
- `is_test` PR: không enqueue (đã có).

## 6. Tests
- BE `test_completion_report.py` (mở rộng):
  - Report kèm items → message chứa tên gói + Phone/UID/Nguồn/Sale·Team.
  - Multi-item → nhiều dòng gói, Tổng = received.
  - `sum(items) != received` → 400.
  - Item thiếu package_name/amount → 400.
  - Report có bill → outbox `image_urls` = list URL bill của PR.
  - seq≥2 vẫn bắt lý do; race → 409.
- BE `test_pr_fully_paid_dingtalk.py`: worker gửi text + N ảnh; lỗi 1 ảnh không chặn tin.
- BE AR reuse: report có items → tạo AR không cần nhập tay; report `items=null` → fallback form.
- FE: CompletionReportModal render form gói, chặn submit khi allocation lệch; nút "Gửi yêu cầu" disable khi chưa báo.

## 7. Đối chiếu 4 tiêu chí
1. **Triệt để:** 1 nguồn dữ liệu (report.items) nuôi cả tin + AR; gói chọn đúng bước; hết cảnh thiếu tên gói.
2. **Không lỗi con:** giữ toàn bộ guard cũ (allocation/bill/seq/race/idempotent) + fallback report backfill.
3. **Không tăng hạ tầng/giảm perf:** 2 cột JSONB, bill URL suy ra sẵn có, tái dùng `send_group_image`; không query nặng thêm.
4. **Tiết kiệm quota:** plan này dùng 2 subagent scope rõ; không fan-out.

## 8. Open questions cần chốt với a Hiếu
1. Thứ tự bước: đồng ý B3 (báo + chọn gói) → B4 (chỉ nút gửi yêu cầu)? Đây là đảo nhẹ quy trình hiện tại.
2. Format dòng gói khi multi-con (UID trong ngoặc vs xuống dòng riêng).
3. Bill nhiều (PR nhiều lần TT) → gửi tuần tự N ảnh có OK không, hay cần gộp/giới hạn.
4. Report backfill cũ (đã có AR, chưa có items) — để nguyên hiển thị "—" hay backfill items từ AR?

## 9. Rollout
- Code trên `sandbox` → migration sandbox → smoke (1 con, multi-con, thêm con đợt 2, bill nhiều).
- Merge `main` → migration prod → verify tin thật (test account, không spam nhóm kế toán).
- Handoff: BE Đạt / FE Đức nếu chia việc (hỏi user MD hay HTML trước khi viết handoff).
