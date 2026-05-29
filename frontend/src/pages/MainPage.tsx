import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import StaffCRMTab from "../components/StaffCRMTab";
import AuthAccountsTab from "../components/AuthAccountsTab";
import Module5Tab from "../components/Module5Tab";
import Module6Tab from "../components/Module6Tab";
import { PaymentFlowProvider, usePaymentFlow, type PaymentFlowView } from "../contexts/PaymentFlowContext";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import ProfilePage from "./ProfilePage";
import AppShell, { type NavItem } from "../layouts/AppShell";
import Badge from "../components/ui/Badge";

const BC01SalesPerformance = lazy(() => import("../components/reports/BC01SalesPerformance"));
const BC02KeyDataReport = lazy(() => import("../components/reports/BC02KeyDataReport"));
const ReportBC03Tab = lazy(() => import("../components/ReportBC03Tab"));
const PaymentRequestsTab = lazy(() => import("../components/PaymentRequestsTab"));
const ReconciliationTab = lazy(() => import("../components/ReconciliationTab"));
const ActivationTab = lazy(() => import("../components/ActivationTab"));
const InvoiceRequestTab = lazy(() => import("../components/InvoiceRequestTab"));
const SoDoanhThuTab = lazy(() => import("../components/SoDoanhThuTab"));

type ViewId =
  | "paymentRequests"
  | "reconciliation"
  | "profile"
  | "module3"
  | "module4"
  | "revenueLedger"
  | "bc01"
  | "bc02"
  | "bc03"
  | "module5"
  | "module6"
  | "staffCrm"
  | "authAccounts";

const FLOW_VIEW_MAP: Record<PaymentFlowView, ViewId> = {
  paymentRequests: "paymentRequests",
  reconciliation: "reconciliation",
  module3: "module3",
  module4: "module4",
};

function ViewFallback() {
  return (
    <div className="p-6 text-center text-sm text-gmv-muted animate-pulse">
      Optimizing data view...
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
  paymentRequests: {
    title: "Quản lý thanh toán",
    subtitle: "Theo dõi Payment Requests, biên lai & tiến độ chuyển khoản của khách",
  },
  reconciliation: {
    title: "Đối soát giao dịch",
    subtitle: "B2 — Kế toán xác nhận / từ chối từng lần thanh toán theo sao kê",
  },
  profile: { title: "Thông tin cá nhân" },
  module3: {
    title: "Kích hoạt khóa học",
    subtitle: "B3 — Active Request, Course Code & Order ID CRM",
  },
  module4: { title: "Xuất hóa đơn", subtitle: "B4 — Phát hành INV theo Course Code (Order ID điền sau được)" },
  revenueLedger: {
    title: "Sổ doanh thu",
    subtitle: "Pay Time · GMV RMB = VND÷3700 — M3 tự động + điền tay + Sync sheet",
  },
  bc01: { title: "BC01: Sales performance", subtitle: "Tổng GMV theo team × sale × tháng" },
  bc02: { title: "BC02: Key Data", subtitle: "Dữ liệu then chốt quy trình bán hàng" },
  bc03: { title: "BC03 — Báo cáo tổng bộ", subtitle: "KPI thủ công + doanh thu / trial / referral tự động" },
  module5: { title: "Đồng bộ CRM", subtitle: "M5 — 1-Click sync & xuất Master Data CRM PalFish" },
  module6: { title: "Dashboard Sale", subtitle: "M6 — Tổng quan hiệu suất theo team & cá nhân" },
  staffCrm: { title: "Nhân sự Sale", subtitle: "Master data Metabase — gán role / team" },
  authAccounts: { title: "Tài khoản Auth", subtitle: "Supabase Auth — khoá/mở account" },
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
  const [activeView, setActiveView] = useState<ViewId>("paymentRequests");

  const { badgeCounts } = usePaymentFlow();

  useEffect(() => {
    flowNavRef.current = (view) => setActiveView(FLOW_VIEW_MAP[view]);
  }, [flowNavRef]);

  const showInvoice = profile?.canConfirmPayment ?? isDevMode;
  const showStaffCrm = profile?.canAccessAdmin ?? isDevMode;
  const showAuthAccounts = profile?.canManageStaff ?? isDevMode;

  const items: NavItem[] = useMemo(() => {
    const list: NavItem[] = [
      {
        id: "paymentRequests",
        label: "Quản lý thanh toán",
        icon: I.invoice,
        section: "Khách hàng & Đơn hàng",
      },
      {
        id: "reconciliation",
        label: "Đối soát giao dịch",
        icon: I.history,
        section: "Đối soát & Hóa đơn",
        badge:
          badgeCounts.reconciliation > 0 ? (
            <Badge tone="warn">{badgeCounts.reconciliation}</Badge>
          ) : null,
      },
    ];

    if (showInvoice) {
      list.push(
        {
          id: "module3",
          label: "Kích hoạt khóa học",
          icon: I.check,
          badge:
            badgeCounts.activation > 0 ? <Badge tone="warn">{badgeCounts.activation}</Badge> : null,
        },
        {
          id: "module4",
          label: "Xuất hóa đơn",
          icon: I.invoice,
          badge:
            badgeCounts.invoice > 0 ? <Badge tone="warn">{badgeCounts.invoice}</Badge> : null,
        }
      );
    }

    if (showInvoice) {
      list.push(
        {
          id: "revenueLedger",
          label: "Sổ doanh thu",
          icon: I.ledger,
          section: "Báo cáo",
        },
        {
          id: "reports",
          label: "Báo cáo",
          icon: I.chart,
          children: [
            {
              id: "bc01",
              label: "BC01: Sales performance",
              subtitle: "GMV theo team × sale × tháng",
            },
            {
              id: "bc02",
              label: "BC02: Key Data",
              subtitle: "Then chốt quy trình bán",
            },
            {
              id: "bc03",
              label: "BC03 — Báo cáo tổng bộ",
              subtitle: "KPI + doanh thu / trial / referral",
            },
          ],
        },
        {
          id: "module5",
          label: "Đồng bộ CRM",
          icon: I.database,
          section: "Dữ liệu",
        },
        {
          id: "module6",
          label: "Dashboard Sale",
          icon: I.chart,
        }
      );
    }

    const accountItems: NavItem[] = [];
    if (showStaffCrm) {
      accountItems.push({ id: "staffCrm", label: "Nhân sự Sale", icon: I.team });
    }
    if (showAuthAccounts) {
      accountItems.push({ id: "authAccounts", label: "Tài khoản Auth", icon: I.shield });
    }
    accountItems.push({ id: "profile", label: "Thông tin cá nhân", icon: I.user });

    if (accountItems.length > 0) {
      accountItems[0] = { ...accountItems[0], section: "Tài khoản & Quyền" };
      list.push(...accountItems);
    }

    return list;
  }, [badgeCounts, showInvoice, showStaffCrm, showAuthAccounts]);

  const head = TITLES[activeView as keyof typeof TITLES] ?? TITLES.paymentRequests;
  const wideContent =
    activeView === "paymentRequests" ||
    activeView === "reconciliation" ||
    activeView === "module3" ||
    activeView === "module4" ||
    activeView === "bc01" ||
    activeView === "bc02" ||
    activeView === "bc03";

  const renderActiveView = () => {
    switch (activeView) {
      case "paymentRequests":
        return <PaymentRequestsTab />;
      case "reconciliation":
        return <ReconciliationTab />;
      case "module3":
        return showInvoice ? <ActivationTab /> : null;
      case "module4":
        return showInvoice ? <InvoiceRequestTab /> : null;
      case "profile":
        return <ProfilePage />;
      case "revenueLedger":
        return showInvoice ? <SoDoanhThuTab /> : null;
      case "bc01":
        return showInvoice ? <BC01SalesPerformance /> : null;
      case "bc02":
        return showInvoice ? <BC02KeyDataReport /> : null;
      case "bc03":
        return showInvoice ? <ReportBC03Tab /> : null;
      case "module5":
        return showInvoice ? <Module5Tab /> : null;
      case "module6":
        return showInvoice ? <Module6Tab /> : null;
      case "staffCrm":
        return showStaffCrm ? <StaffCRMTab /> : null;
      case "authAccounts":
        return showAuthAccounts ? <AuthAccountsTab /> : null;
      default:
        return <PaymentRequestsTab />;
    }
  };

  return (
    <AppShell
      items={items}
      activeId={activeView}
      wideContent={wideContent}
      onSelect={(id) => setActiveView(id as ViewId)}
      title={head.title}
      subtitle={head.subtitle}
      userEmail={user?.email || undefined}
      userRole={profile?.role}
      isDevMode={isDevMode}
      onSignOut={signOut}
    >
      <Suspense fallback={<ViewFallback />}>{renderActiveView()}</Suspense>
    </AppShell>
  );
}
