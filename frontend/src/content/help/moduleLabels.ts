// frontend/src/content/help/moduleLabels.ts
// Nhãn hiển thị cho HDSD (sidebar tree, HelpModuleIndex). Tách riêng khỏi
// MainPage.tsx's TITLES để tránh circular import (MainPage render HelpModuleIndex,
// HelpModuleIndex không thể import ngược lại MainPage).
export const HELP_MODULE_LABELS: Record<string, string> = {
  dashboard: "Bảng thông tin",
  paymentRequests: "Quản lý thanh toán",
  reconciliation: "Đối soát giao dịch · Chuyển khoản",
  reconCard: "Đối soát giao dịch · Quẹt thẻ",
  module3: "Tạo gói học",
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
  payslip: "Phiếu lương",
};

export function getModuleLabel(slug: string): string {
  return HELP_MODULE_LABELS[slug] ?? slug;
}

// Nhóm mục lục HDSD theo đúng khu vực nghiệp vụ đã có sẵn trong sidebar app
// thật (frontend/src/pages/MainPage.tsx dòng ~275-360, field `section` trên
// NavItem) — không bịa taxonomy mới, giữ nguyên thứ tự app thật để user không
// phải học lại cách phân loại (feedback anh Minh 2026-07-28).
export const HELP_MODULE_GROUPS: { label: string; moduleSlugs: string[] }[] = [
  { label: "Khách hàng & Đơn hàng", moduleSlugs: ["dashboard", "paymentRequests"] },
  { label: "Đối soát & Hóa đơn", moduleSlugs: ["reconciliation", "reconCard", "module3", "module4"] },
  { label: "Báo cáo", moduleSlugs: ["revenueLedger", "bc01", "bc02", "bc03"] },
  { label: "Dữ liệu", moduleSlugs: ["module5", "module6", "gatewaySync"] },
  {
    label: "Quản trị",
    moduleSlugs: ["zaloConfig", "zaloGroups", "zaloOutbox", "dingtalkConfig", "dingtalkGroups", "dingtalkOutbox"],
  },
  { label: "Nhân sự", moduleSlugs: ["payslip"] },
  { label: "Tài khoản & Quyền", moduleSlugs: ["authAccounts", "permissions", "profile"] },
];

/**
 * Nhóm danh sách module thật (từ listHelpModules()) theo HELP_MODULE_GROUPS.
 * Module nào không khớp slug nào ở trên (vd module mới thêm quên cập nhật
 * nhóm) rơi vào nhóm "Khác" ở cuối thay vì biến mất âm thầm khỏi mục lục.
 */
export function groupHelpModules<T extends { slug: string }>(
  modules: T[]
): { label: string; modules: T[] }[] {
  const bySlug = new Map(modules.map((m) => [m.slug, m]));
  const groups = HELP_MODULE_GROUPS.map((g) => ({
    label: g.label,
    modules: g.moduleSlugs
      .map((slug) => bySlug.get(slug))
      .filter((m): m is T => Boolean(m)),
  })).filter((g) => g.modules.length > 0);

  const groupedSlugs = new Set(HELP_MODULE_GROUPS.flatMap((g) => g.moduleSlugs));
  const leftover = modules.filter((m) => !groupedSlugs.has(m.slug));
  if (leftover.length > 0) groups.push({ label: "Khác", modules: leftover });

  return groups;
}
