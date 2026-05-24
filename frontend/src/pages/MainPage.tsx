import { useCallback, useEffect, useMemo, useState } from "react";
import Tab1Form from "../components/Tab1Form";
import Tab2Table from "../components/Tab2Table";
import PayosHistoryTab from "../components/PayosHistoryTab";
import StaffCRMTab from "../components/StaffCRMTab";
import AuthAccountsTab from "../components/AuthAccountsTab";
import Module3Tab from "../components/Module3Tab";
import Module4Tab from "../components/Module4Tab";
import SoDoanhThuTab from "../components/SoDoanhThuTab";
import ReportsHub from "../components/ReportsHub";
import Module5Tab from "../components/Module5Tab";
import Module6Tab from "../components/Module6Tab";
import ReportBC03Tab from "../components/ReportBC03Tab";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import { endpoints } from "../lib/api";
import ProfilePage from "./ProfilePage";
import AppShell, { type NavItem } from "../layouts/AppShell";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import type { Order } from "../types/order";

type ViewId =
  | "tab2"
  | "payos"
  | "profile"
  | "module3"
  | "module4"
  | "revenueLedger"
  | "reportsHub"
  | "module5"
  | "module6"
  | "bc03"
  | "staffCrm"
  | "authAccounts";

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
  tab2: { title: "Quản lý mã QR", subtitle: "Theo dõi tiền về, biên lai, CRM" },
  payos: { title: "Lịch sử PayOS", subtitle: "Giao dịch ngân hàng đã đối soát" },
  profile: { title: "Thông tin cá nhân" },
  module3: { title: "Xác nhận CRM", subtitle: "M3 — Điền tên sản phẩm thuế & mã CRM Order" },
  module4: { title: "Xuất hóa đơn thuế", subtitle: "M4 — Cấp mã M.../PF... và tải file ZIP 3 Excel" },
  revenueLedger: { title: "Sổ doanh thu", subtitle: "Ghi từng khoản thu — tự động (M3) + điền tay" },
  reportsHub: { title: "Báo cáo", subtitle: "BC01 · BC02 · BC03" },
  module5: { title: "Đồng bộ CRM", subtitle: "M5 — 1-Click sync dữ liệu CRM PalFish" },
  module6: { title: "Dashboard Sale", subtitle: "M6 — Tổng quan hiệu suất theo team & cá nhân" },
  bc03: { title: "BC03 — Báo cáo tổng bộ", subtitle: "KPI thủ công + doanh thu / trial / referral tự động" },
  staffCrm: { title: "Nhân sự Sale", subtitle: "Master data Metabase — gán role / team" },
  authAccounts: { title: "Tài khoản Auth", subtitle: "Supabase Auth — khoá/mở account" },
};

export default function MainPage() {
  const { user, signOut, isDevMode } = useAuth();
  const { profile } = useMe();
  const [activeView, setActiveView] = useState<ViewId>("tab2");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dbExcel, setDbExcel] = useState<{ uid: string; diaChi: string }[]>([]);
  const [dbFileName, setDbFileName] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(false);

  const refreshOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await endpoints.orders.list();
      setOrders(res.data.orders);
    } catch {
      console.warn("Không tải được danh sách đơn — backend đang chạy?");
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    if (activeView !== "tab2") return;
    const id = window.setInterval(() => refreshOrders(), 15000);
    return () => window.clearInterval(id);
  }, [activeView, refreshOrders]);

  useEffect(() => {
    const onFocus = () => {
      if (activeView === "tab2") refreshOrders();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [activeView, refreshOrders]);

  function handleOrderCreated(order: Order) {
    setOrders((prev) => {
      const exists = prev.some((o) => o.id === order.id);
      return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [...prev, order];
    });
    refreshOrders();
    setCreateModalOpen(false);
  }

  function handleOrderUpdated(order: Order) {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
  }

  function handleDbLoaded(db: { uid: string; diaChi: string }[], fileName: string) {
    setDbExcel(db);
    setDbFileName(`Đã tải: ${fileName} (Chứa ${db.length} dữ liệu UID & Địa chỉ)`);
  }

  const opsPayment = profile?.canConfirmPayment ?? (isDevMode ? true : false);
  const showInvoice = profile?.canConfirmPayment ?? isDevMode;
  const showStaffCrm = profile?.canAccessAdmin ?? isDevMode;
  const showAuthAccounts = profile?.canManageStaff ?? isDevMode;

  const items: NavItem[] = useMemo(() => {
    const list: NavItem[] = [
      {
        id: "tab2",
        label: "Quản lý mã QR",
        icon: I.list,
        section: "Khách hàng & Đơn hàng",
        badge:
          orders.length > 0 ? (
            <Badge tone="primary">{loadingOrders ? "…" : orders.length}</Badge>
          ) : null,
      },
      {
        id: "payos",
        label: "Lịch sử PayOS",
        icon: I.history,
        section: "Đối soát & Hóa đơn",
      },
    ];

    if (showInvoice) {
      list.push(
        { id: "module3", label: "Xác nhận CRM", icon: I.check },
        { id: "module4", label: "Xuất hóa đơn", icon: I.invoice }
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
          id: "reportsHub", 
          label: "Báo cáo", 
          icon: I.chart,
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
        },
        {
          id: "bc03",
          label: "BC03",
          icon: I.ledger,
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
  }, [orders.length, loadingOrders, showInvoice, showStaffCrm, showAuthAccounts]);

  const head = TITLES[activeView];

  return (
    <AppShell
      items={items}
      activeId={activeView}
      onSelect={(id) => {
        setActiveView(id as ViewId);
        if (id === "tab2") refreshOrders();
      }}
      title={head.title}
      subtitle={head.subtitle}
      userEmail={user?.email || undefined}
      userRole={profile?.role}
      isDevMode={isDevMode}
      onSignOut={signOut}
    >
      <div style={{ display: activeView === "tab2" ? "block" : "none" }}>
        <Tab2Table
          orders={orders}
          onDbLoaded={handleDbLoaded}
          dbFileName={dbFileName}
          canConfirmPayment={opsPayment}
          onOrderUpdated={handleOrderUpdated}
          onOpenCreateOrder={() => setCreateModalOpen(true)}
        />
      </div>
      <div style={{ display: activeView === "payos" ? "block" : "none" }}>
        <PayosHistoryTab />
      </div>
      <div style={{ display: activeView === "profile" ? "block" : "none" }}>
        <ProfilePage />
      </div>
      {showInvoice && (
        <div style={{ display: activeView === "module3" ? "block" : "none" }}>
          <Module3Tab />
        </div>
      )}
      {showInvoice && (
        <div style={{ display: activeView === "module4" ? "block" : "none" }}>
          <Module4Tab />
        </div>
      )}
      {showInvoice && (
        <div style={{ display: activeView === "revenueLedger" ? "block" : "none" }}>
          <SoDoanhThuTab />
        </div>
      )}
      {showInvoice && (
        <div style={{ display: activeView === "reportsHub" ? "block" : "none" }}>
          <ReportsHub />
        </div>
      )}
      {showInvoice && (
        <div style={{ display: activeView === "module5" ? "block" : "none" }}>
          <Module5Tab />
        </div>
      )}
      {showInvoice && (
        <div style={{ display: activeView === "module6" ? "block" : "none" }}>
          <Module6Tab />
        </div>
      )}
      {showInvoice && (
        <div style={{ display: activeView === "bc03" ? "block" : "none" }}>
          <ReportBC03Tab />
        </div>
      )}
      {showStaffCrm && (
        <div style={{ display: activeView === "staffCrm" ? "block" : "none" }}>
          <StaffCRMTab />
        </div>
      )}
      {showAuthAccounts && (
        <div style={{ display: activeView === "authAccounts" ? "block" : "none" }}>
          <AuthAccountsTab />
        </div>
      )}

      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Tạo mã QR mới"
        wide
        className="max-w-4xl"
      >
        <Tab1Form onOrderCreated={handleOrderCreated} dbExcel={dbExcel} createdBy={user?.email} />
      </Modal>
    </AppShell>
  );
}
