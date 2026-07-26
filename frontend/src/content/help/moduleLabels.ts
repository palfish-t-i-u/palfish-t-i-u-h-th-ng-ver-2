// frontend/src/content/help/moduleLabels.ts
// Nhãn hiển thị cho HDSD (sidebar tree, HelpModuleIndex). Tách riêng khỏi
// MainPage.tsx's TITLES để tránh circular import (MainPage render HelpModuleIndex,
// HelpModuleIndex không thể import ngược lại MainPage).
export const HELP_MODULE_LABELS: Record<string, string> = {
  dashboard: "Bảng thông tin",
  paymentRequests: "Quản lý thanh toán",
  reconciliation: "Đối soát giao dịch · Chuyển khoản",
  reconCard: "Đối soát giao dịch · Quẹt thẻ",
  module3: "Kích hoạt khóa học",
  module4: "Xuất hóa đơn",
  revenueLedger: "Sổ doanh thu",
  bc01: "BC01: Sales performance",
  bc02: "BC02: Key Data",
  bc03: "BC03 — Báo cáo tổng bộ",
  module5: "Đồng bộ CRM",
  module6: "Dashboard Sale",
  gatewaySync: "Đồng bộ mPOS / Payoo",
  zaloConfig: "Zalo — Cấu hình OA",
  zaloGroups: "Zalo — Nhóm thông báo",
  zaloOutbox: "Zalo — Outbox",
  dingtalkConfig: "DingTalk — Cấu hình",
  dingtalkGroups: "DingTalk — Nhóm thông báo",
  dingtalkOutbox: "DingTalk — Outbox",
  authAccounts: "Tài khoản Auth",
  permissions: "Phân quyền sử dụng",
  profile: "Thông tin cá nhân",
};

export function getModuleLabel(slug: string): string {
  return HELP_MODULE_LABELS[slug] ?? slug;
}
