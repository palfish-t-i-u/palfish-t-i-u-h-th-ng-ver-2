import { useState } from "react";
import { formatApiError } from "../../lib/apiErrors";
import { formatVndNumber } from "../../lib/vndFormat";
import { confirmPayslip, requestReview } from "../../lib/api/payroll";
import type { PayslipDetail as PayslipDetailType, PayslipListItem, PayslipStage } from "../../types/payroll";
import { Card, CardBody, CardHeader } from "../ui/Card";
import Button from "../ui/Button";

export const PAYSLIP_BLOCKS: { title: string; keys: string[] }[] = [
  { title: "Lương cơ bản", keys: ["Lương cơ bản", "Công", "LCB theo ngày công"] },
  {
    title: "Thưởng + COM",
    keys: ["Thưởng COM", "GMV", "GMV bán mới", "GMV giới thiệu", "GMV tái ký", "KPI", "Tỉ lệ đạt KPI", "% Com ≥100%"],
  },
  { title: "Phụ cấp", keys: ["Hỗ trợ ăn trưa", "Tiền hỗ trợ máy tính", "Hỗ trợ tiền xe + PC trách nhiệm"] },
  { title: "Bảo hiểm", keys: ["Bảo hiểm + note", "Bảo hiểm"] },
  {
    title: "Thuế + Bù tiền",
    keys: ["Khấu trừ thuế", "Thue_TNCN", "Thu_nhap_tinh_thue", "Giam_tru_ban_than", "Giam_tru_NPT", "Tong_thu_nhap", "Bù tiền", "Note"],
  },
  { title: "Tổng tiền", keys: ["Tổng lương + thưởng", "Tổng lương", "Luong_thanh_toan (Net)"] },
];

const HEADER_KEYS = new Set(["STT", "Name", "Chức danh"]);
const ALL_BLOCK_KEYS = new Set(PAYSLIP_BLOCKS.flatMap((b) => b.keys));

function formatValue(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") return formatVndNumber(val) || String(val);
  return String(val);
}

function isReviewLocked(kyLuong: string): boolean {
  const parts = kyLuong.split("-").map(Number);
  const y = parts[0], m = parts[1];
  if (!y || !m) return false;
  const payMonth = m === 12 ? 1 : m + 1;
  const payYear = m === 12 ? y + 1 : y;
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const vnYear = vnNow.getUTCFullYear();
  const vnMonth = vnNow.getUTCMonth() + 1;
  const vnDay = vnNow.getUTCDate();
  if (vnYear > payYear) return true;
  if (vnYear === payYear && vnMonth > payMonth) return true;
  if (vnYear === payYear && vnMonth === payMonth && vnDay >= 4) return true;
  return false;
}

function stageLabel(stage: PayslipStage) {
  return stage === "truoc_thue" ? "Trước thuế" : "Sau thuế";
}

interface BlockProps {
  phieu: Record<string, unknown>;
}

function PhieuBlocks({ phieu }: BlockProps) {
  const renderedKeys = new Set<string>();

  return (
    <div className="space-y-4">
      {PAYSLIP_BLOCKS.map((block) => {
        const rows = block.keys.filter((k) => k in phieu && phieu[k] !== "" && phieu[k] !== null);
        if (rows.length === 0) return null;
        rows.forEach((k) => renderedKeys.add(k));
        return (
          <Card key={block.title}>
            <CardHeader className="py-3 text-base">{block.title}</CardHeader>
            <CardBody className="p-0">
              <dl className="divide-y divide-gmv-border">
                {rows.map((k) => (
                  <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-gmv-muted">{k}</dt>
                    <dd className="font-medium text-gmv-text-strong text-right">{formatValue(phieu[k])}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        );
      })}

      {/* Fallback block "Khác" — mọi key lạ không bao giờ mất */}
      {(() => {
        const otherKeys = Object.keys(phieu).filter(
          (k) => !HEADER_KEYS.has(k) && !ALL_BLOCK_KEYS.has(k) && phieu[k] !== "" && phieu[k] !== null
        );
        if (otherKeys.length === 0) return null;
        return (
          <Card key="khac">
            <CardHeader className="py-3 text-base text-gmv-muted">Khác</CardHeader>
            <CardBody className="p-0">
              <dl className="divide-y divide-gmv-border">
                {otherKeys.map((k) => (
                  <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-gmv-muted">{k}</dt>
                    <dd className="font-medium text-gmv-text-strong text-right">{formatValue(phieu[k])}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        );
      })()}
    </div>
  );
}

interface ActionBarProps {
  item: PayslipDetailType;
  onUpdate: (updated: PayslipListItem) => void;
}

function ActionBar({ item, onUpdate }: ActionBarProps) {
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [actionError, setActionError] = useState("");

  const locked = isReviewLocked(item.ky_luong);
  const confirmed = item.confirm_status === "confirmed";
  const reviewRequested = item.review_status === "requested";

  const handleConfirm = async () => {
    setActionError("");
    setLoadingConfirm(true);
    try {
      const updated = await confirmPayslip(item.id);
      onUpdate(updated);
    } catch (e) {
      setActionError(formatApiError(e, "Không thể xác nhận phiếu"));
    } finally {
      setLoadingConfirm(false);
    }
  };

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

  return (
    <div className="mt-4 space-y-2">
      {actionError && <p className="text-sm text-gmv-danger">{actionError}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ok"
          disabled={confirmed || loadingConfirm}
          onClick={() => void handleConfirm()}
        >
          {loadingConfirm ? "Đang xác nhận..." : confirmed ? "Đã xác nhận" : "Xác nhận"}
        </Button>
        <Button
          variant="secondary"
          disabled={locked || reviewRequested || loadingReview}
          title={locked ? "Đã qua hạn (khóa từ mùng 4)" : reviewRequested ? "Đã gửi yêu cầu" : undefined}
          onClick={() => void handleReview()}
        >
          {loadingReview
            ? "Đang gửi..."
            : reviewRequested
            ? "Đã yêu cầu xem lại"
            : "Yêu cầu xem xét lại"}
        </Button>
      </div>
      {locked && (
        <p className="text-xs text-gmv-muted">
          Đã qua hạn yêu cầu xem xét lại (khóa từ mùng 4 tháng trả lương).
        </p>
      )}
    </div>
  );
}

interface Props {
  items: PayslipDetailType[];
  onUpdate: (updated: PayslipListItem) => void;
}

export default function PayslipDetail({ items, onUpdate }: Props) {
  const [activeStage, setActiveStage] = useState<PayslipStage>(items[0]?.stage ?? "truoc_thue");

  const current = items.find((i) => i.stage === activeStage) ?? items[0];
  if (!current) return null;

  const hasMultiple = items.length > 1;
  const name = String(current.phieu["Name"] ?? current.name ?? current.code);
  const chucDanh = typeof current.phieu["Chức danh"] === "string" ? current.phieu["Chức danh"] : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-gmv-lg border border-gmv-border bg-gmv-canvas p-4 shadow-gmv-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-base font-semibold text-gmv-text-strong">{name}</p>
            {chucDanh && <p className="text-sm text-gmv-muted">{String(chucDanh)}</p>}
          </div>
          <div className="text-right text-sm text-gmv-muted">
            <p>Mã NV: {current.code}</p>
            <p>Kỳ lương: {current.ky_luong}</p>
          </div>
        </div>
      </div>

      {/* Stage tabs */}
      {hasMultiple && (
        <div className="flex gap-2">
          {items.map((it) => (
            <button
              key={it.stage}
              onClick={() => setActiveStage(it.stage)}
              className={
                "rounded-gmv-md border px-4 py-1.5 text-sm font-semibold transition " +
                (activeStage === it.stage
                  ? "border-gmv-primary bg-gmv-primary text-white"
                  : "border-gmv-border bg-gmv-canvas text-gmv-text hover:bg-gmv-bg")
              }
            >
              {stageLabel(it.stage)}
            </button>
          ))}
        </div>
      )}

      {/* 6 block + Khác */}
      <PhieuBlocks phieu={current.phieu} />

      {/* 2 nút hành động */}
      <ActionBar item={current} onUpdate={onUpdate} />
    </div>
  );
}
