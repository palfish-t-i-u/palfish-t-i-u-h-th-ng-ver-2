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
  UpdatePaymentRequestPayload,
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
  mergeAddPaymentLineResponse,
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
  handleUpdatePr: (id: string, payload: UpdatePaymentRequestPayload) => Promise<PaymentRequest>;
  handleAddPayment: (
    requestId: string,
    payload: AddPaymentAttemptPayload
  ) => Promise<{ payment: PaymentAttempt; request: PaymentRequest } | null>;
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
  saveActiveRequest: (next: ActiveRequest) => Promise<void>;
  deleteActiveRequest: (arId: string) => Promise<void>;
  patchCourseOrderId: (
    arId: string,
    courseCode: string,
    orderId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  requestInvoiceForCourse: (arId: string, courseCode: string) => Promise<void>;
  issueInvoiceForCourse: (arId: string, courseCode: string) => Promise<void>;
  badgeCounts: { reconciliation: number; activation: number; invoice: number };
  nav: NavState;
  setNav: (next: NavState) => void;
  navigate: (view: PaymentFlowView, extra?: NavState) => void;
};

const PaymentFlowContext = createContext<PaymentFlowContextValue | null>(null);

const POLL_MS = 30_000;

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
  const courseOrderPatchSeqRef = useRef<Record<string, number>>({});
  const loadDataSeqRef = useRef(0);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  const loadData = useCallback(async (options?: LoadDataOptions) => {
    const seq = ++loadDataSeqRef.current;
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

    // Drop stale poll: a newer loadData() has already started.
    if (seq !== loadDataSeqRef.current) return;

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

  const handleUpdatePr = useCallback(
    async (id: string, payload: UpdatePaymentRequestPayload) => {
      const response = await endpoints.paymentRequests.update(id, payload);
      const saved = normalizeRequest(fromApiPaymentRequest(response.data.payment_request));
      setRequests((prev) => prev.map((r) => (r.id === id ? saved : r)));
      setApiNote("");
      return saved;
    },
    []
  );

  const handleAddPayment = useCallback(
    async (requestId: string, payload: AddPaymentAttemptPayload) => {
      const selected = requests.find((r) => r.id === requestId);
      if (!selected) return null;

      const nextIdx =
        selected.payments.filter((p) => !p.cancelled).length > 0
          ? Math.max(...selected.payments.filter((p) => !p.cancelled).map((p) => p.idx)) + 1
          : 1;

      try {
        const res = (await endpoints.paymentRequests.addPayment(requestId, payload)).data;
        let merged: PaymentRequest | null = null;
        updateRequest(requestId, (r) => {
          merged = mergeAddPaymentLineResponse(r, res, nextIdx);
          return merged;
        });
        if (!merged) return null;
        const payment =
          merged.payments.find((p) => p.id === res.payment_line.id) ??
          merged.payments[merged.payments.length - 1] ??
          null;
        if (!payment) return null;
        setApiNote("");
        return { payment, request: merged };
      } catch (err) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Máy chủ thêm lần thanh toán chưa sẵn sàng.";
        setApiNote(String(msg));
        throw err;
      }
    },
    [requests, updateRequest]
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

  const saveActiveRequest = useCallback(async (next: ActiveRequest) => {
    updateActiveRequest(next.id, () => next);
    try {
      const res = await endpoints.activeRequests.update(next.id, {
        uids_data: toActiveRequestPatchUidsData(next),
      });
      const saved = fromApiActiveRequest(res.data);
      setActiveRequests((prev) => prev.map((x) => (x.id === next.id ? saved : x)));
      setApiNote("");
    } catch {
      setApiNote("Đã đổi tạm trên giao diện; máy chủ chưa lưu được thay đổi Kích hoạt khóa học.");
    }
  }, [updateActiveRequest]);

  const deleteActiveRequest = useCallback(async (arId: string) => {
    const previous = activeRequests;
    setActiveRequests((prev) => prev.filter((x) => x.id !== arId));
    try {
      await endpoints.activeRequests.delete(arId);
      setApiNote("");
    } catch {
      setActiveRequests(previous);
      setApiNote("Chưa xóa được Active Request trên máy chủ. Cần BE thêm endpoint xóa/cancel AR.");
    }
  }, [activeRequests]);

  const patchCourseOrderId = useCallback(
    async (arId: string, courseCode: string, orderId: string) => {
      const trimmed = orderId.trim();
      const seqKey = `${arId}::${courseCode}`;
      const seq = (courseOrderPatchSeqRef.current[seqKey] ?? 0) + 1;
      courseOrderPatchSeqRef.current[seqKey] = seq;
      const readOrderId = (ar: ActiveRequest) => {
        for (const uid of ar.uids) {
          const course = uid.courses.find((c) => c.courseCode === courseCode);
          if (course) return (course.orderId || "").trim();
        }
        return "";
      };
      const currentAr = activeRequests.find((x) => x.id === arId) || null;
      if (!currentAr) {
        const error = `Khong tim thay Active Request ${arId}`;
        setApiNote(error);
        return { ok: false, error };
      }
      const optimistic: ActiveRequest = {
        ...currentAr,
        uids: currentAr.uids.map((u) => ({
          ...u,
          courses: u.courses.map((c) =>
            c.courseCode === courseCode ? { ...c, orderId: trimmed } : c
          ),
        })),
      };

      try {
        const res = await endpoints.activeRequests.patchCourseOrderId(arId, courseCode, trimmed);
        if (courseOrderPatchSeqRef.current[seqKey] !== seq) {
          return { ok: false, error: "Yeu cau cu da bi ghi de boi thao tac moi hon." };
        }
        const ar = fromApiActiveRequest(res.data);
        if (readOrderId(ar) !== trimmed) {
          throw new Error("PATCH returned stale order_id");
        }
        setActiveRequests((prev) => prev.map((x) => (x.id === arId ? ar : x)));
        setApiNote("");
        return { ok: true };
      } catch {
        try {
          const res = await endpoints.activeRequests.update(arId, {
            uids_data: toActiveRequestPatchUidsData(optimistic),
          });
          if (courseOrderPatchSeqRef.current[seqKey] !== seq) {
            return { ok: false, error: "Yeu cau cu da bi ghi de boi thao tac moi hon." };
          }
          const ar = fromApiActiveRequest(res.data);
          if (readOrderId(ar) !== trimmed) {
            throw new Error("Full update returned stale order_id");
          }
          setActiveRequests((prev) => prev.map((x) => (x.id === arId ? ar : x)));
          setApiNote("");
          return { ok: true };
        } catch {
          const error = "Khong luu duoc Order ID len may chu.";
          setApiNote(error);
          return { ok: false, error };
        }
      }
    },
    [activeRequests]
  );

  const requestInvoiceForCourse = useCallback(
    async (arId: string, courseCode: string) => {
      const currentAr = activeRequests.find((x) => x.id === arId);
      if (!currentAr) return;
      const requestedAt = flowNow();
      const next: ActiveRequest = {
        ...currentAr,
        uids: currentAr.uids.map((u) => ({
          ...u,
          courses: u.courses.map((c) =>
            c.courseCode === courseCode ? { ...c, invoiceRequestedAt: requestedAt } : c
          ),
        })),
      };
      updateActiveRequest(arId, () => next);
      try {
        const res = await endpoints.activeRequests.update(arId, {
          uids_data: toActiveRequestPatchUidsData(next),
        });
        const saved = fromApiActiveRequest(res.data);
        setActiveRequests((prev) => prev.map((x) => (x.id === arId ? saved : x)));
        setApiNote("");
      } catch {
        setApiNote("Đã chuyển tạm sang B4 trên giao diện; máy chủ chưa lưu được trạng thái Xuất HĐ.");
      }
    },
    [activeRequests, updateActiveRequest]
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
      handleUpdatePr,
      handleAddPayment,
      confirmTransaction,
      rejectTransaction,
      handleCreateActiveRequest,
      handleCreateActiveRequestFromForm,
      updateActiveRequestCoursePackage,
      saveActiveRequest,
      deleteActiveRequest,
      patchCourseOrderId,
      requestInvoiceForCourse,
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
      handleUpdatePr,
      handleAddPayment,
      confirmTransaction,
      rejectTransaction,
      handleCreateActiveRequest,
      handleCreateActiveRequestFromForm,
      updateActiveRequestCoursePackage,
      saveActiveRequest,
      deleteActiveRequest,
      patchCourseOrderId,
      requestInvoiceForCourse,
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
