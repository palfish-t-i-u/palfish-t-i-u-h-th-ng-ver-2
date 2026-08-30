/**
 * Permission system types & constants.
 *
 * Two layers:
 *   1. Department → Module  (which modules a department can see/use)
 *   2. Role (User/Leader/Admin) → Data scope (defined in Tài khoản Auth)
 *
 * Access levels per department×module cell:
 *   "full"  — Toàn quyền: xem + tạo/sửa/xoá
 *   "read"  — Chỉ xem: xem data, không thao tác
 *   "none"  — Không có quyền: ẩn module khỏi sidebar
 */

export type AccessLevel = "full" | "read" | "none";

export type MinRole = "sale" | "leader" | "manager";

export const MIN_ROLE_LIST: { value: MinRole; label: string }[] = [
  { value: "sale", label: "Tất cả" },
  { value: "leader", label: "Từ Leader" },
  { value: "manager", label: "Từ Manager" },
];

export const MIN_ROLE_LABELS: Record<MinRole, string> = {
  sale: "Tất cả",
  leader: "Từ Leader",
  manager: "Từ Manager",
};

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  section: string;
}

export interface DepartmentDef {
  key: string;
  label: string;
  color: string; // CSS color class
}

/** All modules in the system, grouped by sidebar section */
export const MODULE_LIST: ModuleDef[] = [
  // ── Khách hàng & Đơn hàng ──
  { key: "dashboard", label: "Bảng thông tin", description: "Tổng quan đơn hàng, doanh thu, KPI", section: "Khách hàng & Đơn hàng" },
  { key: "paymentRequests", label: "Quản lý thanh toán", description: "Tra cứu và xác nhận thanh toán", section: "Khách hàng & Đơn hàng" },
  // ── Đối soát & Hóa đơn ──
  { key: "reconciliation", label: "Đối soát giao dịch (Chuyển khoản)", description: "So khớp chuyển khoản SePay", section: "Đối soát & Hóa đơn" },
  { key: "reconCard", label: "Đối soát giao dịch mPOS/Payoo", description: "So khớp giao dịch quẹt thẻ với lần thanh toán", section: "Đối soát & Hóa đơn" },
  { key: "module3", label: "Tạo gói học", description: "Tạo gói học cho học viên", section: "Đối soát & Hóa đơn" },
  { key: "module4", label: "Xuất hóa đơn", description: "Tạo và xuất hóa đơn VAT", section: "Đối soát & Hóa đơn" },
  // ── Báo cáo ──
  { key: "revenueLedger", label: "Sổ doanh thu", description: "Báo cáo doanh thu theo thời gian, team", section: "Báo cáo" },
  { key: "bc01", label: "BC01: Sales performance", description: "GMV theo team × sale × tháng", section: "Báo cáo" },
  { key: "bc02", label: "BC02: Key Data", description: "Dữ liệu then chốt quy trình bán", section: "Báo cáo" },
  { key: "bc03", label: "BC03: Báo cáo tổng bộ", description: "KPI + doanh thu / trial / referral", section: "Báo cáo" },
  { key: "bc04", label: "BC04: Dòng tiền về", description: "Tiền thực về TK ngân hàng hàng ngày, kèm số dư", section: "Báo cáo" },
  // ── Dữ liệu ──
  { key: "module5", label: "Đồng bộ CRM", description: "Sync & xuất Master Data CRM PalFish", section: "Dữ liệu" },
  { key: "module6", label: "Dashboard Sale", description: "Tổng quan hiệu suất theo team & cá nhân", section: "Dữ liệu" },
  { key: "gatewaySync", label: "Đồng bộ mPOS/Payoo", description: "Kéo giao dịch mPOS & Payoo về app qua tiện ích", section: "Dữ liệu" },
  // ── Quản trị ──
  { key: "zalo", label: "Zalo OA", description: "Cấu hình OA, nhóm thông báo, outbox", section: "Quản trị" },
  // ── Nhân sự ──
  { key: "payslip", label: "Phiếu lương", description: "Xem phiếu lương cá nhân — xác nhận trước & sau thuế", section: "Nhân sự" },
  // ── Tài khoản & Quyền ──
  { key: "authAccounts", label: "Tài khoản Auth", description: "Quản lý tài khoản đăng nhập", section: "Tài khoản & Quyền" },
  { key: "profile", label: "Thông tin cá nhân", description: "Hồ sơ cá nhân người dùng", section: "Tài khoản & Quyền" },
];

/** Unique section names in order */
export const MODULE_SECTIONS = [...new Set(MODULE_LIST.map((m) => m.section))];

/** Departments that can be assigned permissions */
export const DEPARTMENT_LIST: DepartmentDef[] = [
  { key: "sale", label: "Bán hàng", color: "blue" },
  { key: "hr", label: "Nhân sự & Quản trị", color: "purple" },
  { key: "marketing", label: "Marketing", color: "orange" },
  { key: "cs", label: "CS", color: "green" },
];

/** Default permission matrix — seed data */
export const DEFAULT_PERMISSIONS: Record<string, Record<string, AccessLevel>> = {
  sale: {
    dashboard: "full", paymentRequests: "full",
    reconciliation: "full", reconCard: "none", module3: "full", module4: "read",
    revenueLedger: "read", bc01: "read", bc02: "read", bc03: "read", bc04: "none",
    module5: "none", module6: "full", gatewaySync: "none",
    zalo: "none",
    payslip: "full",
    authAccounts: "none", profile: "full",
  },
  hr: {
    dashboard: "full", paymentRequests: "full",
    reconciliation: "full", reconCard: "full", module3: "full", module4: "full",
    revenueLedger: "full", bc01: "full", bc02: "full", bc03: "full", bc04: "full",
    module5: "full", module6: "full", gatewaySync: "full",
    zalo: "full",
    payslip: "full",
    authAccounts: "full", profile: "full",
  },
  marketing: {
    dashboard: "read", paymentRequests: "none",
    reconciliation: "none", reconCard: "none", module3: "none", module4: "none",
    revenueLedger: "full", bc01: "read", bc02: "read", bc03: "read", bc04: "none",
    module5: "none", module6: "none", gatewaySync: "none",
    zalo: "none",
    payslip: "full",
    authAccounts: "none", profile: "full",
  },
  cs: {
    dashboard: "read", paymentRequests: "none",
    reconciliation: "none", reconCard: "none", module3: "full", module4: "none",
    revenueLedger: "none", bc01: "none", bc02: "none", bc03: "none", bc04: "none",
    module5: "none", module6: "none", gatewaySync: "none",
    zalo: "none",
    payslip: "full",
    authAccounts: "none", profile: "full",
  },
};

/** Override for individual users */
export interface PermissionOverride {
  email: string;
  moduleKey: string;
  accessLevel: AccessLevel;
}

/** Cycle access level on click: full → read → none → full */
export function cycleAccessLevel(current: AccessLevel): AccessLevel {
  if (current === "full") return "read";
  if (current === "read") return "none";
  return "full";
}

/** Display labels */
export const ACCESS_LABELS: Record<AccessLevel, string> = {
  full: "Toàn quyền",
  read: "Chỉ xem",
  none: "Không có quyền",
};
