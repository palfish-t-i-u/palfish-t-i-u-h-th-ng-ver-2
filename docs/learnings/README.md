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
