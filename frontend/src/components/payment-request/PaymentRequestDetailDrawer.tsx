import { useEffect, useRef, useState } from "react";
import type {
  ActiveRequest,
  AddPaymentAttemptPayload,
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
import { BANK_ACCOUNTS } from "../../constants/bank";
import Combobox from "../ui/Combobox";
import {
  fmtPhone,
  formatPaymentDateFull,
  nextPaymentCode,
  nowStamp,
  paymentAttemptLabel,
  vnd,
} from "./paymentRequestUtils";

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
}: {
  qr: PaymentAttempt;
  onCancelQr: (qr: PaymentAttempt) => void;
  onBillFile: (qr: PaymentAttempt, file: File) => void;
  onBillView: (qr: PaymentAttempt) => void;
  onMarkPaid: (qr: PaymentAttempt) => void;
  onShowQr: (qr: PaymentAttempt) => void;
  uploadingBillId?: string | null;
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
    ? `${qr.installmentMonths || ""} kỳ`
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
  const [method, setMethod] = useState<PaymentMethod>("qr");
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState(BANK_ACCOUNTS[0].alias);
  const [cardLast4, setCardLast4] = useState("");
  const [installmentMonths, setInstallmentMonths] = useState("6");
  const [cashier, setCashier] = useState("");

  const remaining = Math.max(0, pr.target - pr.received);
  const nextIdx = (pr.payments[pr.payments.length - 1]?.idx || 0) + 1;
  const code = nextPaymentCode(pr.id, nextIdx);

  const submit = () => {
    const n = parseInt(String(amount).replace(/\D/g, ""), 10);
    if (!n) return;
    onSubmit({
      amount: n,
      method,
      bank: method === "qr" || method === "card" ? bank : undefined,
      cardLast4: method === "card" ? cardLast4 : undefined,
      installmentMonths: method === "installment" ? installmentMonths : undefined,
      cashier: method === "cash" ? cashier : undefined,
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
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, "");
              setAmount(v ? Number(v).toLocaleString("vi-VN") : "");
            }}
          />
        </div>

        {method === "qr" && (
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Ngân hàng nhận</label>
            <select value={bank} onChange={(e) => setBank(e.target.value)}>
              {BANK_ACCOUNTS.map((b) => (
                <option key={b.alias} value={b.alias}>{b.alias}</option>
              ))}
            </select>
          </div>
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
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Số kỳ trả góp</label>
            <select value={installmentMonths} onChange={(e) => setInstallmentMonths(e.target.value)}>
              <option value="3">3 tháng</option>
              <option value="6">6 tháng</option>
              <option value="9">9 tháng</option>
              <option value="12">12 tháng</option>
            </select>
          </div>
        )}
        {method === "cash" && (
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Người thu</label>
            <input value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder="VD: Thu Hiền" />
          </div>
        )}

        <div className="field" style={{ flex: 1.4, minWidth: 220 }}>
          <label>{method === "qr" ? "Nội dung CK gợi ý" : "Mã đối soát nội bộ"}</label>
          <input
            type="text"
            value={code}
            readOnly
            style={{ color: "var(--primary-700)", fontFamily: "JetBrains Mono, monospace" }}
          />
        </div>
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
  country: string;
  phone: string;
  province: string;
  ward: string;
  address: string;
  target: string;
  note: string;
}

/**
 * AR mini-window cho Sales view — gọn nhẹ, hiện ngay trong drawer PR.
 * Sales chỉ cần thấy: AR đã được tạo, danh sách UID + course, chọn gói học, Order ID (read-only sau khi BE điền).
 * KHÔNG có nút "Xác nhận thông tin" của Thu Hiền (đó là nghiệp vụ riêng ở tab Kích hoạt khoá học).
 * Sales không nhập Order ID ở đây để giữ tách bạch nghiệp vụ với tab Kích hoạt khoá học.
 */
function ActiveRequestMiniCard({
  ar,
  onCoursePackageChange,
}: {
  ar: ActiveRequest;
  onCoursePackageChange: (arId: string, courseCode: string, packageName: string) => Promise<void>;
}) {
  const [draftPackages, setDraftPackages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const courseCount = ar.uids.reduce((sum, u) => sum + u.courses.length, 0);
  const filledOrderIds = ar.uids.reduce(
    (sum, u) => sum + u.courses.filter((c) => !!c.orderId).length,
    0
  );
  const allFilled = courseCount > 0 && filledOrderIds === courseCount;
  const courseKey = (uidIdx: number, courseCode: string, courseIdx: number) =>
    `${uidIdx}::${courseCode || courseIdx}`;

  useEffect(() => {
    const next: Record<string, string> = {};
    ar.uids.forEach((u, uidIdx) => {
      u.courses.forEach((c, courseIdx) => {
        next[courseKey(uidIdx, c.courseCode, courseIdx)] = c.packageName || c.name || "";
      });
    });
    setDraftPackages(next);
  }, [ar]);

  const dirtyCourses = ar.uids.flatMap((u, uidIdx) =>
    u.courses
      .map((c, courseIdx) => {
        const key = courseKey(uidIdx, c.courseCode, courseIdx);
        const savedValue = c.packageName || c.name || "";
        const draftValue = draftPackages[key] ?? savedValue;
        return draftValue !== savedValue ? { courseCode: c.courseCode, packageName: draftValue } : null;
      })
      .filter((item): item is { courseCode: string; packageName: string } => !!item)
  );
  const hasDraftChanges = dirtyCourses.length > 0;

  const savePackages = async () => {
    if (!hasDraftChanges || saving) return;
    setSaving(true);
    try {
      for (const item of dirtyCourses) {
        await onCoursePackageChange(ar.id, item.courseCode, item.packageName);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h4>
          <Icons.CheckSquare size={15} /> Kích hoạt khoá học
          <span className="num-pill">{ar.id}</span>
        </h4>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className={`badge ${allFilled ? "is-done" : "is-over"}`}
            title={allFilled ? "Tất cả course đã có Order ID" : "Đang chờ điền Order ID"}
          >
            {allFilled ? <Icons.Check size={11} strokeWidth={2.5} /> : <Icons.Clock size={11} />}{" "}
            {filledOrderIds}/{courseCount} Order ID
          </span>
          <button
            type="button"
            className={`btn btn-sm ${hasDraftChanges ? "btn-primary" : "btn-outline"}`}
            disabled={!hasDraftChanges || saving}
            onClick={() => void savePackages()}
            title={hasDraftChanges ? "Lưu gói học vào Active Request" : "Chưa có thay đổi gói học"}
          >
            <Icons.Check size={13} strokeWidth={2.5} /> {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
      <div style={{ padding: "8px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {ar.uids.map((u, uIdx) => (
          <div
            key={`${u.uid}-${uIdx}`}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 10,
              background: "var(--surface-2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>UID {u.uid || "—"}</span>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {u.country} · {u.phone}
              </span>
            </div>
            {u.courses.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
                Chưa chọn gói khoá học
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {u.courses.map((c, cIdx) => (
                  <div
                    key={cIdx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      alignItems: "center",
                      padding: "6px 8px",
                      background: "white",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <Combobox
                        value={
                          draftPackages[courseKey(uIdx, c.courseCode, cIdx)] ??
                          c.packageName ??
                          c.name ??
                          ""
                        }
                        onChange={(value) =>
                          setDraftPackages((prev) => ({
                            ...prev,
                            [courseKey(uIdx, c.courseCode, cIdx)]: value,
                          }))
                        }
                        options={COURSE_PACKAGE_OPTIONS}
                        placeholder="Chọn hoặc gõ tên gói học..."
                        emptyLabel="Chưa chọn gói"
                      />
                      {c.courseCode && (
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                          Course code: <code>{c.courseCode}</code>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {c.orderId ? (
                        <span className="badge is-done" title="Order ID đã được điền">
                          <Icons.Check size={10} strokeWidth={2.5} /> {c.orderId}
                        </span>
                      ) : (
                        <span className="badge is-over" title="Chờ điền Order ID">
                          <Icons.Clock size={10} /> Chờ Order ID
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
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
  onCoursePackageChange,
  onShowQr,
  uploadingBillId,
}: {
  request: PaymentRequest | null;
  open: boolean;
  onClose: () => void;
  onUpdatePr: (next: PaymentRequest) => Promise<boolean>;
  onAddPayment: (payload: AddPaymentAttemptPayload) => void;
  onCancelPayment: (qr: PaymentAttempt) => void;
  onMarkPaid: (qr: PaymentAttempt) => void;
  onBillFile: (qr: PaymentAttempt, file: File) => void;
  onBillView: (qr: PaymentAttempt) => void;
  onCreateActiveRequest: () => void;
  onCancelRequest: () => void;
  activeRequestId?: string | null;
  activeRequest?: ActiveRequest | null;
  onCoursePackageChange: (arId: string, courseCode: string, packageName: string) => Promise<void>;
  onShowQr: (qr: PaymentAttempt) => void;
  uploadingBillId?: string | null;
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
                Tạo bởi <strong style={{ color: "var(--text-2)" }}>hieuhn.mplanner</strong> · {request.createdAt}
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
              {!editing ? (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setDraft({
                      uid: request.uid,
                      name: request.name,
                      country: request.country || "VN",
                      phone: request.phone,
                      province: request.province || "",
                      ward: request.ward || "",
                      address: request.address || "",
                      target: String(request.target),
                      note: request.note || "",
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
                        country: draft.country,
                        phone: draft.phone,
                        province: draft.province,
                        ward: draft.ward,
                        address: draft.address,
                        target: targetNum,
                        note: draft.note,
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
              {!showAdd && request.state !== "cancelled" && (
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
            <ActiveRequestMiniCard ar={activeRequest} onCoursePackageChange={onCoursePackageChange} />
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
                      ? `Active Request ${activeRequestId} đã tạo — chọn gói khoá học bên dưới`
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
              onClick={() => navigator.clipboard?.writeText(request.id).catch(() => {})}
            >
              <Icons.Copy size={13} /> Copy PR-ID
            </button>
            {canCancel && (
              <button className="btn btn-outline btn-sm" style={{ color: "var(--danger)" }} onClick={onCancelRequest}>
                <Icons.XCircle size={13} /> Huỷ Payment Request
              </button>
            )}
          </div>
          <div className="quick-create">
            {request.state !== "cancelled" && (
              <button className="btn btn-primary" onClick={() => setShowAdd(true)} disabled={showAdd}>
                <Icons.Plus size={14} /> Tạo lần thanh toán
              </button>
            )}
            <button
              className={`btn ${ready && !hasActiveRequest ? "btn-success" : "btn-outline"}`}
              disabled={!ready || hasActiveRequest}
              title={!ready ? "Cần thu đủ 100% số tiền trước khi kích hoạt" : hasActiveRequest ? "Khoá học đã được kích hoạt" : "Tạo Active Request và chọn gói khoá học"}
              onClick={onCreateActiveRequest}
            >
              <Icons.CheckSquare size={14} /> {hasActiveRequest ? "Đã kích hoạt khoá học" : "Kích hoạt khoá học"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export { nowStamp as _nowStamp };
