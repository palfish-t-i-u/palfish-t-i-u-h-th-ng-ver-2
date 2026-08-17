# TypeScript: type và component cùng tên → Duplicate identifier khi import chung file

**Related files:** `frontend/src/components/payslip/PayslipTab.tsx`, `frontend/src/types/payroll.ts`, `frontend/src/components/payslip/PayslipDetail.tsx`

**Problem:** `PayslipTab.tsx` cần dùng cả **type** `PayslipDetail` (từ `types/payroll.ts`) lẫn **component** `PayslipDetail` (từ `components/payslip/PayslipDetail.tsx`). TypeScript báo `error TS2300: Duplicate identifier 'PayslipDetail'` và `TS2693: 'PayslipDetail' only refers to a type, but is being used as a value here`.

**Trap:** Đặt tên type bằng đúng tên component rồi import cả hai vào file cùng scope. TypeScript gộp chúng và không phân biệt được.

**Insight:** Khi type và component đặt tên trùng nhau, **alias một trong hai** ngay tại import:
```ts
// Alias type để tránh clash
import type { PayslipDetail as PayslipDetailData } from "../../types/payroll";
import PayslipDetail from "./PayslipDetail";

// Dùng alias cho state/generic
const [items, setItems] = useState<PayslipDetailData[] | null>(null);
// Dùng tên gốc cho JSX
return <PayslipDetail items={items} />;
```
Convention tốt: type alias thêm hậu tố `Data`/`Type`/`Info`; component giữ tên đơn giản.

**Rule:** Trước khi tạo type có tên trùng component trong cùng domain, hỏi: "File nào sẽ cần import cả hai?" — nếu có, đặt tên type khác ngay từ đầu (vd. `PayslipDetailRecord`, `PayslipDetailPayload`).

**Verify:** `npx tsc -b` trong `frontend/` — phải pass 0 error về `Duplicate identifier`.
