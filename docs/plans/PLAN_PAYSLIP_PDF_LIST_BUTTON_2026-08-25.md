# PLAN — Nút "Tải PDF" ở màn DANH SÁCH phiếu lương (cạnh nút Xem)

> Ngày: 2026-08-25 · Trạng thái: CHỜ DUYỆT
> Executor: Sonnet 4.6 — plan self-contained, KHÔNG cần context chat. Đọc file này là đủ.
> Nối tiếp `PLAN_PAYSLIP_PDF_1CLICK_2026-08-25.md` (nút trong modal — ĐÃ SHIP). Plan này làm nút thứ 2 ở list.

## Bối cảnh (đủ để đứng một mình)

- Nút "Tải PDF" trong **modal** phiếu lương đã ship (commit `42550d1` trên main): `downloadPayslipPdf(item)` ở `frontend/src/components/payslip/payslipPdf.ts` — lazy-load jsPDF + Roboto vietnamese, `doc.save()` download thẳng.
- Giờ thêm nút "Tải PDF" thứ 2 ở **màn danh sách** (`frontend/src/components/payslip/PayslipTab.tsx`), cạnh nút "Xem".
- **Ràng buộc bảo mật**: PDF chính là nội dung phiếu lương. Xem phiếu yêu cầu re-auth (TOTP/Google/password). Vậy tải PDF từ list **PHẢI qua đúng cổng re-auth đó** — không được bypass.

### YÊU CẦU MỚI — cho user chọn bản khi tải

Mỗi dòng list = 1 NV + 1 kỳ, có tối đa 2 bản: **trước thuế** + **sau thuế**. Khi bấm "Tải PDF":
- Dòng chỉ có **1 bản** → tải thẳng bản đó (không hỏi).
- Dòng có **2 bản** → hiện **modal chọn nhỏ** 3 lựa chọn: **Trước thuế** / **Sau thuế** / **Cả hai**.
  - Chọn 1 bản → 1 file PDF 1 trang.
  - Chọn **Cả hai** → **gom vào 1 file PDF 2 trang** (trang 1 trước thuế, trang 2 sau thuế).

### Luồng re-auth hiện tại (phần khó — đọc kỹ)

`frontend/src/components/payslip/PayslipReauthModal.tsx`:
- `isReauthValid()` **luôn return `false`** (dòng 9-11), `markReauthValid()` no-op → **mỗi lần** tải/xem, non-admin đều re-auth. KHÔNG cache.
- 3 cách: TOTP (nhập mã inline) / password (inline) / **Google (full-page redirect)**.
- Google redirect ghi `sessionStorage` marker `setReauthReturn({code, ky, email, prevToken})`; sau khi về, `PayslipTab` (dòng ~105-118) đọc `getReauthReturn()`, so token đổi + email khớp → gọi `fetchDetail`. **Marker chưa có field phân biệt xem/tải và bản nào** → plan này thêm `action` + `stages`.
- `ReauthReturn` interface: dòng 17-22.

`frontend/src/components/payslip/PayslipTab.tsx` (mốc hiện tại):
- pending state: `pendingCode`, `pendingKy` (~77-79).
- `openDetail` (~140-148): non-admin + !isReauthValid → set pending + mở reauth; else `fetchDetail`.
- `fetchDetail` (~150-174): filter tất cả stage của code+ky → `getPayslip(t.id)` → sort → `setDetailItems` (mở modal).
- `handleReauthSuccess` (~176-183): đóng reauth → `fetchDetail(pending...)`.
- `isAdminRole` (138) = system/manager → bỏ qua re-auth.
- Nút "Xem": desktop ~301-309, mobile ~330-334.
- Có sẵn import `getPayslip` (dòng 2), `Modal` (dòng 13), type `PayslipStage` (dòng 7). Không cần import mới.

## Task 1 — Refactor `frontend/src/components/payslip/payslipPdf.ts` (nhận mảng, nhiều trang)

Thay TOÀN BỘ nội dung file bằng:

```ts
import type { PayslipDetail } from "../../types/payroll";
import { normalizePhieu, stageLabel, buildRows } from "./payslipFormat";

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

/** Tải 1 hoặc nhiều phiếu (mỗi stage 1 trang) thành 1 file PDF. */
export async function downloadPayslipPdf(items: PayslipDetail[]): Promise<void> {
  if (items.length === 0) return;

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

  items.forEach((item, idx) => {
    if (idx > 0) doc.addPage();
    doc.setFont("Roboto", "normal");

    const normalized = normalizePhieu(item.phieu);
    const name = String(normalized["Name"] ?? item.name ?? item.code);
    const chucDanh = typeof normalized["Chức danh"] === "string" ? String(normalized["Chức danh"]) : "";

    doc.setFontSize(14);
    doc.setTextColor(17, 17, 17);
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
        textColor: [17, 17, 17] as [number, number, number],
        cellPadding: { top: 4, bottom: 4, left: 8, right: 8 },
      },
      columnStyles: { 1: { halign: "right" } },
      body: rows.map((r) => (r.isBlockHeader ? [{ content: r.label, colSpan: 2 }] : [r.label, r.value])),
      didParseCell: (data) => {
        if (headerIdx.has(data.row.index)) {
          data.cell.styles.fillColor = [238, 240, 248] as [number, number, number];
          data.cell.styles.fontSize = 10.5;
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY ?? 720;
    doc.setFontSize(8.5);
    doc.setTextColor(136, 136, 136);
    doc.text("Nếu có thắc mắc, vui lòng liên hệ Phòng Nhân sự", PAGE_CENTER_X, finalY + 26, { align: "center" });
    doc.text("Ms. Thu Trang — 0988.934.163 · palfishrecruitment@gmail.com", PAGE_CENTER_X, finalY + 40, { align: "center" });
  });

  const first = items[0];
  const fname =
    items.length === 1
      ? `PhieuLuong_${first.code}_${first.ky_luong}_${first.stage}.pdf`
      : `PhieuLuong_${first.code}_${first.ky_luong}.pdf`;
  doc.save(fname);
}
```

Chỉ là bọc vòng lặp quanh code render cũ (đã verify đẹp) — layout từng trang GIỮ NGUYÊN. Lỗi type `autoTable`/`fillColor` → cast `as [number, number, number]` như file gốc, KHÔNG đổi cách khác.

## Task 2 — `PayslipDetail.tsx` (đổi caller modal sang mảng)

Trong `handlePdf` (hàm trong `ActionBar`), đổi 1 dòng. Old:

```tsx
      const { downloadPayslipPdf } = await import("./payslipPdf");
      await downloadPayslipPdf(item);
```

New:

```tsx
      const { downloadPayslipPdf } = await import("./payslipPdf");
      await downloadPayslipPdf([item]);
```

(Modal tải đúng stage đang xem — 1 trang, hành vi như cũ.)

## Task 3 — `PayslipReauthModal.tsx` (thêm `action` + `stages` vào marker)

**3a.** Interface `ReauthReturn` (dòng 17-22). Old:

```tsx
export interface ReauthReturn {
  code: string;
  ky: string;
  email: string;
  prevToken: string;
}
```

New:

```tsx
export interface ReauthReturn {
  code: string;
  ky: string;
  email: string;
  prevToken: string;
  action?: "view" | "download";
  stages?: ("truoc_thue" | "sau_thue")[];
}
```

**3b.** Props interface (dòng 57-65) — thêm `pendingAction` + `pendingStages`. Old:

```tsx
interface Props {
  open: boolean;
  pendingCode: string | null;
  pendingKy: string | null;
  hasTotp: boolean;
  totpFactorId: string | null;
  onSuccess: () => void;
  onClose: () => void;
}
```

New:

```tsx
interface Props {
  open: boolean;
  pendingCode: string | null;
  pendingKy: string | null;
  pendingAction: "view" | "download";
  pendingStages: ("truoc_thue" | "sau_thue")[];
  hasTotp: boolean;
  totpFactorId: string | null;
  onSuccess: () => void;
  onClose: () => void;
}
```

**3c.** Destructure props (dòng 67). Old:

```tsx
export default function PayslipReauthModal({ open, pendingCode, pendingKy, hasTotp, totpFactorId, onSuccess, onClose }: Props) {
```

New:

```tsx
export default function PayslipReauthModal({ open, pendingCode, pendingKy, pendingAction, pendingStages, hasTotp, totpFactorId, onSuccess, onClose }: Props) {
```

**3d.** `handleGoogleReauth` (dòng 77-88) — ghi `action` + `stages` vào marker. Old:

```tsx
    if (pendingCode && pendingKy) {
      setReauthReturn({
        code: pendingCode,
        ky: pendingKy,
        email: userEmail,
        prevToken: session.access_token,
      });
    }
```

New:

```tsx
    if (pendingCode && pendingKy) {
      setReauthReturn({
        code: pendingCode,
        ky: pendingKy,
        email: userEmail,
        prevToken: session.access_token,
        action: pendingAction,
        stages: pendingStages,
      });
    }
```

## Task 4 — `PayslipTab.tsx` (nút + modal chọn bản + luồng download)

**4a.** Thêm state. Sau khối pending (~77-79). Old:

```tsx
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [pendingKy, setPendingKy] = useState<string | null>(null);
```

New:

```tsx
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [pendingKy, setPendingKy] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"view" | "download">("view");
  const [pendingStages, setPendingStages] = useState<PayslipStage[]>([]);
```

**4b.** Thêm state download + picker. Sau `const [detailError, setDetailError] = useState("");`. Old:

```tsx
  const [detailItems, setDetailItems] = useState<PayslipDetailData[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
```

New:

```tsx
  const [detailItems, setDetailItems] = useState<PayslipDetailData[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [pickerRow, setPickerRow] = useState<{ code: string; ky: string } | null>(null);
```

**4c.** Google return handler (~105-118) — branch theo `marker.action`. Old:

```tsx
    if (tokenChanged && emailMatch) {
      markReauthValid();
      void fetchDetail(marker.code, marker.ky);
    }
```

New:

```tsx
    if (tokenChanged && emailMatch) {
      markReauthValid();
      if (marker.action === "download") void fetchAndDownload(marker.code, marker.ky, marker.stages ?? []);
      else void fetchDetail(marker.code, marker.ky);
    }
```

**4d.** `openDetail` (~140-148) — set action="view". Old:

```tsx
  const openDetail = async (code: string, ky: string) => {
    if (!isAdminRole && !isReauthValid()) {
      setPendingCode(code);
      setPendingKy(ky);
      setReauthOpen(true);
      return;
    }
    await fetchDetail(code, ky);
  };
```

New:

```tsx
  const openDetail = async (code: string, ky: string) => {
    if (!isAdminRole && !isReauthValid()) {
      setPendingCode(code);
      setPendingKy(ky);
      setPendingAction("view");
      setReauthOpen(true);
      return;
    }
    await fetchDetail(code, ky);
  };
```

**4e.** Thêm `openDownload` + `startDownload` + `fetchAndDownload` — chèn NGAY SAU hàm `fetchDetail` (trước `handleReauthSuccess`):

```tsx
  // Bấm "Tải PDF" ở list: 1 bản → tải thẳng; 2 bản → mở modal chọn.
  const openDownload = (code: string, ky: string) => {
    setDownloadError("");
    const stages = payslips
      .filter((p) => p.code === code && p.ky_luong === ky)
      .map((p) => p.stage);
    if (stages.length <= 1) {
      void startDownload(code, ky, stages);
    } else {
      setPickerRow({ code, ky });
    }
  };

  // Sau khi chọn bản (hoặc dòng chỉ 1 bản): qua cổng re-auth rồi tải.
  const startDownload = async (code: string, ky: string, stages: PayslipStage[]) => {
    setPickerRow(null);
    setDownloadError("");
    if (stages.length === 0) return;
    if (!isAdminRole && !isReauthValid()) {
      setPendingCode(code);
      setPendingKy(ky);
      setPendingAction("download");
      setPendingStages(stages);
      setReauthOpen(true);
      return;
    }
    await fetchAndDownload(code, ky, stages);
  };

  const fetchAndDownload = async (code: string, ky: string, stages: PayslipStage[]) => {
    const targets = payslips.filter(
      (p) => p.code === code && p.ky_luong === ky && stages.includes(p.stage)
    );
    if (targets.length === 0) return;
    setDownloadError("");
    setDownloadingKey(`${code}__${ky}`);
    try {
      const results = await Promise.all(targets.map((t) => getPayslip(t.id)));
      results.sort((a, b) => {
        const order: Record<PayslipStage, number> = { truoc_thue: 0, sau_thue: 1 };
        return order[a.stage] - order[b.stage];
      });
      const { downloadPayslipPdf } = await import("./payslipPdf");
      await downloadPayslipPdf(results);
    } catch (e) {
      setDownloadError(formatApiError(e, "Không tải được PDF phiếu lương"));
    } finally {
      setDownloadingKey(null);
    }
  };
```

**4f.** `handleReauthSuccess` (~176-183) — branch theo pendingAction. Old:

```tsx
  const handleReauthSuccess = useCallback(() => {
    setReauthOpen(false);
    if (pendingCode && pendingKy) {
      void fetchDetail(pendingCode, pendingKy);
      setPendingCode(null);
      setPendingKy(null);
    }
  }, [pendingCode, pendingKy]); // eslint-disable-line react-hooks/exhaustive-deps
```

New:

```tsx
  const handleReauthSuccess = useCallback(() => {
    setReauthOpen(false);
    if (pendingCode && pendingKy) {
      if (pendingAction === "download") void fetchAndDownload(pendingCode, pendingKy, pendingStages);
      else void fetchDetail(pendingCode, pendingKy);
      setPendingCode(null);
      setPendingKy(null);
    }
  }, [pendingCode, pendingKy, pendingAction, pendingStages]); // eslint-disable-line react-hooks/exhaustive-deps
```

**4g.** Truyền props vào `PayslipReauthModal` (~234-247). Old:

```tsx
      <PayslipReauthModal
        open={reauthOpen}
        pendingCode={pendingCode}
        pendingKy={pendingKy}
        hasTotp={hasTotp}
        totpFactorId={totpFactorId}
        onSuccess={handleReauthSuccess}
        onClose={() => {
          setReauthOpen(false);
          setPendingCode(null);
          setPendingKy(null);
        }}
      />
```

New — thêm `pendingAction` + `pendingStages`:

```tsx
      <PayslipReauthModal
        open={reauthOpen}
        pendingCode={pendingCode}
        pendingKy={pendingKy}
        pendingAction={pendingAction}
        pendingStages={pendingStages}
        hasTotp={hasTotp}
        totpFactorId={totpFactorId}
        onSuccess={handleReauthSuccess}
        onClose={() => {
          setReauthOpen(false);
          setPendingCode(null);
          setPendingKy(null);
        }}
      />
```

**4h.** Modal chọn bản + banner lỗi — chèn NGAY TRƯỚC `{/* Re-auth modal */}` (sau block filter kỳ lương, ~dòng 233):

```tsx
      {downloadError && <p className="text-sm text-gmv-danger">{downloadError}</p>}

      {/* Modal chọn bản để tải PDF (chỉ hiện khi dòng có cả 2 bản) */}
      <Modal
        open={pickerRow !== null}
        onClose={() => setPickerRow(null)}
        title="Tải PDF phiếu lương"
      >
        <p className="mb-4 text-sm text-gmv-muted">Chọn bản muốn tải về:</p>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => pickerRow && void startDownload(pickerRow.code, pickerRow.ky, ["truoc_thue"])}
          >
            Trước thuế
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => pickerRow && void startDownload(pickerRow.code, pickerRow.ky, ["sau_thue"])}
          >
            Sau thuế
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={() => pickerRow && void startDownload(pickerRow.code, pickerRow.ky, ["truoc_thue", "sau_thue"])}
          >
            Cả hai (1 file 2 trang)
          </Button>
        </div>
      </Modal>
```

> Kiểm tra `Button` có prop `fullWidth` (PayslipReauthModal.tsx dùng `fullWidth` — CÓ). Nếu không có, thay bằng `className="w-full"`.

**4i.** Nút desktop (~301-309). Old:

```tsx
                    <Td>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void openDetail(g.code, g.ky_luong)}
                      >
                        Xem
                      </Button>
                    </Td>
```

New:

```tsx
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void openDetail(g.code, g.ky_luong)}
                        >
                          Xem
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={downloadingKey === `${g.code}__${g.ky_luong}`}
                          onClick={() => openDownload(g.code, g.ky_luong)}
                        >
                          {downloadingKey === `${g.code}__${g.ky_luong}` ? "Đang tạo..." : "Tải PDF"}
                        </Button>
                      </div>
                    </Td>
```

**4j.** Nút mobile (~330-334). Old:

```tsx
              actions={
                <Button size="sm" variant="ghost" onClick={() => void openDetail(g.code, g.ky_luong)}>
                  Xem phiếu
                </Button>
              }
```

New:

```tsx
              actions={
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void openDetail(g.code, g.ky_luong)}>
                    Xem phiếu
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={downloadingKey === `${g.code}__${g.ky_luong}`}
                    onClick={() => openDownload(g.code, g.ky_luong)}
                  >
                    {downloadingKey === `${g.code}__${g.ky_luong}` ? "Đang tạo..." : "Tải PDF"}
                  </Button>
                </div>
              }
```

## Verify (theo thứ tự, dừng ở lỗi đầu)

1. `cd frontend && npx tsc -b` → 0 error.
2. `cd frontend && npm run test` → suite cũ + `payslipPdf.test.ts` pass (test buildRows KHÔNG đổi).
3. Browser, tài khoản **admin** (bỏ qua re-auth):
   - Dòng có 2 bản → bấm Tải PDF → **modal chọn** hiện (Trước thuế / Sau thuế / Cả hai).
     - "Trước thuế" → file `..._truoc_thue.pdf` 1 trang.
     - "Cả hai" → file `PhieuLuong_{code}_{ky}.pdf` **2 trang**, tiếng Việt đủ dấu.
   - Nút Xem vẫn mở modal; Tải PDF trong modal vẫn tải đúng stage đang xem (1 trang).
4. Browser, non-admin **có TOTP**:
   - Dòng 2 bản → Tải PDF → modal chọn → chọn "Cả hai" → **modal nhập mã 6 số** → nhập đúng → PDF 2 trang tải về (KHÔNG mở modal xem phiếu).
   - Bấm Xem → nhập mã → mở modal xem (không tải). Xác nhận 2 hành động không lẫn.
5. (Nếu có Google non-admin) Tải PDF → chọn bản → redirect Google → về app → PDF tự tải đúng bản đã chọn (nhờ `action` + `stages` trong marker).
6. DevTools Network: jspdf + font chỉ tải lần đầu; lần 2 không tải font lại.

## Guardrail

- CẤM bypass re-auth cho tải PDF ở list (non-admin phải qua cổng; admin bỏ qua như Xem).
- Modal chọn chỉ hiện khi dòng có **>1 bản**; 1 bản tải thẳng.
- Refactor `downloadPayslipPdf` sang mảng KHÔNG đổi layout render từng trang.
- Nút modal đổi `downloadPayslipPdf([item])` — giữ 1 stage đang xem.
- CẤM `fontStyle: "bold"/"italic"` (chỉ Roboto normal → bold = mất dấu).
- CẤM import tĩnh jspdf — giữ `import()` động ở cả PayslipDetail.tsx và PayslipTab.tsx (bundle +0KB).
- `pendingAction` + `pendingStages` phải set đúng ở CẢ openDetail ("view") và startDownload ("download" + stages) — thiếu → Google-redirect chạy nhầm.
- KHÔNG đụng RBAC/BE — chỉ tái dùng `getPayslip` (RBAC 403 sẵn ở `backend/payroll_routes.py:183-198`).

## Đánh giá 5 tiêu chí

1. **Triệt để** — ✅ Tải từ list, cho chọn Trước/Sau/Cả hai, "Cả hai" gom 1 file 2 trang, qua đúng cổng re-auth (kể cả Google redirect nhờ `action`+`stages`).
2. **Không lỗi con** — ✅ Tái dùng `getPayslip` (RBAC sẵn) + pattern fetchDetail; pendingAction/pendingStages chặn lẫn; loading + error per-row; refactor render giữ nguyên; picker chỉ hiện khi cần.
3. **Không tăng gánh nặng hạ tầng** — ✅ 0 endpoint BE; bundle +0KB (jspdf lazy); tái dùng `Modal` — 0 component mới.
4. **Tối ưu token** — ✅ Mở rộng `downloadPayslipPdf` sang mảng (không viết PDF mới); test cũ cover data.
5. **Bền vững qua compact** — ✅ Old/new nguyên văn + mốc dòng + luồng re-auth đầy đủ trong file này. Sonnet execute không cần chat.

## Sau khi xong

- 1 commit trên `main`: `feat(payslip): nut Tai PDF o list + chon ban (truoc/sau/ca hai)`. Push do user chạy (`git push origin main`).
- Polish tùy chọn: title reauth modal theo `pendingAction` — không bắt buộc.
