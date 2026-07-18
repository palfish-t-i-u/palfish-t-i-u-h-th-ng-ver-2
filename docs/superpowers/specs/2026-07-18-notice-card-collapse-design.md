# Design — Thu gọn/mở rộng card cảnh báo xuất HĐ (tab Kích hoạt)

**Ngày:** 2026-07-18
**Tác giả:** Minh (Phạm Anh Minh) + Claude
**Nguồn feedback:** Chị Thu Hiền (14:46 18/07/2026) — "bỏ phần Lưu ý này đi cho đỡ nhiều thông tin trên màn hình" + "Số tiền căn phải mà tiêu đề căn trái".
**Module:** Kích hoạt & Xuất hóa đơn (B3/B4) — `ActivationTab.tsx`. Xem skill `activation-and-invoicing`.

---

## 1. Vấn đề

Trong drawer AR (tab Kích hoạt), mỗi gói học thiếu điều kiện xuất HĐ hiện 1 card cảnh báo (thêm ở commit `c5227eb`):
- **Card cứng** (vàng): "Chưa xuất được hoá đơn — còn thiếu:" + danh sách (tên gói / số tiền / địa chỉ).
- **Card mềm** (xanh): "Lưu ý:" — thiếu Order ID nhưng vẫn xuất được.

Khi có nhiều gói / chia đôi màn hình → các card chiếm nhiều diện tích, rối. Chị Hiền muốn giảm thông tin nhưng vẫn giữ tín hiệu cảnh báo (Minh: giữ để onboard nhân sự mới đỡ điền thiếu).

Ngoài ra: header cột "Số tiền" căn phải nhưng giá trị căn trái → lệch thị giác.

## 2. Mục tiêu

1. Card cảnh báo **thu gọn/mở rộng** được — thu gọn chỉ còn 1 dòng tóm tắt (icon + tiêu đề + màu đặc trưng) để vẫn biết gói có vấn đề, mở khi cần xem chi tiết.
2. **Per-card**: bấm 1 card → thu/mở chính card đó.
3. **Global**: 1 nút thu/mở **tất cả** card trên mọi gói học, mọi AR.
4. **Lưu trạng thái** phía client, giữ qua tắt/bật app.
5. Fix căn lề cột Số tiền.

## 3. Quyết định thiết kế (đã chốt với Minh)

| Quyết định | Chọn | Lý do |
|---|---|---|
| Nơi lưu | **localStorage** | Setting UI thuần client, server không cần → không dùng cookie (cookie bị đính mọi request = ngược tiêu chí 3). |
| Mặc định lần đầu | **Thu gọn** | Đúng ý "bớt thông tin trên màn hình"; vẫn thấy dòng tóm tắt + màu. |
| Phạm vi | **Cả 2 loại card** (mềm + cứng) | Đồng nhất thao tác. Card cứng thu gọn vẫn giữ màu vàng + icon → tín hiệu blocking vẫn nổi bật (ẩn chi tiết, không ẩn cảnh báo). |

## 4. Kiến trúc trạng thái

### 4.1 Mô hình dữ liệu

1 nguồn state đặt tại component `ActivationDetailDrawer` (cha của mọi card trong drawer), persist vào localStorage:

```ts
// localStorage key: "activation.noticeCards.v1"
type NoticeCollapseState = {
  defaultCollapsed: boolean;              // mặc định true
  overrides: Record<string, boolean>;     // ngoại lệ per-card so với default
};
```

- **cardKey** = `` `${arId}::${courseCode}` `` — ổn định, duy nhất xuyên mọi AR (courseCode dạng `CC-{PR4}-{seq}`, ghép arId để tuyệt đối tránh trùng).
- **Hiệu lực (đang thu gọn?)** của 1 card:
  ```
  isCollapsed(key) = overrides[key] ?? defaultCollapsed
  ```

### 4.2 Ba thao tác

**Bấm 1 card** (chevron hoặc cả header):
```
next = !isCollapsed(key)
if (next === defaultCollapsed) delete overrides[key]   // trùng default → xóa cho map gọn
else overrides[key] = next
```

**Nút global "Thu gọn tất cả" / "Mở rộng tất cả"** (đặt ở header drawer):
```
setDefaultCollapsed(target)   // target = !defaultCollapsed
clear overrides = {}          // mọi card mọi AR về theo default mới
```
→ vì hiệu lực fallback về `defaultCollapsed`, xóa hết overrides khiến TẤT CẢ card (kể cả AR chưa mở) theo trạng thái global. Nhãn nút phản ánh `defaultCollapsed`: đang thu gọn → hiện "Mở rộng tất cả", ngược lại "Thu gọn tất cả".

**Mở/tắt app lại:** đọc localStorage đồng bộ lúc khởi tạo state (lazy initializer) → không nhấp nháy (no flash). Ghi lại localStorage qua `useEffect` khi state đổi.

### 4.3 Đơn vị code

**Hook mới `frontend/src/hooks/useNoticeCardCollapse.ts`** — đóng gói toàn bộ, interface rõ:
```ts
function useNoticeCardCollapse(): {
  isCollapsed: (cardKey: string) => boolean;
  toggle: (cardKey: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  allCollapsed: boolean;   // = defaultCollapsed (cho nhãn nút global)
};
```
- Đọc/ghi localStorage bọc `try/catch`. localStorage không dùng được (ẩn danh / quota) → state sống in-memory trong phiên, không crash, chỉ không persist.
- Parse localStorage phòng thủ: JSON hỏng / thiếu field → về default an toàn (`{ defaultCollapsed: true, overrides: {} }`).

Không cần React Context: chỉ 1 drawer AR mở tại một thời điểm → state ở `ActivationDetailDrawer`, truyền `isCollapsed`/`toggle` xuống từng card, nút global gọi `collapseAll`/`expandAll`. "Mọi AR" đảm bảo qua `defaultCollapsed` persist.

### 4.4 Guardrails (đầy đủ)

| # | Rủi ro | Xử lý |
|---|---|---|
| G1 | localStorage không khả dụng (ẩn danh, tắt cookie/storage, quota) | Mọi `getItem`/`setItem` bọc `try/catch`. Lỗi → state sống in-memory phiên hiện tại, không crash, chỉ không persist. |
| G2 | JSON trong localStorage hỏng / thiếu field / sai kiểu | Parse phòng thủ: validate shape (`defaultCollapsed` boolean, `overrides` object). Sai bất kỳ → về default `{defaultCollapsed:true, overrides:{}}`. |
| G3 | Không có `window` (SSR / môi trường test lạ) | `typeof window === "undefined"` → khởi tạo default, bỏ qua đọc/ghi localStorage. |
| G4 | Bấm nhanh 2 lần, hoặc global + per-card gần nhau → stale closure | Toàn bộ cập nhật dùng **functional updater** `setState(prev => ...)`. Không đọc state ngoài updater. |
| G5 | `courseCode` rỗng (gói mới chưa lưu) → nhiều card cùng key `"arId::"` đè nhau | cardKey = `courseCode ? \`${arId}::${courseCode}\` : \`${arId}::idx${courseIdx}\``. Không bao giờ ra key cụt. |
| G6 | Rò rỉ: gói đã invoiced/xóa → key override rác tồn tại vĩnh viễn | (a) Cleanup: xóa override khi trùng default. (b) Global toggle xóa sạch overrides. (c) **Soft-cap**: khi nạp/ghi, nếu `overrides` > 300 key → reset `overrides = {}` (dead keys tự biến mất, chi phí = mọi card về default — chấp nhận được vì hiếm khi chạm ngưỡng). |
| G7 | Đa tab: user mở 2 cửa sổ, đổi ở tab A → tab B stale | Lắng nghe `window` event `"storage"` lọc đúng key → cập nhật state từ giá trị mới. 1 `useEffect` gắn/gỡ listener. |
| G8 | Bấm nhầm vào link/nội dung chi tiết cũng toggle | Handler toggle CHỈ gắn ở dòng header (icon + tiêu đề + chevron). `<ul>` chi tiết nằm ngoài vùng bấm. |
| G9 | Đổi schema state sau này làm vỡ dữ liệu cũ | Key có version `...v1`. Đổi shape → bump `v2`, dữ liệu cũ bị bỏ qua (G2 lo phần đọc). |

## 5. Giao diện

### 5.1 Card thu gọn / mở

- **Thu gọn:** chỉ render dòng header = icon `AlertCircle` + tiêu đề + chevron (phải). Giữ nguyên `background`/`border` theo loại (vàng cứng / xanh mềm). Ẩn `<ul>` chi tiết.
- **Mở:** như hiện tại + chevron xoay lên.
- Cả dòng header là vùng bấm toggle: `cursor: pointer`, `role="button"`, `aria-expanded`, `tabIndex=0`, hỗ trợ Enter/Space.

### 5.2 Nút global

- Vị trí: **footer drawer, cạnh nút `Copy AR-ID`** (bên trái, cùng hàng — đây là hàng nút luôn hiện, sticky). Nhãn động theo `allCollapsed` ("Thu gọn tất cả" / "Mở rộng tất cả"). Icon chevron đôi. Chỉ hiện khi AR có ≥1 card cảnh báo (không có gói thiếu gì → ẩn nút cho gọn).

### 5.3 Fix căn lề Số tiền

- Thêm `text-align: right` cho ô giá trị số tiền (`.course-row .amt-input`) → header (đã căn phải) + giá trị cùng phải, chuẩn cột số. Cột Course Code / Order ID giữ căn trái.

## 6. File thay đổi

| File | Loại | Việc |
|---|---|---|
| `frontend/src/hooks/useNoticeCardCollapse.ts` | MỚI | State + localStorage + API |
| `frontend/src/hooks/useNoticeCardCollapse.test.ts` | MỚI | Unit test |
| `frontend/src/components/ActivationTab.tsx` | Sửa | Card thu gọn/mở + chevron + toggle; nút global; truyền hook |
| `frontend/src/styles/prototype-payments.css` | Sửa | Style card thu gọn / chevron + `.amt-input` căn phải |
| `MODULES.md` | Sửa | Ghi file hook mới vào index module Kích hoạt |

## 7. Kiểm thử

Unit test `useNoticeCardCollapse.test.ts` (Vitest + `@testing-library/react` `renderHook`, mock localStorage):

**Logic lõi**
1. Mặc định (localStorage rỗng) → `isCollapsed(bất kỳ)` = true; `allCollapsed` = true.
2. `toggle(key)` từ mặc-định-thu-gọn → card đó mở; card khác vẫn thu gọn.
3. `toggle` lần 2 về đúng default → override bị xóa (persist: overrides không chứa key).
4. `collapseAll` / `expandAll` → đổi `defaultCollapsed`, xóa sạch overrides.
5. **(mạnh hóa 4)** Có sẵn vài overrides + `expandAll` → MỌI card (kể cả từng override) đều mở; overrides = {}.
6. Persist: sau thao tác, mount hook mới đọc lại localStorage → giữ nguyên trạng thái.

**Guardrails (map 1-1 với §4.4)**
7. G1 — `setItem`/`getItem` mock throw → hook không throw; `toggle` vẫn đổi state in-memory.
8. G2 — localStorage chứa JSON hỏng / thiếu field / sai kiểu → về default, không throw.
9. G4 — hai `toggle(key)` liên tiếp trong 1 act → về đúng trạng thái đầu, override sạch (chứng minh functional update).
10. G5 — hai gói `courseCode` rỗng khác `courseIdx` → 2 cardKey khác nhau, toggle gói này không ảnh hưởng gói kia.
11. G6 — nạp localStorage với >300 override key → sau init/thao tác, overrides bị reset về {}.
12. G7 — dispatch `StorageEvent` (key đúng, giá trị mới) → `isCollapsed`/`allCollapsed` phản ánh giá trị tab khác.

Không thêm test render nặng cho ActivationTab (đã có test khác); logic collapse + guardrail nằm gọn ở hook → test hook là đủ ground truth. Phần UI (chevron xoay, header bấm, nút global ẩn/hiện) verify bằng browser lúc implement.

## 8. Bốn tiêu chí

1. **Triệt để:** `defaultCollapsed` + `overrides` phủ per-card + global + mọi AR + persist qua restart.
2. **Không lỗi con:** 9 guardrail §4.4 (G1–G9: fallback/parse localStorage, window guard, functional update, cardKey fallback, chống rò rỉ override, đồng bộ đa tab, vùng bấm, version key) — mỗi cái map 1 test §7. Đọc sync lúc init (no flash).
3. **Hạ tầng/hiệu năng:** localStorage 0 gọi mạng; đọc localStorage 1 lần vào state (không mỗi render); ghi qua useEffect debounce tự nhiên theo state change.
4. **Token-frugal:** 2 file mới nhỏ + sửa 3 file; 1 hook cô lập; không refactor ngoài phạm vi; plan inline không bung workflow (theo guardrail cá nhân của Minh).

## 9. Ngoài phạm vi (YAGNI)

- Không đồng bộ setting lên server / giữa nhiều máy (chỉ client-side theo yêu cầu).
- Không animation thu gọn phức tạp (chỉ show/hide + xoay chevron).
- Không đụng logic blocker (`getInvoiceBlockers`) — chỉ đổi cách hiển thị card.
