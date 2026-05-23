# PalFish GMV — Design system (production UI)

Internal ops app. **Light-only** (`gmv-light-ui` trên `#root`). Brand adapt từ portal Khách hàng — không copy Ant Design 1:1.

Wireframe draft (`docs/wireframes.html`) dùng accent `#2f6feb`; **app thật** dùng bảng màu bên dưới.

## Mockup tham chiếu

Snapshot high-fidelity (plan UI refresh): Tạo đơn + Quản lý đơn. Có thể commit PNG vào `docs/images/`; nếu chưa có file, xem lại bản vẽ trong plan hoặc chạy `npm run dev`.

## Tokens (`frontend/src/gmv-tokens.css`)

| Token | Value | Use |
|-------|-------|-----|
| `--gmv-primary` | `#7260ff` | CTA, active nav, accent |
| `--gmv-primary-soft` | `#eeebff` | Nav active, card header, dropdown hover |
| `--gmv-canvas` | `#ffffff` | Cards, sidebar, inputs |
| `--gmv-bg` | `#f6f7fb` | Page background |
| `--gmv-text` | `rgba(0,0,0,0.65)` | Body |
| `--gmv-text-strong` | `#1f2330` | Headings |
| `--gmv-muted` | `#5c7db8` | Subtitles, table header, placeholders |
| `--gmv-link` | `#1890ff` | Hyperlinks only (không làm primary button) |
| `--gmv-border` | `#d6dae4` | Borders |
| `--gmv-shadow-1` / `--gmv-shadow-2` | subtle 2px | Cards, header, dropdown |
| `--gmv-ok` / `--gmv-warn` / `--gmv-danger` | wireframe semantic | Status, badges |
| `--gmv-radius-lg` / `md` / `sm` | 16 / 8 / 4 px | CTA / input / tag |

Import order: `index.css` → `gmv-tokens.css` → `gmv-theme.css` (`main.tsx`).

## Tailwind

`bg-gmv-primary`, `text-gmv-muted`, `rounded-gmv-lg`, `shadow-gmv-1`, … — config: [`frontend/tailwind.config.js`](../frontend/tailwind.config.js).

## Components (`frontend/src/components/ui/`)

| Component | Ghi chú |
|-----------|---------|
| `Button` | `primary` \| `secondary` \| `ghost` \| `danger` \| `ok` |
| `Input` / `Select` / `Textarea` | Focus ring primary |
| `Card` + `CardHeader` + `CardBody` | Header soft `#eeebff` |
| `Badge` | Pill trạng thái |
| `Table` + `TableWrap` + `Th`/`Td`/`Tr` | Ops tables |
| `Modal` | Payment + bill preview |
| `PageSection` | Title block trong tab |

Barrel: `components/ui/index.ts`.

## Layout

- **Desktop:** sidebar 240px (`AppShell`), content `max-w-[1400px]`.
- **Mobile (`< md`):** sidebar ẩn; bottom tab bar 5 mục đầu, touch ≥ 44px.

## VietQR (không thuộc design token)

STK / BIN: `frontend/src/constants/bank.ts` + `VITE_BANK_*` — xem `docs/SETUP_ENV.md` § VietQR.

## Rules (Do / Don't)

1. Dùng token / class `gmv-*` — tránh hex mới trong component.
2. Primary action = filled `#7260ff`, chữ trắng.
3. Không gradient; shadow lớn chỉ modal overlay.
4. Không `style={{}}` mới — Tailwind + UI primitives.
5. Semantic xanh/cam/đỏ cho trạng thái nghiệp vụ, không đổi sang tím.

## LLM prompt ví dụ

```
Card rounded-gmv-lg bg-gmv-canvas shadow-gmv-1, CardHeader soft #eeebff.
Primary button bg-gmv-primary min-h-40px rounded-gmv-lg.
Table th: text-xs uppercase text-gmv-muted bg-gmv-table-head.
```
