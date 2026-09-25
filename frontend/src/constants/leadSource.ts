export interface LeadChannel {
  /** Mã CRM (có thể trùng giữa nhiều nhãn, vd 300431 = livestream FB + TikTok). */
  code: string;
  label: string;
  /**
   * Khoá mịn lưu vào lead_channel — phân biệt các nhãn cùng `code`.
   * Mặc định = code (1 mã ↔ 1 nhãn). Chỉ set khi 1 code có nhiều nhãn.
   */
  value?: string;
}

export interface LeadSourceDef {
  key: string;
  label: string;
  channels: LeadChannel[];
}

export const LEAD_SOURCES: LeadSourceDef[] = [
  {
    key: "quang_cao",
    label: "Quảng cáo",
    channels: [
      { code: "300265", label: "FB - VN" },
      { code: "300281", label: "FB H5 OV" },
      { code: "300431", value: "300431", label: "FB - Livestream" },
      { code: "300431", value: "300431_ls_tt", label: "TikTok - Livestream" },
      { code: "300561", label: "FB-Instant Form-VN" },
      { code: "300571", label: "FB-Instant Form-OV" },
      { code: "300581", label: "FB-Landing Page-VN" },
      { code: "300531", label: "FB - Paid Partnership" },
      { code: "300301", label: "Tiktok ads" },
      { code: "300551", label: "Tiktokshop" },
      { code: "300541", label: "Zalo" },
      { code: "300291", label: "VN google" },
      { code: "300361", label: "Gọi hotline & nhắn tin FE" },
    ],
  },
  {
    key: "gioi_thieu",
    label: "Giới thiệu",
    channels: [
      { code: "832", label: "Kênh giới thiệu" },
    ],
  },
  {
    key: "offline",
    label: "Offline",
    channels: [
      { code: "300461", label: "HCM Offline booth" },
      { code: "300441", label: "VN Offline booth" },
      { code: "300511", label: "Linh Đàm Offline Store" },
      { code: "932", label: "Offline events" },
    ],
  },
  {
    key: "koc",
    label: "KOC",
    channels: [
      { code: "300391", label: "VN KOC" },
    ],
  },
  {
    key: "gia_han",
    label: "Gia hạn",
    channels: [],
  },
  {
    key: "kho_chung",
    label: "Kho Chung",
    channels: [],
  },
  {
    key: "khac",
    label: "Khác",
    channels: [
      { code: "300444", label: "Tải App - Palfish Class" },
      { code: "300445", label: "Tải App - Palfish English" },
      { code: "300311", label: "Sales tự tìm kiếm" },
      { code: "300471", label: "Sales tự tìm kiếm (HCM)" },
    ],
  },
];

export const LEAD_SOURCE_MAP = new Map(LEAD_SOURCES.map((s) => [s.key, s]));

export function findSourceByKey(key: string | undefined | null): LeadSourceDef | undefined {
  return key ? LEAD_SOURCE_MAP.get(key) : undefined;
}

export function sourceHasChannels(sourceKey: string | undefined | null): boolean {
  const src = findSourceByKey(sourceKey);
  return !!src && src.channels.length > 0;
}

/**
 * Trả về channel code mặc định nếu source chỉ có duy nhất 1 channel (auto-select),
 * ngược lại trả về undefined (user phải tự chọn).
 */
export function defaultChannelForSource(sourceKey: string | undefined | null): string | undefined {
  const src = findSourceByKey(sourceKey);
  if (src && src.channels.length === 1) return src.channels[0].value ?? src.channels[0].code;
  return undefined;
}

/** Giá trị lưu/so khớp của 1 channel = value (nếu có) hoặc code. */
export function channelValue(ch: LeadChannel): string {
  return ch.value ?? ch.code;
}

/** Khớp channel theo giá trị đã lưu (value mịn), fallback code cho dữ liệu cũ. */
export function resolveChannel(
  sourceKey: string | undefined | null,
  storedValue: string | undefined | null,
): LeadChannel | undefined {
  const src = findSourceByKey(sourceKey);
  if (!src || !storedValue) return undefined;
  return (
    src.channels.find((c) => channelValue(c) === storedValue) ??
    src.channels.find((c) => c.code === storedValue)
  );
}

/**
 * Trả về mã CRM (300431...) từ giá trị đã lưu — dùng hiển thị read-only chỉ mã,
 * ẩn hậu tố value mịn. Không cần sourceKey; fallback tách theo '_'.
 */
export function channelCodeFromValue(storedValue: string | undefined | null): string {
  if (!storedValue) return "";
  for (const s of LEAD_SOURCES) {
    for (const c of s.channels) {
      if (channelValue(c) === storedValue) return c.code;
    }
  }
  return storedValue.split("_")[0];
}

export const NEW_CHECK_SOURCES = new Set(["quang_cao", "offline", "koc", "khac"]);

export const LY_DO_KHONG_GHEP = [
  { value: "TU_TIM_DEN", label: "Khách tự tìm đến, không qua quảng cáo" },
  { value: "NGUOI_QUEN_GT", label: "Người quen giới thiệu" },
  { value: "KHACH_CU_MUA_LAI", label: "Khách cũ mua lại" },
  { value: "SO_KHAC_KHONG_NHO", label: "Khách dùng số khác nhưng không nhớ" },
  { value: "KHAC", label: "Khác (ghi chú vào ô Ghi chú)" },
] as const;
