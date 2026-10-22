/**
 * Kênh chăm sóc CS (Sale→CS handover khâu 1) — KHÁC lead_channel (nguồn lead).
 * Sale chọn khi báo đơn; ghi vào cột "Kênh liên hệ" của sheet bàn giao.
 * Dùng làm GỢI Ý trong Combobox freeText — sale gõ được nền tảng khác ngoài list.
 */
export const CARE_CHANNELS = ["Zalo", "Messenger", "WhatsApp", "Viber", "Kakao", "Line", "Telegram", "WeChat", "Facebook"] as const;

export type CareChannel = (typeof CARE_CHANNELS)[number];
