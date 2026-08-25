import { useState } from "react";
import { formatApiError } from "../../lib/apiErrors";
import { formatVndNumber } from "../../lib/vndFormat";
import { confirmPayslip, requestReview } from "../../lib/api/payroll";
import type { PayslipDetail as PayslipDetailType, PayslipListItem, PayslipStage } from "../../types/payroll";
import { Card, CardBody, CardHeader } from "../ui/Card";
import Button from "../ui/Button";
import { printPayslip } from "./payslipPrint";

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

export function stageLabel(stage: PayslipStage) {
  return stage === "truoc_thue" ? "Trước thuế" : "Sau thuế";
}

interface BlockProps {
  phieu: Record<string, unknown>;
}

function PhieuBlocks({ phieu }: BlockProps) {
  const normalized = normalizePhieu(phieu);

  return (
    <div className="space-y-2">
      {PAYSLIP_BLOCKS.map((block) => {
        const rows: { key: string; dataKey: string }[] = [];
        for (const blockKey of block.keys) {
          for (const dk of Object.keys(normalized)) {
            if (matchesBlockKey(dk, blockKey) && normalized[dk] !== "" && normalized[dk] !== null) {
              rows.push({ key: blockKey, dataKey: dk });
            }
          }
        }
        if (rows.length === 0) return null;
        return (
          <Card key={block.title}>
            <CardHeader className="py-1.5 text-sm">{block.title}</CardHeader>
            <CardBody className="p-0">
              <dl className="divide-y divide-gmv-border">
                {rows.map((r) => (
                  <div key={r.dataKey} className="flex justify-between gap-4 px-3 py-1 text-[13px]">
                    <dt className="text-gmv-muted">{r.dataKey}</dt>
                    <dd className="font-medium text-gmv-text-strong text-right">{formatValue(normalized[r.dataKey], r.dataKey)}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        );
      })}

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
    <div className="mt-2 space-y-1.5">
      {actionError && <p className="text-xs text-gmv-danger">{actionError}</p>}
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
        <Button variant="ghost" onClick={() => printPayslip(item)}>
          Tải PDF
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

  const normalized = normalizePhieu(current.phieu);
  const hasMultiple = items.length > 1;
  const name = String(normalized["Name"] ?? current.name ?? current.code);
  const chucDanh = typeof normalized["Chức danh"] === "string" ? normalized["Chức danh"] : null;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="rounded-gmv-lg border border-gmv-border bg-gmv-canvas p-3 shadow-gmv-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gmv-text-strong">{name}</p>
            {chucDanh && <p className="text-xs text-gmv-muted">{String(chucDanh)}</p>}
          </div>
          <div className="text-right text-xs text-gmv-muted">
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

      {/* Footer liên hệ HR */}
      <p className="pt-2 text-center text-xs text-gmv-muted leading-relaxed">
        Nếu Anh/Chị có thắc mắc, vui lòng liên hệ Phòng Nhân sự
        {" "}(<span className="font-medium">Ms. Thu Trang — 0988.934.163</span>)
        <br />
        Email: <span className="font-medium">palfishrecruitment@gmail.com</span>
      </p>

      {/* 2 nút hành động */}
      <ActionBar item={current} onUpdate={onUpdate} />
    </div>
  );
}
