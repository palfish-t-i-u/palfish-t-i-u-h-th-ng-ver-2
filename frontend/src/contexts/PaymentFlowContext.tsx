import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { endpoints } from "../lib/api";
import type {
  ActiveRequest,
  AddPaymentAttemptPayload,
  CreatePaymentRequestPayload,
  PaymentAttempt,
  PaymentRequest,
} from "../types/paymentRequest";
import { MOCK_ACTIVE_REQUESTS } from "../components/payment-request/mockActiveRequests";
import { MOCK_PAYMENT_REQUESTS } from "../components/payment-request/mockPaymentRequests";
import {
  buildCreateActiveRequestPayload,
  createLocalActiveRequest,
  fromApiActiveRequest,
  fromApiPaymentRequest,
  isBackendLineId,
  nextPaymentCode,
  normalizeRequest,
  nowStamp,
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
};

type PaymentFlowContextValue = {
  requests: PaymentRequest[];
  activeRequests: ActiveRequest[];
  loading: boolean;
  apiNote: string;
  setApiNote: (note: string) => void;
  loadData: () => Promise<void>;
  updateRequest: (id: string, updater: (r: PaymentRequest) => PaymentRequest) => void;
  updateActiveRequest: (id: string, updater: (ar: ActiveRequest) => ActiveRequest) => void;
  handleCreate: (payload: CreatePaymentRequestPayload) => Promise<PaymentRequest>;
  handleAddPayment: (requestId: string, payload: AddPaymentAttemptPayload) => Promise<PaymentAttempt | null>;
  confirmTransaction: (prId: string, paymentId: string) => Promise<void>;
  rejectTransaction: (prId: string, paymentId: string) => Promise<void>;
  handleCreateActiveRequest: (pr: PaymentRequest) => Promise<ActiveRequest>;
  patchCourseOrderId: (arId: string, courseCode: string, orderId: string) => Promise<void>;
  issueInvoiceForCourse: (arId: string, courseCode: string) => void;
  badgeCounts: { reconciliation: number; activation: number; invoice: number };
  nav: NavState;
  setNav: (next: NavState) => void;
  navigate: (view: PaymentFlowView, extra?: NavState) => void;
};

const PaymentFlowContext = createContext<PaymentFlowContextValue | null>(null);

function nextPrId(requests: PaymentRequest[]) {
  const max = requests.reduce((best, request) => {
    const n = Number(request.id.match(/(\d+)$/)?.[1] || 0);
    return Math.max(best, n);
  }, 0);
  return `PR-2026-${String(max + 1).padStart(4, "0")}`;
}

export function PaymentFlowProvider({
  children,
  onViewChange,
}: {
  children: ReactNode;
  onViewChange?: (view: PaymentFlowView, nav?: NavState) => void;
}) {
  const [requests, setRequests] = useState<PaymentRequest[]>(MOCK_PAYMENT_REQUESTS);
  const [activeRequests, setActiveRequests] = useState<ActiveRequest[]>(MOCK_ACTIVE_REQUESTS);
  const [loading, setLoading] = useState(false);
  const [apiNote, setApiNote] = useState("");
  const [nav, setNav] = useState<NavState>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    const notes: string[] = [];
    let nextRequests = MOCK_PAYMENT_REQUESTS;
    try {
      const response = await endpoints.paymentRequests.list();
      const fromApi = (response.data.requests ?? []).map((r) =>
        normalizeRequest(fromApiPaymentRequest(r))
      );
      if (fromApi.length > 0) nextRequests = fromApi;
      else notes.push("Danh sách PR từ máy chủ trống — dùng dữ liệu mẫu Hiếu.");
    } catch {
      notes.push("GET /payment-requests chưa sẵn sàng — dùng dữ liệu mẫu Hiếu.");
    }

    let nextArs = MOCK_ACTIVE_REQUESTS;
    try {
      const arRes = await endpoints.activeRequests.list();
      const rows = Array.isArray(arRes.data) ? arRes.data : [];
      if (rows.length > 0) nextArs = rows.map(fromApiActiveRequest);
    } catch {
      notes.push("GET /active-requests chưa sẵn sàng — dùng mock Active Request.");
    }

    setRequests(nextRequests);
    setActiveRequests(nextArs);
    setApiNote(notes.join(" "));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateRequest = useCallback((id: string, updater: (r: PaymentRequest) => PaymentRequest) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? normalizeRequest(updater(r)) : r)));
  }, []);

  const updateActiveRequest = useCallback((id: string, updater: (ar: ActiveRequest) => ActiveRequest) => {
    setActiveRequests((prev) => prev.map((ar) => (ar.id === id ? updater(ar) : ar)));
  }, []);

  const handleCreate = useCallback(
    async (payload: CreatePaymentRequestPayload) => {
      const fallback = normalizeRequest({
        id: nextPrId(requests),
        name: payload.name,
        uid: payload.uid,
        phone: payload.phone,
        country: payload.country,
        address: payload.address,
        ward: payload.ward,
        province: payload.province,
        note: payload.note,
        target: payload.target,
        source: "Bán mới",
        createdAt: nowStamp(),
        received: 0,
        doneCount: 0,
        totalCount: 0,
        delta: 0,
        state: "pending",
        payments: [],
      });
      setRequests((prev) => [fallback, ...prev]);
      try {
        const response = await endpoints.paymentRequests.create(payload);
        const saved = normalizeRequest(fromApiPaymentRequest(response.data.payment_request));
        setRequests((prev) => prev.map((r) => (r.id === fallback.id ? saved : r)));
        setApiNote("");
        return saved;
      } catch {
        setApiNote("Máy chủ tạo Payment Request chưa sẵn sàng; giao diện dùng bản tạm.");
        return fallback;
      }
    },
    [requests]
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
        status: payload.method === "cash" || payload.method === "card" ? "paid" : "pending",
        createdAt: nowStamp(),
        paidAt: payload.method === "cash" || payload.method === "card" ? nowStamp() : null,
        code: nextPaymentCode(requestId, nextIdx),
        bill: payload.method !== "qr",
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
          bill: res.payment_line.status === "paid" ? true : payload.method !== "qr",
        };
        updateRequest(requestId, (r) => {
          const updatedPayments = r.payments.map((p) => (p.id === localPayment.id ? confirmed : p));
          const prFromBe = fromApiPaymentRequest(res.payment_request);
          return normalizeRequest({ ...r, ...prFromBe, payments: updatedPayments });
        });
        setApiNote("");
        return confirmed;
      } catch {
        setApiNote("Máy chủ thêm lần thanh toán chưa sẵn sàng; giao diện cập nhật tạm.");
        return localPayment;
      }
    },
    [requests, updateRequest]
  );

  const confirmTransaction = useCallback(
    async (prId: string, paymentId: string) => {
      updateRequest(prId, (r) => ({
        ...r,
        payments: r.payments.map((p) =>
          p.id === paymentId ? { ...p, status: "paid", paidAt: flowNow(), bill: true } : p
        ),
      }));
      if (isBackendLineId(paymentId)) {
        try {
          const res = await endpoints.transactions.patchStatus(paymentId, "paid");
          updateRequest(prId, (r) => {
            const line = res.data.payment_line;
            const updatedPayments = r.payments.map((p) =>
              p.id === paymentId
                ? { ...p, status: "paid" as const, paidAt: line.paid_at || flowNow(), bill: true }
                : p
            );
            const prFromBe = fromApiPaymentRequest(res.data.payment_request);
            return normalizeRequest({ ...r, ...prFromBe, payments: updatedPayments });
          });
        } catch {
          /* optimistic */
        }
      }
    },
    [updateRequest]
  );

  const rejectTransaction = useCallback(
    async (prId: string, paymentId: string) => {
      updateRequest(prId, (r) => ({
        ...r,
        payments: r.payments.map((p) =>
          p.id === paymentId ? { ...p, status: "rejected" as const, bill: false, paidAt: null } : p
        ),
      }));
      if (isBackendLineId(paymentId)) {
        try {
          await endpoints.transactions.patchStatus(paymentId, "rejected");
        } catch {
          /* optimistic */
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

  const patchCourseOrderId = useCallback(
    async (arId: string, courseCode: string, orderId: string) => {
      updateActiveRequest(arId, (ar) => ({
        ...ar,
        uids: ar.uids.map((u) => ({
          ...u,
          courses: u.courses.map((c) =>
            c.courseCode === courseCode ? { ...c, orderId: orderId.trim() } : c
          ),
        })),
      }));
      try {
        await endpoints.activeRequests.attachCourse(arId, courseCode, { order_id: orderId.trim() });
      } catch {
        /* local ok for demo */
      }
    },
    [updateActiveRequest]
  );

  const issueInvoiceForCourse = useCallback((arId: string, courseCode: string) => {
    const invId = `INV-2026-${String(Math.floor(Math.random() * 900) + 100)}`;
    updateActiveRequest(arId, (ar) => ({
      ...ar,
      uids: ar.uids.map((u) => ({
        ...u,
        courses: u.courses.map((c) =>
          c.courseCode === courseCode
            ? { ...c, invoiced: true, invoiceId: invId, invoicedAt: flowNow() }
            : c
        ),
      })),
    }));
  }, [updateActiveRequest]);

  const badgeCounts = useMemo(
    () => ({
      reconciliation: countAwaitingTransactions(requests),
      activation: countPendingAr(activeRequests),
      invoice: countPendingInvoice(activeRequests),
    }),
    [requests, activeRequests]
  );

  const navigate = useCallback(
    (view: PaymentFlowView, extra?: NavState) => {
      setNav(extra ?? {});
      onViewChange?.(view, extra);
    },
    [onViewChange]
  );

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
