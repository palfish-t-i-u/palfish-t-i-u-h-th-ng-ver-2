import { useCallback, useEffect, useMemo, useState } from "react";
import { endpoints } from "../lib/api";
import type {
  AddPaymentAttemptPayload,
  CreatePaymentRequestPayload,
  PaymentAttempt,
  PaymentRequest,
} from "../types/paymentRequest";
import { Button } from "./ui";
import AddPaymentAttemptModal from "./payment-request/AddPaymentAttemptModal";
import CreatePaymentRequestModal from "./payment-request/CreatePaymentRequestModal";
import { MOCK_PAYMENT_REQUESTS } from "./payment-request/mockPaymentRequests";
import PaymentRequestDetailDrawer from "./payment-request/PaymentRequestDetailDrawer";
import PaymentRequestKpiCards from "./payment-request/PaymentRequestKpiCards";
import PaymentRequestSubTabs from "./payment-request/PaymentRequestSubTabs";
import PaymentRequestTable from "./payment-request/PaymentRequestTable";
import PaymentRequestToolbar from "./payment-request/PaymentRequestToolbar";
import {
  type DateFilter,
  type RequestBucket,
  type StatusFilter,
  normalizeRequest,
  requestBucket,
} from "./payment-request/paymentRequestUtils";

function nextPrId(requests: PaymentRequest[]) {
  const max = requests.reduce((best, request) => {
    const n = Number(request.id.match(/(\d+)$/)?.[1] || 0);
    return Math.max(best, n);
  }, 0);
  return `PR-2026-${String(max + 1).padStart(4, "0")}`;
}

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function dateInRange(createdAt: string, filter: DateFilter) {
  if (filter === "all") return true;
  const created = new Date(createdAt.replace(" ", "T"));
  if (Number.isNaN(created.getTime())) return true;
  const now = new Date();
  const start = new Date(now);
  if (filter === "today") start.setHours(0, 0, 0, 0);
  if (filter === "7d") start.setDate(now.getDate() - 7);
  if (filter === "30d") start.setDate(now.getDate() - 30);
  return created >= start;
}

export default function PaymentRequestsTab() {
  const [requests, setRequests] = useState<PaymentRequest[]>(MOCK_PAYMENT_REQUESTS);
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_PAYMENT_REQUESTS[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [bucket, setBucket] = useState<RequestBucket>("tracking");
  const [loading, setLoading] = useState(false);
  const [apiNote, setApiNote] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await endpoints.paymentRequests.list();
      const next = response.data.requests.map(normalizeRequest);
      setRequests(next.length >= 10 ? next : MOCK_PAYMENT_REQUESTS);
      setSelectedId((prev) => prev && next.some((request) => request.id === prev) ? prev : next[0]?.id ?? MOCK_PAYMENT_REQUESTS[0]?.id ?? null);
      setApiNote(next.length >= 10 ? "" : "Dữ liệu Payment Request từ máy chủ chưa đủ để duyệt giao diện; đang dùng dữ liệu mẫu theo hợp đồng dữ liệu.");
    } catch {
      setRequests(MOCK_PAYMENT_REQUESTS);
      setSelectedId((prev) => prev ?? MOCK_PAYMENT_REQUESTS[0]?.id ?? null);
      setApiNote("Máy chủ Payment Request chưa sẵn sàng; đang dùng dữ liệu mẫu theo hợp đồng dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? requests[0] ?? null,
    [requests, selectedId]
  );

  const counts = useMemo(() => {
    const live = requests.filter((request) => request.state !== "cancelled");
    return {
      all: live.length,
      pending: live.filter((request) => request.state === "pending").length,
      short: live.filter((request) => request.state === "short").length,
      done: live.filter((request) => request.state === "done").length,
      over: live.filter((request) => request.state === "over").length,
    };
  }, [requests]);

  const bucketCounts = useMemo(() => ({
    tracking: requests.filter((request) => requestBucket(request) === "tracking").length,
    created: requests.filter((request) => requestBucket(request) === "created").length,
    cancelled: requests.filter((request) => requestBucket(request) === "cancelled").length,
  }), [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (requestBucket(request) !== bucket) return false;
      if (status !== "all" && request.state !== status) return false;
      if (!dateInRange(request.createdAt, dateFilter)) return false;
      if (!q) return true;
      return [request.id, request.name, request.uid, request.phone].some((value) => value.toLowerCase().includes(q));
    });
  }, [bucket, dateFilter, requests, search, status]);

  const updateRequest = (id: string, updater: (request: PaymentRequest) => PaymentRequest) => {
    setRequests((prev) => prev.map((request) => (request.id === id ? normalizeRequest(updater(request)) : request)));
  };

  const createPaymentRequest = async (payload: CreatePaymentRequestPayload) => {
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
    setSelectedId(fallback.id);
    setCreateOpen(false);
    try {
      const response = await endpoints.paymentRequests.create(payload);
      const saved = normalizeRequest(response.data);
      setRequests((prev) => prev.map((request) => (request.id === fallback.id ? saved : request)));
      setSelectedId(saved.id);
    } catch {
      setApiNote("Máy chủ tạo Payment Request chưa sẵn sàng; giao diện đã tạo bản tạm theo hợp đồng dữ liệu.");
    }
  };

  const addPayment = async (payload: AddPaymentAttemptPayload) => {
    if (!selected) return;
    const requestId = selected.id;
    const localPayment: PaymentAttempt = {
      id: `${requestId}-${Date.now()}`,
      idx: selected.payments.length + 1,
      amount: payload.amount,
      status: payload.method === "cash" || payload.method === "card" ? "paid" : "pending",
      createdAt: nowStamp(),
      paidAt: payload.method === "cash" || payload.method === "card" ? nowStamp() : null,
      code: `TT-${requestId.replace(/[^\d]/g, "").slice(-4)}-${String(selected.payments.length + 1).padStart(3, "0")}`,
      bill: payload.method !== "qr",
      method: payload.method,
      bank: payload.bank,
      cardLast4: payload.cardLast4,
      installmentMonths: payload.installmentMonths,
      cashier: payload.cashier,
    };
    updateRequest(requestId, (request) => ({ ...request, payments: [...request.payments, localPayment] }));
    setAddPaymentOpen(false);
    try {
      const response = await endpoints.paymentRequests.addPayment(requestId, payload);
      updateRequest(requestId, (request) => ({
        ...request,
        payments: request.payments.map((payment) => (payment.id === localPayment.id ? response.data : payment)),
      }));
    } catch {
      setApiNote("Máy chủ thêm lần thanh toán chưa sẵn sàng; giao diện đã cập nhật tạm theo hợp đồng dữ liệu.");
    }
  };

  const cancelRequest = async (request: PaymentRequest) => {
    updateRequest(request.id, (current) => ({ ...current, cancelledAt: nowStamp(), cancelledReason: "Huỷ PR" }));
    setBucket("cancelled");
    try {
      await endpoints.paymentRequests.cancel(request.id);
    } catch {
      setApiNote("Máy chủ huỷ PR chưa sẵn sàng; giao diện đã cập nhật tạm theo hợp đồng dữ liệu.");
    }
  };

  const createActiveRequest = async () => {
    if (!selected) return;
    setApiNote("Yêu cầu tạo đơn hàng sẽ nối sang màn Kích hoạt khóa học khi phần máy chủ của Giang/Đức sẵn sàng.");
    try {
      await endpoints.paymentRequests.createActiveRequest({
        prId: selected.id,
        customerName: selected.name,
        uid: selected.uid,
        phone: selected.phone,
        country: selected.country,
        targetAmount: selected.target,
      });
    } catch {
      // Giữ message ở trên để UI không giả lập module B3 trong màn này.
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-6 text-gmv-muted">
          Mỗi <strong className="text-gmv-text-strong">Payment Request</strong> đại diện cho một thương vụ. Một PR có thể gồm <strong className="text-gmv-text-strong">nhiều lần thanh toán</strong> (chuyển khoản nhiều lần hoặc 1 lần CK cho nhiều đơn). Khi đủ 100% sẽ chuyển sang bước Active Request.
        </p>
        <Button onClick={() => setCreateOpen(true)}>+ Tạo Payment Request</Button>
      </div>

      <PaymentRequestKpiCards requests={requests} />

      <PaymentRequestToolbar
        search={search}
        status={status}
        dateFilter={dateFilter}
        counts={counts}
        onSearch={setSearch}
        onStatus={setStatus}
        onDateFilter={setDateFilter}
      />

      {apiNote && (
        <div className="rounded-gmv-md border border-gmv-warn/40 bg-gmv-warn-soft px-3 py-2 text-sm text-gmv-warn">
          {apiNote}
        </div>
      )}

      <div className="overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas shadow-gmv-1">
        <PaymentRequestSubTabs active={bucket} counts={bucketCounts} resultCount={filtered.length} onChange={setBucket} />
        <div className="grid gap-4 p-0 xl:grid-cols-[minmax(0,1fr)_380px]">
          <PaymentRequestTable
            requests={filtered}
            selectedId={selected?.id ?? null}
            onSelect={(request) => setSelectedId(request.id)}
            onCancel={cancelRequest}
          />
          <div className="p-4 pl-0 max-xl:pl-4">
            <PaymentRequestDetailDrawer
              request={selected}
              onAddPayment={() => setAddPaymentOpen(true)}
              onCreateActiveRequest={createActiveRequest}
              onCancel={() => selected && cancelRequest(selected)}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={loadData} disabled={loading}>
          {loading ? "Đang tải..." : "Tải lại"}
        </Button>
      </div>

      <CreatePaymentRequestModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={createPaymentRequest} />
      <AddPaymentAttemptModal request={selected} open={addPaymentOpen} onClose={() => setAddPaymentOpen(false)} onSubmit={addPayment} />
    </div>
  );
}
