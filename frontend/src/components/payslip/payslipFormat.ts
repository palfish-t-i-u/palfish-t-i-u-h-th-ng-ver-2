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
