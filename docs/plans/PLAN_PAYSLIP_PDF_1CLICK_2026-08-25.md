# PLAN — Nút "Tải PDF" phiếu lương: download 1-click (jsPDF)

> Ngày: 2026-08-25 · Trạng thái: CHỜ DUYỆT
> Executor: Sonnet 4.6 — plan self-contained, KHÔNG cần context chat. Đọc file này là đủ.
> Thứ tự task BẮT BUỘC: 0 → 1 → 2 → 3 → 4 → 5 → 6 → Verify.

## Bối cảnh (đủ để đứng một mình)

- Hiện tại nút "Tải PDF" trong modal phiếu lương (`ActionBar` của `frontend/src/components/payslip/PayslipDetail.tsx`) gọi `printPayslip()` (`frontend/src/components/payslip/payslipPrint.ts`) → mở cửa sổ + print dialog. User muốn **bấm 1 phát ra file PDF luôn** (hộp thoại lưu file), không qua print dialog.
- Giải pháp: jsPDF + jspdf-autotable, **lazy-load toàn bộ** (dynamic `import()`), font Roboto đặt ở `frontend/public/fonts/` fetch runtime → main bundle +0KB.
- 2 bẫy đã xác định trước (PHẢI tuân thủ):
  1. **Font phải là static TTF có subset Vietnamese.** Repo google/fonts hiện chứa variable font (`Roboto[wdth,wght].ttf`) — jsPDF parse không đáng tin. TTF subset chỉ-Latin sẽ tạo PDF **mất dấu tiếng Việt mà không báo lỗi**. Nguồn chuẩn ở Task 0.
  2. **jspdf-autotable mặc định dùng helvetica-bold cho vài style** → fallback mất dấu. Mọi tầng style PHẢI ép `font: "Roboto", fontStyle: "normal"`; hàng tiêu đề block nổi bật bằng `fillColor` + `fontSize`, KHÔNG dùng bold.

## Task 0 — Môi trường (PowerShell, KHÔNG dùng Bash — hook RTK làm hỏng lệnh)

```powershell
cd "D:\File làm việc\automation\palfish-gmv-reconciliation-v2\frontend"
New-Item -ItemType Directory -Force public\fonts
Invoke-WebRequest -Uri "https://gwfh.mranftl.com/api/fonts/roboto?download=zip&subsets=latin,vietnamese&variants=regular&formats=ttf" -OutFile "$env:TEMP\roboto.zip"
Expand-Archive "$env:TEMP\roboto.zip" "$env:TEMP\roboto-ttf" -Force
Get-ChildItem "$env:TEMP\roboto-ttf" -Recurse -Filter *.ttf | Select-Object -First 1 | Copy-Item -Destination "public\fonts\Roboto-Regular.ttf"
(Get-Item "public\fonts\Roboto-Regular.ttf").Length
```

- **Sanity check size**: kết quả `.Length` phải **40.000–250.000 bytes**. Dưới 40KB = nghi subset thiếu glyph Việt → DỪNG, dùng fallback.
- **Fallback nếu gwfh.mranftl.com chết/size sai**: tải thủ công từ fonts.google.com → search "Roboto" → Download family → trong zip lấy `static/Roboto-Regular.ttf` (~170KB, full glyph) → đặt vào `frontend/public/fonts/Roboto-Regular.ttf`.

```powershell
npm install jspdf jspdf-autotable
```

- Thêm vào file `.gitattributes` ở **repo root** (tạo mới nếu chưa có) dòng: `*.ttf binary` — TRƯỚC khi `git add` font (tránh git đụng line-ending làm hỏng file binary trên Windows).

## Task 1 — NEW `frontend/src/components/payslip/payslipFormat.ts`

Tách logic format thuần (không React, không API) ra file riêng để: (a) `payslipPdf.ts` import không kéo theo component chain, (b) unit test import an toàn không cần env. Nội dung = **di chuyển nguyên văn** từ `PayslipDetail.tsx`, tạo file với đúng nội dung sau:

```ts
import { formatVndNumber } from "../../lib/vndFormat";
import type { PayslipStage } from "../../types/payroll";

export const PAYSLIP_BLOCKS: { title: string; keys: string[] }[] = [
  { title: "Lương cơ bản", keys: ["Lương cơ bản", "Công", "LCB theo ngày công"] },
  {
    title: "Thưởng + COM",
    keys: ["Thưởng COM", "GMV", "GMV bán mới", "GMV giới thiệu", "GMV tái ký", "KPI", "Tỉ lệ đạt KPI", "% Com ≥100%"],
  },
  { title: "Phụ cấp", keys: ["Hỗ trợ ăn trưa", "Tiền hỗ trợ máy tính", "Hỗ trợ tiền xe + PC trách nhiệm"] },
  { title: "Bảo hiểm", keys: ["Bảo hiểm", "Note"] },
  {
    title: "Thuế + Bù tiền",
    keys: ["Khấu trừ thuế", "Thue_TNCN", "Thu_nhap_tinh_thue", "Giam_tru_ban_than", "Giam_tru_NPT", "Tong_thu_nhap", "Bù tiền", "Ghi chú"],
  },
  { title: "Tổng tiền", keys: ["Tổng lương + thưởng", "Tổng lương", "Luong_thanh_toan (Net)"] },
];

const KEY_NORMALIZE: Record<string, string> = {
  "Luong co ban": "Lương cơ bản",
  "LCB theo ngay cong": "LCB theo ngày công",
  "Thuong COM": "Thưởng COM",
  "Ho tro an trua": "Hỗ trợ ăn trưa",
  "Tien ho tro may tinh": "Tiền hỗ trợ máy tính",
  "Ho tro tien xe + PC trach nhiem": "Hỗ trợ tiền xe + PC trách nhiệm",
  "Bao hiem + note": "Bảo hiểm + note",
  "Bao hiem": "Bảo hiểm",
  "Luong_thanh_toan (Net)": "Tổng lương + thưởng",
  "Tổng lương + thưởng (Net)": "Tổng lương + thưởng",
  "Khau tru thue": "Khấu trừ thuế",
  "Bu tien": "Bù tiền",
  "Ghi chu": "Ghi chú",
  "Tong luong + thuong": "Tổng lương + thưởng",
  "Tong luong": "Tổng lương",
  "Chuc danh": "Chức danh",
};

const PREFIX_KEYS = ["Khấu trừ thuế", "Ghi chú"];

export function normalizePhieu(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = KEY_NORMALIZE[k] ?? k;
    if (nk === "Bảo hiểm + note") {
      result["Bảo hiểm"] = v;
      if (!("Note" in raw)) result["Note"] = "—";
      continue;
    }
    result[nk] = v;
  }
  return result;
}

export function matchesBlockKey(dataKey: string, blockKey: string): boolean {
  if (dataKey === blockKey) return true;
  if (PREFIX_KEYS.includes(blockKey) && dataKey.startsWith(blockKey)) return true;
  return false;
}

const KEEP_DECIMAL = new Set(["Công", "Tỉ lệ đạt KPI", "% Com ≥100%"]);

export function formatValue(val: unknown, key?: string): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") {
    if (key && KEEP_DECIMAL.has(key)) return val.toLocaleString("vi-VN");
    return formatVndNumber(val) || String(val);
  }
  return String(val);
}

export function stageLabel(stage: PayslipStage) {
  return stage === "truoc_thue" ? "Trước thuế" : "Sau thuế";
}
```

## Task 2 — EDIT `frontend/src/components/payslip/PayslipDetail.tsx`

**2a.** Thay khối import đầu file. Old (nguyên văn hiện tại):

```tsx
import { useState } from "react";
import { formatApiError } from "../../lib/apiErrors";
import { formatVndNumber } from "../../lib/vndFormat";
import { confirmPayslip, requestReview } from "../../lib/api/payroll";
import type { PayslipDetail as PayslipDetailType, PayslipListItem, PayslipStage } from "../../types/payroll";
import { Card, CardBody, CardHeader } from "../ui/Card";
import Button from "../ui/Button";
import { printPayslip } from "./payslipPrint";
```

New:

```tsx
import { useState } from "react";
import { formatApiError } from "../../lib/apiErrors";
import { confirmPayslip, requestReview } from "../../lib/api/payroll";
import type { PayslipDetail as PayslipDetailType, PayslipListItem, PayslipStage } from "../../types/payroll";
import { Card, CardBody, CardHeader } from "../ui/Card";
import Button from "../ui/Button";
import { PAYSLIP_BLOCKS, normalizePhieu, matchesBlockKey, formatValue, stageLabel } from "./payslipFormat";
```

**2b.** XÓA toàn bộ các định nghĩa đã move sang `payslipFormat.ts` (từ `export const PAYSLIP_BLOCKS` đến hết `export function stageLabel(...) { ... }`, gồm: `PAYSLIP_BLOCKS`, `KEY_NORMALIZE`, `PREFIX_KEYS`, `normalizePhieu`, `matchesBlockKey`, `KEEP_DECIMAL`, `formatValue`, `stageLabel`). GIỮ NGUYÊN `isReviewLocked` (vẫn dùng nội bộ). GIỮ NGUYÊN toàn bộ component `PhieuBlocks`, `ActionBar`, `PayslipDetail`.

## Task 3 — NEW `frontend/src/components/payslip/payslipPdf.ts`

Tạo file với đúng nội dung sau:

```ts
import type { PayslipDetail } from "../../types/payroll";
import { PAYSLIP_BLOCKS, normalizePhieu, formatValue, matchesBlockKey, stageLabel } from "./payslipFormat";

export type PdfRow = { label: string; value: string; isBlockHeader?: boolean };

/** Dựng danh sách dòng PDF — mirror 100% logic render PhieuBlocks (6 block, bỏ key rỗng). */
export function buildRows(phieu: Record<string, unknown>): PdfRow[] {
  const normalized = normalizePhieu(phieu);
  const rows: PdfRow[] = [];
  for (const block of PAYSLIP_BLOCKS) {
    const blockRows: PdfRow[] = [];
    for (const blockKey of block.keys) {
      for (const dk of Object.keys(normalized)) {
        if (matchesBlockKey(dk, blockKey) && normalized[dk] !== "" && normalized[dk] !== null) {
          blockRows.push({ label: dk, value: formatValue(normalized[dk], dk) });
        }
      }
    }
    if (blockRows.length === 0) continue;
    rows.push({ label: block.title, value: "", isBlockHeader: true });
    rows.push(...blockRows);
  }
  return rows;
}

// Cache base64 font trong module — fetch 1 lần / session; file tĩnh có browser cache.
let fontB64: string | null = null;

async function loadFontB64(): Promise<string> {
  if (fontB64) return fontB64;
  const res = await fetch("/fonts/Roboto-Regular.ttf");
  if (!res.ok) throw new Error(`Font HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  fontB64 = btoa(bin);
  return fontB64;
}

const PAGE_CENTER_X = 297.6; // A4 width 595.28pt / 2

export async function downloadPayslipPdf(item: PayslipDetail): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, font] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadFontB64(),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  // CHỈ có Roboto "normal" — cấm mọi fontStyle "bold"/"italic"
  // (bold sẽ fallback Helvetica → MẤT DẤU tiếng Việt).
  doc.addFileToVFS("Roboto-Regular.ttf", font);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.setFont("Roboto", "normal");

  const normalized = normalizePhieu(item.phieu);
  const name = String(normalized["Name"] ?? item.name ?? item.code);
  const chucDanh = typeof normalized["Chức danh"] === "string" ? String(normalized["Chức danh"]) : "";

  doc.setFontSize(14);
  doc.text(`PHIẾU LƯƠNG — ${stageLabel(item.stage).toUpperCase()}`, PAGE_CENTER_X, 48, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(85, 85, 85);
  const sub = [name, chucDanh, `Mã NV: ${item.code}`, `Kỳ: ${item.ky_luong}`].filter(Boolean).join("  ·  ");
  doc.text(sub, PAGE_CENTER_X, 66, { align: "center" });

  const rows = buildRows(item.phieu);
  const headerIdx = new Set(rows.map((r, i) => (r.isBlockHeader ? i : -1)).filter((i) => i >= 0));

  autoTable(doc, {
    startY: 84,
    margin: { left: 48, right: 48 },
    theme: "plain",
    styles: {
      font: "Roboto",
      fontStyle: "normal",
      fontSize: 10,
      textColor: [17, 17, 17],
      cellPadding: { top: 4, bottom: 4, left: 8, right: 8 },
    },
    columnStyles: { 1: { halign: "right" } },
    body: rows.map((r) => (r.isBlockHeader ? [{ content: r.label, colSpan: 2 }] : [r.label, r.value])),
    didParseCell: (data) => {
      if (headerIdx.has(data.row.index)) {
        data.cell.styles.fillColor = [238, 240, 248];
        data.cell.styles.fontSize = 10.5;
      } else {
        data.cell.styles.lineWidth = { bottom: 0.5 };
        data.cell.styles.lineColor = [235, 235, 235];
      }
    },
  });

  const finalY =
    (doc as InstanceType<typeof jsPDF> & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 720;
  doc.setFontSize(8.5);
  doc.setTextColor(136, 136, 136);
  doc.text("Nếu có thắc mắc, vui lòng liên hệ Phòng Nhân sự", PAGE_CENTER_X, finalY + 26, { align: "center" });
  doc.text("Ms. Thu Trang — 0988.934.163 · palfishrecruitment@gmail.com", PAGE_CENTER_X, finalY + 40, { align: "center" });

  doc.save(`PhieuLuong_${item.code}_${item.ky_luong}_${item.stage}.pdf`);
}
```

Lưu ý version types: nếu `tsc -b` báo lỗi ở `lineWidth: { bottom: 0.5 }` (types khác version), XÓA 2 dòng `lineWidth`/`lineColor` trong nhánh else (chỉ là kẻ dòng cosmetic) — KHÔNG tìm cách khác.

## Task 4 — EDIT `PayslipDetail.tsx` — ActionBar

**4a.** Thêm state. Old:

```tsx
function ActionBar({ item, onUpdate }: ActionBarProps) {
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [actionError, setActionError] = useState("");
```

New — thêm 1 dòng cuối:

```tsx
function ActionBar({ item, onUpdate }: ActionBarProps) {
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [actionError, setActionError] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);
```

**4b.** Thêm handler sau `handleReview`. Old (anchor — giữ nguyên, chỉ chèn thêm sau):

```tsx
  const handleReview = async () => {
    setActionError("");
    setLoadingReview(true);
    try {
      const updated = await requestReview(item.id);
      onUpdate(updated);
    } catch (e) {
      setActionError(formatApiError(e, "Không thể gửi yêu cầu xem xét lại"));
    } finally {
      setLoadingReview(false);
    }
  };
```

Chèn ngay sau khối trên:

```tsx
  const handlePdf = async () => {
    setActionError("");
    setLoadingPdf(true);
    try {
      const { downloadPayslipPdf } = await import("./payslipPdf");
      await downloadPayslipPdf(item);
    } catch {
      setActionError("Không tạo được PDF — thử lại hoặc báo IT.");
    } finally {
      setLoadingPdf(false);
    }
  };
```

**4c.** Thay nút. Old:

```tsx
        <Button variant="ghost" onClick={() => printPayslip(item)}>
          Tải PDF
        </Button>
```

New:

```tsx
        <Button variant="ghost" disabled={loadingPdf} onClick={() => void handlePdf()}>
          {loadingPdf ? "Đang tạo PDF..." : "Tải PDF"}
        </Button>
```

## Task 5 — XÓA `payslipPrint.ts` + grep guard

```powershell
cd "D:\File làm việc\automation\palfish-gmv-reconciliation-v2"
git rm frontend/src/components/payslip/payslipPrint.ts
```

Grep guard (phải 0 kết quả ngoài file test/pdf mới tạo):

- `grep -r "payslipPrint" frontend/src` → 0 hits
- `grep -r "from \"./PayslipDetail\"" frontend/src` → 0 hits (không ai import helper từ component nữa)
- `grep -rn "printPayslip" frontend/src` → 0 hits

## Task 6 — NEW `frontend/src/components/payslip/payslipPdf.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildRows } from "./payslipPdf";

describe("buildRows — mirror UI 6 block", () => {
  const phieu = {
    STT: 1,
    Name: "Phạm Anh Minh",
    "Khối": "MARKETING",
    "Luong co ban": 6000000,
    "Công": 24,
    "Thuong COM": "",
    "Khấu trừ thuế tháng 07": 600000,
    "Tong luong + thuong": 5400000,
  };

  it("nhóm đúng block, bỏ key rỗng, ẩn key ngoài mẫu", () => {
    const rows = buildRows(phieu);
    const labels = rows.map((r) => r.label);

    // Block header đầu tiên + flag
    expect(rows[0]).toEqual({ label: "Lương cơ bản", value: "", isBlockHeader: true });
    // Số format vi-VN
    expect(rows).toContainEqual({ label: "Lương cơ bản", value: "6.000.000" });
    expect(rows).toContainEqual({ label: "Tổng lương + thưởng", value: "5.400.000" });
    // Prefix match "Khấu trừ thuế..."
    expect(rows).toContainEqual({ label: "Khấu trừ thuế tháng 07", value: "600.000" });
    // Key ngoài mẫu KHÔNG xuất hiện
    expect(labels).not.toContain("Khối");
    expect(labels).not.toContain("Name");
    expect(labels).not.toContain("STT");
    // "Thưởng COM" rỗng → cả block không render
    expect(labels).not.toContain("Thưởng + COM");
    // KEEP_DECIMAL: Công giữ nguyên 24
    expect(rows).toContainEqual({ label: "Công", value: "24" });
  });
});
```

Nếu assertion số fail vì format (`formatVndNumber` trả khác "6.000.000"): đọc `frontend/src/lib/vndFormat.ts` để lấy format thật rồi sửa **expected trong test** cho khớp — KHÔNG sửa formatValue.

## Verify (chạy theo thứ tự, dừng ở lỗi đầu)

1. `cd frontend && npx tsc -b` → 0 error.
2. `cd frontend && npx vitest run src/components/payslip/payslipPdf.test.ts` → pass. Sau đó `npm run test` full suite → không vỡ test cũ.
3. Browser (dev server): mở tab Phiếu lương → Xem 1 phiếu → bấm **Tải PDF** → nút chuyển "Đang tạo PDF..." → file `PhieuLuong_<mã>_<kỳ>_<stage>.pdf` tải về ngay (KHÔNG mở print dialog, KHÔNG mở tab mới).
4. Mở file PDF kiểm tra: tiêu đề "PHIẾU LƯƠNG — TRƯỚC THUẾ"; tên đủ dấu ("Phạm Anh Minh"); các dòng "Lương cơ bản", "Khấu trừ thuế", "Hỗ trợ ăn trưa" **đủ dấu tiếng Việt**; số dạng `5.400.000`; 6 block nền tím nhạt đúng thứ tự UI; footer HR (Ms. Thu Trang — 0988.934.163).
5. DevTools Network: chunk jspdf + font chỉ load ở lần bấm đầu; bấm lần 2 không fetch font lại.
6. Nếu có phiếu sau thuế: tab "Sau thuế" → Tải PDF → file `_sau_thue.pdf`, tiêu đề "— SAU THUẾ".

## Guardrail

- KHÔNG đụng logic Xác nhận / Yêu cầu xem xét lại / re-auth / RBAC.
- PDF lấy dữ liệu qua `PAYSLIP_BLOCKS` + `buildRows` dùng chung — CẤM hardcode danh sách khoản riêng cho PDF (lệch mẫu chị Trang = lỗi).
- CẤM `fontStyle: "bold"`/`"italic"` ở mọi chỗ trong payslipPdf.ts (chỉ có Roboto normal được nhúng).
- CẤM import tĩnh `jspdf`/`jspdf-autotable` ở bất kỳ file nào — phải là `import()` động (giữ main bundle +0KB).
- `.gitattributes` có `*.ttf binary` trước khi add font.
- Lỗi tạo PDF → `setActionError`, không được crash modal.

## Đánh giá 5 tiêu chí

1. **Triệt để** — ✅ 1-click ra file PDF, tiếng Việt chuẩn (font subset vietnamese + ép font mọi tầng autotable), mirror đúng 6 block mẫu.
2. **Không lỗi con** — ✅ 2 bẫy font đã chặn trong plan; PDF dùng chung logic format với UI (không drift); test buildRows chốt hành vi; fallback lineWidth đã định sẵn.
3. **Không tăng gánh nặng hạ tầng** — ✅ 0 endpoint BE; main bundle +0KB (lazy chunk + font tĩnh cache); font ~60-90KB tải 1 lần.
4. **Tối ưu token** — ✅ Tái dùng format logic (move, không viết lại); plan 1 file tự chứa, Sonnet không cần đọc thêm context.
5. **Bền vững qua context compact** — ✅ Toàn bộ old/new code nguyên văn + lệnh PowerShell nguyên văn + expected output nằm trong file này (`docs/plans/PLAN_PAYSLIP_PDF_1CLICK_2026-08-25.md`).

## Sau khi xong

- Commit trên `main` (đang ở main, feature payslip trước đó cũng đã đi main): 1 commit gọn `feat(payslip): 1-click PDF download (jsPDF + Roboto vietnamese)`. Push do user chạy (`git push origin main` — classifier chặn push tự động).
- Nút "Tải PDF" thứ 2 ở màn danh sách (cạnh nút Xem): **NGOÀI SCOPE plan này** — cần threading re-auth, làm plan riêng sau.
