import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthAccountsTab from "../components/AuthAccountsTab";
import PermissionsTab from "../components/permissions/PermissionsTab";
import Module5Tab from "../components/Module5Tab";
import Module6Tab from "../components/Module6Tab";
import DashboardTab from "../components/DashboardTab";
import { PaymentFlowProvider, usePaymentFlow, type PaymentFlowView } from "../contexts/PaymentFlowContext";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import ProfilePage from "./ProfilePage";
import AppShell, { type NavChildItem, type NavItem } from "../layouts/AppShell";
import Badge from "../components/ui/Badge";
import { DEPARTMENT_LIST } from "../types/permissions";
import NotificationBell from "../components/NotificationBell";
import { lazyRetry } from "../lib/lazyRetry";

const BC01SalesPerformance = lazyRetry(() => import("../components/reports/BC01SalesPerformance"));
const BC02KeyDataReport = lazyRetry(() => import("../components/reports/BC02KeyDataReport"));
const ReportBC03Tab = lazyRetry(() => import("../components/ReportBC03Tab"));
const PaymentRequestsTab = lazyRetry(() => import("../components/PaymentRequestsTab"));
const ReconciliationTab = lazyRetry(() => import("../components/ReconciliationTab"));
const CardReconciliationTab = lazyRetry(() => import("../components/CardReconciliationTab"));
const GatewaySyncTab = lazyRetry(() => import("../components/GatewaySyncTab"));
const ActivationTab = lazyRetry(() => import("../components/ActivationTab"));
const InvoiceRequestTab = lazyRetry(() => import("../components/InvoiceRequestTab"));
const SoDoanhThuTab = lazyRetry(() => import("../components/SoDoanhThuTab"));
const ZaloConfigTab = lazyRetry(() => import("../components/admin/ZaloConfigTab"));
const ZaloGroupsTab = lazyRetry(() => import("../components/admin/ZaloGroupsTab"));
const ZaloOutboxTab = lazyRetry(() => import("../components/admin/ZaloOutboxTab"));
const DingTalkConfigTab = lazyRetry(() => import("../components/admin/DingTalkConfigTab"));
const DingTalkGroupsTab = lazyRetry(() => import("../components/admin/DingTalkGroupsTab"));
const DingTalkOutboxTab = lazyRetry(() => import("../components/admin/DingTalkOutboxTab"));

const PRELOAD_MAP: Record<string, () => Promise<unknown>> = {
  paymentRequests: () => import("../components/PaymentRequestsTab"),
  reconciliation: () => import("../components/ReconciliationTab"),
  reconCard: () => import("../components/CardReconciliationTab"),
  module3: () => import("../components/ActivationTab"),
  module4: () => import("../components/InvoiceRequestTab"),
  revenueLedger: () => import("../components/SoDoanhThuTab"),
  bc01: () => import("../components/reports/BC01SalesPerformance"),
  bc02: () => import("../components/reports/BC02KeyDataReport"),
  bc03: () => import("../components/ReportBC03Tab"),
  gatewaySync: () => import("../components/GatewaySyncTab"),
};

type ViewId =
  | "dashboard"
  | "paymentRequests"
  | "reconciliation"
  | "reconCard"
  | "profile"
  | "module3"
  | "module4"
  | "revenueLedger"
  | "bc01"
  | "bc02"
  | "bc03"
  | "module5"
  | "module6"
  | "gatewaySync"
  | "authAccounts"
  | "permissions"
  | "zaloConfig"
  | "zaloGroups"
  | "zaloOutbox"
  | "dingtalkConfig"
  | "dingtalkGroups"
  | "dingtalkOutbox";

const FLOW_VIEW_MAP: Record<PaymentFlowView, ViewId> = {
  paymentRequests: "paymentRequests",
  reconciliation: "reconciliation",
  module3: "module3",
  module4: "module4",
  reconCard: "reconCard",
};

function ViewFallback() {
  return (
    <div className="p-6 text-center text-sm text-gmv-muted animate-pulse">
      Đang tải dữ liệu...
    </div>
  );
}

const I = {
  list: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  history: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <line x1="12" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="15" y2="14" />
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  team: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  invoice: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  ledger: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  chart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  database: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
};

const TITLES: Record<ViewId, { title: string; subtitle?: string }> = {
  dashboard: {
    title: "Bảng thông tin",
    subtitle: "Vinh danh, xếp hạng doanh thu, nhiệm vụ thưởng tuần và sự kiện nội bộ",
  },
  paymentRequests: {
    title: "Quản lý thanh toán",
    subtitle: "Theo dõi Payment Requests, biên lai & tiến độ chuyển khoản của khách",
  },
  reconciliation: {
    title: "Đối soát giao dịch · Chuyển khoản",
    subtitle: "PayOS / SePay — kế toán xác nhận tiền CK đã về theo sao kê",
  },
  reconCard: {
    title: "Đối soát giao dịch · Quẹt thẻ",
    subtitle: "Ghép giao dịch mPOS & Payoo với đúng lần thanh toán của PR",
  },
  profile: { title: "Thông tin cá nhân" },
  module3: {
    title: "Kích hoạt khóa học",
    subtitle: "B3 — Active Request, Course Code & Order ID CRM",
  },
  module4: { title: "Xuất hóa đơn", subtitle: "B4 — Phát hành INV theo Course Code (Order ID điền sau được)" },
  revenueLedger: {
    title: "Sổ doanh thu",
    subtitle: "Pay Time · GMV RMB = VND÷3700 — Tự động + Thủ công + Sync sheet",
  },
  bc01: { title: "BC01: Sales performance", subtitle: "Tổng GMV theo team × sale × tháng" },
  bc02: { title: "BC02: Key Data", subtitle: "Dữ liệu then chốt quy trình bán hàng" },
  bc03: { title: "BC03 — Báo cáo tổng bộ", subtitle: "KPI thủ công + doanh thu / trial / referral tự động" },
  module5: { title: "Đồng bộ CRM", subtitle: "M5 — 1-Click sync & xuất Master Data CRM PalFish" },
  module6: { title: "Dashboard Sale", subtitle: "M6 — Tổng quan hiệu suất theo team & cá nhân" },
  gatewaySync: { title: "Đồng bộ mPOS / Payoo", subtitle: "Cài tiện ích kéo giao dịch mPOS & Payoo về app" },
  authAccounts: {
    title: "Tài khoản Auth",
    subtitle: "Quản lý tài khoản đăng nhập — liên kết CRM & phân quyền vai trò",
  },
  permissions: {
    title: "Phân quyền sử dụng",
    subtitle: "Quản lý quyền truy cập module theo nhóm và cá nhân",
  },
  zaloConfig: {
    title: "Zalo — Cấu hình OA",
    subtitle: "App ID, Token, kiểm tra kết nối Zalo OA",
  },
  zaloGroups: {
    title: "Zalo — Nhóm thông báo",
    subtitle: "Mapping team → nhóm Zalo GMF để gửi thông báo tự động",
  },
  zaloOutbox: {
    title: "Zalo — Outbox",
    subtitle: "50 tin nhắn gần nhất — theo dõi trạng thái gửi & retry",
  },
  dingtalkConfig: {
    title: "DingTalk — Cấu hình",
    subtitle: "Test gửi tin tới nhóm DingTalk đã cấu hình",
  },
  dingtalkGroups: {
    title: "DingTalk — Nhóm thông báo",
    subtitle: "Mapping team → DingTalk openConversationId",
  },
  dingtalkOutbox: {
    title: "DingTalk — Outbox",
    subtitle: "50 tin nhắn gần nhất — theo dõi trạng thái gửi & retry",
  },
};

export default function MainPage() {
  const flowNavRef = useRef<(view: PaymentFlowView) => void>(() => {});

  return (
    <PaymentFlowProvider onViewChange={(view) => flowNavRef.current(view)}>
      <MainPageInner flowNavRef={flowNavRef} />
    </PaymentFlowProvider>
  );
}

function MainPageInner({
  flowNavRef,
}: {
  flowNavRef: React.MutableRefObject<(view: PaymentFlowView) => void>;
}) {
  const { user, signOut, isDevMode } = useAuth();
  const { profile } = useMe();
  const [activeView, setActiveView] = useState<ViewId>("dashboard");

  const { badgeCounts } = usePaymentFlow();

  useEffect(() => {
    flowNavRef.current = (view) => setActiveView(FLOW_VIEW_MAP[view]);
  }, [flowNavRef]);

  const perms = profile?.permissions ?? {};
  const can = (key: string) => {
    const k = key === "zaloConfig" || key === "zaloGroups" || key === "zaloOutbox" ? "zalo"
      : key === "dingtalkConfig" || key === "dingtalkGroups" || key === "dingtalkOutbox" ? "dingtalk"
      : key;
    return isDevMode || (perms[k] ?? "none") !== "none";
  };

  const handleNavHover = useCallback((id: string) => {
    PRELOAD_MAP[id]?.();
  }, []);

  const showReconciliation = can("reconciliation");
  const showAuthAccounts = can("authAccounts");

  // Nếu user đang ở tab bị ẩn bởi permission, chuyển về dashboard
  useEffect(() => {
    if (activeView !== "profile" && !can(activeView)) {
      setActiveView("dashboard");
    }
  }, [perms, activeView]); // eslint-disable-line react-hooks/exhaustive-deps

  const items: NavItem[] = useMemo(() => {
    const list: NavItem[] = [];

    // ── Khách hàng & Đơn hàng ──
    if (can("dashboard"))
      list.push({ id: "dashboard", label: "Bảng thông tin", icon: I.chart, section: "Khách hàng & Đơn hàng" });
    if (can("paymentRequests"))
      list.push({ id: "paymentRequests", label: "Quản lý thanh toán", icon: I.invoice, ...(!can("dashboard") ? { section: "Khách hàng & Đơn hàng" } : {}) });

    // ── Đối soát & Hóa đơn ── (dropdown 3 tab con: Chuyển khoản / mPOS / Payoo)
    const reconChildren: NavChildItem[] = [];
    if (showReconciliation)
      reconChildren.push({ id: "reconciliation", label: "Chuyển khoản", subtitle: "SePay" });
    if (can("reconCard"))
      reconChildren.push({ id: "reconCard", label: "Quẹt thẻ", subtitle: "mPOS / Payoo" });
    const reconItem: NavItem | null = reconChildren.length > 0
      ? { id: "reconHub", label: "Đối soát giao dịch", icon: I.history, section: "Đối soát & Hóa đơn", children: reconChildren }
      : null;
    if (reconItem) list.push(reconItem);

    if (can("module3"))
      list.push({ id: "module3", label: "Kích hoạt khóa học", icon: I.check,
        ...(!reconItem ? { section: "Đối soát & Hóa đơn" } : {}),
        badge: badgeCounts.activation > 0 ? <Badge tone="warn">{badgeCounts.activation}</Badge> : null });
    if (can("module4"))
      list.push({ id: "module4", label: "Xuất hóa đơn", icon: I.invoice,
        badge: badgeCounts.invoice > 0 ? <Badge tone="warn">{badgeCounts.invoice}</Badge> : null });

    // ── Báo cáo ──
    if (can("revenueLedger"))
      list.push({ id: "revenueLedger", label: "Sổ doanh thu", icon: I.ledger, section: "Báo cáo" });
    const reportChildren: { id: string; label: string; subtitle?: string }[] = [];
    if (can("bc01")) reportChildren.push({ id: "bc01", label: "BC01: Sales performance", subtitle: "GMV theo team × sale × tháng" });
    if (can("bc02")) reportChildren.push({ id: "bc02", label: "BC02: Key Data", subtitle: "Then chốt quy trình bán" });
    if (can("bc03")) reportChildren.push({ id: "bc03", label: "BC03 — Báo cáo tổng bộ", subtitle: "KPI + doanh thu / trial / referral" });
    if (reportChildren.length > 0)
      list.push({ id: "reports", label: "Báo cáo", icon: I.chart, children: reportChildren,
        ...(!can("revenueLedger") ? { section: "Báo cáo" } : {}) });

    // ── Dữ liệu ──
    if (can("module5"))
      list.push({ id: "module5", label: "Đồng bộ CRM", icon: I.database, section: "Dữ liệu" });
    if (can("module6"))
      list.push({ id: "module6", label: "Dashboard Sale", icon: I.chart, ...(!can("module5") ? { section: "Dữ liệu" } : {}) });
    if (can("gatewaySync"))
      list.push({ id: "gatewaySync", label: "Đồng bộ mPOS / Payoo", icon: I.database,
        ...(!can("module5") && !can("module6") ? { section: "Dữ liệu" } : {}) });

    // ── Zalo OA ──
    const zaloChildren: NavChildItem[] = [];
    if (can("zaloConfig"))
      zaloChildren.push({ id: "zaloConfig", label: "Cấu hình OA", subtitle: "Token & kiểm tra kết nối" });
    if (can("zaloGroups"))
      zaloChildren.push({ id: "zaloGroups", label: "Nhóm thông báo", subtitle: "Mapping team → Zalo group" });
    if (can("zaloOutbox"))
      zaloChildren.push({ id: "zaloOutbox", label: "Outbox", subtitle: "Trạng thái gửi tin" });
    if (zaloChildren.length > 0)
      list.push({ id: "zaloHub", label: "Zalo OA", icon: I.team, section: "Quản trị", children: zaloChildren });

    // ── DingTalk ──
    const dingtalkChildren: NavChildItem[] = [];
    if (can("dingtalkConfig"))
      dingtalkChildren.push({ id: "dingtalkConfig", label: "Cấu hình", subtitle: "Test gửi tin" });
    if (can("dingtalkGroups"))
      dingtalkChildren.push({ id: "dingtalkGroups", label: "Nhóm thông báo", subtitle: "Mapping team → DingTalk group" });
    if (can("dingtalkOutbox"))
      dingtalkChildren.push({ id: "dingtalkOutbox", label: "Outbox", subtitle: "Trạng thái gửi tin" });
    if (dingtalkChildren.length > 0)
      list.push({ id: "dingtalkHub", label: "DingTalk", icon: I.team, children: dingtalkChildren });

    // ── Tài khoản & Quyền ──
    const accountItems: NavItem[] = [];
    if (showAuthAccounts)
      accountItems.push({ id: "authAccounts", label: "Tài khoản Auth", icon: I.shield });
    if (can("permissions"))
      accountItems.push({ id: "permissions", label: "Phân quyền sử dụng", icon: I.check });
    if (can("profile"))
      accountItems.push({ id: "profile", label: "Thông tin cá nhân", icon: I.user });

    if (accountItems.length > 0) {
      accountItems[0] = { ...accountItems[0], section: "Tài khoản & Quyền" };
      list.push(...accountItems);
    }

    return list;
  }, [badgeCounts, perms, isDevMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const head = TITLES[activeView as keyof typeof TITLES] ?? TITLES.paymentRequests;
  const wideContent =
    activeView === "dashboard" ||
    activeView === "paymentRequests" ||
    activeView === "reconciliation" ||
    activeView === "reconCard" ||
    activeView === "module3" ||
    activeView === "module4" ||
    activeView === "bc01" ||
    activeView === "bc02" ||
    activeView === "bc03" ||
    activeView === "permissions" ||
    activeView === "zaloConfig" ||
    activeView === "zaloGroups" ||
    activeView === "zaloOutbox" ||
    activeView === "dingtalkConfig" ||
    activeView === "dingtalkGroups" ||
    activeView === "dingtalkOutbox";

  const renderActiveView = () => {
    if (!can(activeView) && activeView !== "profile") return null;
    switch (activeView) {
      case "dashboard": return <DashboardTab />;
      case "paymentRequests": return <PaymentRequestsTab />;
      case "reconciliation": return <ReconciliationTab />;
      case "reconCard": return <CardReconciliationTab onGoToSync={() => setActiveView("gatewaySync")} />;
      case "module3": return <ActivationTab />;
      case "module4": return <InvoiceRequestTab />;
      case "profile": return <ProfilePage />;
      case "revenueLedger": return <SoDoanhThuTab />;
      case "bc01": return <BC01SalesPerformance />;
      case "bc02": return <BC02KeyDataReport />;
      case "bc03": return <ReportBC03Tab />;
      case "module5": return <Module5Tab />;
      case "module6": return <Module6Tab />;
      case "gatewaySync": return <GatewaySyncTab />;
      case "authAccounts": return <AuthAccountsTab />;
      case "permissions": return <PermissionsTab />;
      case "zaloConfig": return <ZaloConfigTab />;
      case "zaloGroups": return <ZaloGroupsTab />;
      case "zaloOutbox": return <ZaloOutboxTab />;
      case "dingtalkConfig": return <DingTalkConfigTab />;
      case "dingtalkGroups": return <DingTalkGroupsTab />;
      case "dingtalkOutbox": return <DingTalkOutboxTab />;
      default: return <PaymentRequestsTab />;
    }
  };

  return (
    <AppShell
      items={items}
      activeId={activeView}
      wideContent={wideContent}
      onSelect={(id) => setActiveView(id as ViewId)}
      onHover={handleNavHover}
      title={head.title}
      subtitle={head.subtitle}
      userEmail={user?.email || undefined}
      userRole={DEPARTMENT_LIST.find((d) => d.key === profile?.department)?.label ?? profile?.role}
      isDevMode={isDevMode}
      onSignOut={signOut}
      headerExtras={<NotificationBell onNavigate={(view) => setActiveView(view as ViewId)} />}
      helpModuleSlug={activeView}
    >
      <Suspense fallback={<ViewFallback />}>{renderActiveView()}</Suspense>
    </AppShell>
  );
}
