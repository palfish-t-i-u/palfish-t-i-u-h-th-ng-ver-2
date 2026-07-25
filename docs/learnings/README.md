# Learnings

Extracted reasoning from non-trivial solved problems. Each note captures the **trap** (obvious-but-wrong approach), the **insight** (non-obvious fact), and a **checkable rule** — so future engineers and models skip the discovery process.

Written by the `extract-approach` skill. One insight per file.

## Index

<!-- Add entries below: - [topic](filename.md) — one-line hook -->
- [oom-per-request-supabase-clients](oom-per-request-supabase-clients.md) — OOM leo đều theo traffic = per-request client churn; đọc Render metrics shape TRƯỚC khi đọc code
- [filter-after-limit-postgrest](filter-after-limit-postgrest.md) — thêm .range() vào query có lọc hậu kỳ Python = sale mất dữ liệu; filter phải vào SQL trước limit
- [filtered-list-index-vs-stable-line-number](filtered-list-index-vs-stable-line-number.md) — "Lần #" phải dùng line.idx BE đánh (tính cả line huỷ), không dùng index mảng đã lọc
- [mobile-reflow-not-just-width](mobile-reflow-not-just-width.md) — vỡ mobile app desktop-first nằm ở tầng reflow (collapse grid + flex-wrap + break-words), không phải drawer width; pageOverflow==0 không đủ, phải mở từng drawer đo mắt
- [flex-basis-vs-width-mobile](flex-basis-vs-width-mobile.md) — `flex:1` set basis 0% → nuốt `width:100%`; muốn flex item full-row phải `flex-basis:100%`
- [outbox-snapshot-stale-mutable-asset](outbox-snapshot-stale-mutable-asset.md) — bill Zalo ra link text vì URL snapshot trong outbox trỏ file đã xóa; worker phải đọc lại bill_images fresh từ DB, retry URL cũ là fix giả
- [worker-gate-by-event-type-not-source-table](worker-gate-by-event-type-not-source-table.md) — nhiều event_type chung source_table='payment_lines'; gate logic per-event bằng event_type, không thì payment_paid bị dính ảnh bill
- [settlement-pattern-verify-by-cross-sum](settlement-pattern-verify-by-cross-sum.md) — pattern nhận diện settle mPOS/Payoo viết từ nội dung sao kê thật + verify đối chiếu tổng net gateway_transactions; đoán regex = 0 hit cả tháng
- [pillow-thumbnail-before-exif-transpose](pillow-thumbnail-before-exif-transpose.md) — thumbnail() TRƯỚC exif_transpose() để giữ JPEG draft-mode (~5MB thay 36MB); đảo thứ tự = OOM trên Render 512MB
- [lazy-thumb-at-send-covers-backfill](lazy-thumb-at-send-covers-backfill.md) — tạo thumb lazy lúc gửi tin tự phủ bill cũ+mới, không cần backfill migration riêng
- [dual-channel-race-match-only-pending](dual-channel-race-match-only-pending.md) — auto-match chỉ tìm status=pending → kẻ thua race PayOS↔SePay/confirm-tay tạo CK mồ côi lẫn tab CK ngoài; fix khớp muộn 3 chốt, link-only không notify
- [outbox-unique-source-id-second-business-event](outbox-unique-source-id-second-business-event.md) — tin nghiệp vụ lần 2 cùng entity bị outbox UNIQUE nuốt; đổi source_id (suffix deterministic), KHÔNG đổi event_type
- [button-gate-existence-vs-resource](button-gate-existence-vs-resource.md) — gate nút theo hasX = one-shot khoá oan việc resumable; gate theo tài-nguyên-còn-lại (remaining>0) cho việc làm nhiều đợt
- [shared-toolbar-filter-dead-on-parallel-tab](2026-07-20-shared-toolbar-filter-dead-on-parallel-tab.md) — toolbar search/date dùng chung nhưng tab CK ngoài render list riêng (bankPendingTxns) không đọc filter state → control chết câm; mỗi memo list phải tiêu thụ đủ filter
- [dingtalk-markdown-line-break-br-tag](dingtalk-markdown-line-break-br-tag.md) — DingTalk sampleMarkdown render trailing-space thành visible space; dùng `<br>` cho line break
- [egress-visibility-gate-before-slim-payload](egress-visibility-gate-before-slim-payload.md) — egress = size×frequency×tabs; gate visibility (FE-only, cắt tab ẩn refetch) TRƯỚC, slim payload SAU; gate FETCH không gate subscription
- [ios-webkit-sticky-header-sibling-scroll-gap](ios-webkit-sticky-header-sibling-scroll-gap.md) — sticky header mà scroll-container là sibling → WebKit/iOS chèn ~250px trống (Chromium giấu); verify drawer mobile trên Playwright WebKit iPhone, không chỉ Pixel5
- [mobile-drawer-100vh-hides-foot-use-dvh](mobile-drawer-100vh-hides-foot-use-dvh.md) — drawer fixed full-screen mobile `100vh` = cao hơn vùng nhìn khi thanh địa chỉ hiện → `.drawer-foot` (nút Yêu cầu kích hoạt) khuất, không cuộn tới; dùng `100dvh`, fix ở base `.drawer` cascade hết biến thể; headless giấu lỗi
- [ios-input-under-16px-autozoom-reload-chain](ios-input-under-16px-autozoom-reload-chain.md) — input `font-size<16px` → iOS auto-zoom focus → user zoom-out → iOS discard tab reload về Dashboard; fix blanket `16px !important` mobile (thắng đặc hiệu component); WebKit-only, phải test iPhone thật
- [fold-ambiguous-chars-transfer-code-match](fold-ambiguous-chars-transfer-code-match.md) — khách gõ tay NDCK nhầm I→l (verify bằng ASCII() đừng tin mắt); fold {I,L,1}/{O,0} lúc so với guard bất đối xứng (unique + exact amount); ĐỪNG đổi alphabet generator (deterministic, đổi base = collision 2028)
- [stale-refresh-must-not-rebuild-from-own-stale-field](stale-refresh-must-not-rebuild-from-own-stale-field.md) — nút "Cập nhật QR" no-op vì rebuild content từ `line.name_for_transfer` (chính tên CŨ stale) → new==old → early-return không ghi; detect + resolve phải đọc CÙNG nguồn (tên PR hiện tại)
