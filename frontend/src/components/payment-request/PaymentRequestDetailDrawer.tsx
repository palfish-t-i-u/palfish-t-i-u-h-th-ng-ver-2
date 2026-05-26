import { useEffect, useRef, useState } from "react";
import type {
  AddPaymentAttemptPayload,
  PaymentAttempt,
  PaymentMethod,
  PaymentRequest,
} from "../../types/paymentRequest";
import CountryCombo, { findCountry } from "./CountryCombo";
import { Icons, type IconKey } from "./Icons";
import BillUploadZone from "./BillUploadZone";
import VietnamAddressFields from "./VietnamAddressFields";
import PaymentRequestStatusBadge from "./PaymentRequestStatusBadge";
import {
  fmtPhone,
  nextPaymentCode,
  nowStamp,
  paymentAttemptLabel,
  vnd,
} from "./paymentRequestUtils";

const METHOD_META: Record<PaymentMethod, { cls: string; label: string; icon: IconKey; sub: string }> = {
  qr: { cls: "method-qr", label: "Chuyß╗ân khoß║ún", icon: "QrCode", sub: "QR / chuyß╗ân khoß║ún" },
  cash: { cls: "method-cash", label: "Tiß╗ün mß║╖t", icon: "Cash", sub: "Thu trß╗▒c tiß║┐p" },
  card: { cls: "method-card", label: "Quß║╣t thß║╗", icon: "Bank", sub: "POS / thß║╗ t├¡n dß╗Ñng" },
  installment: { cls: "method-installment", label: "Trß║ú g├│p", icon: "Sigma", sub: "Trß║ú nhiß╗üu kß╗│" },
};

const METHOD_ORDER: PaymentMethod[] = ["qr", "cash", "card", "installment"];

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
        <Icons.XCircle size={11} /> ─É├ú huß╗╖
      </span>
    );
  } else if (qr.status === "paid") {
    pill = (
      <span className="badge is-done">
        <Icons.Check size={11} strokeWidth={2.5} /> ─É├ú x├íc nhß║¡n
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
    ? qr.bank || (qr.cardLast4 ? `ΓÇóΓÇóΓÇóΓÇó ${qr.cardLast4}` : "")
    : qr.method === "installment"
    ? `${qr.installmentMonths || ""} kß╗│`
    : "";

  return (
    <div className="qr-row v2" style={isCancelled ? { opacity: 0.55 } : undefined}>
      <QrThumb paid={qr.status === "paid"} method={qr.method} />
      <div style={{ minWidth: 0 }}>
        <div className="qr-info-line1">
          <span style={{ fontWeight: 600, color: "var(--text-3)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
            Lß║ºn #{qr.idx}
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
          <span>{qr.status === "paid" ? `X├íc nhß║¡n l├║c ${qr.paidAt || ""}` : `Tß║ío ${qr.createdAt}`}</span>
          {qr.status !== "paid" && (qr.billImage || qr.bill) && (
            <>
              <span className="sep" />
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkPaid(qr);
                }}
                title="Demo ΓÇö th╞░ß╗¥ng do module ─Éß╗æi so├ít cß╗ºa kß║┐ to├ín thß╗▒c hiß╗çn"
                style={{
                  color: "var(--primary-700)",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                  textUnderlineOffset: 2,
                  whiteSpace: "nowrap",
                }}
              >
                M├┤ phß╗Ång kß║┐ to├ín x├íc nhß║¡n ΓåÆ
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
            title="Huß╗╖ lß║ºn giao dß╗ïch n├áy"
            onClick={() => onCancelQr(qr)}
          >
            <Icons.XCircle size={13} /> Huß╗╖
          </button>
        )}
        {isCancelled && <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>ΓÇö</span>}
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
  const [bank, setBank] = useState("MB Bank");
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
          Ph╞░╞íng thß╗⌐c thanh to├ín
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
          <label>Sß╗æ tiß╗ün lß║ºn n├áy</label>
          <input
            type="text"
            placeholder={`C├▓n thiß║┐u: ${vnd(remaining)}`}
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, "");
              setAmount(v ? Number(v).toLocaleString("vi-VN") : "");
            }}
          />
        </div>

        {method === "qr" && (
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Ng├ón h├áng nhß║¡n</label>
            <select value={bank} onChange={(e) => setBank(e.target.value)}>
              <option>MB Bank</option>
              <option>Vietcombank</option>
              <option>Techcombank</option>
              <option>BIDV</option>
              <option>VPBank</option>
            </select>
          </div>
        )}
        {method === "card" && (
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>4 sß╗æ cuß╗æi thß║╗</label>
            <input
              value={cardLast4}
              onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="ΓÇóΓÇóΓÇóΓÇó 4242"
            />
          </div>
        )}
        {method === "installment" && (
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Sß╗æ kß╗│ trß║ú g├│p</label>
            <select value={installmentMonths} onChange={(e) => setInstallmentMonths(e.target.value)}>
              <option value="3">3 th├íng</option>
              <option value="6">6 th├íng</option>
              <option value="9">9 th├íng</option>
              <option value="12">12 th├íng</option>
            </select>
          </div>
        )}
        {method === "cash" && (
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Ng╞░ß╗¥i thu</label>
            <input value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder="VD: Thu Hiß╗ün" />
          </div>
        )}

        <div className="field" style={{ flex: 1.4, minWidth: 220 }}>
          <label>{method === "qr" ? "Nß╗Öi dung CK gß╗úi ├╜" : "M├ú ─æß╗æi so├ít nß╗Öi bß╗Ö"}</label>
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
          Huß╗╖
        </button>
        <button className="btn btn-primary" onClick={submit}>
          <Icons.Sparkle size={14} /> {method === "qr" ? "Tß║ío QR & m├ú CK" : "Ghi nhß║¡n lß║ºn thanh to├ín"}
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
  onShowQr,
  uploadingBillId,
}: {
  request: PaymentRequest | null;
  open: boolean;
  onClose: () => void;
  onUpdatePr: (next: PaymentRequest) => void;
  onAddPayment: (payload: AddPaymentAttemptPayload) => void;
  onCancelPayment: (qr: PaymentAttempt) => void;
  onMarkPaid: (qr: PaymentAttempt) => void;
  onBillFile: (qr: PaymentAttempt, file: File) => void;
  onBillView: (qr: PaymentAttempt) => void;
  onCreateActiveRequest: () => void;
  onCancelRequest: () => void;
  activeRequestId?: string | null;
  onShowQr: (qr: PaymentAttempt) => void;
  uploadingBillId?: string | null;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftPr | null>(null);
  const drawerBodyRef = useRef<HTMLDivElement | null>(null);
  const addFormRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setShowAdd(false);
    setEditing(false);
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
  const canCancel = request.state !== "cancelled" && request.doneCount === 0;
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
                Tß║ío bß╗ƒi <strong style={{ color: "var(--text-2)" }}>hieuhn.mplanner</strong> ┬╖ {request.createdAt}
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
              <div className="summary-label">Tß╗òng dß╗▒ kiß║┐n</div>
              <div className="summary-value">{vnd(request.target)}</div>
            </div>
            <div className="summary is-received">
              <div className="summary-label">─É├ú nhß║¡n</div>
              <div className="summary-value">{vnd(request.received)}</div>
            </div>
            <div className={`summary is-delta-${request.state}`}>
              <div className="summary-label">
                {request.state === "over" ? "Thß╗½a" : request.state === "done" ? "Ch├¬nh lß╗çch" : "C├▓n thiß║┐u"}
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
              <div className="summary-label">Sß╗æ lß║ºn thanh to├ín</div>
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
                <Icons.User size={15} /> Th├┤ng tin kh├ích h├áng (B1)
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
                      target: String(request.target.toLocaleString("vi-VN")),
                      note: request.note || "",
                    });
                    setEditing(true);
                  }}
                >
                  <Icons.Pencil size={13} /> Sß╗¡a
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setEditing(false);
                      setDraft(null);
                    }}
                  >
                    Huß╗╖
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (!draft) return;
                      const targetNum =
                        Number(String(draft.target).replace(/\D/g, "")) || request.target;
                      onUpdatePr({
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
                      setEditing(false);
                      setDraft(null);
                    }}
                  >
                    <Icons.Check size={13} strokeWidth={2.5} /> L╞░u thay ─æß╗òi
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
                  <div className="info-label">T├¬n kh├ích h├áng</div>
                  <div className="info-value">{request.name}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Sß╗æ ─æiß╗çn thoß║íi</div>
                  <div className="info-value mono">
                    <span style={{ marginRight: 4 }}>{country.flag}</span>
                    {country.dial} {fmtPhone(request.phone)}
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Tß╗ënh / Th├ánh phß╗æ</div>
                  <div className="info-value">{request.province || "ΓÇö"}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Ph╞░ß╗¥ng / X├ú</div>
                  <div className="info-value">{request.ward || "ΓÇö"}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Sß╗æ nh├á, ─æ╞░ß╗¥ng</div>
                  <div className="info-value">{request.address || "ΓÇö"}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Tß╗òng tiß╗ün dß╗▒ kiß║┐n</div>
                  <div className="info-value money">{vnd(request.target)}</div>
                </div>
                {request.note && (
                  <div className="info-cell full" style={{ gridColumn: "1 / -1" }}>
                    <div className="info-label">Ghi ch├║</div>
                    <div className="info-value">{request.note}</div>
                  </div>
                )}
                {request.state === "cancelled" && (
                  <div className="info-cell full" style={{ gridColumn: "1 / -1" }}>
                    <div className="info-label" style={{ color: "var(--danger-text)" }}>
                      ─É├ú huß╗╖
                    </div>
                    <div
                      className="info-value"
                      style={{
                        background: "var(--danger-bg)",
                        borderColor: "var(--danger-bg)",
                        color: "var(--danger-text)",
                      }}
                    >
                      Huß╗╖ l├║c <strong>{request.cancelledAt}</strong>
                      {request.cancelledReason ? ` ┬╖ L├╜ do: ${request.cancelledReason}` : ""}
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
                  <div className="info-label">T├¬n kh├ích h├áng</div>
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
                  <div className="info-label">Sß╗æ ─æiß╗çn thoß║íi</div>
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
                  <div className="info-label">─Éß╗ïa chß╗ë kh├ích h├áng</div>
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
                  <div className="info-label">Tß╗òng tiß╗ün dß╗▒ kiß║┐n</div>
                  <input
                    value={draft.target}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setDraft({ ...draft, target: v ? Number(v).toLocaleString("vi-VN") : "" });
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
                  <div className="info-label">Ghi ch├║</div>
                  <textarea
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    placeholder="Ghi ch├║ nß╗Öi bß╗Ö"
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
                <Icons.Wallet size={15} /> C├íc lß║ºn thanh to├ín
                <span className="num-pill">{request.payments.length}</span>
              </h4>
              {!showAdd && request.state !== "cancelled" && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(true)}>
                  <Icons.Plus size={13} /> Tß║ío lß║ºn thanh to├ín
                </button>
              )}
            </div>

            <div>
              {request.payments.length === 0 && !showAdd && (
                <div className="empty" style={{ padding: "28px 12px" }}>
                  <Icons.Wallet size={22} />
                  <div>Ch╞░a c├│ lß║ºn thanh to├ín n├áo.</div>
                  {request.state !== "cancelled" && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
                      <Icons.Plus size={13} /> Tß║ío lß║ºn thanh to├ín ─æß║ºu ti├¬n
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

          {/* Timeline */}
          <div className="panel">
            <div className="panel-head">
              <h4>
                <Icons.Sigma size={15} /> Tiß║┐n ─æß╗Ö quy tr├¼nh
              </h4>
            </div>
            <div className="timeline">
              <div className="tl-item">
                <div className="tl-dot done" />
                <div className="tl-content">
                  <div className="tl-title">B1 ┬╖ Tß║ío Payment Request</div>
                  <div className="tl-meta">PR-ID ─æ├ú ─æ╞░ß╗úc tß║ío ┬╖ {request.createdAt}</div>
                </div>
              </div>
              <div className="tl-item">
                <div className={`tl-dot ${ready ? "done" : request.state === "cancelled" ? "pending" : "active"}`} />
                <div className="tl-content">
                  <div className="tl-title">B2 ┬╖ Tß║ío lß║ºn thanh to├ín &amp; thu tiß╗ün</div>
                  <div className="tl-meta">
                    ─É├ú nhß║¡n {vnd(request.received)} / {vnd(request.target)} ┬╖ {request.doneCount}/{request.totalCount} lß║ºn
                  </div>
                </div>
              </div>
              <div className="tl-item">
                <div className={`tl-dot ${ready ? "active" : "pending"}`} />
                <div className="tl-content">
                  <div className="tl-title">B3 ┬╖ Active Request (Tß║ío kho├í hß╗ìc)</div>
                  <div className="tl-meta">
                    {hasActiveRequest
                      ? `Active Request ${activeRequestId} ─æ├ú tß║ío ΓÇö chuyß╗ân sang K├¡ch hoß║ít kh├│a hß╗ìc ─æß╗â ─æiß╗ün Order ID`
                      : ready
                      ? 'Sß║╡n s├áng k├¡ch hoß║ít ΓÇö bß║Ñm "Tß║ío Active Request" ─æß╗â mß╗ƒ kho├í hß╗ìc'
                      : "Sß║╜ mß╗ƒ kho├í khi ─æß╗º 100% tiß╗ün"}
                  </div>
                </div>
              </div>
              <div className="tl-item">
                <div className="tl-dot pending" />
                <div className="tl-content">
                  <div className="tl-title">B4 ┬╖ Y├¬u cß║ºu xuß║Ñt ho├í ─æ╞ín</div>
                  <div className="tl-meta">Sß║╜ xuß║Ñt sau khi ─æß╗º tiß╗ün &amp; c├│ Active code</div>
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
                <Icons.XCircle size={13} /> Huß╗╖ Payment Request
              </button>
            )}
          </div>
          <div className="quick-create">
            {request.state !== "cancelled" && (
              <button className="btn btn-primary" onClick={() => setShowAdd(true)} disabled={showAdd}>
                <Icons.Plus size={14} /> Tß║ío lß║ºn thanh to├ín
              </button>
            )}
            <button
              className={`btn ${ready && !hasActiveRequest ? "btn-success" : "btn-outline"}`}
              disabled={!ready || hasActiveRequest}
              onClick={onCreateActiveRequest}
            >
              <Icons.CheckSquare size={14} /> {hasActiveRequest ? "─É├ú tß║ío Active Request" : "Tß║ío Active Request (B3)"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export { nowStamp as _nowStamp };
