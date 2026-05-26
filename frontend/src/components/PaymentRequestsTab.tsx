import { useCallback, useEffect, useMemo, useState } from "react";
import { endpoints } from "../lib/api";
import { cn } from "../lib/cn";
import type {
  ActiveCourse,
  ActiveRequest,
  ActiveRequestStatus,
  ActiveUidGroup,
  AddPaymentAttemptPayload,
  PaymentAttempt,
  PaymentMethod,
  PaymentRequest,
  PaymentRequestStatus,
} from "../types/paymentRequest";
import { Badge, Button, Card, CardBody, Input, Modal, Select, Table, TableWrap, Td, Textarea, Th, Tr } from "./ui";

type WorkTab = "requests" | "reconcile" | "activate" | "invoice";

const METHOD_META: Record<PaymentMethod, { label: string; short: string; helper: string; tone: string }> = {
  qr: { label: "Chuyển khoản", short: "QR", helper: "QR / chuyển khoản", tone: "text-gmv-primary" },
  cash: { label: "Tiền mặt", short: "CASH", helper: "Thu trực tiếp", tone: "text-gmv-ok" },
  card: { label: "Quẹt thẻ", short: "CARD", helper: "POS / thẻ tín dụng", tone: "text-gmv-secondary" },
  installment: { label: "Trả góp", short: "EMI", helper: "Trả nhiều kỳ", tone: "text-gmv-warn" },
};

const REQUEST_STATUS_META: Record<PaymentRequestStatus, { label: string; tone: "neutral" | "ok" | "warn" | "danger" | "primary" }> = {
  pending: { label: "Chưa thanh toán", tone: "neutral" },
  short: { label: "Thiếu", tone: "warn" },
  done: { label: "Đủ", tone: "ok" },
  over: { label: "Thừa", tone: "primary" },
  cancelled: { label: "Đã huỷ", tone: "danger" },
};

const ACTIVE_STATUS_META: Record<ActiveRequestStatus, { label: string; tone: "neutral" | "ok" | "warn" | "primary" }> = {
  pending_order: { label: "Chờ tạo đơn", tone: "warn" },
  partial_order: { label: "Đang điền Order ID", tone: "primary" },
  ready_invoice: { label: "Sẵn sàng xuất HĐ", tone: "ok" },
  invoiced: { label: "Đã xuất hoá đơn", tone: "neutral" },
};

const PACKAGE_OPTIONS = [
  "2/W- NEW 48 US-UK+2 HN",
  "2/W- NEW 96 US-UK+5 HN",
  "2/W- UPSALE 24 US-UK+1 HN",
  "2/W- UPSALE 48 PHI+5 HN",
  "2/W- UPSALE 96 PHI+10 HN",
  "2/W- UPSALE 144 PHI+15 HN",
  "3/W- COMBO 48 US-UK+2 HN",
  "5/W- VIP 96 US-UK+5 HN",
];

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h6" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function normalizeRequest(req: PaymentRequest): PaymentRequest {
  const payments = req.payments || [];
  const received = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const doneCount = payments.filter((p) => p.status === "paid").length;
  const delta = received - req.target;
  let state: PaymentRequestStatus = "pending";
  if (req.cancelledAt || req.state === "cancelled") state = "cancelled";
  else if (received === 0) state = "pending";
  else if (delta === 0) state = "done";
  else if (delta > 0) state = "over";
  else state = "short";
  return { ...req, payments, received, doneCount, totalCount: payments.length, delta, state };
}

function paymentAttemptStatus(payment: PaymentAttempt) {
  if (payment.status === "paid") return { label: "Đã xác nhận", tone: "ok" as const, icon: <IconCheck /> };
  if (payment.bill) return { label: "Chờ xác nhận", tone: "warn" as const, icon: <IconClock /> };
  return { label: "Chờ chuyển", tone: "neutral" as const, icon: <IconClock /> };
}

function flatCourses(ar: ActiveRequest) {
  return ar.uids.flatMap((u) => u.courses.map((course) => ({ ...course, uid: u.uid, phone: u.phone })));
}

function activeStatus(ar: ActiveRequest): ActiveRequestStatus {
  const courses = flatCourses(ar);
  if (courses.length === 0) return "pending_order";
  if (courses.every((course) => course.invoiced)) return "invoiced";
  const ordered = courses.filter((course) => course.orderId.trim()).length;
  if (ordered === 0) return "pending_order";
  if (ordered === courses.length) return "ready_invoice";
  return "partial_order";
}

function activeTotal(ar: ActiveRequest) {
  return flatCourses(ar).reduce((sum, course) => sum + course.amount, 0);
}

function nextCourseCode(ar: ActiveRequest) {
  const seq = String(flatCourses(ar).length + 1).padStart(3, "0");
  const base = ar.id.replace(/[^\d]/g, "").slice(-4) || "0000";
  return `CC-${base}-${seq}`;
}

function attemptSeed(overrides: Omit<PaymentAttempt, "id">): PaymentAttempt {
  return { id: `${overrides.code}-${overrides.idx}`, ...overrides };
}

function requestSeed(req: Omit<PaymentRequest, "received" | "doneCount" | "totalCount" | "delta" | "state">): PaymentRequest {
  return normalizeRequest({ ...req, received: 0, doneCount: 0, totalCount: 0, delta: 0, state: "pending" });
}

const MOCK_REQUESTS: PaymentRequest[] = [
  requestSeed({
    id: "PR-2026-0042",
    name: "Nguyễn Thị Mai Anh",
    uid: "3213123123",
    phone: "0934428123",
    country: "VN",
    address: "119, Phố Phúc Xá",
    ward: "Phường Phúc Xá",
    province: "Thành phố Hà Nội",
    note: "Khách yêu cầu chuyển khoản 2 đợt",
    target: 24_000_000,
    source: "Bán mới",
    createdAt: "2026-05-18 09:42",
    payments: [
      attemptSeed({
        idx: 1,
        amount: 12_000_000,
        status: "paid",
        createdAt: "2026-05-18 09:45",
        paidAt: "2026-05-18 10:20",
        code: "TT-PR42-001",
        bill: true,
        method: "qr",
        bank: "MB Bank",
        paymentLinkId: "payos_0042_001",
        transferContent: "Thanh toan TT-PR42-001",
      }),
      attemptSeed({
        idx: 2,
        amount: 12_000_000,
        status: "pending",
        createdAt: "2026-05-23 08:30",
        paidAt: null,
        code: "TT-PR42-002",
        bill: true,
        method: "qr",
        bank: "MB Bank",
        paymentLinkId: "payos_0042_002",
      }),
    ],
  }),
  requestSeed({
    id: "PR-2026-0040",
    name: "Phạm Thu Hương",
    uid: "0123456789",
    phone: "0123456789",
    country: "VN",
    address: "Số 4 Trần Hưng Đạo",
    ward: "Phường Quang Trung",
    province: "Tỉnh Hà Giang",
    note: "",
    target: 12_000_000,
    source: "Bán mới",
    createdAt: "2026-05-24 08:02",
    payments: [
      attemptSeed({
        idx: 1,
        amount: 12_000_000,
        status: "paid",
        createdAt: "2026-05-24 08:05",
        paidAt: "2026-05-24 08:33",
        code: "TT-PR40-001",
        bill: true,
        method: "card",
        bank: "Techcombank",
        cardLast4: "2238",
      }),
    ],
  }),
  requestSeed({
    id: "PR-2026-0039",
    name: "Lê Minh Đức",
    uid: "minhduc1990",
    phone: "0838762341",
    country: "VN",
    address: "Số 275 Hạ Long",
    ward: "Phường Tuần Châu",
    province: "Tỉnh Quảng Ninh",
    note: "Mua 2 khóa cho 2 con",
    target: 36_000_000,
    source: "Bán mới",
    createdAt: "2026-05-20 16:48",
    payments: [
      attemptSeed({
        idx: 1,
        amount: 10_000_000,
        status: "paid",
        createdAt: "2026-05-20 16:52",
        paidAt: "2026-05-20 18:10",
        code: "TT-PR39-001",
        bill: true,
        method: "qr",
        bank: "BIDV",
      }),
      attemptSeed({
        idx: 2,
        amount: 10_000_000,
        status: "paid",
        createdAt: "2026-05-21 09:00",
        paidAt: "2026-05-21 12:45",
        code: "TT-PR39-002",
        bill: true,
        method: "qr",
        bank: "BIDV",
      }),
      attemptSeed({
        idx: 3,
        amount: 16_000_000,
        status: "pending",
        createdAt: "2026-05-23 10:30",
        paidAt: null,
        code: "TT-PR39-003",
        bill: true,
        method: "installment",
        installmentMonths: "6",
      }),
    ],
  }),
  requestSeed({
    id: "PR-2026-0038",
    name: "Đặng Khánh Linh",
    uid: "khanhlinh",
    phone: "0987234511",
    country: "VN",
    address: "Tổ 3 Phương Lâm",
    ward: "Phường Phương Lâm",
    province: "Tỉnh Bắc Kạn",
    note: "Khách chuyển dư 200k",
    target: 12_000_000,
    source: "Khách giới thiệu",
    createdAt: "2026-05-19 13:22",
    payments: [
      attemptSeed({
        idx: 1,
        amount: 12_200_000,
        status: "paid",
        createdAt: "2026-05-19 13:25",
        paidAt: "2026-05-19 14:01",
        code: "TT-PR38-001",
        bill: true,
        method: "qr",
        bank: "MB Bank",
      }),
    ],
  }),
  requestSeed({
    id: "PR-2026-0037",
    name: "Vũ Hoài Nam",
    uid: "hoainam",
    phone: "0909123123",
    country: "VN",
    address: "12 Nguyễn Trãi",
    target: 9_500_000,
    source: "Gia hạn",
    createdAt: "2026-05-16 15:22",
    cancelledAt: "2026-05-18 10:00",
    cancelledReason: "Tạo nhầm",
    payments: [],
  }),
];

const MOCK_ACTIVE_REQUESTS: ActiveRequest[] = [
  {
    id: "AR-2026-0001",
    prId: "PR-2026-0042",
    customerName: "Nguyễn Thị Mai Anh",
    createdAt: "2026-05-23 17:00",
    createdBy: "admin.tranminhanh",
    uids: [
      {
        uid: "3213123123",
        phone: "0934428123",
        country: "VN",
        courses: [
          {
            courseCode: "CC-0001-001",
            packageName: "2/W- NEW 48 US-UK+2 HN",
            amount: 12_000_000,
            orderId: "ORD-2026-87654",
            invoiced: true,
            invoiceId: "INV-2026-1042",
            invoicedAt: "2026-05-24 09:30",
          },
          {
            courseCode: "CC-0001-002",
            packageName: "2/W- UPSALE 24 US-UK+1 HN",
            amount: 12_000_000,
            orderId: "ORD-2026-87655",
            invoiced: false,
            invoiceId: "",
          },
        ],
      },
    ],
  },
  {
    id: "AR-2026-0002",
    prId: "PR-2026-0040",
    customerName: "Phạm Thu Hương",
    createdAt: "2026-05-25 09:10",
    createdBy: "admin.tranminhanh",
    uids: [
      {
        uid: "0123456789",
        phone: "0123456789",
        country: "VN",
        courses: [
          {
            courseCode: "CC-0002-001",
            packageName: "2/W- NEW 48 US-UK+2 HN",
            amount: 12_000_000,
            orderId: "",
            invoiced: false,
            invoiceId: "",
          },
        ],
      },
    ],
  },
];

function KpiTile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="min-h-[94px] rounded-gmv-md border border-gmv-border bg-gmv-canvas p-3 shadow-gmv-1">
      <div className="text-xs font-medium text-gmv-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gmv-text-strong">{value}</div>
      <div className="mt-1 text-xs text-gmv-muted">{sub}</div>
    </div>
  );
}

function StatusBadge({ state }: { state: PaymentRequestStatus }) {
  const meta = REQUEST_STATUS_META[state];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function ActiveStatusBadge({ status }: { status: ActiveRequestStatus }) {
  const meta = ACTIVE_STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function MethodBadge({ method }: { method: PaymentMethod }) {
  const meta = METHOD_META[method];
  return (
    <span className={cn("inline-flex items-center rounded-full bg-gmv-bg px-2 py-0.5 text-[11px] font-semibold", meta.tone)}>
      {meta.label}
    </span>
  );
}

function ProgressBar({ received, target }: { received: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((received / target) * 100)) : 0;
  const fill = received > target ? "bg-gmv-primary" : pct >= 100 ? "bg-gmv-ok" : pct >= 50 ? "bg-gmv-warn" : "bg-gmv-muted";
  return (
    <div className="min-w-[180px]">
      <div className="h-2 overflow-hidden rounded-full bg-gmv-bg">
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-gmv-muted">
        <span>{vnd(received)}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

function AddPaymentModal({
  request,
  open,
  onClose,
  onSubmit,
}: {
  request: PaymentRequest | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: AddPaymentAttemptPayload) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("qr");
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState("MB Bank");
  const [cardLast4, setCardLast4] = useState("");
  const [installmentMonths, setInstallmentMonths] = useState("6");
  const [cashier, setCashier] = useState("");

  useEffect(() => {
    if (!open || !request) return;
    setAmount(String(Math.max(0, request.target - request.received)));
    setMethod("qr");
    setBank("MB Bank");
    setCardLast4("");
    setInstallmentMonths("6");
    setCashier("");
  }, [open, request]);

  if (!request) return null;

  const parsedAmount = Number(String(amount).replace(/\D/g, ""));
  const canSubmit = parsedAmount > 0;

  return (
    <Modal open={open} onClose={onClose} title="Thêm lần thanh toán" wide className="max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-gmv-md border border-gmv-border bg-gmv-bg p-3 text-sm">
          <div className="font-semibold text-gmv-text-strong">{request.id} · {request.name}</div>
          <div className="mt-1 text-xs text-gmv-muted">
            Còn thiếu: <strong>{vnd(Math.max(0, request.target - request.received))}</strong>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gmv-muted">Phương thức</label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(METHOD_META).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMethod(key as PaymentMethod)}
                className={cn(
                  "min-h-[88px] rounded-gmv-md border p-3 text-left transition",
                  method === key
                    ? "border-gmv-primary bg-gmv-primary-soft text-gmv-primary"
                    : "border-gmv-border bg-gmv-canvas text-gmv-text hover:border-gmv-primary/50"
                )}
              >
                <span className="block text-sm font-semibold">{meta.label}</span>
                <span className="mt-1 block text-xs text-gmv-muted">{meta.helper}</span>
                <span className="mt-2 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold">{meta.short}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-gmv-muted">Số tiền</span>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
          </label>
          {method === "qr" && (
            <label className="block">
              <span className="mb-1 block text-xs text-gmv-muted">Ngân hàng</span>
              <Select value={bank} onChange={(e) => setBank(e.target.value)}>
                <option>MB Bank</option>
                <option>BIDV</option>
                <option>Techcombank</option>
                <option>Vietcombank</option>
                <option>PalFish Saigon</option>
              </Select>
            </label>
          )}
          {method === "card" && (
            <label className="block">
              <span className="mb-1 block text-xs text-gmv-muted">4 số cuối thẻ</span>
              <Input value={cardLast4} onChange={(e) => setCardLast4(e.target.value)} maxLength={4} />
            </label>
          )}
          {method === "installment" && (
            <label className="block">
              <span className="mb-1 block text-xs text-gmv-muted">Kỳ trả góp</span>
              <Select value={installmentMonths} onChange={(e) => setInstallmentMonths(e.target.value)}>
                <option value="3">3 tháng</option>
                <option value="6">6 tháng</option>
                <option value="9">9 tháng</option>
                <option value="12">12 tháng</option>
              </Select>
            </label>
          )}
          {method === "cash" && (
            <label className="block">
              <span className="mb-1 block text-xs text-gmv-muted">Người thu</span>
              <Input value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder="Tên nhân sự thu tiền" />
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button
            onClick={() => {
              if (!canSubmit) return;
              onSubmit({ amount: parsedAmount, method, bank, cardLast4, installmentMonths, cashier });
            }}
            disabled={!canSubmit}
          >
            <IconPlus /> Thêm lần thanh toán
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ActiveRequestEditor({
  activeRequest,
  onChange,
  onInvoiceOne,
}: {
  activeRequest: ActiveRequest;
  onChange: (next: ActiveRequest) => void;
  onInvoiceOne: (arId: string, courseCode: string) => void;
}) {
  const patchCourse = (uidIdx: number, courseIdx: number, patch: Partial<ActiveCourse>) => {
    onChange({
      ...activeRequest,
      uids: activeRequest.uids.map((group, i) =>
        i === uidIdx
          ? {
              ...group,
              courses: group.courses.map((course, j) => (j === courseIdx ? { ...course, ...patch } : course)),
            }
          : group
      ),
    });
  };

  const addCourse = (uidIdx: number) => {
    onChange({
      ...activeRequest,
      uids: activeRequest.uids.map((group, i) =>
        i === uidIdx
          ? {
              ...group,
              courses: [
                ...group.courses,
                {
                  courseCode: nextCourseCode(activeRequest),
                  packageName: PACKAGE_OPTIONS[0],
                  amount: 0,
                  orderId: "",
                  invoiced: false,
                  invoiceId: "",
                },
              ],
            }
          : group
      ),
    });
  };

  const addUid = () => {
    const nextGroup: ActiveUidGroup = {
      uid: "",
      phone: "",
      country: "VN",
      courses: [
        {
          courseCode: nextCourseCode(activeRequest),
          packageName: PACKAGE_OPTIONS[0],
          amount: 0,
          orderId: "",
          invoiced: false,
          invoiceId: "",
        },
      ],
    };
    onChange({ ...activeRequest, uids: [...activeRequest.uids, nextGroup] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ActiveStatusBadge status={activeStatus(activeRequest)} />
        <span className="text-sm font-semibold text-gmv-text-strong">{activeRequest.id}</span>
        <span className="text-xs text-gmv-muted">Tổng khóa: {flatCourses(activeRequest).length}</span>
        <span className="text-xs text-gmv-muted">Tổng tiền: {vnd(activeTotal(activeRequest))}</span>
        <Button size="sm" variant="ghost" onClick={addUid} className="ml-auto">
          <IconPlus /> Thêm UID
        </Button>
      </div>

      {activeRequest.uids.map((group, uidIdx) => (
        <div key={`${activeRequest.id}-${uidIdx}`} className="rounded-gmv-md border border-gmv-border bg-gmv-canvas p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_160px_120px_auto]">
            <Input
              value={group.uid}
              onChange={(e) =>
                onChange({
                  ...activeRequest,
                  uids: activeRequest.uids.map((u, i) => (i === uidIdx ? { ...u, uid: e.target.value } : u)),
                })
              }
              placeholder="UID"
            />
            <Input
              value={group.phone}
              onChange={(e) =>
                onChange({
                  ...activeRequest,
                  uids: activeRequest.uids.map((u, i) => (i === uidIdx ? { ...u, phone: e.target.value } : u)),
                })
              }
              placeholder="SĐT"
            />
            <Input value={group.country} readOnly />
            <Button size="sm" variant="secondary" onClick={() => addCourse(uidIdx)}>
              <IconPlus /> Thêm khóa
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {group.courses.map((course, courseIdx) => (
              <div
                key={course.courseCode}
                className="grid gap-2 rounded-gmv-md bg-gmv-bg p-2 lg:grid-cols-[1.4fr_140px_130px_160px_140px]"
              >
                <Select
                  value={course.packageName}
                  onChange={(e) => patchCourse(uidIdx, courseIdx, { packageName: e.target.value })}
                >
                  {PACKAGE_OPTIONS.map((pkg) => (
                    <option key={pkg}>{pkg}</option>
                  ))}
                </Select>
                <Input
                  value={course.amount ? course.amount.toLocaleString("vi-VN") : ""}
                  onChange={(e) => patchCourse(uidIdx, courseIdx, { amount: Number(e.target.value.replace(/\D/g, "")) })}
                  placeholder="Số tiền"
                />
                <span className="inline-flex min-h-[40px] items-center rounded-gmv-md border border-gmv-border bg-gmv-canvas px-2 font-mono text-xs font-semibold text-gmv-primary">
                  {course.courseCode}
                </span>
                <Input
                  value={course.orderId}
                  onChange={(e) => patchCourse(uidIdx, courseIdx, { orderId: e.target.value })}
                  placeholder="ORD-XXXX"
                />
                {course.invoiced ? (
                  <Badge tone="neutral" className="justify-center normal-case">
                    {course.invoiceId || "Đã xuất HĐ"}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!course.orderId.trim()}
                    onClick={() => onInvoiceOne(activeRequest.id, course.courseCode)}
                  >
                    <IconFile /> Xuất HĐ
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PaymentRequestsTab() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [activeRequests, setActiveRequests] = useState<ActiveRequest[]>([]);
  const [tab, setTab] = useState<WorkTab>("requests");
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [selectedActiveId, setSelectedActiveId] = useState<string>("");
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiNote, setApiNote] = useState("");
  const [invoiceSelection, setInvoiceSelection] = useState<Set<string>>(() => new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    setApiNote("");
    try {
      const res = await endpoints.paymentRequests.list();
      const nextRequests = (res.data.requests || []).map(normalizeRequest);
      const nextActive = res.data.activeRequests || [];
      setRequests(nextRequests);
      setActiveRequests(nextActive);
      setSelectedRequestId((current) => current || nextRequests[0]?.id || "");
      setSelectedActiveId((current) => current || nextActive[0]?.id || "");
    } catch {
      setRequests(MOCK_REQUESTS);
      setActiveRequests(MOCK_ACTIVE_REQUESTS);
      setSelectedRequestId((current) => current || MOCK_REQUESTS[0]?.id || "");
      setSelectedActiveId((current) => current || MOCK_ACTIVE_REQUESTS[0]?.id || "");
      setApiNote("API Payment Request chưa sẵn sàng; đang dùng dữ liệu mẫu theo contract frontend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedRequestId) || requests[0] || null,
    [requests, selectedRequestId]
  );

  const selectedActive = useMemo(
    () => activeRequests.find((ar) => ar.id === selectedActiveId) || activeRequests[0] || null,
    [activeRequests, selectedActiveId]
  );

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (showCancelled !== (request.state === "cancelled")) return false;
      if (!q) return true;
      return [request.id, request.name, request.uid, request.phone, request.source]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [requests, search, showCancelled]);

  const allPayments = useMemo(
    () =>
      requests.flatMap((request) =>
        request.payments.map((payment) => ({
          request,
          payment,
          derived: paymentAttemptStatus(payment),
        }))
      ),
    [requests]
  );

  const invoiceRows = useMemo(
    () =>
      activeRequests.flatMap((ar) =>
        flatCourses(ar)
          .filter((course) => course.orderId.trim())
          .map((course) => ({ ar, course }))
      ),
    [activeRequests]
  );

  const kpi = useMemo(() => {
    const live = requests.filter((request) => request.state !== "cancelled");
    const received = live.reduce((sum, request) => sum + request.received, 0);
    const target = live.reduce((sum, request) => sum + request.target, 0);
    return {
      liveCount: live.length,
      received,
      target,
      shortCount: live.filter((request) => request.state === "short").length,
      readyCount: live.filter((request) => request.state === "done" || request.state === "over").length,
    };
  }, [requests]);

  const updateRequest = (id: string, updater: (request: PaymentRequest) => PaymentRequest) => {
    setRequests((prev) => prev.map((request) => (request.id === id ? normalizeRequest(updater(request)) : request)));
  };

  const addPayment = async (payload: AddPaymentAttemptPayload) => {
    if (!selectedRequest) return;
    const requestId = selectedRequest.id;
    const nextIdx = (selectedRequest.payments[selectedRequest.payments.length - 1]?.idx || 0) + 1;
    const code = `TT-${requestId.replace(/[^\d]/g, "").slice(-4) || "0000"}-${String(nextIdx).padStart(3, "0")}`;
    const localAttempt: PaymentAttempt = {
      id: `${code}-${Date.now()}`,
      idx: nextIdx,
      amount: payload.amount,
      status: "pending",
      createdAt: nowStamp(),
      paidAt: null,
      code,
      bill: false,
      method: payload.method,
      bank: payload.method === "qr" || payload.method === "card" ? payload.bank : "",
      cardLast4: payload.method === "card" ? payload.cardLast4 || "" : null,
      installmentMonths: payload.method === "installment" ? payload.installmentMonths || "6" : null,
      cashier: payload.method === "cash" ? payload.cashier || "" : null,
    };
    updateRequest(requestId, (request) => ({ ...request, payments: [...request.payments, localAttempt] }));
    setAddPaymentOpen(false);
    try {
      const res = await endpoints.paymentRequests.addPayment(requestId, payload);
      updateRequest(requestId, (request) => ({
        ...request,
        payments: request.payments.map((payment) => (payment.id === localAttempt.id ? res.data : payment)),
      }));
    } catch {
      setApiNote("Backend chưa nhận thao tác thêm thanh toán; UI đã cập nhật tạm thời để review.");
    }
  };

  const markBill = async (requestId: string, paymentId: string) => {
    updateRequest(requestId, (request) => ({
      ...request,
      payments: request.payments.map((payment) => (payment.id === paymentId ? { ...payment, bill: true } : payment)),
    }));
    try {
      await endpoints.paymentRequests.attachBill(requestId, paymentId);
    } catch {
      setApiNote("Backend chưa nhận thao tác bill; UI đã cập nhật tạm thời để review.");
    }
  };

  const confirmPayment = async (requestId: string, paymentId: string) => {
    updateRequest(requestId, (request) => ({
      ...request,
      payments: request.payments.map((payment) =>
        payment.id === paymentId ? { ...payment, status: "paid", bill: true, paidAt: nowStamp() } : payment
      ),
    }));
    try {
      await endpoints.paymentRequests.confirmPayment(requestId, paymentId);
    } catch {
      setApiNote("Backend chưa nhận thao tác xác nhận; UI đã cập nhật tạm thời để review.");
    }
  };

  const cancelSelectedRequest = async () => {
    if (!selectedRequest) return;
    const requestId = selectedRequest.id;
    updateRequest(requestId, (request) => ({
      ...request,
      state: "cancelled",
      cancelledAt: nowStamp(),
      cancelledReason: "Huỷ từ UI Payment Request",
    }));
    try {
      await endpoints.paymentRequests.cancel(requestId);
    } catch {
      setApiNote("Backend chưa nhận thao tác huỷ PR; UI đã cập nhật tạm thời để review.");
    }
  };

  const createActiveFromRequest = async () => {
    if (!selectedRequest) return;
    const existing = activeRequests.find((ar) => ar.prId === selectedRequest.id);
    if (existing) {
      setSelectedActiveId(existing.id);
      setTab("activate");
      return;
    }
    const nextSeq = String(activeRequests.length + 1).padStart(4, "0");
    const localAr: ActiveRequest = {
      id: `AR-2026-${nextSeq}`,
      prId: selectedRequest.id,
      customerName: selectedRequest.name,
      createdAt: nowStamp(),
      createdBy: "frontend",
      uids: [
        {
          uid: selectedRequest.uid,
          phone: selectedRequest.phone,
          country: selectedRequest.country,
          courses: [
            {
              courseCode: `CC-${nextSeq}-001`,
              packageName: PACKAGE_OPTIONS[0],
              amount: selectedRequest.target,
              orderId: "",
              invoiced: false,
              invoiceId: "",
            },
          ],
        },
      ],
    };
    setActiveRequests((prev) => [...prev, localAr]);
    setSelectedActiveId(localAr.id);
    setTab("activate");
    try {
      const res = await endpoints.paymentRequests.createActiveRequest({
        prId: selectedRequest.id,
        customerName: selectedRequest.name,
        uid: selectedRequest.uid,
        phone: selectedRequest.phone,
        country: selectedRequest.country,
        targetAmount: selectedRequest.target,
      });
      setActiveRequests((prev) => prev.map((ar) => (ar.id === localAr.id ? res.data : ar)));
      setSelectedActiveId(res.data.id);
    } catch {
      setApiNote("Backend Active Request chưa sẵn sàng; UI đã tạo bản tạm theo contract.");
    }
  };

  const saveActiveRequest = (next: ActiveRequest) => {
    setActiveRequests((prev) => prev.map((ar) => (ar.id === next.id ? next : ar)));
    endpoints.paymentRequests.updateActiveRequest(next.id, next).catch(() => {
      setApiNote("Backend chưa lưu Active Request; UI đang giữ thay đổi tạm thời.");
    });
  };

  const invoiceCourses = async (arId: string, courseCodes: string[]) => {
    if (courseCodes.length === 0) return;
    const invoiceId = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    setActiveRequests((prev) =>
      prev.map((ar) =>
        ar.id === arId
          ? {
              ...ar,
              uids: ar.uids.map((group) => ({
                ...group,
                courses: group.courses.map((course) =>
                  courseCodes.includes(course.courseCode)
                    ? { ...course, invoiced: true, invoiceId, invoicedAt: nowStamp() }
                    : course
                ),
              })),
            }
          : ar
      )
    );
    setInvoiceSelection(new Set());
    try {
      await endpoints.paymentRequests.invoiceCourses(arId, courseCodes);
    } catch {
      setApiNote("Backend chưa nhận thao tác xuất HĐ; UI đã cập nhật tạm thời để review.");
    }
  };

  const toggleInvoiceSelection = (key: string) => {
    setInvoiceSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedInvoiceGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const key of invoiceSelection) {
      const [arId, courseCode] = key.split("::");
      if (!arId || !courseCode) continue;
      const arr = groups.get(arId) || [];
      arr.push(courseCode);
      groups.set(arId, arr);
    }
    return groups;
  }, [invoiceSelection]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <KpiTile label="Payment Request" value={kpi.liveCount} sub="Đang theo dõi" />
        <KpiTile label="Đã thu" value={vnd(kpi.received)} sub={`Mục tiêu ${vnd(kpi.target)}`} />
        <KpiTile label="Còn thiếu" value={kpi.shortCount} sub="PR cần theo dõi" />
        <KpiTile label="Sẵn sàng B3" value={kpi.readyCount} sub="Đủ / thừa tiền" />
      </div>

      <Card>
        <CardBody className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["requests", "Payment Request"],
              ["reconcile", "Đối soát"],
              ["activate", "Active Request"],
              ["invoice", "Xuất hóa đơn"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id as WorkTab)}
                className={cn(
                  "min-h-[36px] rounded-gmv-md px-3 text-sm font-semibold transition",
                  tab === id ? "bg-gmv-primary text-white" : "bg-gmv-bg text-gmv-text hover:bg-gmv-primary-soft"
                )}
              >
                {label}
              </button>
            ))}
            <Button size="sm" variant="secondary" className="ml-auto" onClick={loadData} disabled={loading}>
              {loading ? "Đang tải..." : "Tải lại"}
            </Button>
          </div>

          {apiNote && (
            <div className="rounded-gmv-md border border-gmv-warn/40 bg-gmv-warn-soft px-3 py-2 text-sm text-gmv-warn">
              {apiNote}
            </div>
          )}

          {tab === "requests" && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[240px] flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gmv-muted">
                      <IconSearch />
                    </span>
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm PR-ID, tên khách, UID, SĐT..."
                      className="pl-9"
                    />
                  </div>
                  <Button variant={showCancelled ? "secondary" : "primary"} size="sm" onClick={() => setShowCancelled(false)}>
                    Đang theo dõi
                  </Button>
                  <Button variant={showCancelled ? "primary" : "secondary"} size="sm" onClick={() => setShowCancelled(true)}>
                    Đã huỷ
                  </Button>
                </div>

                <TableWrap>
                  <Table className="min-w-[980px]">
                    <thead>
                      <tr>
                        <Th>PR-ID</Th>
                        <Th>Khách hàng</Th>
                        <Th>Tổng cần thu</Th>
                        <Th>Tiến độ</Th>
                        <Th>Lần TT</Th>
                        <Th>Trạng thái</Th>
                        <Th>Nguồn</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((request) => (
                        <Tr
                          key={request.id}
                          onClick={() => setSelectedRequestId(request.id)}
                          className={cn("cursor-pointer", selectedRequestId === request.id && "[&>td]:bg-gmv-primary-soft")}
                        >
                          <Td className="text-left font-mono text-xs font-semibold text-gmv-primary">{request.id}</Td>
                          <Td className="text-left">
                            <div className="font-semibold">{request.name}</div>
                            <div className="text-xs text-gmv-muted">UID {request.uid} · {request.phone}</div>
                          </Td>
                          <Td className="text-right font-semibold">{vnd(request.target)}</Td>
                          <Td><ProgressBar received={request.received} target={request.target} /></Td>
                          <Td>{request.doneCount}/{request.totalCount} lần</Td>
                          <Td><StatusBadge state={request.state} /></Td>
                          <Td>{request.source}</Td>
                        </Tr>
                      ))}
                      {filteredRequests.length === 0 && (
                        <tr>
                          <Td colSpan={7} className="py-8 text-gmv-muted">Không có Payment Request phù hợp.</Td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </TableWrap>
              </div>

              <div className="rounded-gmv-md border border-gmv-border bg-gmv-canvas p-4 shadow-gmv-1">
                {selectedRequest ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-sm font-semibold text-gmv-primary">{selectedRequest.id}</div>
                        <div className="mt-1 text-lg font-semibold text-gmv-text-strong">{selectedRequest.name}</div>
                        <div className="text-xs text-gmv-muted">{selectedRequest.address}</div>
                      </div>
                      <StatusBadge state={selectedRequest.state} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-gmv-md bg-gmv-bg p-2">
                        <div className="text-xs text-gmv-muted">Cần thu</div>
                        <div className="font-semibold">{vnd(selectedRequest.target)}</div>
                      </div>
                      <div className="rounded-gmv-md bg-gmv-bg p-2">
                        <div className="text-xs text-gmv-muted">Đã thu</div>
                        <div className="font-semibold">{vnd(selectedRequest.received)}</div>
                      </div>
                      <div className="rounded-gmv-md bg-gmv-bg p-2">
                        <div className="text-xs text-gmv-muted">Chênh</div>
                        <div className="font-semibold">{selectedRequest.delta === 0 ? "Đã đủ" : vnd(selectedRequest.delta)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setAddPaymentOpen(true)} disabled={selectedRequest.state === "cancelled"}>
                        <IconPlus /> Thêm thanh toán
                      </Button>
                      <Button
                        size="sm"
                        variant="ok"
                        onClick={createActiveFromRequest}
                        disabled={!(selectedRequest.state === "done" || selectedRequest.state === "over")}
                      >
                        <IconCheck /> Tạo Active Request
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={cancelSelectedRequest}
                        disabled={selectedRequest.state === "cancelled"}
                      >
                        Huỷ PR
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gmv-muted">Lịch sử thanh toán</div>
                      {selectedRequest.payments.map((payment) => {
                        const derived = paymentAttemptStatus(payment);
                        return (
                          <div key={payment.id} className="rounded-gmv-md border border-gmv-border bg-gmv-bg p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold">Lần #{payment.idx}</span>
                              <span className="font-semibold text-gmv-text-strong">{vnd(payment.amount)}</span>
                              <MethodBadge method={payment.method} />
                              <Badge tone={derived.tone} className="normal-case">{derived.icon}{derived.label}</Badge>
                            </div>
                            <div className="mt-2 text-xs text-gmv-muted">
                              {payment.code} · {payment.bank || payment.cashier || `${payment.installmentMonths || ""} tháng`} · {payment.paidAt || payment.createdAt}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-gmv-muted">Chọn một Payment Request để xem chi tiết.</div>
                )}
              </div>
            </div>
          )}

          {tab === "reconcile" && (
            <TableWrap>
              <Table className="min-w-[1100px]">
                <thead>
                  <tr>
                    <Th>PR-ID</Th>
                    <Th>Khách hàng</Th>
                    <Th>Lần TT</Th>
                    <Th>Phương thức</Th>
                    <Th>Số tiền</Th>
                    <Th>Mã thanh toán</Th>
                    <Th>Trạng thái</Th>
                    <Th>Thao tác</Th>
                  </tr>
                </thead>
                <tbody>
                  {allPayments.map(({ request, payment, derived }) => (
                    <Tr key={`${request.id}-${payment.id}`}>
                      <Td className="font-mono text-xs text-gmv-primary">{request.id}</Td>
                      <Td className="text-left">
                        <div className="font-semibold">{request.name}</div>
                        <div className="text-xs text-gmv-muted">{request.uid}</div>
                      </Td>
                      <Td>#{payment.idx}</Td>
                      <Td><MethodBadge method={payment.method} /></Td>
                      <Td className="text-right font-semibold">{vnd(payment.amount)}</Td>
                      <Td className="font-mono text-xs">{payment.code}</Td>
                      <Td><Badge tone={derived.tone} className="normal-case">{derived.icon}{derived.label}</Badge></Td>
                      <Td>
                        <div className="flex justify-center gap-2">
                          {!payment.bill && payment.status !== "paid" && (
                            <Button size="sm" variant="secondary" onClick={() => markBill(request.id, payment.id)}>
                              Có bill
                            </Button>
                          )}
                          {payment.status !== "paid" && (
                            <Button size="sm" variant="ok" onClick={() => confirmPayment(request.id, payment.id)}>
                              <IconCheck /> Xác nhận
                            </Button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}

          {tab === "activate" && (
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-2">
                {activeRequests.map((ar) => (
                  <button
                    key={ar.id}
                    type="button"
                    onClick={() => setSelectedActiveId(ar.id)}
                    className={cn(
                      "w-full rounded-gmv-md border p-3 text-left transition",
                      selectedActiveId === ar.id ? "border-gmv-primary bg-gmv-primary-soft" : "border-gmv-border bg-gmv-canvas hover:border-gmv-primary/50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-gmv-primary">{ar.id}</span>
                      <ActiveStatusBadge status={activeStatus(ar)} />
                    </div>
                    <div className="mt-2 font-semibold text-gmv-text-strong">{ar.customerName}</div>
                    <div className="mt-1 text-xs text-gmv-muted">{ar.prId || "Không gắn PR"} · {vnd(activeTotal(ar))}</div>
                  </button>
                ))}
              </div>
              <div className="rounded-gmv-md border border-gmv-border bg-gmv-bg p-3">
                {selectedActive ? (
                  <ActiveRequestEditor activeRequest={selectedActive} onChange={saveActiveRequest} onInvoiceOne={invoiceCourses} />
                ) : (
                  <div className="py-8 text-center text-sm text-gmv-muted">Chưa có Active Request.</div>
                )}
              </div>
            </div>
          )}

          {tab === "invoice" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="ok"
                  disabled={invoiceSelection.size === 0}
                  onClick={() => {
                    for (const [arId, codes] of selectedInvoiceGroups.entries()) {
                      invoiceCourses(arId, codes);
                    }
                  }}
                >
                  <IconFile /> Xuất HĐ đã chọn
                </Button>
                <span className="text-xs text-gmv-muted">{invoiceSelection.size} Course Code được chọn</span>
              </div>
              <TableWrap>
                <Table className="min-w-[1000px]">
                  <thead>
                    <tr>
                      <Th>Chọn</Th>
                      <Th>AR-ID</Th>
                      <Th>Khách hàng</Th>
                      <Th>UID</Th>
                      <Th>Course Code</Th>
                      <Th>Gói học</Th>
                      <Th>Số tiền</Th>
                      <Th>Order ID</Th>
                      <Th>Hoá đơn</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceRows.map(({ ar, course }) => {
                      const key = `${ar.id}::${course.courseCode}`;
                      return (
                        <Tr key={key}>
                          <Td>
                            <input
                              type="checkbox"
                              checked={invoiceSelection.has(key)}
                              disabled={course.invoiced}
                              onChange={() => toggleInvoiceSelection(key)}
                              className="h-4 w-4 accent-gmv-primary"
                            />
                          </Td>
                          <Td className="font-mono text-xs text-gmv-primary">{ar.id}</Td>
                          <Td className="text-left font-semibold">{ar.customerName}</Td>
                          <Td>{course.uid}</Td>
                          <Td className="font-mono text-xs">{course.courseCode}</Td>
                          <Td className="text-left">{course.packageName}</Td>
                          <Td className="text-right font-semibold">{vnd(course.amount)}</Td>
                          <Td className="font-mono text-xs">{course.orderId}</Td>
                          <Td>
                            {course.invoiced ? (
                              <Badge tone="neutral" className="normal-case">{course.invoiceId || "Đã xuất HĐ"}</Badge>
                            ) : (
                              <Button size="sm" variant="secondary" onClick={() => invoiceCourses(ar.id, [course.courseCode])}>
                                <IconFile /> Xuất HĐ
                              </Button>
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                    {invoiceRows.length === 0 && (
                      <tr>
                        <Td colSpan={9} className="py-8 text-gmv-muted">Chưa có Course Code sẵn sàng xuất hóa đơn.</Td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </TableWrap>
            </div>
          )}
        </CardBody>
      </Card>

      <AddPaymentModal request={selectedRequest} open={addPaymentOpen} onClose={() => setAddPaymentOpen(false)} onSubmit={addPayment} />
    </div>
  );
}
