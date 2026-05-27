/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { endpoints } from "../lib/api";
import type {
  ActiveRequest,
  AddPaymentAttemptPayload,
  CreatePaymentRequestPayload,
  CreateActiveRequestPayload,
  PaymentAttempt,
  PaymentRequest,
} from "../types/paymentRequest";
import {
  buildCreateActiveRequestPayload,
  createLocalActiveRequest,
  createLocalActiveRequestFromForm,
  fromApiActiveRequest,
  fromApiPaymentRequest,
  isBackendLineId,
  nextPaymentCode,
  normalizeRequest,
  nowStamp,
  toActiveRequestPatchUidsData,
  updateActiveCoursePackage,
} from "../components/payment-request/paymentRequestUtils";
import {
  countAwaitingTransactions,
  countPendingAr,
  countPendingInvoice,
  nowStamp as flowNow,
} from "../components/payment-flow/paymentFlowUtils";

export type PaymentFlowView = "paymentRequests" | "reconciliation" | "module3" | "module4";

type NavState = {
  openArId?: string | null;
  openPrId?: string | null;
  invoiceTab?: "pending" | "issued";
  openInvoiceTab?: "pending" | "issued";
  openInvoiceKey?: string | null;
  openInvoiceCourseCode?: string | null;
};

type LoadDataOptions = {
  silent?: boolean;
};

type PaymentFlowContextValue = {
  requests: PaymentRequest[];
  activeRequests: ActiveRequest[];
  loading: boolean;
  apiNote: string;
  setApiNote: (note: string) => void;
  loadData: (options?: LoadDataOptions) => Promise<void>;
  updateRequest: (id: string, updater: (r: PaymentRequest) => PaymentRequest) => void;
  updateActiveRequest: (id: string, updater: (ar: ActiveRequest) => ActiveRequest) => void;
  handleCreate: (payload: CreatePaymentRequestPayload) => Promise<PaymentRequest>;
  handleAddPayment: (requestId: string, payload: AddPaymentAttemptPayload) => Promise<PaymentAttempt | null>;
  confirmTransaction: (prId: string, paymentId: string) => Promise<void>;
  rejectTransaction: (prId: string, paymentId: string, rejectReason?: string) => Promise<void>;
  handleCreateActiveRequest: (pr: PaymentRequest) => Promise<ActiveRequest>;
  handleCreateActiveRequestFromForm: (data: {
    prId: string | null;
    customerName: string;
    uid: string;
    phone?: string;
    country?: string;
    packageName: string;
    amount: number;
  }) => Promise<ActiveRequest>;
  updateActiveRequestCoursePackage: (arId: string, courseCode: string, packageName: string) => Promise<void>;
  patchCourseOrderId: (arId: string, courseCode: string, orderId: string) => Promise<void>;
  issueInvoiceForCourse: (arId: string, courseCode: string) => Promise<void>;
  badgeCounts: { reconciliation: number; activation: number; invoice: number };
  nav: NavState;
  setNav: (next: NavState) => void;
  navigate: (view: PaymentFlowView, extra?: NavState) => void;
};

const PaymentFlowContext = createContext<PaymentFlowContextValue | null>(null);

const POLL_MS = 12_000;

function hasPendingQrPayments(requests: PaymentRequest[]) {
  return requests.some((pr) =>
    pr.state !== "cancelled" &&
    pr.payments.some((p) => !p.cancelled && p.method === "qr" && p.status === "pending")
  );
}

export function PaymentFlowProvider({
  children,
  onViewChange,
}: {
  children: ReactNode;
  onViewChange?: (view: PaymentFlowView, nav?: NavState) => void;
}) {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [activeRequests, setActiveRequests] = useState<ActiveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiNote, setApiNote] = useState("");
  const [nav, setNav] = useState<NavState>({});
  const onViewChangeRef = useRef(onViewChange);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  const loadData = useCallback(async (options?: LoadDataOptions) => {
    if (!options?.silent) setLoading(true);
    const notes: string[] = [];

    try {
      await endpoints.paymentRequests.syncPendingPayos();
    } catch {
      /* PayOS poll fallback — webhook có thể chưa tới */
    }

    let nextRequests: PaymentRequest[] = [];
    let prOk = false;
    try {
      const response = await endpoints.paymentRequests.list();
      nextRequests = (response.data.requests ?? []).map((r) =>
        normalizeRequest(fromApiPaymentRequest(r))
      );
      prOk = true;
    } catch {
      notes.push("GET /payment-requests chưa sẵn sàng.");
    }

    let nextArs: ActiveRequest[] = [];
    let arOk = false;
    try {
      const arRes = await endpoints.activeRequests.list();
      const rows = Array.isArray(arRes.data) ? arRes.data : [];
      nextArs = rows.map(fromApiActiveRequest);
      arOk = true;
    } catch {
      notes.push("GET /active-requests chưa sẵn sàng.");
    }

    if (prOk) setRequests(nextRequests);
    if (arOk) setActiveRequests(nextArs);
    setApiNote(notes.join(" "));
    if (!options?.silent) setLoading(false);
  }, []);

  // Initial data load on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const pendingQr = useMemo(() => hasPendingQrPayments(requests), [requests]);

  useEffect(() => {
    if (!pendingQr) return;
    const timer = window.setInterval(() => {
      void loadData({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pendingQr, loadData]);

  const updateRequest = useCallback((id: string, updater: (r: PaymentRequest) => PaymentRequest) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? normalizeRequest(updater(r)) : r)));
  }, []);

  const updateActiveRequest = useCallback((id: string, updater: (ar: ActiveRequest) => ActiveRequest) => {
    setActiveRequests((prev) => prev.map((ar) => (ar.id === id ? updater(ar) : ar)));
  }, []);

  const handleCreate = useCallback(
    async (payload: CreatePaymentRequestPayload) => {
      const response = await endpoints.paymentRequests.create(payload);
      const saved = normalizeRequest(fromApiPaymentRequest(response.data.payment_request));
      setRequests((prev) => [saved, ...prev]);
      setApiNote("");
      return saved;
    },
    []
  );

  const handleAddPayment = useCallback(
    async (requestId: string, payload: AddPaymentAttemptPayload) => {
      const selected = requests.find((r) => r.id === requestId);
      if (!selected) return null;
      const nextIdx = (selected.payments[selected.payments.length - 1]?.idx || 0) + 1;
      const localPayment: PaymentAttempt = {
        id: `${requestId}-${Date.now()}`,
        idx: nextIdx,
        amount: payload.amount,
        status: "pending",
        createdAt: nowStamp(),
        paidAt: null,
        code: nextPaymentCode(requestId, nextIdx),
        bill: false,
        method: payload.method,
        bank: payload.bank,
        cardLast4: payload.cardLast4,
        installmentMonths: payload.installmentMonths,
        cashier: payload.cashier,
      };
      updateRequest(requestId, (r) => ({ ...r, payments: [...r.payments, localPayment] }));
      try {
        const res = (await endpoints.paymentRequests.addPayment(requestId, payload)).data;
        const confirmed: PaymentAttempt = {
          ...localPayment,
          id: res.payment_line.id || localPayment.id,
          code: res.payment_line.transfer_code || localPayment.code,
          status: res.payment_line.status === "paid" ? "paid" : "pending",
          paidAt: res.payment_line.paid_at || null,
          qrCode: res.payment_line.qr_code || res.payos?.qr_code || null,
          checkoutUrl: res.payment_line.checkout_url || res.payos?.checkout_url || null,
          paymentLinkId: res.payos?.payment_link_id || null,
          transferContent: res.payos?.transfer_content || res.payment_line.transfer_code || localPayment.code,
          billImage: res.payment_line.bill_image ?? null,
          bill: !!(res.payment_line.bill_image),
        };
        updateRequest(requestId, (r) => {
          const updatedPayments = r.payments.map((p) => (p.id === localPayment.id ? confirmed : p));
          const prFromBe = fromApiPaymentRequest(res.payment_request);
          return normalizeRequest({ ...r, ...prFromBe, payments: updatedPayments });
        });
        setApiNote("");
        void loadData({ silent: true });
        return confirmed;
      } catch {
        setApiNote("Máy chủ thêm lần thanh toán chưa sẵn sàng; giao diện cập nhật tạm.");
        return localPayment;
      }
    },
    [requests, updateRequest, loadData]
  );

  const confirmTransaction = useCallback(
    async (prId: string, paymentId: string) => {
      if (isBackendLineId(paymentId)) {
        try {
          const res = await endpoints.transactions.patchStatus(paymentId, "paid");
          updateRequest(prId, (r) => {
            const line = res.data.payment_line;
            const updatedPayments = r.payments.map((p) =>
              p.id === paymentId
                ? {
                    ...p,
                    status: "paid" as const,
                    paidAt: line.paid_at || flowNow(),
                    bill: !!(line.bill_image ?? p.billImage),
                    billImage: line.bill_image ?? p.billImage ?? null,
                  }
                : p
            );
            const prFromBe = fromApiPaymentRequest(res.data.payment_request);
            return normalizeRequest({ ...r, ...prFromBe, payments: updatedPayments });
          });
          return;
        } catch {
          /* fall through optimistic */
        }
      }
      updateRequest(prId, (r) => ({
        ...r,
        payments: r.payments.map((p) =>
          p.id === paymentId ? { ...p, status: "paid", paidAt: flowNow() } : p
        ),
      }));
    },
    [updateRequest]
  );

  const rejectTransaction = useCallback(
    async (prId: string, paymentId: string, rejectReason?: string) => {
      // Optimistic update immediately — no full reload
      updateRequest(prId, (r) => ({
        ...r,
        payments: r.payments.map((p) =>
          p.id === paymentId
            ? { ...p, status: "rejected" as const, bill: false, paidAt: null, rejectReason: rejectReason ?? null }
            : p
        ),
      }));
      if (isBackendLineId(paymentId)) {
        try {
          await endpoints.transactions.patchStatus(paymentId, "rejected", rejectReason);
        } catch {
          /* silently ignore — optimistic update already applied */
        }
      }
    },
    [updateRequest]
  );

  const handleCreateActiveRequest = useCallback(
    async (pr: PaymentRequest) => {
      try {
        const res = await endpoints.paymentRequests.createActiveRequest(
          pr.id,
          buildCreateActiveRequestPayload(pr)
        );
        const ar = fromApiActiveRequest(res.data);
        if (!ar.customerName) ar.customerName = pr.name;
        setActiveRequests((prev) => [ar, ...prev.filter((x) => x.id !== ar.id)]);
        return ar;
      } catch {
        const ar = createLocalActiveRequest(pr, activeRequests);
        setActiveRequests((prev) => [ar, ...prev]);
        return ar;
      }
    },
    [activeRequests]
  );

  const handleCreateActiveRequestFromForm = useCallback(
    async (data: {
      prId: string | null;
      customerName: string;
      uid: string;
      phone?: string;
      country?: string;
      packageName: string;
      amount: number;
    }) => {
      const payload: CreateActiveRequestPayload = {
        uids: [
          {
            uid: data.uid,
            phone: data.phone,
            country: data.country || "VN",
            courses: [{ name: data.packageName, amount: data.amount }],
          },
        ],
      };
      if (data.prId) {
        try {
          const res = await endpoints.paymentRequests.createActiveRequest(data.prId, payload);
          const ar = fromApiActiveRequest(res.data);
          if (!ar.customerName) ar.customerName = data.customerName;
          setActiveRequests((prev) => [ar, ...prev.filter((x) => x.id !== ar.id)]);
          setApiNote("");
          return ar;
        } catch {
          setApiNote("Tạo AR trên máy chủ thất bại — lưu tạm trên giao diện.");
        }
      } else {
        try {
          const res = await endpoints.activeRequests.create({
            customer_name: data.customerName,
            uids: payload.uids,
          });
          const ar = fromApiActiveRequest(res.data);
          if (!ar.customerName) ar.customerName = data.customerName;
          setActiveRequests((prev) => [ar, ...prev.filter((x) => x.id !== ar.id)]);
          setApiNote("");
          return ar;
        } catch {
          setApiNote("Tạo AR trên máy chủ thất bại — lưu tạm trên giao diện.");
        }
      }
      const ar = createLocalActiveRequestFromForm(data, activeRequests);
      setActiveRequests((prev) => [ar, ...prev]);
      return ar;
    },
    [activeRequests]
  );

  const updateActiveRequestCoursePackage = useCallback(
    async (arId: string, courseCode: string, packageName: string) => {
      let optimistic: ActiveRequest | null = null;
      updateActiveRequest(arId, (ar) => {
        optimistic = updateActiveCoursePackage(ar, courseCode, packageName);
        return optimistic;
      });

      if (!optimistic) return;

      try {
        const res = await endpoints.activeRequests.update(arId, {
          uids_data: toActiveRequestPatchUidsData(optimistic),
        });
        const ar = fromApiActiveRequest(res.data);
        setActiveRequests((prev) => prev.map((x) => (x.id === arId ? ar : x)));
        setApiNote("");
      } catch {
        setApiNote("Đã đổi gói tạm trên giao diện; máy chủ chưa lưu được thay đổi gói học.");
      }
    },
    [updateActiveRequest]
  );

  const patchCourseOrderId = useCallback(
    async (arId: string, courseCode: string, orderId: string) => {
      const trimmed = orderId.trim();
      updateActiveRequest(arId, (ar) => ({
        ...ar,
        uids: ar.uids.map((u) => ({
          ...u,
          courses: u.courses.map((c) =>
            c.courseCode === courseCode ? { ...c, orderId: trimmed } : c
          ),
        })),
      }));
      try {
        const res = await endpoints.activeRequests.attachCourse(arId, courseCode, { order_id: trimmed });
        const ar = fromApiActiveRequest(res.data as Parameters<typeof fromApiActiveRequest>[0]);
        setActiveRequests((prev) => prev.map((x) => (x.id === arId ? ar : x)));
      } catch {
        setApiNote("Không lưu được Order ID lên máy chủ.");
      }
    },
    [updateActiveRequest]
  );

  const issueInvoiceForCourse = useCallback(
    async (arId: string, courseCode: string) => {
      try {
        const res = await endpoints.activeRequests.issueInvoice(arId, courseCode);
        const ar = fromApiActiveRequest(res.data.active_request);
        setActiveRequests((prev) => prev.map((x) => (x.id === arId ? ar : x)));
        setApiNote("");
      } catch {
        setApiNote("Xuất hoá đơn thất bại — kiểm tra thông tin KH trên PR.");
      }
    },
    []
  );

  const badgeCounts = useMemo(
    () => ({
      reconciliation: countAwaitingTransactions(requests),
      activation: countPendingAr(activeRequests),
      invoice: countPendingInvoice(activeRequests),
    }),
    [requests, activeRequests]
  );

  const navigate = useCallback((view: PaymentFlowView, extra?: NavState) => {
    setNav(extra ?? {});
    onViewChangeRef.current?.(view, extra);
  }, []);

  const value = useMemo(
    () => ({
      requests,
      activeRequests,
      loading,
      apiNote,
      setApiNote,
      loadData,
      updateRequest,
      updateActiveRequest,
      handleCreate,
      handleAddPayment,
      confirmTransaction,
      rejectTransaction,
      handleCreateActiveRequest,
      handleCreateActiveRequestFromForm,
      updateActiveRequestCoursePackage,
      patchCourseOrderId,
      issueInvoiceForCourse,
      badgeCounts,
      nav,
      setNav,
      navigate,
    }),
    [
      requests,
      activeRequests,
      loading,
      apiNote,
      loadData,
      updateRequest,
      updateActiveRequest,
      handleCreate,
      handleAddPayment,
      confirmTransaction,
      rejectTransaction,
      handleCreateActiveRequest,
      handleCreateActiveRequestFromForm,
      updateActiveRequestCoursePackage,
      patchCourseOrderId,
      issueInvoiceForCourse,
      badgeCounts,
      nav,
      navigate,
    ]
  );

  return <PaymentFlowContext.Provider value={value}>{children}</PaymentFlowContext.Provider>;
}

export function usePaymentFlow() {
  const ctx = useContext(PaymentFlowContext);
  if (!ctx) throw new Error("usePaymentFlow must be used within PaymentFlowProvider");
  return ctx;
}

export function usePaymentFlowOptional() {
  return useContext(PaymentFlowContext);
}
