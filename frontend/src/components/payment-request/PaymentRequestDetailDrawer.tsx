import { useEffect, useRef, useState } from "react";
import { LEAD_SOURCES, findSourceByKey, sourceHasChannels } from "../../constants/leadSource";
import type {
  ActiveRequest,
  AddPaymentAttemptPayload,
  CustomerType,
  PaymentAttempt,
  PaymentMethod,
  PaymentRequest,
} from "../../types/paymentRequest";
import { COURSE_PACKAGES } from "../../constants/coursePackages";
import CountryCombo, { findCountry } from "./CountryCombo";
import { Icons, type IconKey } from "./Icons";
import BillUploadZone from "./BillUploadZone";
import VietnamAddressFields from "./VietnamAddressFields";
import PaymentRequestStatusBadge from "./PaymentRequestStatusBadge";
import { getAvailableBanks } from "../../constants/bank";
import { useMe } from "../../hooks/useMe";
import Combobox from "../ui/Combobox";
import {
  activationSummary,
  activeRequestAllocation,
  fmtPhone,
  formatCoursePhone,
  formatPaymentDateFull,
  nowStamp,
  paymentAttemptLabel,
  vnd,
} from "./paymentRequestUtils";
import { nextCourseCode } from "../payment-flow/paymentFlowUtils";

const METHOD_META: Record<PaymentMethod, { cls: string; label: string; icon: IconKey; sub: string }> = {
  qr: { cls: "method-qr", label: "Chuyển khoản", icon: "QrCode", sub: "QR / chuyển khoản" },
  cash: { cls: "method-cash", label: "Tiền mặt", icon: "Cash", sub: "Thu trực tiếp" },
  card: { cls: "method-card", label: "Quẹt thẻ", icon: "Bank", sub: "POS / thẻ tín dụng" },
  installment: { cls: "method-installment", label: "Trả góp", icon: "Sigma", sub: "Trả nhiều kỳ" },
};

const METHOD_ORDER: PaymentMethod[] = ["qr", "cash", "card", "installment"];
const COURSE_PACKAGE_OPTIONS = COURSE_PACKAGES.map((name) => ({ value: name, label: name }));

function MethodBadge({ method }: { method: PaymentMethod }) {
  const meta = METHOD_META[method];
  const Ico = Icons[meta.icon];
  return (
    <span className={`method-badge ${meta.cls}`}>
      <Ico size={11} strokeWidth={2.2} /> {meta.label}
    </span>
  );
}

function QrThumb({ paid, method }: { paid: boolean; method: PaymentMethod }) {
  const meta = METHOD_META[method];
  const Ico = Icons[meta.icon];
  if (method !== "qr") {
    return (
      <div className={`qr-thumb ${meta.cls}`} style={{ background: "var(--mp-bg)", color: "var(--mp-color)", borderColor: "transparent" }}>
        <Ico size={26} strokeWidth={1.8} />
      </div>
    );
  }
  return (
    <div className={`qr-thumb ${paid ? "paid" : "pending"}`}>
      <Icons.QrCode size={36} strokeWidth={1.5} />
    </div>
  );
}

function QrRow({
  qr,
  onCancelQr,
  onBillFile,
  onBillView,
  onMarkPaid,
  onShowQr,
  uploadingBillId,
  deletingBillId,
}: {
  qr: PaymentAttempt;
  onCancelQr: (qr: PaymentAttempt) => void;
  onBillFile: (qr: PaymentAttempt, file: File) => void | Promise<void>;
  onBillView: (qr: PaymentAttempt) => void;
  onMarkPaid: (qr: PaymentAttempt) => void;
  onShowQr: (qr: PaymentAttempt) => void;
  uploadingBillId?: string | null;
  deletingBillId?: string | null;
}) {
  const isQr = qr.method === "qr";
  const isCancelled = !!qr.cancelled;

  let pill;
  if (isCancelled) {
    pill = (
      <span className="badge is-cancelled">
        <Icons.XCircle size={11} /> Đã huỷ
      </span>
    );
  } else if (qr.status === "paid") {
    pill = (
      <span className="badge is-done">
        <Icons.Check size={11} strokeWidth={2.5} /> Đã xác nhận
      </span>
    );
  } else if (qr.status === "rejected") {
    pill = (
      <span className="badge is-cancelled">
        <Icons.XCircle size={11} /> Bị từ chối
      </span>
    );
  } else {
    pill = (
      <span className="badge is-over">
        <Icons.Clock size={11} /> {paymentAttemptLabel(qr)}
      </span>
    );
  }

  const detail = isQr
    ? qr.bank || ""
    : qr.method === "cash"
    ? qr.cashier || ""
    : qr.method === "card"
    ? qr.bank || (qr.cardLast4 ? `•••• ${qr.cardLast4}` : "")
    : qr.method === "installment"
    ? `${qr.installmentPlatform || "Trả góp"}${qr.installmentTotal ? ` · ${vnd(qr.installmentTotal)}` : ""}${qr.saleReceived ? ` → ${vnd(qr.saleReceived)}` : ""}`
    : "";

  return (
    <div className="qr-row v2" style={isCancelled ? { opacity: 0.55 } : undefined}>
      <QrThumb paid={qr.status === "paid"} method={qr.method} />
      <div style={{ minWidth: 0 }}>
        <div className="qr-info-line1">
          <span style={{ fontWeight: 600, color: "var(--text-3)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
            Lần #{qr.idx}
          </span>
          <span className="amt">{vnd(qr.amount)}</span>
          {pill}
        </div>
        <div className="qr-info-line2">
          <MethodBadge method={qr.method} />
          {detail && (
            <>
              <span className="sep" />
              <span>{detail}</span>
            </>
          )}
          <span className="sep" />
          <code>{qr.code}</code>
          <span className="sep" />
          <span>{qr.status === "paid" ? `Xác nhận lúc ${qr.paidAt ? formatPaymentDateFull(qr.paidAt) : ""}` : `Tạo ${qr.createdAt ? formatPaymentDateFull(qr.createdAt) : ""}`}</span>
          {qr.status === "rejected" && qr.rejectReason && (
            <>
              <span className="sep" />
              <span style={{ color: "var(--danger)", fontStyle: "italic" }}>Lý do: {qr.rejectReason}</span>
            </>
          )}
          {import.meta.env.DEV && qr.status !== "paid" && (qr.billImage || qr.bill) && (
            <>
              <span className="sep" />
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkPaid(qr);
                }}
                title="Demo — thường do module Đối soát của kế toán thực hiện"
                style={{
                  color: "var(--primary-700)",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                  textUnderlineOffset: 2,
                  whiteSpace: "nowrap",
                }}
              >
                Mô phỏng kế toán xác nhận →
              </span>
            </>
          )}
        </div>
      </div>
      <div>
        <BillUploadZone
          hasBill={!!qr.billImage}
          uploading={uploadingBillId === qr.id}
          deleting={deletingBillId === qr.id}
          onView={() => onBillView(qr)}
          onFile={(file) => onBillFile(qr, file)}
        />
      </div>
      <div className="qr-actions">
        {isQr && !isCancelled && (
          <button className="btn btn-outline btn-sm" onClick={() => onShowQr(qr)}>
            <Icons.QrCode size={13} /> Xem QR
          </button>
        )}
        {!isCancelled && qr.status !== "paid" && (
          <button
            className="btn btn-outline btn-sm"
            style={{ color: "var(--danger)" }}
            title="Huỷ lần giao dịch này"
            onClick={() => onCancelQr(qr)}
          >
            <Icons.XCircle size={13} /> Huỷ
          </button>
        )}
        {isCancelled && <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>—</span>}
      </div>
    </div>
  );
}

function AddPaymentForm({
  pr,
  onCancel,
  onSubmit,
}: {
  pr: PaymentRequest;
  onCancel: () => void;
  onSubmit: (payload: AddPaymentAttemptPayload) => void;
}) {
  const { profile } = useMe();
  const availableBanks = getAvailableBanks(profile?.team);

  const [method, setMethod] = useState<PaymentMethod>("qr");
  const [amount, setAmount] = useState("");
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [bank, setBank] = useState(availableBanks[0].alias);
  const [cardLast4, setCardLast4] = useState("");
  const [installmentPlatform, setInstallmentPlatform] = useState("");
  const [installmentTotal, setInstallmentTotal] = useState("");
  const [saleReceivedDraft, setSaleReceivedDraft] = useState("");
  const [cashier, setCashier] = useState("");
  const [nameForTransfer, setNameForTransfer] = useState(pr.childName || pr.name);

  const remaining = Math.max(0, pr.target - pr.received);
  const nameOptions = [
    { value: pr.name, label: `KH: ${pr.name}` },
    ...(pr.childName ? [{ value: pr.childName, label: `Con: ${pr.childName}` }] : []),
  ];

  const submit = () => {
    const n = parseInt(String(amount).replace(/\D/g, ""), 10);
    if (!n) return;
    onSubmit({
      amount: n,
      method,
      bank: method === "qr" || method === "card" ? bank : undefined,
      cardLast4: method === "card" ? cardLast4 : undefined,
      installment_platform: method === "installment" ? installmentPlatform : undefined,
      installment_total: method === "installment" ? (parseInt(installmentTotal.replace(/\D/g, ""), 10) || undefined) : undefined,
      sale_received: method === "installment" ? (parseInt(saleReceivedDraft.replace(/\D/g, ""), 10) || undefined) : undefined,
      cashier: method === "cash" ? cashier : undefined,
      name_for_transfer: method === "qr" ? nameForTransfer : undefined,
    });
  };

  return (
    <div
      style={{
        border: "1px dashed var(--border-strong)",
        borderRadius: 10,
        padding: 14,
        background: "var(--surface-2)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div>
        <div className="info-label" style={{ marginBottom: 8 }}>
          Phương thức thanh toán
        </div>
        <div className="method-grid">
          {METHOD_ORDER.map((k) => {
            const meta = METHOD_META[k];
            const Ico = Icons[meta.icon];
            return (
              <button
                key={k}
                type="button"
                className={`method-pick ${meta.cls} ${method === k ? "active" : ""}`}
                onClick={() => setMethod(k)}
              >
                <span className="mp-icon">
                  <Ico size={15} />
                </span>
                <span className="mp-label">{meta.label}</span>
                <span className="mp-sub">{meta.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Số tiền lần này</label>
          <input
            type="text"
            placeholder={`Còn thiếu: ${vnd(remaining)}`}
            value={isAmountFocused ? amount : amount ? Number(amount).toLocaleString("vi-VN") : ""}
            inputMode="numeric"
            pattern="[0-9]*"
            onFocus={() => setIsAmountFocused(true)}
            onBlur={() => setIsAmountFocused(false)}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, "");
              setAmount(v);
            }}
          />
        </div>

        {method === "qr" && (
          <>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label>Ngân hàng nhận</label>
              <select value={bank} onChange={(e) => setBank(e.target.value)}>
                {availableBanks.map((b) => (
                  <option key={b.alias} value={b.alias}>{b.alias}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label>Tên trên nội dung CK</label>
              {nameOptions.length > 1 ? (
                <select value={nameForTransfer} onChange={(e) => setNameForTransfer(e.target.value)}>
                  {nameOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input type="text" value={pr.name} readOnly style={{ color: "var(--text-3)" }} />
              )}
            </div>
          </>
        )}
        {method === "card" && (
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>4 số cuối thẻ</label>
            <input
              value={cardLast4}
              onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="•••• 4242"
            />
          </div>
        )}
        {method === "installment" && (
          <>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>Nền tảng trả góp <span style={{ color: "var(--danger)" }}>*</span></label>
              <select
                value={installmentPlatform}
                onChange={(e) => setInstallmentPlatform(e.target.value)}
                style={{ font: "inherit", fontSize: 13 }}
              >
                <option value="">— Chọn —</option>
                <option value="Payoo">Payoo</option>
                <option value="Mpos">Mpos</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Tổng tiền trả góp <span style={{ color: "var(--danger)" }}>*</span></label>
              <input
                inputMode="numeric"
                placeholder="Số tiền KH chuyển qua app"
                value={installmentTotal}
                onChange={(e) => setInstallmentTotal(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Thực nhận về công ty <span style={{ color: "var(--danger)" }}>*</span></label>
              <input
                inputMode="numeric"
                placeholder="Sau phí nền tảng"
                value={saleReceivedDraft}
                onChange={(e) => setSaleReceivedDraft(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
          </>
        )}
        {method === "cash" && (
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Người thu</label>
            <input value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder="VD: Thu Hiền" />
          </div>
        )}

        {method !== "qr" && (
          <div className="field" style={{ flex: 1.4, minWidth: 220 }}>
            <label>Mã đối soát</label>
            <input
              type="text"
              value="Tự động tạo bởi hệ thống"
              readOnly
              style={{ color: "var(--text-3)", fontStyle: "italic" }}
            />
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="btn btn-outline" onClick={onCancel}>
          Huỷ
        </button>
        <button className="btn btn-primary" onClick={submit}>
          <Icons.Sparkle size={14} /> {method === "qr" ? "Tạo QR & mã CK" : "Ghi nhận lần thanh toán"}
        </button>
      </div>
    </div>
  );
}

interface DraftPr {
  uid: string;
  name: string;
  childName: string;
  country: string;
  phone: string;
  email: string;
  province: string;
  ward: string;
  address: string;
  target: string;
  note: string;
  taxId: string;
  customerType: CustomerType;
  companyName: string;
  leadSource: string;
  leadChannel: string;
}

/**
 * AR mini-window cho Sales view — gọn nhẹ, hiện ngay trong drawer PR.
 * Sales chỉ cần thấy: AR đã được tạo, danh sách UID + course, chọn gói học, Order ID (read-only sau khi BE điền).
 * KHÔNG có nút "Xác nhận thông tin" của Thu Hiền (đó là nghiệp vụ riêng ở tab Kích hoạt khoá học).
 * Sales không nhập Order ID ở đây để giữ tách bạch nghiệp vụ với tab Kích hoạt khoá học.
 */
function ActiveRequestMiniCardV2({
  ar,
  request,
  onActiveRequestMutate,
  onActiveRequestSave,
  onActiveRequestDelete,
}: {
  ar: ActiveRequest;
  request: PaymentRequest;
  onActiveRequestMutate: (arId: string, updater: (ar: ActiveRequest) => ActiveRequest) => void;
  onActiveRequestSave: (next: ActiveRequest) => Promise<void>;
  onActiveRequestDelete: (arId: string) => Promise<void>;
}) {
  const [uidDrafts, setUidDrafts] = useState<Record<number, string>>({});
  const [phoneDrafts, setPhoneDrafts] = useState<Record<number, string>>({});
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [allocationError, setAllocationError] = useState("");

  useEffect(() => {
    if (editing) return;
    const nextUidDrafts: Record<number, string> = {};
    const nextPhoneDrafts: Record<number, string> = {};
    const nextAmountDrafts: Record<string, string> = {};
    ar.uids.forEach((u, uidIdx) => {
      nextUidDrafts[uidIdx] = u.uid ?? "";
      nextPhoneDrafts[uidIdx] = u.phone ?? "";
      u.courses.forEach((c) => {
        nextAmountDrafts[c.courseCode] = c.amount ? String(c.amount) : "";
      });
    });
    setUidDrafts(nextUidDrafts);
    setPhoneDrafts(nextPhoneDrafts);
    setAmountDrafts(nextAmountDrafts);
  }, [ar, editing]);

  const summary = activationSummary(ar);
  const allocation = activeRequestAllocation(ar, request);
  const allocationWarning = allocation.isOver
    ? `Tổng gói học (${vnd(allocation.total)}) đang vượt tiền đã nhận (${vnd(allocation.received)}) — vượt ${vnd(allocation.overAmount)}.`
    : "";
  const allCourses = ar.uids.flatMap((u) => u.courses);
  const allCoursesLocked = allCourses.length > 0 && allCourses.every((c) => !!(c.orderId?.trim()) || !!c.invoiced);
  const editFullyLocked = allCoursesLocked && allocation.remaining <= 0;
  const hasUnfilledCourse = allCourses.some((c) => {
    const locked = !!(c.orderId?.trim()) || !!c.invoiced;
    return !locked && (c.amount || 0) <= 0;
  });
  const canAddMore = allocation.remaining > 0 && !hasUnfilledCourse;
  const missingFields: string[] = [];
  ar.uids.forEach((u, uIdx) => {
    const label = u.uid.trim() || `UID #${uIdx + 1}`;
    if (!u.uid.trim()) missingFields.push("UID");
    if (!u.phone.trim()) missingFields.push("SĐT");
    u.courses.forEach((c) => {
      const locked = !!(c.orderId?.trim()) || !!c.invoiced;
      if (locked) return;
      if (!(c.packageName || c.name || "").trim()) missingFields.push(`gói học (${label})`);
      if ((c.amount || 0) <= 0) missingFields.push(`số tiền (${label})`);
    });
  });
  const missingRequiredCount = missingFields.length;

  const mutate = (updater: (next: ActiveRequest) => ActiveRequest) => {
    onActiveRequestMutate(ar.id, updater);
  };

  const save = async () => {
    if (allocation.isOver) {
      setAllocationError(allocationWarning);
      return;
    }
    if (hasUnfilledCourse) {
      setAllocationError("Có gói học chưa điền số tiền (0 đ). Hãy điền số tiền hoặc xóa gói trước khi lưu.");
      return;
    }
    setSaving(true);
    setAllocationError("");
    await onActiveRequestSave(ar);
    setSaving(false);
    setEditing(false);
  };

  const removeAr = async () => {
    if (!window.confirm(`Xóa Active Request ${ar.id}?`)) return;
    setDeleting(true);
    await onActiveRequestDelete(ar.id);
    setDeleting(false);
  };

  const commitUid = (uidIdx: number) => {
    const nextUid = (uidDrafts[uidIdx] ?? "").trim();
    const current = ar.uids[uidIdx]?.uid ?? "";
    if (nextUid === current) return;
    mutate((next) => ({
      ...next,
      uids: next.uids.map((u, idx) => (idx === uidIdx ? { ...u, uid: nextUid } : u)),
    }));
  };

  const commitPhone = (uidIdx: number) => {
    const nextPhone = (phoneDrafts[uidIdx] ?? "").replace(/[^\d]/g, "");
    const current = ar.uids[uidIdx]?.phone ?? "";
    if (nextPhone === current) return;
    mutate((next) => ({
      ...next,
      uids: next.uids.map((u, idx) => (idx === uidIdx ? { ...u, phone: nextPhone } : u)),
    }));
  };

  const commitAmount = (uidIdx: number, courseCode: string) => {
    const raw = (amountDrafts[courseCode] ?? "").replace(/[^\d]/g, "");
    const nextAmount = raw ? Number(raw) : 0;
    const current = ar.uids[uidIdx]?.courses.find((x) => x.courseCode === courseCode)?.amount ?? 0;
    if (nextAmount === current) return;
    const nextAr = {
      ...ar,
      uids: ar.uids.map((u, idx) =>
        idx === uidIdx
          ? {
              ...u,
              courses: u.courses.map((c) =>
                c.courseCode === courseCode ? { ...c, amount: nextAmount } : c
              ),
            }
          : u
      ),
    };
    const nextAllocation = activeRequestAllocation(nextAr, request);
    if (nextAllocation.isOver) {
      setAllocationError(
        `Không thể lưu số tiền này: tổng gói học ${vnd(nextAllocation.total)} vượt tiền đã nhận ${vnd(nextAllocation.received)}.`
      );
      setAmountDrafts((prev) => ({ ...prev, [courseCode]: current ? String(current) : "" }));
      return;
    }
    setAllocationError("");
    mutate(() => nextAr);
  };

  const addCourseForUid = (uidIdx: number) => {
    setAllocationError("");
    mutate((next) => {
      const code = nextCourseCode(next);
      const remaining = activeRequestAllocation(next, request).remaining;
      return {
        ...next,
        uids: next.uids.map((u, idx) =>
          idx === uidIdx
            ? {
                ...u,
                courses: [
                  ...u.courses,
                  {
                    courseCode: code,
                    packageName: "",
                    amount: remaining,
                    orderId: "",
                    invoiced: false,
                    invoiceRequestedAt: null,
                  },
                ],
              }
            : u
        ),
      };
    });
  };

  const removeCourse = (uidIdx: number, courseCode: string) => {
    const course = ar.uids[uidIdx]?.courses.find((c) => c.courseCode === courseCode);
    if (!course) return;
    if (course.invoiced) {
      window.alert("Không thể xóa khóa học đã xuất hóa đơn.");
      return;
    }
    if (course.orderId && course.orderId.trim()) {
      window.alert(
        `Khóa học ${courseCode} đã được Ops kích hoạt (Order ID ${course.orderId}). Sales không thể xóa — liên hệ Ops nếu cần hủy.`
      );
      return;
    }
    if (!window.confirm(`Xóa khóa học ${courseCode}?`)) return;
    setAmountDrafts((prev) => {
      if (!(courseCode in prev)) return prev;
      const next = { ...prev };
      delete next[courseCode];
      return next;
    });
    mutate((next) => ({
      ...next,
      uids: next.uids.map((u, idx) =>
        idx === uidIdx
          ? { ...u, courses: u.courses.filter((c) => c.courseCode !== courseCode) }
          : u
      ),
    }));
  };

  const removeUidGroup = (uidIdx: number) => {
    const u = ar.uids[uidIdx];
    if (!u) return;
    const hasLocked = u.courses.some((c) => !!(c.orderId?.trim()) || !!c.invoiced);
    if (hasLocked) {
      window.alert("UID này có gói học đã kích hoạt — không thể xóa.");
      return;
    }
    if (!window.confirm(`Xóa UID "${u.uid || "(trống)"}" và tất cả gói học của nó?`)) return;
    mutate((next) => ({
      ...next,
      uids: next.uids.filter((_, idx) => idx !== uidIdx),
    }));
  };

  const addUidGroup = () => {
    setAllocationError("");
    mutate((next) => {
      const code = nextCourseCode(next);
      const remaining = activeRequestAllocation(next, request).remaining;
      return {
        ...next,
        uids: [
          ...next.uids,
          {
            uid: "",
            phone: "",
            country: next.uids[0]?.country || "VN",
            courses: [
              {
                courseCode: code,
                packageName: "",
                amount: remaining,
                orderId: "",
                invoiced: false,
                invoiceRequestedAt: null,
              },
            ],
          },
        ],
      };
    });
  };

  const activationPct = summary.courseCount > 0 ? Math.round((summary.activatedCount / summary.courseCount) * 100) : 0;

  return (
    <div className={`panel ar-mini-card ${allocation.isOver ? "is-over-allocated" : ""}`}>
      <div className="panel-head ar-mini-head">
        <h4>
          <Icons.CheckSquare size={15} /> Kích hoạt khoá học
          <span className="num-pill">{ar.id}</span>
        </h4>
        <span
          className={`badge ${summary.allActivated ? "is-done" : "is-over"}`}
          title={summary.allActivated ? "Tất cả gói học đã được Ops kích hoạt" : "Đang chờ Ops kích hoạt gói học"}
        >
          {summary.allActivated ? <Icons.Check size={11} strokeWidth={2.5} /> : <Icons.Clock size={11} />}{" "}
          {summary.buttonLabel}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="ar-cue-wrap">
            <button
              type="button"
              className={`btn btn-sm btn-ar-action ${!editing && !editFullyLocked ? "btn-edit-hint" : "btn-outline"}`}
              title={editFullyLocked ? "Tất cả gói học đã được kích hoạt và đã dùng hết tiền" : "Sửa thông tin gói học"}
              aria-label="Sửa thông tin gói học"
              disabled={editFullyLocked}
              onClick={() => setEditing(true)}
              style={{ opacity: editFullyLocked ? 0.35 : 1 }}
            >
              <Icons.Pencil size={14} /> Sửa
            </button>
            {!editing && !editFullyLocked && (
              <div className="ar-cue-tooltip">Bấm để sửa thông tin / thêm gói học</div>
            )}
          </div>
          <div className="ar-cue-wrap">
            <button
              type="button"
              className={`btn btn-sm btn-ar-action ${editing ? "btn-save-hint" : "btn-outline"}`}
              title="Lưu thông tin Active Request"
              aria-label="Lưu thông tin Active Request"
              disabled={!editing || saving || allocation.isOver || hasUnfilledCourse}
              onClick={() => void save()}
            >
              <Icons.Check size={15} strokeWidth={2.6} /> Lưu
            </button>
            {editing && (
              <div className="ar-cue-tooltip is-save">Bấm để lưu thông tin</div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            title="Xóa Active Request"
            aria-label="Xóa Active Request"
            disabled={deleting}
            onClick={() => void removeAr()}
            style={{ width: 32, padding: 0, color: "var(--danger)" }}
          >
            <Icons.Close size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      {missingRequiredCount > 0 && (
        <div className="match-warning" style={{ marginBottom: 10 }}>
          <Icons.AlertCircle size={14} />
          <span>Cần bổ sung: {[...new Set(missingFields)].join(", ")}.</span>
        </div>
      )}
      <div className={`pulse-progress ${allocation.isOver ? "is-over" : ""}`}>
        <div className="pulse-progress-head">
          <div className="pulse-progress-count">
            <span className="pulse-count-num">{summary.activatedCount}/{summary.courseCount}</span>
            <span className="pulse-count-label">gói đã kích hoạt</span>
          </div>
          <div className="pulse-progress-total">
            <span className="pulse-total-label">TỔNG TIỀN</span>
            <span className="pulse-total-amount">{vnd(allocation.total)}</span>
          </div>
        </div>
        <div className="prog-bar" aria-label="Tiến độ kích hoạt gói học">
          <div
            className={`prog-fill ${summary.allActivated ? "is-done" : activationPct > 0 ? "is-mid" : ""}`}
            style={{ width: `${activationPct}%` }}
          />
        </div>
        {allocation.isOver && (
          <div className="pulse-progress-warn">
            Vượt {vnd(allocation.overAmount)} so với tiền đã nhận ({vnd(allocation.received)})
          </div>
        )}
      </div>
      {(allocationError || allocationWarning) && (
        <div className="match-warning" style={{ marginBottom: 10 }}>
          <Icons.AlertCircle size={14} />
          <span>{allocationError || allocationWarning}</span>
        </div>
      )}
      <div className="ar-mini-body">
        {ar.uids.map((u, uIdx) => (
          <div
            key={`${u.uid || "uid"}-${uIdx}`}
            className="ar-mini-uid"
          >
            {!editing && (
              <div className="ar-mini-uid-header">
                <span className="ar-avatar">{(u.uid || "?").slice(0, 2).toUpperCase()}</span>
                <div className="ar-uid-info">
                  <span className="ar-uid-name">{u.uid || "—"}</span>
                  <span className="ar-uid-phone">{formatCoursePhone(u.country, u.phone)}</span>
                </div>
              </div>
            )}
            <div className="ar-mini-uid-edit" style={{ display: editing ? "grid" : "none" }}>
              <input
                value={uidDrafts[uIdx] ?? u.uid ?? ""}
                onChange={(e) => setUidDrafts((prev) => ({ ...prev, [uIdx]: e.target.value }))}
                onBlur={() => commitUid(uIdx)}
                placeholder="UID CRM"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "7px 9px",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  outline: "none",
                  background: "white",
                }}
              />
              <input
                value={phoneDrafts[uIdx] ?? u.phone ?? ""}
                onChange={(e) =>
                  setPhoneDrafts((prev) => ({
                    ...prev,
                    [uIdx]: e.target.value.replace(/[^\d]/g, ""),
                  }))
                }
                onBlur={() => commitPhone(uIdx)}
                placeholder="Số điện thoại"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "7px 9px",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  outline: "none",
                  background: "white",
                }}
              />
              <button type="button" className="btn btn-outline btn-sm" disabled={!canAddMore} onClick={() => addCourseForUid(uIdx)}
                title={!canAddMore ? "Đã phân bổ hết tiền đã nhận — không thể thêm gói" : "Thêm gói khoá học"}>
                <Icons.Plus size={12} /> Thêm gói
              </button>
              {ar.uids.length > 1 && (
                <button type="button" className="btn btn-outline btn-sm"
                  disabled={u.courses.some((c) => !!(c.orderId?.trim()) || !!c.invoiced)}
                  title={u.courses.some((c) => !!(c.orderId?.trim()) || !!c.invoiced) ? "UID có gói đã kích hoạt — không thể xóa" : "Xóa UID này"}
                  onClick={() => removeUidGroup(uIdx)}
                  style={{ color: "var(--danger)" }}>
                  <Icons.Close size={12} /> Xóa UID
                </button>
              )}
            </div>
            {u.courses.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
                Chưa chọn gói khoá học
              </div>
            ) : (
              <div className="ar-mini-course-list">
                {u.courses.map((c, cIdx) => {
                  const courseLocked = !!(c.orderId && c.orderId.trim()) || !!c.invoiced;
                  return (
                  <div
                    key={`${c.courseCode}-${cIdx}`}
                    className={`ar-mini-course ${editing ? "is-editing" : ""}`}
                  >
                    {!editing && (
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.packageName || c.name || "Chưa chọn gói"}
                        </div>
                        {c.courseCode && (
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                            Course code: <code className="ar-course-code">{c.courseCode}</code>
                          </div>
                        )}
                      </div>
                    )}
                    <div
                      style={{ minWidth: 0, display: editing ? "block" : "none", position: "relative" }}
                      title={courseLocked ? "Đã kích hoạt — Sales không thể đổi gói học" : undefined}
                    >
                      <Combobox
                        value={c.packageName || c.name || ""}
                        disabled={courseLocked}
                        onChange={(value) =>
                          mutate((next) => ({
                            ...next,
                            uids: next.uids.map((uu, idx) =>
                              idx === uIdx
                                ? {
                                    ...uu,
                                    courses: uu.courses.map((course) =>
                                      course.courseCode === c.courseCode
                                        ? { ...course, packageName: value }
                                        : course
                                    ),
                                  }
                                : uu
                            ),
                          }))
                        }
                        options={COURSE_PACKAGE_OPTIONS}
                        placeholder="Chọn hoặc gõ tên gói học..."
                        emptyLabel="Chưa chọn gói"
                      />
                      {!courseLocked && (c.packageName || c.name) && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          aria-label="Xóa tên gói học"
                          title="Xóa tên gói học"
                          onClick={() =>
                            mutate((next) => ({
                              ...next,
                              uids: next.uids.map((uu, idx) =>
                                idx === uIdx
                                  ? {
                                      ...uu,
                                      courses: uu.courses.map((course) =>
                                        course.courseCode === c.courseCode ? { ...course, packageName: "" } : course
                                      ),
                                    }
                                  : uu
                              ),
                            }))
                          }
                          style={{
                            position: "absolute",
                            right: 6,
                            top: 6,
                            width: 24,
                            height: 24,
                            padding: 0,
                            borderRadius: 999,
                            color: "var(--danger)",
                            background: "white",
                          }}
                        >
                          <Icons.Close size={12} strokeWidth={2.4} />
                        </button>
                      )}
                      {c.courseCode && (
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                          Course code: <code>{c.courseCode}</code>
                        </div>
                      )}
                    </div>
                    {!editing && (
                      <div className="ar-course-amount">{vnd(c.amount || 0)}</div>
                    )}
                    <input
                      value={amountDrafts[c.courseCode] ?? (c.amount ? String(c.amount) : "")}
                      onChange={(e) => {
                        if (courseLocked) return;
                        const raw = e.target.value.replace(/[^\d]/g, "");
                        setAmountDrafts((prev) => ({ ...prev, [c.courseCode]: raw }));
                      }}
                      onBlur={() => commitAmount(uIdx, c.courseCode)}
                      readOnly={courseLocked}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Số tiền"
                      title={courseLocked ? "Đã kích hoạt — Sales không thể đổi số tiền" : undefined}
                      style={{
                        display: editing ? "block" : "none",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "7px 9px",
                        fontSize: 12,
                        fontFamily: "JetBrains Mono, monospace",
                        outline: "none",
                        textAlign: "right",
                        background: courseLocked ? "var(--row-hover, #f4f5f7)" : "white",
                        color: courseLocked ? "var(--text-3)" : undefined,
                        cursor: courseLocked ? "not-allowed" : "text",
                      }}
                    />
                    <div className="ar-toggle-cell">
                      <span className={`ar-toggle-label ${c.orderId ? "is-active" : ""}`}>
                        {c.orderId ? "Đã kích hoạt" : "Chờ kích hoạt"}
                      </span>
                      <span
                        className={`ar-toggle ${c.orderId ? "is-on" : ""}`}
                        title={c.orderId ? "Gói học đã được Ops kích hoạt" : "Chờ Ops kích hoạt gói học"}
                      >
                        <span className="ar-toggle-knob" />
                      </span>
                    </div>
                    {editing && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        title={courseLocked ? "Đã kích hoạt — không thể xóa" : "Xóa khóa học"}
                        aria-label="Xóa khóa học"
                        disabled={courseLocked}
                        onClick={() => removeCourse(uIdx, c.courseCode)}
                        style={{ width: 28, padding: 0, color: "var(--danger)", opacity: courseLocked ? 0.4 : 1 }}
                      >
                        <Icons.Close size={12} strokeWidth={2.4} />
                      </button>
                    )}
                    {!editing && (c.leadSource || c.leadChannel) && (
                      <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-3)", display: "flex", gap: 8 }}>
                        {c.leadSource && <span>Nguồn: {findSourceByKey(c.leadSource)?.label ?? c.leadSource}</span>}
                        {c.leadChannel && (() => {
                          const src = findSourceByKey(c.leadSource);
                          const ch = src?.channels.find((ch) => ch.code === c.leadChannel);
                          return <span>Kênh: {ch ? `${ch.code} - ${ch.label}` : c.leadChannel}</span>;
                        })()}
                      </div>
                    )}
                    {editing && (
                      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                        <select
                          value={c.leadSource ?? ""}
                          disabled={courseLocked}
                          onChange={(e) => {
                            const val = e.target.value;
                            mutate((next) => ({
                              ...next,
                              uids: next.uids.map((uu, idx) =>
                                idx === uIdx
                                  ? {
                                      ...uu,
                                      courses: uu.courses.map((course) =>
                                        course.courseCode === c.courseCode
                                          ? { ...course, leadSource: val, leadChannel: undefined }
                                          : course
                                      ),
                                    }
                                  : uu
                              ),
                            }));
                          }}
                          style={{ font: "inherit", fontSize: 12, flex: 1, borderRadius: 8, border: "1px solid var(--border)", padding: "5px 7px" }}
                        >
                          <option value="">— Nguồn —</option>
                          {LEAD_SOURCES.map((s) => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                          ))}
                        </select>
                        {sourceHasChannels(c.leadSource) && (
                          <select
                            value={c.leadChannel ?? ""}
                            disabled={courseLocked}
                            onChange={(e) =>
                              mutate((next) => ({
                                ...next,
                                uids: next.uids.map((uu, idx) =>
                                  idx === uIdx
                                    ? {
                                        ...uu,
                                        courses: uu.courses.map((course) =>
                                          course.courseCode === c.courseCode
                                            ? { ...course, leadChannel: e.target.value }
                                            : course
                                        ),
                                      }
                                    : uu
                                ),
                              }))
                            }
                            style={{ font: "inherit", fontSize: 12, flex: 1, borderRadius: 8, border: "1px solid var(--border)", padding: "5px 7px" }}
                          >
                            <option value="">— Kênh —</option>
                            {findSourceByKey(c.leadSource)?.channels.map((ch) => (
                              <option key={ch.code} value={ch.code}>{ch.code} - {ch.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12, paddingBottom: 4 }}>
        <button type="button" className="btn btn-outline btn-sm" disabled={!canAddMore} onClick={addUidGroup}
          title={!canAddMore ? "Đã phân bổ hết tiền đã nhận — không thể thêm UID" : "Thêm UID mới"}>
          <Icons.Plus size={12} /> Thêm UID
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", paddingTop: 6, lineHeight: 1.5 }}>
        Sales bấm "Kích hoạt khoá học" sẽ tự động dùng thông tin KH từ PR. Bộ phận quản trị (chị Thu Hiền) sẽ điền Order ID trong tab <strong>Kích hoạt khoá học</strong>.
      </div>
    </div>
  );
}

export default function PaymentRequestDetailDrawer({
  request,
  open,
  onClose,
  onUpdatePr,
  onAddPayment,
  onCancelPayment,
  onMarkPaid,
  onBillFile,
  onBillView,
  onCreateActiveRequest,
  onCancelRequest,
  activeRequestId,
  activeRequest,
  onActiveRequestMutate,
  onActiveRequestSave,
  onActiveRequestDelete,
  onShowQr,
  uploadingBillId,
  deletingBillId,
  readOnly = false,
}: {
  request: PaymentRequest | null;
  open: boolean;
  onClose: () => void;
  onUpdatePr: (next: PaymentRequest) => Promise<boolean>;
  onAddPayment: (payload: AddPaymentAttemptPayload) => void;
  onCancelPayment: (qr: PaymentAttempt) => void;
  onMarkPaid: (qr: PaymentAttempt) => void;
  onBillFile: (qr: PaymentAttempt, file: File) => void | Promise<void>;
  onBillView: (qr: PaymentAttempt) => void;
  onCreateActiveRequest: () => void;
  onCancelRequest: () => void;
  activeRequestId?: string | null;
  activeRequest?: ActiveRequest | null;
  onActiveRequestMutate: (arId: string, updater: (ar: ActiveRequest) => ActiveRequest) => void;
  onActiveRequestSave: (next: ActiveRequest) => Promise<void>;
  onActiveRequestDelete: (arId: string) => Promise<void>;
  onShowQr: (qr: PaymentAttempt) => void;
  uploadingBillId?: string | null;
  deletingBillId?: string | null;
  readOnly?: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [isTargetFocused, setIsTargetFocused] = useState(false);
  const [draft, setDraft] = useState<DraftPr | null>(null);
  const drawerBodyRef = useRef<HTMLDivElement | null>(null);
  const addFormRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setShowAdd(false);
    setEditing(false);
    setSavingEdit(false);
    setIsTargetFocused(false);
    setDraft(null);
  }, [request?.id]);

  useEffect(() => {
    if (!showAdd) return;
    const id = setTimeout(() => {
      const body = drawerBodyRef.current;
      const target = addFormRef.current;
      if (!body || !target) return;
      const top = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTo({ top: top - 16, behavior: "smooth" });
    }, 60);
    return () => clearTimeout(id);
  }, [showAdd]);

  if (!request) {
    return (
      <>
        <div className={`scrim ${open ? "open" : ""}`} onClick={onClose} style={{ pointerEvents: open ? "auto" : "none" }} />
        <aside className={`drawer ${open ? "open" : ""}`} />
      </>
    );
  }

  const country = findCountry(request.country);
  const remaining = Math.max(0, request.target - request.received);
  const canCancel = request.state !== "cancelled" && request.doneCount === 0 && !activeRequestId;
  const ready = request.state === "done" || request.state === "over";
  const hasActiveRequest = !!activeRequestId;
  const activeSummary = activationSummary(activeRequest);
  const copyPrId = async () => {
    const id = request.id;
    const fallbackCopy = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = id;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    };

    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
        ok = true;
      } else {
        ok = fallbackCopy();
      }
    } catch {
      ok = fallbackCopy();
    }

    if (!ok) {
      window.prompt("Không thể tự copy trong trình duyệt này. Copy PR-ID thủ công:", id);
    }
  };

  return (
    <>
      <div className={`scrim ${open ? "open" : ""}`} onClick={onClose} style={{ pointerEvents: open ? "auto" : "none" }} />
      <aside className={`drawer ${open ? "open" : ""}`}>
        <div className="drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="pr-id-pill">{request.id}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{request.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                Tạo bởi <strong style={{ color: "var(--text-2)" }}>{request.saleEmail ? request.saleEmail.split("@")[0] : "—"}</strong> · {request.createdAt}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <PaymentRequestStatusBadge state={request.state} />
            <button className="drawer-close" onClick={onClose}>
              <Icons.Close size={16} />
            </button>
          </div>
        </div>

        <div className="drawer-body" ref={drawerBodyRef}>
          {/* Summary */}
          <div className="summary-row">
            <div className="summary is-target">
              <div className="summary-label">Tổng dự kiến</div>
              <div className="summary-value">{vnd(request.target)}</div>
            </div>
            <div className="summary is-received">
              <div className="summary-label">Đã nhận</div>
              <div className="summary-value">{vnd(request.received)}</div>
            </div>
            <div className={`summary is-delta-${request.state}`}>
              <div className="summary-label">
                {request.state === "over" ? "Thừa" : request.state === "done" ? "Chênh lệch" : "Còn thiếu"}
              </div>
              <div className="summary-value">
                {request.state === "done"
                  ? "0 ─æ"
                  : request.state === "over"
                  ? "+" + vnd(Math.abs(request.delta))
                  : vnd(remaining)}
              </div>
            </div>
            <div className="summary">
              <div className="summary-label">Số lần thanh toán</div>
              <div className="summary-value">
                <span style={{ color: "var(--primary-700)" }}>{request.doneCount}</span>
                <span style={{ color: "var(--text-muted)" }}>/</span>
                <span style={{ color: "var(--text-2)" }}>{request.totalCount}</span>
              </div>
            </div>
          </div>

          {/* B1 info */}
          <div className="panel">
            <div className="panel-head">
              <h4>
                <Icons.User size={15} /> Thông tin khách hàng (B1)
              </h4>
              {!editing && !readOnly ? (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setDraft({
                      uid: request.uid,
                      name: request.name,
                      childName: request.childName || "",
                      country: request.country || "VN",
                      phone: request.phone,
                      email: request.email || "",
                      province: request.province || "",
                      ward: request.ward || "",
                      address: request.address || "",
                      target: String(request.target),
                      note: request.note || "",
                      taxId: request.taxId || "",
                      customerType: request.customerType || "individual",
                      companyName: request.companyName || "",
                      leadSource: request.leadSource || "",
                      leadChannel: request.leadChannel || "",
                    });
                    setEditing(true);
                  }}
                >
                  <Icons.Pencil size={13} /> Sửa
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={savingEdit}
                    onClick={() => {
                      if (savingEdit) return;
                      setEditing(false);
                      setDraft(null);
                    }}
                  >
                    Huỷ
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={savingEdit}
                    onClick={async () => {
                      if (savingEdit) return;
                      if (!draft) return;
                      const targetNum =
                        Number(String(draft.target).replace(/\D/g, "")) || request.target;
                      setSavingEdit(true);
                      const ok = await onUpdatePr({
                        ...request,
                        uid: draft.uid,
                        name: draft.name,
                        childName: draft.childName || undefined,
                        country: draft.country,
                        phone: draft.phone,
                        email: draft.email,
                        province: draft.province,
                        ward: draft.ward,
                        address: draft.address,
                        target: targetNum,
                        note: draft.note,
                        taxId: draft.taxId || undefined,
                        customerType: draft.customerType,
                        companyName: draft.customerType === "business" ? draft.companyName || undefined : undefined,
                        leadSource: draft.leadSource || undefined,
                        leadChannel: draft.leadChannel || undefined,
                      });
                      setSavingEdit(false);
                      if (!ok) return;
                      setEditing(false);
                      setDraft(null);
                    }}
                  >
                    <Icons.Check size={13} strokeWidth={2.5} /> {savingEdit ? "Đang lưu..." : "Lưu thay đổi"}
                  </button>
                </div>
              )}
            </div>

            {!editing ? (
              <div className="info-grid">
                <div className="info-cell">
                  <div className="info-label">UID CRM</div>
                  <div className="info-value mono">{request.uid}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Tên khách hàng</div>
                  <div className="info-value">{request.name}</div>
                </div>
                {request.childName && (
                  <div className="info-cell">
                    <div className="info-label">Tên con (học viên)</div>
                    <div className="info-value">{request.childName}</div>
                  </div>
                )}
                <div className="info-cell">
                  <div className="info-label">Số điện thoại</div>
                  <div className="info-value mono">
                    <span style={{ marginRight: 4 }}>{country.flag}</span>
                    {country.dial} {fmtPhone(request.phone)}
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Tỉnh / Thành phố</div>
                  <div className="info-value">{request.province || "—"}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Phường / Xã</div>
                  <div className="info-value">{request.ward || "—"}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Số nhà, đường</div>
                  <div className="info-value">{request.address || "—"}</div>
                </div>
                {request.email && (
                  <div className="info-cell">
                    <div className="info-label">Email</div>
                    <div className="info-value">{request.email}</div>
                  </div>
                )}
                <div className="info-cell">
                  <div className="info-label">Loại KH</div>
                  <div className="info-value">
                    {request.customerType === "business" ? "Doanh nghiệp" : "Cá nhân"}
                  </div>
                </div>
                {request.customerType === "business" && request.companyName && (
                  <div className="info-cell">
                    <div className="info-label">Tên công ty</div>
                    <div className="info-value">{request.companyName}</div>
                  </div>
                )}
                {request.taxId && (
                  <div className="info-cell">
                    <div className="info-label">{request.customerType === "business" ? "MST doanh nghiệp" : "MST cá nhân"}</div>
                    <div className="info-value mono">{request.taxId}</div>
                  </div>
                )}
                {request.leadSource && (
                  <div className="info-cell">
                    <div className="info-label">Nguồn KH</div>
                    <div className="info-value">{findSourceByKey(request.leadSource)?.label || request.leadSource}</div>
                  </div>
                )}
                {request.leadChannel && (
                  <div className="info-cell">
                    <div className="info-label">Kênh</div>
                    <div className="info-value mono">{request.leadChannel}</div>
                  </div>
                )}
                <div className="info-cell">
                  <div className="info-label">Tổng tiền dự kiến</div>
                  <div className="info-value money">{vnd(request.target)}</div>
                </div>
                {request.note && (
                  <div className="info-cell full" style={{ gridColumn: "1 / -1" }}>
                    <div className="info-label">Ghi chú</div>
                    <div className="info-value">{request.note}</div>
                  </div>
                )}
                {request.state === "cancelled" && (
                  <div className="info-cell full" style={{ gridColumn: "1 / -1" }}>
                    <div className="info-label" style={{ color: "var(--danger-text)" }}>
                      Đã huỷ
                    </div>
                    <div
                      className="info-value"
                      style={{
                        background: "var(--danger-bg)",
                        borderColor: "var(--danger-bg)",
                        color: "var(--danger-text)",
                      }}
                    >
                      Huỷ lúc <strong>{request.cancelledAt}</strong>
                      {request.cancelledReason ? ` · Lý do: ${request.cancelledReason}` : ""}
                    </div>
                  </div>
                )}
              </div>
            ) : draft ? (
              <div className="info-grid">
                <div className="info-cell">
                  <div className="info-label">UID CRM</div>
                  <input
                    value={draft.uid}
                    onChange={(e) => setDraft({ ...draft, uid: e.target.value })}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      font: "inherit",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Tên khách hàng</div>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      font: "inherit",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Tên con (học viên)</div>
                  <input
                    value={draft.childName}
                    onChange={(e) => setDraft({ ...draft, childName: e.target.value })}
                    placeholder="Nếu khác tên KH"
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      font: "inherit",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Số điện thoại</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <CountryCombo value={draft.country} onChange={(v) => setDraft({ ...draft, country: v })} />
                    <input
                      value={draft.phone}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value.replace(/\D/g, "") })}
                      style={{
                        flex: 1,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        font: "inherit",
                        fontSize: 13,
                      }}
                    />
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Email</div>
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    placeholder="example@gmail.com"
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      font: "inherit",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Loại KH</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${draft.customerType === "individual" ? "btn-primary" : "btn-outline"}`}
                      onClick={() => setDraft({ ...draft, customerType: "individual", companyName: "" })}
                    >
                      Cá nhân
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${draft.customerType === "business" ? "btn-primary" : "btn-outline"}`}
                      onClick={() => setDraft({ ...draft, customerType: "business" })}
                    >
                      Doanh nghiệp
                    </button>
                  </div>
                </div>
                {draft.customerType === "business" && (
                  <div className="info-cell">
                    <div className="info-label">Tên công ty</div>
                    <input
                      value={draft.companyName}
                      onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
                      placeholder="VD: Công ty TNHH ABC"
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        font: "inherit",
                        fontSize: 13,
                      }}
                    />
                  </div>
                )}
                <div className="info-cell">
                  <div className="info-label">{draft.customerType === "business" ? "MST doanh nghiệp" : "MST cá nhân"}</div>
                  <input
                    value={draft.taxId}
                    onChange={(e) => setDraft({ ...draft, taxId: e.target.value.replace(/[^\d]/g, "") })}
                    placeholder="VD: 0123456789"
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      font: "inherit",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Nguồn KH</div>
                  <select
                    value={draft.leadSource}
                    onChange={(e) => setDraft({ ...draft, leadSource: e.target.value, leadChannel: "" })}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      font: "inherit",
                      fontSize: 13,
                    }}
                  >
                    <option value="">— Chọn nguồn —</option>
                    {LEAD_SOURCES.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
                {sourceHasChannels(draft.leadSource) && (
                  <div className="info-cell">
                    <div className="info-label">Kênh</div>
                    <select
                      value={draft.leadChannel}
                      onChange={(e) => setDraft({ ...draft, leadChannel: e.target.value })}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        font: "inherit",
                        fontSize: 13,
                      }}
                    >
                      <option value="">— Chọn kênh —</option>
                      {findSourceByKey(draft.leadSource)?.channels.map((ch) => (
                        <option key={ch.code} value={ch.code}>{ch.code} - {ch.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="info-cell full">
                  <div className="info-label">Địa chỉ khách hàng</div>
                  <VietnamAddressFields
                    province={draft.province}
                    ward={draft.ward}
                    address={draft.address}
                    onProvinceChange={(v) => setDraft({ ...draft, province: v })}
                    onWardChange={(v) => setDraft({ ...draft, ward: v })}
                    onAddressChange={(v) => setDraft({ ...draft, address: v })}
                  />
                </div>
                <div className="info-cell">
                  <div className="info-label">Tổng tiền dự kiến</div>
                  <input
                    value={
                      isTargetFocused
                        ? draft.target
                        : draft.target
                        ? Number(draft.target).toLocaleString("vi-VN")
                        : ""
                    }
                    inputMode="numeric"
                    pattern="[0-9]*"
                    onFocus={() => setIsTargetFocused(true)}
                    onBlur={() => setIsTargetFocused(false)}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setDraft({ ...draft, target: v });
                    }}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      font: "inherit",
                      fontSize: 13,
                      color: "var(--money)",
                      fontWeight: 600,
                    }}
                  />
                </div>
                <div className="info-cell full" style={{ gridColumn: "1 / -1" }}>
                  <div className="info-label">Ghi chú</div>
                  <textarea
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    placeholder="Ghi chú nội bộ"
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      font: "inherit",
                      fontSize: 13,
                      minHeight: 64,
                      resize: "vertical",
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Payments list */}
          <div className="panel">
            <div className="panel-head">
              <h4>
                <Icons.Wallet size={15} /> Các lần thanh toán
                <span className="num-pill">{request.payments.length}</span>
              </h4>
              {!showAdd && !readOnly && request.state !== "cancelled" && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(true)}>
                  <Icons.Plus size={13} /> Tạo lần thanh toán
                </button>
              )}
            </div>

            <div>
              {request.payments.length === 0 && !showAdd && (
                <div className="empty" style={{ padding: "28px 12px" }}>
                  <Icons.Wallet size={22} />
                  <div>Chưa có lần thanh toán nào.</div>
                  {request.state !== "cancelled" && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
                      <Icons.Plus size={13} /> Tạo lần thanh toán đầu tiên
                    </button>
                  )}
                </div>
              )}
              {request.payments.map((qr) => (
                <QrRow
                  key={qr.id}
                  qr={qr}
                  onCancelQr={onCancelPayment}
                  onBillFile={onBillFile}
                  onBillView={onBillView}
                  onMarkPaid={onMarkPaid}
                  onShowQr={onShowQr}
                  uploadingBillId={uploadingBillId}
                  deletingBillId={deletingBillId}
                />
              ))}
            </div>

            {showAdd && (
              <div style={{ marginTop: 12 }} ref={addFormRef}>
                <AddPaymentForm
                  pr={request}
                  onCancel={() => setShowAdd(false)}
                  onSubmit={(payload) => {
                    onAddPayment(payload);
                    setShowAdd(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* AR mini-window — chỉ Sales view, gọn nhẹ. Tab Kích hoạt khoá học (Thu Hiền) vẫn riêng */}
          {hasActiveRequest && activeRequest && (
            <ActiveRequestMiniCardV2
              ar={activeRequest}
              request={request}
              onActiveRequestMutate={onActiveRequestMutate}
              onActiveRequestSave={onActiveRequestSave}
              onActiveRequestDelete={onActiveRequestDelete}
            />
          )}

          {/* Timeline */}
          <div className="panel">
            <div className="panel-head">
              <h4>
                <Icons.Sigma size={15} /> Tiến độ quy trình
              </h4>
            </div>
            <div className="timeline">
              <div className="tl-item">
                <div className="tl-dot done" />
                <div className="tl-content">
                  <div className="tl-title">B1 · Tạo Payment Request</div>
                  <div className="tl-meta">PR-ID đã được tạo · {request.createdAt}</div>
                </div>
              </div>
              <div className="tl-item">
                <div className={`tl-dot ${ready ? "done" : request.state === "cancelled" ? "pending" : "active"}`} />
                <div className="tl-content">
                  <div className="tl-title">B2 · Tạo lần thanh toán &amp; thu tiền</div>
                  <div className="tl-meta">
                    Đã nhận {vnd(request.received)} / {vnd(request.target)} · {request.doneCount}/{request.totalCount} lần
                  </div>
                </div>
              </div>
              <div className="tl-item">
                <div className={`tl-dot ${ready ? "active" : "pending"}`} />
                <div className="tl-content">
                  <div className="tl-title">B3 · Active Request (Tạo khoá học)</div>
                  <div className="tl-meta">
                    {hasActiveRequest
                      ? `Active Request ${activeRequestId} — ${activeSummary.buttonLabel}`
                      : ready
                      ? 'Sẵn sàng kích hoạt — bấm "Kích hoạt khoá học" để mở gói'
                      : "Sẽ mở khoá khi đủ 100% tiền"}
                  </div>
                </div>
              </div>
              <div className="tl-item">
                <div className="tl-dot pending" />
                <div className="tl-content">
                  <div className="tl-title">B4 · Yêu cầu xuất hoá đơn</div>
                  <div className="tl-meta">Sẽ xuất sau khi đủ tiền &amp; có Active code</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="drawer-foot">
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => void copyPrId()}
            >
              <Icons.Copy size={13} /> Copy PR-ID
            </button>
            {canCancel && !readOnly && (
              <button className="btn btn-outline btn-sm" style={{ color: "var(--danger)" }} onClick={onCancelRequest}>
                <Icons.XCircle size={13} /> Huỷ Payment Request
              </button>
            )}
          </div>
          <div className="quick-create">
            {!readOnly && request.state !== "cancelled" && (
              <button className="btn btn-primary" onClick={() => setShowAdd(true)} disabled={showAdd}>
                <Icons.Plus size={14} /> Tạo lần thanh toán
              </button>
            )}
            {!readOnly && <button
              className={`btn ${ready && !hasActiveRequest ? "btn-success" : "btn-outline"}`}
              disabled={!ready || hasActiveRequest}
              title={!ready ? "Cần thu đủ 100% số tiền trước khi kích hoạt" : hasActiveRequest ? activeSummary.buttonLabel : "Tạo Active Request và chọn gói khoá học"}
              onClick={onCreateActiveRequest}
            >
              <Icons.CheckSquare size={14} /> {hasActiveRequest ? activeSummary.buttonLabel : "Kích hoạt khoá học"}
            </button>}
          </div>
        </div>
      </aside>
    </>
  );
}

export { nowStamp as _nowStamp };
