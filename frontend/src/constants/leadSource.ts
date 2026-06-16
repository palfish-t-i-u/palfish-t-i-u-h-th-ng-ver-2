export interface LeadChannel {
  code: string;
  label: string;
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
      { code: "300431", label: "FB - Livestream" },
      { code: "300561", label: "FB-Instant Form-VN" },
      { code: "300571", label: "FB-Instant Form-OV" },
      { code: "300581", label: "FB-Landing Page-VN" },
      { code: "300531", label: "FB - Paid Partnership" },
      { code: "300301", label: "Tiktok ads" },
      { code: "300551", label: "Tiktokshop" },
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
      { code: "300444", label: "Tài App - Palfish Class" },
      { code: "300445", label: "Tài App - Palfish English" },
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
