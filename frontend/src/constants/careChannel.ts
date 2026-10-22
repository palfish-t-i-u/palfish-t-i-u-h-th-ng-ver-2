/**
 * Kênh chăm sóc CS (Sale→CS handover khâu 1) — KHÁC lead_channel (nguồn lead).
 * Sale chọn khi báo đơn; ghi vào cột "Kênh liên hệ" của sheet bàn giao.
 */
export const CARE_CHANNELS = ["Zalo", "Viber", "WhatsApp", "Kakao"] as const;

export type CareChannel = (typeof CARE_CHANNELS)[number];
