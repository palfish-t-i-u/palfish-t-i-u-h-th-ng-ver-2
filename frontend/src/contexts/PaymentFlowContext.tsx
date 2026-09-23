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
import { notifyLedgerChanged } from "../lib/ledgerEvents";
import { withExpectedUpdatedAt, parseArConflict, AR_CONFLICT_MESSAGE } from "../lib/arConcurrency";
import {
  fetchAllPaymentRequests,
  PR_TOTAL_WARN_THRESHOLD,
  type RawPrRow,
} from "../lib/fetchAllPaymentRequests";
import { PR_LIST_MODE, PR_SERVER_PAGE_SIZE } from "../lib/prListMode";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import { useVisiblePoll } from "../hooks/useVisiblePoll";
import type {
  ActiveRequest,
  AddPaymentAttemptPayload,
  ArDraftRow,
  CompletionReport,
  CreatePaymentRequestPayload,
  CreateActiveRequestPayload,
  PatchPaymentRequestPayload,
  PaymentAttempt,
  PaymentRequest,
  PrBadgeCountsResponse,
  PrListQuery,
  PrSummaryResponse,
} from "../types/paymentRequest";
import {
  buildCreateActiveRequestPayload,
  createLocalActiveRequestFromForm,
  fromApiActiveRequest,
  fromApiPaymentRequest,
  hasPendingQrPayments,
  isBackendLineId,
  mergeAddPaymentLineResponse,
  normalizeRequest,
  toActiveRequestPatchUidsData,
  updateActiveCoursePackage,
} from "../components/payment-request/paymentRequestUtils";
import {
  countAwaitingTransactions,
  countPendingAr,
  countPendingInvoice,
  nowStamp as flowNow,
} from "../components/payment-flow/paymentFlowUtils";

export type PaymentFlowView = "paymentRequests" | "reconciliation" | "module3" | "module4" | "reconCard";

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
  orderIdConflictMessage: string;
  setOrderIdConflictMessage: (msg: string) => void;
  dismissOrderIdConflict: () => void;
  loadData: (options?: LoadDataOptions) => Promise<void>;
  updateRequest: (id: string, updater: (r: PaymentRequest) => PaymentRequest) => void;
  updateActiveRequest: (id: string, updater: (ar: ActiveRequest) => ActiveRequest) => void;
  setEditingArId: (id: string | null) => void;
  markPersisted: () => void;
  handleCreate: (payload: CreatePaymentRequestPayload) => Promise<PaymentRequest>;
  handleUpdatePr: (id: string, payload: PatchPaymentRequestPayload) => Promise<PaymentRequest>;
  handleAddPayment: (
    requestId: string,
    payload: AddPaymentAttemptPayload
  ) => Promise<{ payment: PaymentAttempt; request: PaymentRequest } | null>;
  confirmTransaction: (prId: string, paymentId: string, extra?: { verified_total?: number; verified_received?: number }) => Promise<void>;
  rejectTransaction: (prId: string, paymentId: string, rejectReason?: string) => Promise<void>;
  /** B3 (16/7) — Báo đơn hoàn thành. reason bắt buộc từ lần báo thứ 2 (BE validate). */
  reportComplete: (prId: string, reason?: string) => Promise<CompletionReport>;
  handleCreateActiveRequest: (pr: PaymentRequest, rows: ArDraftRow[], opts?: { holdActivation?: boolean; holdNote?: string }) => Promise<ActiveRequest>;
  handleAppendActiveRequest: (pr: PaymentRequest, arId: string, rows: ArDraftRow[], opts?: { holdActivation?: boolean; holdNote?: string }) => Promise<ActiveRequest>;
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

  // --- Server-side pagination cho B1 (M3-T2, pr-list-server-pagination) ---
  // Vô hại/rỗng khi PR_LIST_MODE==="load-all" (mặc định) — chỉ có ý nghĩa ở server mode.
  /** Bộ lọc trang hiện tại (bucket/state/date/tvts/search/page) — set qua setListQuery. */
  listQuery: PrListQuery;
  setListQuery: (next: PrListQuery) => void;
  /** 1 trang PR (≤50) khớp listQuery hiện tại — server mode dùng thay `requests` để render bảng. */
  pageRows: PaymentRequest[];
  pageTotal: number;
  /** AR của các PR trong pageRows + PR đã hydrate rời (pinnedRows) — TÁCH khỏi `activeRequests`
   * đầy đủ (LB6: B3 mounted độc lập cần `activeRequests` full, không được thay bằng bản trang). */
  pageActiveRequests: ActiveRequest[];
  /** chips/tabs/kpi/tvts/has_pending_qr cho toàn bộ tập khớp filter (không chỉ 1 trang). */
  summary: PrSummaryResponse | null;
  /** Tìm 1 PR: pageRows → pinnedRows (đã hydrate rời) → requests (full, nếu đã tải). */
  findPr: (id: string) => PaymentRequest | null;
  /** B2/B3/B4 gọi trong effect mount để đảm bảo `requests`/`activeRequests` đầy đủ vẫn được tải
   * song song ở server mode (3 tab này chưa chuyển sang findPr/pageRows). Trả cleanup giảm đếm. */
  ensureFullData: () => () => void;
  /** Tải 1 PR đầy đủ ngoài trang đang xem (VD nav từ B3 tới PR tháng khác) → ghim vào pinnedRows. */
  hydratePr: (id: string) => Promise<PaymentRequest | null>;
  /** Ghim/bỏ ghim 1 PR đã có sẵn (row từ lưới) vào pinnedRows — không gọi mạng. */
  pinPr: (row: PaymentRequest) => void;
  unpinPr: (id: string) => void;
};

const PaymentFlowContext = createContext<PaymentFlowContextValue | null>(null);

const POLL_MS = 30_000;


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
  const [orderIdConflictMessage, setOrderIdConflictMessage] = useState("");
  const [nav, setNav] = useState<NavState>({});
  const onViewChangeRef = useRef(onViewChange);
  const courseOrderPatchSeqRef = useRef<Record<string, number>>({});
  const loadDataSeqRef = useRef(0);
  const persistCooldownRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingRefetchRef = useRef(false);
  const editingArIdRef = useRef<string | null>(null);

  // --- Server-side pagination cho B1 (M3-T2) — chỉ đọc/ghi khi PR_LIST_MODE==="server" ---
  const [listQuery, setListQueryState] = useState<PrListQuery>({ bucket: "tracking", page: 1 });
  const [pageRows, setPageRows] = useState<PaymentRequest[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [pinnedRows, setPinnedRows] = useState<Map<string, PaymentRequest>>(new Map());
  const [pageActiveRequests, setPageActiveRequests] = useState<ActiveRequest[]>([]);
  const [summary, setSummary] = useState<PrSummaryResponse | null>(null);
  const [badgeCountsServer, setBadgeCountsServer] = useState<PrBadgeCountsResponse | null>(null);
  const fullLoadedRef = useRef(false);
  const fullConsumersRef = useRef(0);
  const hydrateSeqRef = useRef<Record<string, number>>({});
  const pinnedRowsRef = useRef(pinnedRows);
  useEffect(() => {
    pinnedRowsRef.current = pinnedRows;
  }, [pinnedRows]);

  const setListQuery = useCallback((next: PrListQuery) => {
    setListQueryState(next);
  }, []);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  // Tải toàn bộ requests + activeRequests (hành vi GĐ1 gốc) — dùng làm nhánh
  // load-all mode VÀ khi server mode có consumer full-data (B2/B3/B4 mounted).
  const fetchFullData = useCallback(async (): Promise<{
    requests: PaymentRequest[] | null;
    activeRequests: ActiveRequest[] | null;
    notes: string[];
  }> => {
    const notes: string[] = [];
    let nextRequests: PaymentRequest[] | null = null;
    try {
      const all = await fetchAllPaymentRequests(async (limit, offset) => {
        const response = await endpoints.paymentRequests.list({ limit, offset });
        return { requests: (response.data.requests ?? []) as unknown as RawPrRow[], total: response.data.total };
      });
      nextRequests = all.requests.map((r) => normalizeRequest(fromApiPaymentRequest(r)));
      if (all.incomplete) {
        notes.push("Danh sách PR tải chưa đủ — sẽ tự đồng bộ lại, hoặc bấm tải lại trang.");
      }
      if (all.total !== null && all.total > PR_TOTAL_WARN_THRESHOLD) {
        console.warn(
          `[pr-list] total=${all.total} vượt ${PR_TOTAL_WARN_THRESHOLD} — trigger GĐ2 (slim list), xem docs/superpowers/plans/2026-07-11-pr-list-slim-lazy-gd2.md`
        );
      }
    } catch {
      notes.push("GET /payment-requests chưa sẵn sàng.");
    }

    let nextArs: ActiveRequest[] | null = null;
    try {
      const arRes = await endpoints.activeRequests.list();
      const rows = Array.isArray(arRes.data) ? arRes.data : [];
      nextArs = rows.map(fromApiActiveRequest);
    } catch {
      notes.push("GET /active-requests chưa sẵn sàng.");
    }

    return { requests: nextRequests, activeRequests: nextArs, notes };
  }, []);

  const applyFullData = useCallback((nextRequests: PaymentRequest[] | null, nextArs: ActiveRequest[] | null) => {
    if (nextRequests) setRequests(nextRequests);
    if (nextArs) {
      const editId = editingArIdRef.current;
      if (editId) {
        setActiveRequests((prev) => {
          const editing = prev.find((x) => x.id === editId);
          if (!editing) return nextArs;
          return nextArs.map((x) => (x.id === editId ? editing : x));
        });
      } else {
        setActiveRequests(nextArs);
      }
    }
    if (nextRequests || nextArs) fullLoadedRef.current = true;
  }, []);

  const loadData = useCallback(async (options?: LoadDataOptions) => {
    if (options?.silent && inFlightRef.current) {
      pendingRefetchRef.current = true;
      return;
    }
    inFlightRef.current = true;
    const seq = ++loadDataSeqRef.current;
    if (!options?.silent) setLoading(true);

    try {
      if (PR_LIST_MODE === "server") {
        // --- Server mode: trang (≤50 dòng) + summary + badge-counts + AR của trang ---
        const notes: string[] = [];
        let nextPageRows: PaymentRequest[] = [];
        let nextTotal = 0;
        let pageOk = false;
        try {
          const res = await endpoints.paymentRequests.listPage({ ...listQuery, page_size: PR_SERVER_PAGE_SIZE });
          nextPageRows = (res.data.requests ?? []).map((r) =>
            normalizeRequest(fromApiPaymentRequest(r as unknown as Record<string, unknown>))
          );
          nextTotal = res.data.total ?? 0;
          pageOk = true;
        } catch {
          notes.push("GET /payment-requests?view=page chưa sẵn sàng.");
        }

        let nextSummary: PrSummaryResponse | null = null;
        try {
          nextSummary = (await endpoints.paymentRequests.summary(listQuery)).data;
        } catch {
          notes.push("GET /payment-requests/summary chưa sẵn sàng.");
        }

        let nextBadge: PrBadgeCountsResponse | null = null;
        try {
          nextBadge = (await endpoints.paymentRequests.badgeCounts()).data;
        } catch {
          notes.push("GET /payment-requests/badge-counts chưa sẵn sàng.");
        }

        let nextPageArs: ActiveRequest[] = [];
        if (pageOk && nextPageRows.length > 0) {
          try {
            const ids = nextPageRows.map((r) => r.id).join(",");
            const arRes = await endpoints.activeRequests.list({ pr_ids: ids });
            const rows = Array.isArray(arRes.data) ? arRes.data : [];
            nextPageArs = rows.map(fromApiActiveRequest);
          } catch {
            notes.push("GET /active-requests?pr_ids chưa sẵn sàng.");
          }
        }

        // B2/B3/B4 vẫn cần requests/activeRequests đầy đủ khi mounted — tải song song,
        // KHÔNG chờ tuần tự (mỗi consumer chỉ tăng chi phí khi thực sự có tab đó mở).
        let fullResult: Awaited<ReturnType<typeof fetchFullData>> | null = null;
        if (fullConsumersRef.current > 0) {
          fullResult = await fetchFullData();
          notes.push(...fullResult.notes);
        }

        if (seq !== loadDataSeqRef.current) return;

        if (pageOk) {
          setPageRows(nextPageRows);
          setPageTotal(nextTotal);
        }
        if (nextSummary) setSummary(nextSummary);
        if (nextBadge) setBadgeCountsServer(nextBadge);
        setPageActiveRequests((prev) => {
          // Giữ AR của các PR đã pin (hydratePr) không nằm trong trang hiện tại —
          // tránh B3 "mất" AR của 1 PR ngoài trang đang mở drawer.
          const pageIds = new Set(nextPageRows.map((r) => r.id));
          const kept = prev.filter(
            (ar) => ar.prId && !pageIds.has(ar.prId) && pinnedRowsRef.current.has(ar.prId)
          );
          return [...nextPageArs, ...kept];
        });
        if (fullResult) applyFullData(fullResult.requests, fullResult.activeRequests);

        setApiNote(notes.join(" "));
        if (!options?.silent) setLoading(false);
        return;
      }

      // --- Load-all mode (mặc định, hành vi GĐ1 gốc — KHÔNG đổi) ---
      const { requests: nextRequests, activeRequests: nextArs, notes } = await fetchFullData();
      if (seq !== loadDataSeqRef.current) return;
      applyFullData(nextRequests, nextArs);
      setApiNote(notes.join(" "));
      if (!options?.silent) setLoading(false);
    } finally {
      inFlightRef.current = false;
      if (pendingRefetchRef.current) {
        pendingRefetchRef.current = false;
        // Cùng gate với silentRefetch: không chain refetch nền khi đang sửa AR.
        if (!editingArIdRef.current) void loadData({ silent: true });
      }
    }
  }, [listQuery, fetchFullData, applyFullData]);

  // Load-all mode: tải full ngay khi mount. Server mode: xem effect [listQuery] dưới
  // (chạy luôn ở lần mount đầu vì useEffect luôn fire ít nhất 1 lần).
  useEffect(() => {
    if (PR_LIST_MODE === "load-all") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadData();
    }
  }, [loadData]);

  // Server mode: bộ lọc/trang đổi -> refetch. KHÔNG gộp chung effect với load-all
  // ở trên để tránh double-fetch lúc mount (2 effect cùng gọi loadData 1 lần đầu).
  useEffect(() => {
    if (PR_LIST_MODE === "server") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery]);

  const ensureFullData = useCallback(() => {
    fullConsumersRef.current += 1;
    if (PR_LIST_MODE === "server" && !fullLoadedRef.current) {
      void loadData({ silent: true });
    }
    return () => {
      fullConsumersRef.current = Math.max(0, fullConsumersRef.current - 1);
    };
  }, [loadData]);

  const findPr = useCallback(
    (id: string): PaymentRequest | null => {
      return pageRows.find((r) => r.id === id) ?? pinnedRows.get(id) ?? requests.find((r) => r.id === id) ?? null;
    },
    [pageRows, pinnedRows, requests]
  );

  const hydratePr = useCallback(async (id: string): Promise<PaymentRequest | null> => {
    const seq = (hydrateSeqRef.current[id] ?? 0) + 1;
    hydrateSeqRef.current[id] = seq;
    try {
      const res = await endpoints.paymentRequests.get(id);
      // Seq-guard per-id (bug QR cross-PR 26/6): 1 hydrate cũ hơn trả về SAU 1 hydrate
      // mới hơn cho CÙNG id thì bỏ, không ghi đè dữ liệu mới bằng dữ liệu cũ.
      if (hydrateSeqRef.current[id] !== seq) return null;
      const pr = normalizeRequest(fromApiPaymentRequest(res.data));
      setPinnedRows((prev) => {
        const next = new Map(prev);
        next.set(id, pr);
        return next;
      });
      try {
        const arRes = await endpoints.activeRequests.list({ pr_ids: id });
        const rows = Array.isArray(arRes.data) ? arRes.data : [];
        const ars = rows.map(fromApiActiveRequest);
        if (hydrateSeqRef.current[id] === seq) {
          setPageActiveRequests((prev) => [...prev.filter((a) => a.prId !== id), ...ars]);
        }
      } catch {
        // AR hydrate lỗi không chặn hiển thị PR — trả pr, AR coi như chưa có.
      }
      return pr;
    } catch {
      return null;
    }
  }, []);

  // Ghim 1 PR đã có sẵn (row từ lưới) vào pinnedRows — KHÔNG gọi mạng, chỉ giữ nó
  // "sống" qua refetch nền để findPr không trả null (server mode). updateRequest đã
  // đồng bộ pinnedRows nên snapshot được cập nhật khi có optimistic update.
  const pinPr = useCallback((row: PaymentRequest) => {
    setPinnedRows((prev) => {
      const next = new Map(prev);
      next.set(row.id, row);
      return next;
    });
  }, []);
  const unpinPr = useCallback((id: string) => {
    setPinnedRows((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const pendingQr = useMemo(() => {
    if (PR_LIST_MODE === "server") return summary?.has_pending_qr ?? false;
    return hasPendingQrPayments(requests);
  }, [requests, summary]);

  // Refetch nền (poll / realtime / focus) — bỏ qua khi:
  // - vừa persist (cooldown 3s, tránh realtime echo ghi đè optimistic)
  // - đang sửa 1 AR trong drawer (editingArIdRef): full-refetch O(N) giữa lúc gõ
  //   là nguồn lag chính. loadData() tay (nút "Tải lại") vẫn đi thẳng, không qua đây.
  const silentRefetch = useCallback(() => {
    if (Date.now() < persistCooldownRef.current) return;
    if (editingArIdRef.current) return;
    void loadData({ silent: true });
  }, [loadData]);

  useVisiblePoll(silentRefetch, POLL_MS, pendingQr);

  const markPersisted = useCallback(() => {
    persistCooldownRef.current = Date.now() + 3_000;
  }, []);

  useRealtimeTable(
    ["payment_requests", "payment_lines", "active_requests"],
    silentRefetch,
  );

  useRefetchOnFocus(silentRefetch);

  const updateRequest = useCallback((id: string, updater: (r: PaymentRequest) => PaymentRequest) => {
    // Cập nhật ĐỒNG THỜI mọi nơi PR có thể đang sống (requests / pageRows / pinnedRows,
    // M3-T2) — set trên mảng/Map không chứa id là no-op vô hại, nên an toàn gọi cả 3 dù
    // mode nào. Thiếu bước này: optimistic update ở server mode chỉ chạm `requests`
    // (thường rỗng), UI trang/pin không thấy thay đổi cho tới lần refetch kế tiếp.
    setRequests((prev) => prev.map((r) => (r.id === id ? normalizeRequest(updater(r)) : r)));
    setPageRows((prev) => prev.map((r) => (r.id === id ? normalizeRequest(updater(r)) : r)));
    setPinnedRows((prev) => {
      const current = prev.get(id);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(id, normalizeRequest(updater(current)));
      return next;
    });
  }, []);

  const updateActiveRequest = useCallback((id: string, updater: (ar: ActiveRequest) => ActiveRequest) => {
    setActiveRequests((prev) => prev.map((ar) => (ar.id === id ? updater(ar) : ar)));
    setPageActiveRequests((prev) => prev.map((ar) => (ar.id === id ? updater(ar) : ar)));
  }, []);

  const setEditingArId = useCallback((id: string | null) => {
    editingArIdRef.current = id;
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
    async (id: string, payload: PatchPaymentRequestPayload) => {
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
      const selected = findPr(requestId);
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
        const m = merged as PaymentRequest;
        const payment =
          m.payments.find((p: PaymentAttempt) => p.id === res.payment_line.id) ??
          m.payments[m.payments.length - 1] ??
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
    [findPr, updateRequest]
  );

  const confirmTransaction = useCallback(
    async (prId: string, paymentId: string, extra?: { verified_total?: number; verified_received?: number }) => {
      // Backend-persisted line: gọi BE thật; nếu BE từ chối, KHÔNG set paid ở FE.
      if (isBackendLineId(paymentId)) {
        try {
          const res = await endpoints.transactions.patchStatus(paymentId, "paid", undefined, extra);
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
                    verifiedTotal: line.verified_total ?? p.verifiedTotal ?? null,
                    verifiedReceived: line.verified_received ?? p.verifiedReceived ?? null,
                  }
                : p
            );
            const prFromBe = fromApiPaymentRequest(res.data.payment_request);
            return normalizeRequest({ ...r, ...prFromBe, payments: updatedPayments });
          });
          setApiNote("");
          return;
        } catch (err) {
          const msg =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            "Máy chủ từ chối xác nhận thanh toán. Vui lòng thử lại.";
          setApiNote(String(msg));
          throw err;
        }
      }
      // Local-only line (chưa có ở BE) — optimistic OK
      updateRequest(prId, (r) => ({
        ...r,
        payments: r.payments.map((p) =>
          p.id === paymentId ? { ...p, status: "paid", paidAt: flowNow() } : p
        ),
      }));
    },
    [updateRequest]
  );

  const reportComplete = useCallback(
    async (prId: string, reason?: string) => {
      try {
        const res = (await endpoints.paymentRequests.reportComplete(prId, reason ? { reason } : undefined)).data;
        updateRequest(prId, (r) => ({ ...r, completion_reports: res.reports }));
        setApiNote("");
        return res.report;
      } catch (err) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Máy chủ từ chối báo đơn hoàn thành. Vui lòng thử lại.";
        setApiNote(String(msg));
        throw err;
      }
    },
    [updateRequest]
  );

  const rejectTransaction = useCallback(
    async (prId: string, paymentId: string, rejectReason?: string) => {
      // Snapshot trước khi optimistic để rollback nếu BE từ chối
      const previousPayments = (findPr(prId)?.payments ?? null);
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
          setApiNote("");
        } catch (err) {
          // BE từ chối: rollback FE để UI khớp DB
          if (previousPayments) {
            updateRequest(prId, (r) => ({ ...r, payments: previousPayments }));
          }
          const msg =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            "Máy chủ từ chối huỷ giao dịch. Vui lòng thử lại.";
          setApiNote(String(msg));
          throw err;
        }
      }
    },
    [findPr, updateRequest]
  );

  const handleCreateActiveRequest = useCallback(
    async (pr: PaymentRequest, rows: ArDraftRow[], opts?: { holdActivation?: boolean; holdNote?: string; crmAddressConfirmed?: boolean }) => {
      try {
        const res = await endpoints.paymentRequests.createActiveRequest(
          pr.id,
          buildCreateActiveRequestPayload(pr, rows, opts)
        );
        const ar = fromApiActiveRequest(res.data);
        if (!ar.customerName) ar.customerName = pr.name;
        setActiveRequests((prev) => [ar, ...prev.filter((x) => x.id !== ar.id)]);
        setApiNote("");
        return ar;
      } catch (err) {
        // Không tạo AR giả lập local — ops không thấy được, sale chờ vô vọng.
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Không tạo được Active Request trên máy chủ. Vui lòng thử lại.";
        setApiNote(String(msg));
        throw err;
      }
    },
    []
  );

  const handleAppendActiveRequest = useCallback(
    async (pr: PaymentRequest, arId: string, rows: ArDraftRow[], opts?: { holdActivation?: boolean; holdNote?: string; crmAddressConfirmed?: boolean }) => {
      try {
        const res = await endpoints.activeRequests.append(
          arId,
          buildCreateActiveRequestPayload(pr, rows, opts)
        );
        const ar = fromApiActiveRequest(res.data);
        if (!ar.customerName) ar.customerName = pr.name;
        // Replace-in-place: AR đã tồn tại trong state, không prepend bản sao
        setActiveRequests((prev) => prev.map((x) => (x.id === ar.id ? ar : x)));
        setApiNote("");
        return ar;
      } catch (err) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Không bổ sung được bé/gói trên máy chủ. Vui lòng thử lại.";
        setApiNote(String(msg));
        throw err;
      }
    },
    []
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

      markPersisted();
      try {
        const res = await endpoints.activeRequests.update(arId,
          withExpectedUpdatedAt({ uids_data: toActiveRequestPatchUidsData(optimistic) }, optimistic),
        );
        const ar = fromApiActiveRequest(res.data);
        setActiveRequests((prev) => prev.map((x) => (x.id === arId ? ar : x)));
        markPersisted();
        setApiNote("");
      } catch (err) {
        const conflict = parseArConflict(err);
        if (conflict.conflict) {
          const fresh = fromApiActiveRequest(conflict.current);
          setActiveRequests((prev) => prev.map((x) => (x.id === arId ? fresh : x)));
          setApiNote(AR_CONFLICT_MESSAGE);
        } else {
          setApiNote("Đã đổi gói tạm trên giao diện; máy chủ chưa lưu được thay đổi gói học.");
        }
      }
    },
    [updateActiveRequest, markPersisted]
  );

  const saveActiveRequest = useCallback(async (next: ActiveRequest) => {
    updateActiveRequest(next.id, () => next);
    markPersisted();
    try {
      const res = await endpoints.activeRequests.update(next.id,
        withExpectedUpdatedAt({ uids_data: toActiveRequestPatchUidsData(next) }, next),
      );
      const saved = fromApiActiveRequest(res.data);
      setActiveRequests((prev) => prev.map((x) => (x.id === next.id ? saved : x)));
      markPersisted();
      setApiNote("");
      if (saved.uids.some((u) => u.courses.some((c) => c.orderId?.trim()))) {
        notifyLedgerChanged();
      }
    } catch (err) {
      const conflict = parseArConflict(err);
      if (conflict.conflict) {
        const fresh = fromApiActiveRequest(conflict.current);
        setActiveRequests((prev) => prev.map((x) => (x.id === next.id ? fresh : x)));
        setApiNote(AR_CONFLICT_MESSAGE);
      } else {
        setApiNote("Đã đổi tạm trên giao diện; máy chủ chưa lưu được thay đổi Tạo gói học.");
      }
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
      const extractDetail = (err: unknown): string => {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        return typeof detail === "string" ? detail : "";
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
        if (trimmed) notifyLedgerChanged();
        return { ok: true };
      } catch (err1) {
        const detail1 = extractDetail(err1);
        if (detail1.includes("order_id") && detail1.includes("ton tai")) {
          setOrderIdConflictMessage(detail1);
          setApiNote(`Order ID '${trimmed}' đã được dùng ở Active Request khác — không lưu được.`);
          return { ok: false, error: detail1 };
        }
        const error = detail1 || "Khong luu duoc Order ID len may chu.";
        setApiNote(error);
        return { ok: false, error };
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
        const res = await endpoints.activeRequests.update(arId,
          withExpectedUpdatedAt({ uids_data: toActiveRequestPatchUidsData(next) }, currentAr),
        );
        const saved = fromApiActiveRequest(res.data);
        setActiveRequests((prev) => prev.map((x) => (x.id === arId ? saved : x)));
        setApiNote("");
      } catch (err) {
        const conflict = parseArConflict(err);
        if (conflict.conflict) {
          const fresh = fromApiActiveRequest(conflict.current);
          setActiveRequests((prev) => prev.map((x) => (x.id === arId ? fresh : x)));
          setApiNote(AR_CONFLICT_MESSAGE);
        } else {
          setApiNote("Đã chuyển tạm sang B4 trên giao diện; máy chủ chưa lưu được trạng thái Xuất HĐ.");
        }
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

  const badgeCounts = useMemo(() => {
    if (PR_LIST_MODE === "server" && badgeCountsServer) return badgeCountsServer;
    return {
      reconciliation: countAwaitingTransactions(requests),
      activation: countPendingAr(activeRequests),
      invoice: countPendingInvoice(activeRequests),
    };
  }, [requests, activeRequests, badgeCountsServer]);

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
      orderIdConflictMessage,
      setOrderIdConflictMessage,
      dismissOrderIdConflict: () => setOrderIdConflictMessage(""),
      loadData,
      updateRequest,
      updateActiveRequest,
      setEditingArId,
      markPersisted,
      handleCreate,
      handleUpdatePr,
      handleAddPayment,
      confirmTransaction,
      rejectTransaction,
      reportComplete,
      handleCreateActiveRequest,
      handleAppendActiveRequest,
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
      listQuery,
      setListQuery,
      pageRows,
      pageTotal,
      pageActiveRequests,
      summary,
      findPr,
      ensureFullData,
      hydratePr,
      pinPr,
      unpinPr,
    }),
    [
      requests,
      activeRequests,
      loading,
      apiNote,
      orderIdConflictMessage,
      loadData,
      updateRequest,
      updateActiveRequest,
      setEditingArId,
      markPersisted,
      handleCreate,
      handleUpdatePr,
      handleAddPayment,
      confirmTransaction,
      rejectTransaction,
      reportComplete,
      handleCreateActiveRequest,
      handleAppendActiveRequest,
      handleCreateActiveRequestFromForm,
      updateActiveRequestCoursePackage,
      saveActiveRequest,
      deleteActiveRequest,
      patchCourseOrderId,
      requestInvoiceForCourse,
      issueInvoiceForCourse,
      listQuery,
      setListQuery,
      pageRows,
      pageTotal,
      pageActiveRequests,
      summary,
      findPr,
      ensureFullData,
      hydratePr,
      pinPr,
      unpinPr,
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
