# PLAN — Tạo hộ PR + Chuyển giao PR + Nhật ký lưu chuyển (2026-07-23)

> Nguồn: đề xuất Sale Leader 22/07 (doc "Tạo hộ và chuyển giao PR"). Anh Hiếu đã đưa các Sale Leader đọc, không có feedback → làm theo defaults mục 8 của doc.

## Vì sao kiến trúc hiện tại thuận lợi

`payment_requests.sale_email` là **cột sở hữu duy nhất**. Mọi hạ nguồn resolve từ nó **lúc runtime**:

| Hạ nguồn | Cơ chế | Hệ quả khi đổi sale_email |
|---|---|---|
| List/scope B1 | `sale_email IN visible_creator_emails` (`payment_request_routes.py:1677`) | Tự đúng ngay |
| Zalo/DingTalk (cả Python enqueue + SQL trigger) | JOIN `pr.sale_email → nhan_su_sale.team` lúc enqueue | Tin SAU thời điểm chuyển về team mới; tin đã gửi không thu hồi (đúng doc) |
| AR (B3) | Không lưu sale — re-read PR lúc serialize (`activation_routes.py:419`) | Tự đúng ngay |
| Sổ doanh thu | Snapshot `sale_crm_name` lúc kích hoạt, **insert-once** (check tồn tại theo `crm_order_id` rồi return — `revenue_routes.py:917-927`) | Doanh thu đã chốt giữ nguyên sale cũ (đúng Q4); doanh thu mới theo sale mới |
| BXH/Dashboard | Group `so_doanh_thu.sale_crm_name` | Theo snapshot — đúng semantics doc mục 5.1 |

→ Chỉ cần: (1) cho phép set `sale_email` ≠ actor lúc tạo, (2) endpoint đổi `sale_email`, (3) bảng nhật ký. Không sửa gì ở notification/revenue/dashboard.

## Defaults áp dụng (mục 8 doc — không ai phản đối)

1. Leader chọn sale trong team+sub_team mình (dùng đúng `visible_creator_emails`); Manager = cả team; System = mọi sale.
2. Manager tạo hộ/chuyển phạm vi team. ✔
3. Chuyển được ở **mọi giai đoạn** (kể cả sau kích hoạt) — không đụng doanh thu đã chốt (tự nhiên do insert-once).
4. Doanh thu quá khứ **giữ nguyên**, nhật ký làm mốc đối soát. ✔
5. Lý do: **tùy chọn**, free text.
6. **Không** thông báo Zalo/app cho sale được gán.
7. Sale tự bàn giao PR của mình → leader; leader thao tác cả 2 chiều.
8. A→B đi vòng 2 bước qua leader, mỗi bước 1 dòng nhật ký. ✔ (enforce bằng axis rule)
9. Leader chuyển cho bất kỳ sale trong team mình. ✔

**Quyết định kỹ thuật bổ sung** (chưa có trong doc, cần thì đổi sau):
- **Axis rule enforce cứng**: mọi transfer phải có ≥1 đầu (from hoặc to) role ∈ {leader, manager} — chặn sale↔sale 1 bước với mọi actor (kể cả system) để nhật ký luôn "đi qua leader".
- `ops` (kế toán) **không** được tạo hộ/chuyển (doc chỉ nói Leader/Manager); system được.
- `is_test` theo **owner** (không theo người bấm): tạo hộ → is_test của sale sở hữu; transfer → recompute theo owner mới (tránh account @dev nuốt/nhả thông báo sai).
- Không transfer PR đã hủy (cancelled) — vô nghĩa, tránh nhiễu nhật ký.
- Backfill nhật ký: 1 dòng `create` cho mọi PR cũ (from=NULL, to=sale_email, actor=sale_email, created_at=PR.created_at) → timeline đầy đủ từ ngày 1.

## Schema

`backend/migrations/2026-07-23-pr-ownership-log.sql`:

```sql
pr_ownership_log (
  id uuid PK default gen_random_uuid(),
  pr_id text NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  action text CHECK ('create' | 'create_on_behalf' | 'transfer'),
  from_sale_email text NULL,       -- NULL với create
  to_sale_email text NOT NULL,
  actor_email text NOT NULL,       -- người bấm nút
  reason text NULL,
  created_at timestamptz default now()
)
```
+ index (pr_id, created_at) + RLS service_role bypass (pattern 2026-06-08) + backfill + NOTIFY.

## Backend (`payment_request_routes.py`)

1. `PaymentRequestCreate` + field `owner_sale_email: str | None`. Trong create route: nếu có và ≠ actor → validate role ≥ leader (không ops) + owner trong scope (`visible_creator_emails`) + tồn tại & is_active trong `nhan_su_sale` → set `sale_email=owner`, `is_test=_is_test_email(owner)`. Ghi log `create_on_behalf`. Mọi PR mới (kể cả tạo thường) ghi log `create`.
2. `POST /payment-requests/{id}/transfer` body `{to_sale_email, reason?}`:
   - actor role: sale (chỉ PR của mình → to role ≥ leader cùng team+sub_team), leader/manager (from & to trong scope), system (mọi nơi). ops → 403.
   - axis rule: role(from) hoặc role(to) ∈ {leader,manager} (lookup `nhan_su_sale.role`).
   - to ≠ from, to tồn tại + is_active, PR chưa cancelled.
   - UPDATE `sale_email` + recompute `is_test` → insert log `transfer` → `log_audit("pr.owner_transferred")`.
3. `GET /payment-requests/{id}/ownership-log` — ai thấy PR thì thấy log; enrich tên từ `nhan_su_sale`.
4. `GET /payment-requests/owner-options` — roster theo role actor (sale → leaders cùng sub_team; leader → members team+sub_team; manager → team; system → all active). FE dùng cho cả ô tạo hộ + modal chuyển.

## Frontend

- `CreatePaymentRequestModal`: field "Sale sở hữu PR" (Combobox), chỉ hiện khi role ∈ {leader, manager, system} và options > 0. Default = chính mình.
- `PaymentRequestDetailDrawer`: nút "Chuyển sale" (drawer-foot, cạnh Huỷ PR) → modal chọn người nhận + lý do; section "Lịch sử lưu chuyển" (trên AuditTrail) fetch ownership-log.
- `types/paymentRequest.ts` + `lib/api.ts`: types + 3 endpoint mới.

## Không làm (theo doc mục 10)

- Không sửa hồi tố `so_doanh_thu` (đã tự nhiên nhờ insert-once).
- Không thu hồi tin Zalo/DingTalk đã gửi.
- Không sync về CRM PalFish.
- Không cho sale↔sale trực tiếp.

## Rủi ro & đối sách

- **Outbox pending chưa gửi lúc transfer**: giữ group cũ (đã resolve lúc enqueue) — chấp nhận, cùng loại "tin đã bắn".
- **PR đã kích hoạt rồi mới chuyển + sau đó AR bị sửa/re-sync**: dòng ledger cũ vẫn giữ (insert-once return sớm theo `crm_order_id`). Course MỚI append sau transfer → ghi sale mới (đúng "doanh thu mới theo sale mới").
- **FastAPI route order**: `GET /payment-requests/owner-options` không đụng route param nào hiện có (không tồn tại `GET /payment-requests/{id}` trần).
