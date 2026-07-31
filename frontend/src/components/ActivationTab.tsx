import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MoneyInput } from "./ui/MoneyInput";
import { COURSE_PACKAGES } from "../constants/coursePackages";
import { usePaymentFlow } from "../contexts/PaymentFlowContext";
import { usePermission } from "../hooks/usePermission";
import useIsMobile from "../hooks/useIsMobile";
import ActivationRowCards from "./activation/ActivationRowCards";
import { endpoints } from "../lib/api";
import { notifyLedgerChanged } from "../lib/ledgerEvents";
import type { ActiveRequest, ActiveCourse, ActiveUidGroup, PaymentRequest } from "../types/paymentRequest";
import type { ActiveRequestStatus } from "../types/paymentRequest";
import {
  AR_STATUS_META,
  canAllocateCourseAmount,
  enrichActiveRequest,
  flatCourses,
  nextCourseCode,
  remainingReceivedAmount,
  vnd,
} from "./payment-flow/paymentFlowUtils";
import CountryCombo, { COUNTRIES, findCountry } from "./payment-request/CountryCombo";
import DateRangeFilter, { EMPTY_RANGE, type DateRange, inDateRange } from "./payment-request/DateRangeFilter";
import { Icons } from "./payment-request/Icons";
import { useNoticeCardCollapse } from "../hooks/useNoticeCardCollapse";
import { activationAuditText, formatPaymentDateFull, formatPaymentDateTime, fromApiActiveRequest, getArReferralStatus, getReferralStatus, pageItems, paginate, REFERRAL_STATUS_HEADER, REFERRAL_STATUS_PANEL_STYLE, toActiveRequestPatchUidsData } from "./payment-request/paymentRequestUtils";
import { downloadTaxInvoiceZip } from "../utils/taxInvoiceXlsxExport";
import type { InvoiceRow } from "./payment-flow/paymentFlowUtils";
import { getUidSyncState } from "./ActivationTab.uidSync";
import { HdsdLink } from "./help/HdsdLink";
import "../styles/prototype-payments.css";
import { AR_PER_PAGE, applyCourseOrderId, countCourseTabs, courseRowMatchesSearch, courseRowMatchesTab, flatCourseRows, groupRowsByAr, type CourseRow } from "./activation/activationFlatList";
import { normVi } from "../lib/textUtils";

type ArTabId = "pending_order" | "activated" | "all";

/** Vạch màu trái xoay vòng theo cụm AR (không random — ổn định giữa các render). */
const GROUP_TINTS = ["#7c6cff", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

function PrSearchCombo({
  prs,
  value,
  onChange,
  allowNone = true,
}: {
  prs: PaymentRequest[];
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const selectedPr = value ? prs.find((p) => p.id === value) : null;
  const filtered = prs
    .filter((p) => p.state !== "cancelled")
    .filter((p) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.uid.toLowerCase().includes(q) ||
        p.phone.includes(q)
      );
    });

  return (
    <div className="pr-search-wrap" ref={ref}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "9px 11px",
          background: "white",
          cursor: "pointer",
          minHeight: 40,
        }}
      >
        {selectedPr ? (
          <>
            <span className="pr-id-pill">{selectedPr.id}</span>
            <span
              style={{ flex: 1, fontSize: 13, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {selectedPr.name}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              {vnd(selectedPr.target)} · {selectedPr.state === "done" ? "✓ Đủ" : selectedPr.state === "over" ? "⚠ Thừa" : "✗ Chưa đủ"}
            </span>
          </>
        ) : (
          <span style={{ flex: 1, color: "var(--text-3)", fontSize: 13 }}>Tìm theo PR-ID, tên, UID, SĐT…</span>
        )}
        <Icons.ChevronDown size={14} stroke="var(--text-3)" />
      </div>
      {open && (
        <div className="pr-search-pop">
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
            <Icons.Search size={13} stroke="var(--text-3)" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Lọc nhanh…"
              style={{ flex: 1, border: 0, outline: "none", font: "inherit", fontSize: 13 }}
            />
          </div>
          {allowNone && (
            <div className="pr-search-opt" onClick={() => { onChange(null); setOpen(false); }}>
              <span className="pr-id-text" style={{ color: "var(--text-3)" }}>
                — Không liên kết PR —
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>Standalone</span>
              <span className="pr-meta">AR sẽ không có Payment Request gắn kèm</span>
            </div>
          )}
          {filtered.length === 0 && (
            <div style={{ padding: 12, color: "var(--text-3)", fontSize: 12 }}>Không tìm thấy PR khớp.</div>
          )}
          {filtered.map((p) => (
            <div key={p.id} className="pr-search-opt" onClick={() => { onChange(p.id); setOpen(false); }}>
              <span className="pr-id-text">{p.id}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-2)", textAlign: "right" }}>{vnd(p.target)}</span>
              <span className="pr-meta">
                {p.name} · UID {p.uid} ·{" "}
                {p.state === "done" ? "Đủ tiền" : p.state === "over" ? "Thừa" : p.state === "short" ? `Còn thiếu ${vnd(p.target - p.received)}` : "Chưa thanh toán"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ARCreateModal({
  open,
  onClose,
  prs,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  prs: PaymentRequest[];
  onCreate: (data: {
    prId: string | null;
    customerName: string;
    uid: string;
    packageName: string;
    amount: number;
  }) => void;
}) {
  const [linkedPrId, setLinkedPrId] = useState<string | null>(null);
  const [firstUid, setFirstUid] = useState("");
  const [pkgName, setPkgName] = useState("");
  const [amount, setAmount] = useState("");
  const [customerName, setCustomerName] = useState("");

  useEffect(() => {
    if (!open) return;
    setLinkedPrId(null);
    setFirstUid("");
    setCustomerName("");
    setAmount("");

    setPkgName("");
  }, [open]);

  if (!open) return null;

  const linkedPr = linkedPrId ? prs.find((p) => p.id === linkedPrId) : null;
  const amountNum = parseInt(String(amount).replace(/\D/g, ""), 10) || 0;
  const linkedPrOverAmount = linkedPr ? Math.max(0, amountNum - linkedPr.received) : 0;
  const canSubmit =
    firstUid.trim() &&
    pkgName.trim() &&
    amountNum > 0 &&
    linkedPrOverAmount === 0 &&
    (linkedPr ? true : customerName.trim());

  return (
    <div className="gmv-prototype-modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(720px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Tạo Active Request mới</h3>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Bước 3 · Đăng ký khoá học cho UID khách hàng, hệ thống xuất ra Course Code dùng để đối chiếu hoá đơn.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <HdsdLink moduleSlug="module3" topicSlug="tao-active-request" />
            <button type="button" className="drawer-close" onClick={onClose}>
              <Icons.Close size={16} />
            </button>
          </div>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>
              Liên kết Payment Request <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(khuyến nghị)</span>
            </label>
            <PrSearchCombo
              prs={prs}
              value={linkedPrId}
              onChange={(id) => {
                setLinkedPrId(id);
                if (id) {
                  const p = prs.find((x) => x.id === id);
                  if (p) {
                    setFirstUid(p.uid);
                    setCustomerName(p.name);
                    if (!amount) setAmount(String(p.received));
                  }
                }
              }}
            />
            {linkedPr && linkedPr.state !== "done" && linkedPr.state !== "over" && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--warning-text)", display: "flex", gap: 6, alignItems: "center" }}>
                <Icons.AlertCircle size={13} /> PR này chưa thanh toán đủ — thường chỉ kích hoạt khi đủ tiền.
              </div>
            )}
            {linkedPrOverAmount > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--danger)", display: "flex", gap: 6, alignItems: "center" }}>
                <Icons.AlertCircle size={13} /> Số tiền khóa học không được vượt tiền đã nhận ({vnd(linkedPr?.received ?? 0)}).
              </div>
            )}
          </div>

          {!linkedPr && (
            <div className="field">
              <label>
                Tên khách hàng <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Họ và tên" />
            </div>
          )}

          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--surface-2)" }}>
            <div className="info-label" style={{ marginBottom: 10 }}>
              Khoá học đầu tiên
            </div>
            <div className="field-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
              <div className="field">
                <label>
                  UID học viên <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  value={firstUid}
                  onChange={(e) => setFirstUid(e.target.value)}
                  placeholder="UID CRM hoặc UID nội bộ"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                />
              </div>
              <div className="field">
                <label>
                  Số tiền khoá học <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <MoneyInput
                  value={amount}
                  onValueChange={setAmount}
                  placeholder="VD: 12.000.000"
                />
              </div>
            </div>
            <div className="field">
              <label>
                Gói học <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                list="ar-create-packages"
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                placeholder="Bắt đầu nhập hoặc chọn từ danh sách…"
              />
              <datalist id="ar-create-packages">
                {COURSE_PACKAGES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            style={!canSubmit ? { opacity: 0.4, cursor: "not-allowed" } : {}}
            onClick={() =>
              canSubmit &&
              onCreate({
                prId: linkedPrId,
                customerName: linkedPr ? linkedPr.name : customerName.trim(),
                uid: firstUid.trim(),
                packageName: pkgName.trim(),
                amount: amountNum,
              })
            }
          >
            <Icons.Plus size={14} /> Tạo AR &amp; mở chi tiết
          </button>
        </div>
      </div>
    </div>
  );
}

function ARStatusBadge({ status }: { status: ActiveRequestStatus }) {
  const meta = AR_STATUS_META[status as keyof typeof AR_STATUS_META] || AR_STATUS_META.pending_order;
  return (
    <span className={`badge ${meta.cls}`}>
      <span className="dot" />
      {meta.text}
    </span>
  );
}

// soft = nhắc mềm, KHÔNG chặn xuất HĐ (chỉ hiển thị lưu ý). Mặc định (không soft) = chặn.
type InvoiceBlocker = { key: string; text: string; soft?: boolean };

// Tên các quốc gia nước ngoài (khách OV chọn lúc tạo PR → lưu vào `province`).
// Tỉnh/TP Việt Nam không nằm trong danh sách này nên phân biệt được khách OV vs khách VN.
const FOREIGN_COUNTRY_NAMES = new Set(
  COUNTRIES.filter((c) => c.code !== "VN").map((c) => c.name)
);

/**
 * Điều kiện bắt buộc để Yêu cầu xuất hoá đơn (B4) cho 1 gói học.
 * Trả về danh sách thứ còn thiếu — rỗng nghĩa là đủ điều kiện.
 * Địa chỉ lấy theo chain course → PR (khớp cách invoice ghép địa chỉ ở paymentFlowUtils),
 * nên AR do kế toán tạo tay (có địa chỉ trên course) hay AR gắn PR đều check đúng.
 */
export function getInvoiceBlockers(
  course: ActiveCourse,
  pr: { province?: string; ward?: string; address?: string } | null
): InvoiceBlocker[] {
  const blockers: InvoiceBlocker[] = [];

  // Xuất HĐ KHÔNG phụ thuộc Order ID — luồng kích hoạt CRM (order_id) và luồng
  // xuất hoá đơn là 2 luồng tách biệt (khớp BE _derive_status, activation_routes.py).
  // Feedback chị Thu Hiền 5/2026: chỉ cần "tiền về" là xuất được HĐ.
  // Order ID chỉ là NHẮC MỀM (soft) — không chặn — để kế toán không quên kích hoạt CRM.
  if (!course.orderId?.trim()) {
    blockers.push({
      key: "order",
      soft: true,
      text: "Còn thiếu Order ID — vẫn xuất được hoá đơn nhưng cần bổ sung Order ID sau khi kích hoạt trên CRM.",
    });
  }
  if (!course.packageName?.trim()) {
    blockers.push({ key: "package", text: "Còn thiếu tên gói học — điền & lưu để xuất được hoá đơn." });
  }
  if (!(Number(course.amount) > 0)) {
    blockers.push({ key: "amount", text: "Còn thiếu số tiền gói học (> 0) — điền & lưu để xuất được hoá đơn." });
  }

  const province = (course.province ?? pr?.province ?? "").trim();
  const ward = (course.ward ?? pr?.ward ?? "").trim();
  const street = (course.address ?? pr?.address ?? "").trim();

  // Khách nước ngoài (OV): `province` là tên quốc gia → quy luật riêng,
  // chỉ cần có quốc gia là đủ, không bắt Phường/Xã + Số nhà.
  if (FOREIGN_COUNTRY_NAMES.has(province)) {
    return blockers;
  }

  const missingAddr: string[] = [];
  if (!province) missingAddr.push("Tỉnh/Thành");
  if (!ward) missingAddr.push("Phường/Xã");
  if (!street) missingAddr.push("Số nhà, đường");
  if (missingAddr.length) {
    blockers.push({
      key: "address",
      text: `PR khách hàng này chưa đủ địa chỉ — thiếu: ${missingAddr.join(", ")}. Bổ sung ở PR để xuất được hoá đơn.`,
    });
  }

  return blockers;
}

function ActivationDetailDrawer({
  ar,
  pr,
  requestsForAutofill,
  open,
  onClose,
  onUpdate,
  onPersist,
  onNavigateInvoice,
  onOpenPr,
  onGoToInvoice,
  readOnly = false,
}: {
  ar: ActiveRequest | null;
  pr: ReturnType<typeof usePaymentFlow>["requests"][0] | null;
  requestsForAutofill: PaymentRequest[];
  open: boolean;
  onClose: () => void;
  onUpdate: (next: ActiveRequest) => void;
  onPersist: (next: ActiveRequest) => Promise<{ ok: boolean; saved?: ActiveRequest; error?: string }>;
  onNavigateInvoice: () => void | Promise<void>;
  onOpenPr?: () => void;
  onGoToInvoice: (courseCode: string) => void | Promise<void>;
  readOnly?: boolean;
}) {
  // Khoá scroll nền khi drawer mở.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const [courseDrafts, setCourseDrafts] = useState<
    Record<string, { packageName: string; amount: string; orderId: string }>
  >({});
  const [uidDrafts, setUidDrafts] = useState<Record<number, { uid: string; phone: string; country: string }>>({});
  const [savingCourse, setSavingCourse] = useState<Record<string, boolean>>({});
  const [courseSaveErrors, setCourseSaveErrors] = useState<Record<string, string>>({});
  const [courseSavedAt, setCourseSavedAt] = useState<Record<string, number>>({});
  const [savingStructureKey, setSavingStructureKey] = useState<string | null>(null);
  const [structureError, setStructureError] = useState("");
  const [addUidDialogOpen, setAddUidDialogOpen] = useState(false);
  const [newUidValue, setNewUidValue] = useState("");
  const [newUidError, setNewUidError] = useState("");
  // Multi-con: UID mới của bé nào — "" = chưa chọn, "__new__" = gõ tên bé mới
  const [newUidChildName, setNewUidChildName] = useState("");
  const [newChildNameInput, setNewChildNameInput] = useState("");
  const arBodyScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [copiedArId, setCopiedArId] = useState(false);
  const notice = useNoticeCardCollapse();
  const copyResetTimer = useRef<number | null>(null);
  const uidTouchedRef = useRef<Record<number, { uid: boolean; phone: boolean; country: boolean }>>({});

  // T1.1 — credit-referral checkbox. Không cần RBAC FE vì Sale không có quyền
  // vào tab Kích hoạt khoá học (permissions[module3] = "none"). BE rbac.py
  // require_referral_credit() vẫn enforce server-side.
  const [creditInflight, setCreditInflight] = useState<Record<string, boolean>>({});
  const [creditError, setCreditError] = useState<Record<string, string>>({});
  const [uncreditDialog, setUncreditDialog] = useState<{
    open: boolean;
    uid: string;
    courseCode: string;
    side: "referee" | "referrer";
    reason: string;
  }>({ open: false, uid: "", courseCode: "", side: "referee", reason: "" });

  const creditKey = (uid: string, courseCode: string, side: "referee" | "referrer") =>
    `${uid}::${courseCode}::${side}`;

  const submitCredit = async (
    uid: string,
    courseCode: string,
    side: "referee" | "referrer",
    credited: boolean,
    reason?: string,
  ) => {
    if (!ar) return;
    const key = creditKey(uid, courseCode, side);
    setCreditInflight((p) => ({ ...p, [key]: true }));
    setCreditError((p) => ({ ...p, [key]: "" }));
    try {
      const { data } = await endpoints.activeRequests.creditReferral(ar.id, {
        uid,
        course_code: courseCode,
        side,
        credited,
        ...(reason ? { reason } : {}),
      });
      onUpdate(fromApiActiveRequest(data));
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      let msg = "Lỗi cập nhật";
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail
          .map((d) => (typeof d === "object" && d && "msg" in d ? String((d as { msg: unknown }).msg) : JSON.stringify(d)))
          .join("; ");
      } else if (detail) {
        msg = JSON.stringify(detail);
      }
      setCreditError((p) => ({ ...p, [key]: msg }));
    } finally {
      setCreditInflight((p) => ({ ...p, [key]: false }));
    }
  };

  const handleCreditToggle = (
    uid: string,
    courseCode: string,
    side: "referee" | "referrer",
    nextChecked: boolean,
  ) => {
    if (nextChecked) {
      void submitCredit(uid, courseCode, side, true);
    } else {
      setUncreditDialog({ open: true, uid, courseCode, side, reason: "" });
    }
  };
  const prByUid = useMemo(() => {
    const map = new Map<string, PaymentRequest>();
    for (const item of requestsForAutofill) {
      if (item.state === "cancelled") continue;
      const uid = String(item.uid || "").trim();
      if (!uid || map.has(uid)) continue;
      map.set(uid, item);
    }
    return map;
  }, [requestsForAutofill]);

  useEffect(() => {
    if (!ar) return;
    const next: Record<string, { packageName: string; amount: string; orderId: string }> = {};
    flatCourses(ar).forEach((c) => {
      next[c.courseCode] = {
        packageName: c.packageName || "",
        amount: c.amount ? String(c.amount) : "",
        orderId: c.orderId || "",
      };
    });
    // Keep unsaved draft while polling refreshes server payload.
    setCourseDrafts((prev) => {
      const merged: Record<string, { packageName: string; amount: string; orderId: string }> = { ...next };
      Object.entries(prev).forEach(([code, draftVal]) => {
        const serverVal = next[code];
        if (!serverVal) return;
        const packageDirty = draftVal.packageName !== serverVal.packageName;
        const amountDirty =
          (parseInt(draftVal.amount.replace(/[^\d]/g, ""), 10) || 0) !==
          (parseInt(serverVal.amount.replace(/[^\d]/g, ""), 10) || 0);
        const orderDirty = draftVal.orderId.trim() !== serverVal.orderId.trim();
        if (packageDirty || amountDirty || orderDirty) {
          merged[code] = draftVal;
        }
      });
      return merged;
    });
    const courseCodes = new Set(Object.keys(next));
    setSavingCourse((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([code]) => courseCodes.has(code)))
    );
    setCourseSaveErrors((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([code]) => courseCodes.has(code)))
    );
    setCourseSavedAt((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([code]) => courseCodes.has(code)))
    );
  }, [ar, open]);

  useEffect(() => {
    if (!ar) return;
    const next: Record<number, { uid: string; phone: string; country: string }> = {};
    ar.uids.forEach((u, idx) => {
      next[idx] = {
        uid: u.uid ?? "",
        phone: u.phone ?? "",
        country: u.country || "VN",
      };
    });
    setUidDrafts((prev) => {
      const merged: Record<number, { uid: string; phone: string; country: string }> = { ...next };
      Object.entries(prev).forEach(([idxRaw, draft]) => {
        const idx = Number(idxRaw);
        const server = next[idx];
        if (!server) return;
        const touched = uidTouchedRef.current[idx] || { uid: false, phone: false, country: false };
        merged[idx] = {
          uid: touched.uid ? draft.uid : server.uid,
          phone: touched.phone ? draft.phone : server.phone,
          country: touched.country ? draft.country : server.country,
        };
      });
      return merged;
    });
  }, [ar, open]);

  useEffect(() => {
    if (!open || !ar) return;
    let changed = false;
    const nextUids = ar.uids.map((u, idx) => {
      const uid = String(u.uid || "").trim();
      if (!uid) return u;
      const sourcePr =
        pr && (String(pr.uid || "").trim() === uid || idx === 0)
          ? pr
          : prByUid.get(uid);
      if (!sourcePr) return u;

      const sourcePhone = String(sourcePr.phone || "").replace(/\D/g, "").trim();
      const sourceCountry = String(sourcePr.country || "VN").trim() || "VN";

      // Auto-fill only missing values, never overwrite manual values.
      const nextPhone = u.phone?.trim() ? u.phone : sourcePhone;
      const nextCountry = u.country?.trim() ? u.country : sourceCountry;
      if (u.phone === nextPhone && (u.country || "VN") === nextCountry) return u;
      changed = true;
      return { ...u, phone: nextPhone, country: nextCountry };
    });

    if (changed) {
      // Keep first sync local to avoid full-payload races with autosave paths.
      onUpdate({ ...ar, uids: nextUids });
    }
  }, [open, ar, pr, prByUid, onUpdate]);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) {
        window.clearTimeout(copyResetTimer.current);
        copyResetTimer.current = null;
      }
    };
  }, [ar?.id]);

  useEffect(() => {
    uidTouchedRef.current = {};
  }, [ar?.id, open]);

  useEffect(() => {
    setStructureError("");
    setSavingStructureKey(null);
    setAddUidDialogOpen(false);
    setNewUidValue("");
    setNewUidError("");
  }, [ar?.id, open]);

  useEffect(() => {
    const el = arBodyScrollRef.current;
    if (!open || !el) {
      setCanScrollUp(false);
      setCanScrollDown(false);
      return;
    }
    const update = () => {
      setCanScrollUp(el.scrollTop > 4);
      setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    };
    update();
    el.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open, ar?.id, ar?.uids.length]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!ar) {
    return (
      <>
        <div className={`scrim ${open ? "open" : ""}`} onClick={onClose} style={{ pointerEvents: open ? "auto" : "none" }} />
        <aside className={`drawer ${open ? "open" : ""}`} />
      </>
    );
  }

  const enriched = enrichActiveRequest(ar);
  const courses = flatCourses(ar);
  const orderedCount = courses.filter((c) => c.orderId?.trim()).length;
  const invoicedCount = courses.filter((c) => c.invoiced).length;
  const total = enriched.total;
  const receivedGap = pr ? total - pr.received : 0;
  const receivedRemaining = pr ? remainingReceivedAmount(ar, pr) : 0;
  const receivedUsagePct = pr?.received ? Math.min(100, Math.round((total / pr.received) * 100)) : 0;
  const isStructureSaving = !!savingStructureKey;
  const locked = readOnly || isStructureSaving;
  const setUidDraftField = (
    uidIdx: number,
    field: "uid" | "phone" | "country",
    value: string
  ) => {
    const currentTouched = uidTouchedRef.current[uidIdx] || { uid: false, phone: false, country: false };
    uidTouchedRef.current[uidIdx] = { ...currentTouched, [field]: true };
    setUidDrafts((prev) => ({
      ...prev,
      [uidIdx]: {
        uid: prev[uidIdx]?.uid ?? ar.uids[uidIdx]?.uid ?? "",
        phone: prev[uidIdx]?.phone ?? ar.uids[uidIdx]?.phone ?? "",
        country: prev[uidIdx]?.country ?? ar.uids[uidIdx]?.country ?? "VN",
        [field]: value,
      },
    }));
  };
  const saveUidHeader = async (uidIdx: number) => {
    const base = ar.uids[uidIdx];
    if (!base) return;
    const draft = uidDrafts[uidIdx];
    if (!draft) return;
    const nextUid = draft.uid.trim();
    const nextPhone = draft.phone.replace(/[^\d]/g, "");
    const nextCountry = (draft.country || "VN").trim() || "VN";
    if (
      nextUid === base.uid &&
      nextPhone === (base.phone || "") &&
      nextCountry === (base.country || "VN")
    ) {
      return;
    }
    const result = await onPersist({
      ...ar,
      uids: ar.uids.map((u, i) =>
        i === uidIdx ? { ...u, uid: nextUid, phone: nextPhone, country: nextCountry } : u
      ),
    });
    if (!result.ok) return;
    uidTouchedRef.current[uidIdx] = { uid: false, phone: false, country: false };
  };

  const syncUidFromPr = async (uidIdx: number) => {
    const base = ar.uids[uidIdx];
    const target = String(pr?.uid || "").trim();
    if (!base || !target || String(base.uid || "").trim() === target) return;
    // G-UID3: chỉ đổi chuỗi uid, giữ nguyên phone/country/courses.
    const result = await onPersist({
      ...ar,
      uids: ar.uids.map((u, i) => (i === uidIdx ? { ...u, uid: target } : u)),
    });
    if (!result.ok) return;
  };

  const persistStructure = async (actionKey: string, next: ActiveRequest) => {
    setSavingStructureKey(actionKey);
    setStructureError("");
    const result = await onPersist(next);
    setSavingStructureKey(null);
    if (!result.ok) {
      setStructureError(result.error || "Không lưu được thay đổi cấu trúc Active Request.");
      return false;
    }
    return true;
  };

  const removeCourse = async (uidIdx: number, courseIdx: number) => {
    const u = ar.uids[uidIdx];
    if (u.courses.length === 1 && ar.uids.length === 1) return;
    const nextUid: ActiveUidGroup = { ...u, courses: u.courses.filter((_, j) => j !== courseIdx) };
    const nextUids =
      nextUid.courses.length === 0
        ? ar.uids.filter((_, i) => i !== uidIdx)
        : ar.uids.map((u2, i) => (i === uidIdx ? nextUid : u2));
    await persistStructure(`remove-course-${uidIdx}-${courseIdx}`, { ...ar, uids: nextUids });
  };

  const addCourse = async (uidIdx: number) => {
    const newCode = nextCourseCode(ar);
    const u = ar.uids[uidIdx];
    const remaining = pr ? receivedRemaining : 0;
    const nextUid: ActiveUidGroup = {
      ...u,
      courses: [
        ...u.courses,
        { courseCode: newCode, packageName: "", amount: remaining || 0, orderId: "", invoiced: false },
      ],
    };
    await persistStructure(`add-course-${uidIdx}`, {
      ...ar,
      uids: ar.uids.map((u2, i) => (i === uidIdx ? nextUid : u2)),
    });
  };

  const removeUid = async (uidIdx: number) => {
    if (ar.uids.length <= 1) return;
    await persistStructure(`remove-uid-${uidIdx}`, {
      ...ar,
      uids: ar.uids.filter((_, i) => i !== uidIdx),
    });
  };

  const addUid = async (nextUidValue: string, childName?: string) => {
    const newCode = nextCourseCode(ar);
    const remaining = pr ? receivedRemaining : 0;
    return await persistStructure("add-uid", {
      ...ar,
      uids: [
        ...ar.uids,
        {
          uid: nextUidValue,
          // Multi-con: gắn tên bé vào block — Zalo/hiển thị theo đúng bé
          ...(childName ? { name: childName } : {}),
          phone: "",
          country: "VN",
          courses: [{ courseCode: newCode, packageName: "", amount: remaining || 0, orderId: "", invoiced: false }],
        },
      ],
    });
  };

  const openAddUidDialog = () => {
    if (locked) return;
    setNewUidValue("");
    setNewUidError("");
    setNewUidChildName("");
    setNewChildNameInput("");
    setAddUidDialogOpen(true);
  };

  // Multi-con: PR liên kết có ≥2 bé → bắt buộc chọn UID này của bé nào
  const prChildren = (pr?.children ?? []).filter((c) => c.name);
  const requireChildPick = prChildren.length >= 2;

  const submitAddUid = async () => {
    const uid = newUidValue.trim();
    if (!uid) {
      setNewUidError("UID không được để trống.");
      return;
    }
    if (ar.uids.some((u) => String(u.uid || "").trim() === uid)) {
      setNewUidError("UID này đã tồn tại trong Active Request.");
      return;
    }
    const childName = newUidChildName === "__new__" ? newChildNameInput.trim() : newUidChildName;
    if (requireChildPick && !childName) {
      setNewUidError("PR này có nhiều bé — hãy chọn UID này của bé nào.");
      return;
    }
    const ok = await addUid(uid, childName || undefined);
    if (!ok) return;
    setAddUidDialogOpen(false);
    setNewUidValue("");
    setNewUidError("");
    setNewUidChildName("");
    setNewChildNameInput("");
  };

  const copyArId = async () => {
    const text = ar.id;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (!ok) return;
    setCopiedArId(true);
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
    copyResetTimer.current = window.setTimeout(() => {
      setCopiedArId(false);
      copyResetTimer.current = null;
    }, 1400);
  };

  const getCourseFromAr = (courseCode: string) => {
    for (const uid of ar.uids) {
      const found = uid.courses.find((c) => c.courseCode === courseCode);
      if (found) return found;
    }
    return null;
  };

  const getCourseDraft = (course: ActiveCourse) => {
    return courseDrafts[course.courseCode] ?? {
      packageName: course.packageName || "",
      amount: course.amount ? String(course.amount) : "",
      orderId: course.orderId || "",
    };
  };

  const isCourseDirty = (courseCode: string) => {
    const source = getCourseFromAr(courseCode);
    if (!source) return false;
    const draft = getCourseDraft(source);
    const draftAmount = parseInt(draft.amount.replace(/[^\d]/g, ""), 10) || 0;
    return (
      draft.packageName !== (source.packageName || "") ||
      draftAmount !== (source.amount || 0) ||
      draft.orderId.trim() !== (source.orderId || "").trim()
    );
  };

  const hasUnsavedCourseDrafts = () => {
    return flatCourses(ar).some((c) => isCourseDirty(c.courseCode));
  };

  const requestCloseDrawer = () => {
    if (!hasUnsavedCourseDrafts()) {
      onClose();
      return;
    }
    const accepted = window.confirm("Bạn có thay đổi chưa lưu. Đóng sẽ mất các thay đổi này. Tiếp tục đóng?");
    if (!accepted) return;
    onClose();
  };

  const scrollDrawerBy = (delta: number) => {
    const el = arBodyScrollRef.current;
    if (!el) return;
    el.scrollBy({ top: delta, behavior: "smooth" });
  };

  const saveCourseRow = async (uidIdx: number, courseIdx: number, courseCode: string) => {
    const source = ar.uids[uidIdx]?.courses[courseIdx];
    if (!source) return;
    const draft = getCourseDraft(source);
    const nextPackage = draft.packageName.trim();
    const nextAmount = parseInt(draft.amount.replace(/[^\d]/g, ""), 10) || 0;
    const nextOrderId = draft.orderId.trim();
    if (!canAllocateCourseAmount(ar, pr, courseCode, nextAmount)) {
      setCourseSaveErrors((prev) => ({
        ...prev,
        [courseCode]: `Tổng courses không được vượt số tiền đã nhận (${vnd(pr?.received || 0)}).`,
      }));
      return;
    }
    if (
      nextPackage === (source.packageName || "") &&
      nextAmount === (source.amount || 0) &&
      nextOrderId === (source.orderId || "")
    ) {
      setCourseSaveErrors((prev) => ({ ...prev, [courseCode]: "" }));
      return;
    }

    setSavingCourse((prev) => ({ ...prev, [courseCode]: true }));
    setCourseSaveErrors((prev) => ({ ...prev, [courseCode]: "" }));
    const next: ActiveRequest = {
      ...ar,
      uids: ar.uids.map((u, i) => {
        if (i !== uidIdx) return u;
        return {
          ...u,
          courses: u.courses.map((c, j) =>
            j === courseIdx
              ? { ...c, packageName: nextPackage, amount: nextAmount, orderId: nextOrderId }
              : c
          ),
        };
      }),
    };
    const result = await onPersist(next);
    setSavingCourse((prev) => ({ ...prev, [courseCode]: false }));

    if (!result.ok) {
      setCourseSaveErrors((prev) => ({
        ...prev,
        [courseCode]: result.error || "Không lưu được thay đổi lên máy chủ.",
      }));
      return;
    }

    setCourseSaveErrors((prev) => ({ ...prev, [courseCode]: "" }));
    setCourseSavedAt((prev) => ({ ...prev, [courseCode]: Date.now() }));
  };

  return (
    <>
      <div className={`scrim ${open ? "open" : ""}`} onClick={requestCloseDrawer} style={{ pointerEvents: open ? "auto" : "none" }} />
      <aside className={`drawer ar-drawer ${open ? "open" : ""}`}>
        <div className="drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div style={{ flexShrink: 0 }}>
              <span className="ar-id-pill">{ar.id}</span>
              <div className="drawer-status-mobile">
                <ARStatusBadge status={enriched.status} />
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{ar.customerName}</div>
              <div className="drawer-meta" style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                {pr ? (
                  <>
                    Liên kết <strong style={{ color: "var(--primary-700)" }}>{pr.id}</strong> ·{" "}
                  </>
                ) : (
                  <>Standalone · </>
                )}
                Tạo bởi <strong style={{ color: "var(--text-2)" }}>{ar.createdBy || ar.saleName || "—"}</strong> · {ar.createdAt}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <ARStatusBadge status={enriched.status} />
            <button type="button" className="drawer-close" onClick={requestCloseDrawer}>
              <Icons.Close size={16} />
            </button>
            <button type="button" className="drawer-back-mobile" onClick={requestCloseDrawer}>
              <Icons.ChevronLeft size={14} /> Quay lại
            </button>
          </div>
        </div>

        <div className="drawer-body ar-drawer-body" ref={arBodyScrollRef}>
          {enriched.holdActivation && enriched.status !== "activated" && enriched.status !== "invoiced" && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              border: "1px solid #ffd54f", background: "#fffde7",
              fontSize: 12.5, marginBottom: 12,
              display: "flex", alignItems: "flex-start", gap: 8,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⏸</span>
              <div>
                <strong style={{ color: "#f57f17" }}>PH chưa muốn kích hoạt</strong>
                <div style={{ marginTop: 2, color: "var(--text-2)" }}>
                  {enriched.holdNote ? `“${enriched.holdNote}”` : "(sale không ghi lý do)"}
                </div>
              </div>
            </div>
          )}
          <div className="summary-row" style={{ gridTemplateColumns: pr ? "repeat(5, 1fr)" : "repeat(4, 1fr)" }}>
            <div className="summary">
              <div className="summary-label">Tổng giá trị courses</div>
              <div className="summary-value" style={{ color: "var(--money)" }}>
                {vnd(total)}
              </div>
            </div>
            {pr && (
              <div
                className={`summary ${
                  receivedGap === 0 ? "is-delta-done" : receivedGap > 0 ? "is-delta-short" : "is-delta-over"
                }`}
              >
                <div className="summary-label">So với đã nhận</div>
                <div className="summary-value">
                  {receivedGap === 0
                    ? "✓ Khớp"
                    : receivedGap > 0
                      ? `Thiếu ${vnd(receivedGap)}`
                      : `Dư ${vnd(Math.abs(receivedGap))}`}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>
                  PR đã nhận {vnd(pr.received)}
                </div>
              </div>
            )}
            <div className="summary">
              <div className="summary-label">Số UID · Khoá học</div>
              <div className="summary-value">
                <span style={{ color: "var(--primary-700)" }}>{ar.uids.length}</span>
                <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>·</span>
                <span>{courses.length}</span>
              </div>
            </div>
            <div className="summary">
              <div className="summary-label">Order ID đã điền</div>
              <div className="summary-value">
                <span
                  style={{
                    color:
                      orderedCount === courses.length && courses.length > 0
                        ? "var(--success-text)"
                        : "var(--warning-text)",
                  }}
                >
                  {orderedCount}
                </span>
                <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>/</span>
                <span style={{ color: "var(--text-2)" }}>{courses.length}</span>
              </div>
            </div>
            <div className="summary">
              <div className="summary-label">Đã xuất hoá đơn</div>
              <div className="summary-value">
                <span style={{ color: "var(--success-text)" }}>{invoicedCount}</span>
                <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>/</span>
                <span style={{ color: "var(--text-2)" }}>{courses.length}</span>
              </div>
            </div>
          </div>

          {pr && (
            <div className={`allocation-progress ${receivedGap > 0 ? "is-over" : ""}`}>
              <div className="allocation-progress-head">
                <span>Phân bổ tiền đã nhận</span>
                <strong>
                  Đã dùng {vnd(total)} / Đã nhận {vnd(pr.received)}
                </strong>
              </div>
              <div className="prog-bar" aria-label="Tiến độ phân bổ tiền đã nhận">
                <div
                  className={`prog-fill ${
                    receivedGap === 0 && pr.received > 0 ? "is-done" : receivedGap > 0 ? "is-over" : "is-mid"
                  }`}
                  style={{ width: `${receivedUsagePct}%` }}
                />
              </div>
              <div className="allocation-progress-meta">
                <span>Còn lại {vnd(receivedRemaining)}</span>
                {receivedGap > 0 ? <span className="danger">Vượt {vnd(receivedGap)}</span> : null}
              </div>
            </div>
          )}

          {pr &&
            (receivedGap === 0 && pr.received > 0 ? (
              <div className="match-ok">
                <Icons.CheckCircle size={16} />
                <span>
                  Tổng courses (<strong>{vnd(total)}</strong>) khớp với <strong>{vnd(pr.received)}</strong> đã nhận từ
                  PR — sẵn sàng cho B4.
                </span>
              </div>
            ) : receivedGap > 0 ? (
              <div className="match-warning">
                <Icons.AlertCircle size={16} />
                <span>
                  Tổng courses (<strong>{vnd(total)}</strong>) đang <strong>nhiều hơn</strong> tiền đã nhận (
                  {vnd(pr.received)}) — thiếu <strong>{vnd(receivedGap)}</strong>.
                </span>
              </div>
            ) : (
              <div
                className="match-warning"
                style={{ background: "var(--info-bg)", borderColor: "#a8c5f0", color: "var(--info-text)" }}
              >
                <Icons.AlertCircle size={16} />
                <span>
                  Tổng courses (<strong>{vnd(total)}</strong>) <strong>ít hơn</strong> tiền đã nhận (
                  {vnd(pr.received)}) — phần dư <strong>{vnd(Math.abs(receivedGap))}</strong> giữ lại cấn trừ PR sau.
                </span>
              </div>
            ))}

          {pr ? (
            <div className="panel" style={{ padding: 14 }}>
              <div className="panel-head" style={{ marginBottom: 10 }}>
                <h4>
                  <Icons.Wallet size={15} /> Payment Request liên kết
                </h4>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {onOpenPr && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={onOpenPr}>
                      <Icons.ChevronRight size={13} /> Mở PR
                    </button>
                  )}
                  <HdsdLink moduleSlug="module3" topicSlug="tao-active-request" />
                </div>
              </div>
              <div className="act-course-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                <div className="info-cell">
                  <div className="info-label">PR-ID</div>
                  <div className="info-value mono">
                    <span className="pr-id-pill">{pr.id}</span>
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Tổng dự kiến</div>
                  <div className="info-value money">{vnd(pr.target)}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Đã nhận</div>
                  <div className="info-value money" style={{ color: "var(--success-text)" }}>
                    {vnd(pr.received)}
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Số lần TT</div>
                  <div className="info-value">
                    {pr.doneCount}/{pr.totalCount}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: "var(--surface-3)",
                  color: "var(--text-3)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icons.AlertCircle size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Active Request standalone</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                  AR không gắn Payment Request — admin nhập từ kênh khác.
                </div>
              </div>
            </div>
          )}

          <div className="ar-uid-list">
            {ar.uids.map((uidObj, uidIdx) => {
              const uidKey = uidObj.uid.trim();
              const isUidFromPr = !!uidKey && (
                (!!pr && uidKey === String(pr.uid || "").trim()) || !!prByUid.get(uidKey)
              );
              const uidSync = getUidSyncState(uidKey, pr?.uid, {
                matchedOtherPr: !!prByUid.get(uidKey),
                singleUid: ar.uids.length === 1,
              });
              const draftUid = uidDrafts[uidIdx] ?? {
                uid: uidObj.uid ?? "",
                phone: uidObj.phone ?? "",
                country: uidObj.country || "VN",
              };
              const isUidDirty =
                draftUid.uid.trim() !== uidObj.uid ||
                draftUid.phone.replace(/[^\d]/g, "") !== (uidObj.phone || "") ||
                (draftUid.country || "VN") !== (uidObj.country || "VN");
              return (
              <div key={uidObj.uid || `new-uid-${uidIdx}`} className="uid-group">
              <div className="uid-group-head">
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 700,
                  }}
                >
                  UID #{uidIdx + 1}
                </div>
                {uidObj.name && (
                  <span
                    className="badge"
                    title="UID này của bé"
                    style={{ background: "var(--primary-50)", color: "var(--primary-700)", whiteSpace: "nowrap" }}
                  >
                    {uidObj.name}
                  </span>
                )}
                <input
                  className="uid-mono"
                  value={draftUid.uid}
                  onChange={(e) => setUidDraftField(uidIdx, "uid", e.target.value)}
                  placeholder="Nhập UID học viên…"
                  style={{ width: 180 }}
                />
                <span style={{ width: 1, height: 22, background: "var(--border-strong)" }} />
                <span
                  style={{
                    fontSize: 10.5,
                    color: "var(--text-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontWeight: 600,
                  }}
                >
                  SĐT
                </span>
                <CountryCombo
                  value={draftUid.country || "VN"}
                  onChange={(v) => setUidDraftField(uidIdx, "country", v)}
                />
                <input
                  value={draftUid.phone}
                  onChange={(e) => setUidDraftField(uidIdx, "phone", e.target.value.replace(/\D/g, ""))}
                  placeholder={`Chỉ nhập phần số, VD: ${findCountry(draftUid.country).exampleLocal.replace(/\s/g, "")}`}
                  style={{
                    width: 180,
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 12.5,
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "7px 10px",
                    outline: "none",
                    background: "white",
                  }}
                />
                {isUidFromPr && (
                  <span className="badge is-soft-primary" style={{ fontSize: 10 }}>
                    <Icons.Check size={10} strokeWidth={2.5} /> UID từ PR
                  </span>
                )}
                {uidSync.kind === "diverged" && (
                  <span
                    className="badge"
                    title={`UID thông tin khách (B1) hiện là ${uidSync.prUid} — khác UID đang lưu ở bản kích hoạt. Có thể sale đã sửa UID sau khi tạo bản kích hoạt.`}
                    style={{
                      background: "var(--danger-50, #fef2f2)",
                      color: "var(--danger-700, #b91c1c)",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Icons.AlertCircle size={11} strokeWidth={2.5} /> UID lệch với TT khách: {uidSync.prUid}
                  </span>
                )}
                {uidSync.kind === "diverged" && uidSync.canOneClick && !locked && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => void syncUidFromPr(uidIdx)}
                    title={`Ghi ${uidSync.prUid} (UID thông tin khách) đè lên UID bản kích hoạt`}
                  >
                    <Icons.RefreshCw size={12} strokeWidth={2.5} /> Đồng bộ từ PR
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void saveUidHeader(uidIdx)}
                  disabled={!isUidDirty || locked}
                  title={isUidDirty ? "Lưu UID/SĐT/quốc gia lên Supabase" : "Chưa có thay đổi"}
                >
                  <Icons.Check size={12} strokeWidth={2.5} /> Lưu
                </button>
                <span className="spacer" />
                <span className="num-pill">{uidObj.courses.length} khoá</span>
                {ar.uids.length > 1 && !readOnly && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ color: "var(--danger)" }}
                    disabled={locked}
                    onClick={() => void removeUid(uidIdx)}
                  >
                    <Icons.XCircle size={13} /> Xoá UID
                  </button>
                )}
              </div>
              <div className="course-table">
              <div className="course-row-head">
                <span />
                <span>Gói học</span>
                <span>Số tiền</span>
                <span>Course Code</span>
                <span>Order ID</span>
                <span>Lưu</span>
                <span>Yêu cầu xuất</span>
                <span />
              </div>
              {uidObj.courses.map((course, courseIdx) => (
                <Fragment key={course.courseCode}>
                <div className="course-row">
                  <div className="idx-bubble">{courseIdx + 1}</div>
                  <div className="pkg-name">
                    <input
                      list={`packages-${ar.id}`}
                      value={(courseDrafts[course.courseCode]?.packageName ?? course.packageName) || ""}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setCourseDrafts((prev) => ({
                          ...prev,
                          [course.courseCode]: {
                            packageName: nextVal,
                            amount: prev[course.courseCode]?.amount ?? (course.amount ? String(course.amount) : ""),
                            orderId: prev[course.courseCode]?.orderId ?? (course.orderId || ""),
                          },
                        }));
                        setCourseSaveErrors((prev) => ({ ...prev, [course.courseCode]: "" }));
                        setCourseSavedAt((prev) => ({ ...prev, [course.courseCode]: 0 }));
                      }}
                      placeholder="VD: 2/W- NEW 48 US-UK+2 HN"
                    />
                  </div>
                  <MoneyInput
                    className="amt-input"
                    value={courseDrafts[course.courseCode]?.amount ?? (course.amount ? String(course.amount) : "")}
                    onValueChange={(v) => {
                      setCourseDrafts((prev) => ({
                        ...prev,
                        [course.courseCode]: {
                          packageName: prev[course.courseCode]?.packageName ?? (course.packageName || ""),
                          amount: v,
                          orderId: prev[course.courseCode]?.orderId ?? (course.orderId || ""),
                        },
                      }));
                      setCourseSaveErrors((prev) => ({ ...prev, [course.courseCode]: "" }));
                      setCourseSavedAt((prev) => ({ ...prev, [course.courseCode]: 0 }));
                    }}
                    placeholder="0"
                  />
                  <span className="code-chip cc">
                    <Icons.Sparkle size={11} /> {course.courseCode}
                  </span>
                  <input
                    className={`order-input ${(courseDrafts[course.courseCode]?.orderId ?? course.orderId ?? "").trim() ? "has" : ""}`}
                    placeholder="ORD-XXXX-XXXXX"
                    value={courseDrafts[course.courseCode]?.orderId ?? course.orderId ?? ""}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCourseDrafts((prev) => ({
                        ...prev,
                        [course.courseCode]: {
                          packageName: prev[course.courseCode]?.packageName ?? (course.packageName || ""),
                          amount: prev[course.courseCode]?.amount ?? (course.amount ? String(course.amount) : ""),
                          orderId: next,
                        },
                      }));
                      setCourseSaveErrors((prev) => ({ ...prev, [course.courseCode]: "" }));
                      setCourseSavedAt((prev) => ({ ...prev, [course.courseCode]: 0 }));
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 136 }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={locked || !isCourseDirty(course.courseCode) || !!savingCourse[course.courseCode]}
                      onClick={() => void saveCourseRow(uidIdx, courseIdx, course.courseCode)}
                      title={
                        isCourseDirty(course.courseCode)
                          ? "Lưu gói học, số tiền và Order ID lên Supabase"
                          : "Chưa có thay đổi"
                      }
                    >
                      <Icons.Check size={11} strokeWidth={2.5} /> {savingCourse[course.courseCode] ? "Đang lưu..." : "Lưu"}
                    </button>
                    {courseSaveErrors[course.courseCode] ? (
                      <span style={{ fontSize: 10.5, color: "var(--danger)", whiteSpace: "nowrap" }} title={courseSaveErrors[course.courseCode]}>
                        Lỗi lưu
                      </span>
                    ) : isCourseDirty(course.courseCode) ? (
                      <span style={{ fontSize: 10.5, color: "var(--warning-text)", whiteSpace: "nowrap" }}>Chưa lưu</span>
                    ) : courseSavedAt[course.courseCode] ? (
                      <span style={{ fontSize: 10.5, color: "var(--success-text)", whiteSpace: "nowrap" }}>
                        {(courseDrafts[course.courseCode]?.orderId ?? course.orderId ?? "").trim()
                          ? "Đã lưu · Sổ DT"
                          : "Đã lưu"}
                      </span>
                    ) : null}
                  </div>
                  <div className="invoice-cell">
                    {course.invoiced ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span
                          className="invoice-chip"
                          title="Đã xuất HĐ"
                        >
                          <Icons.Doc size={11} /> {course.invoiceId}
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          title="Tải ZIP 3 file Excel kê khai thuế"
                          onClick={(e) => {
                            e.stopPropagation();
                            const row: InvoiceRow = {
                              key: `${ar.id}::${course.courseCode}`,
                              ar,
                              pr,
                              uidObj,
                              uidIdx,
                              courseIdx,
                              course,
                            };
                            void downloadTaxInvoiceZip([row]);
                          }}
                        >
                          <Icons.Download size={12} /> Tải file thuế
                        </button>
                      </div>
                    ) : course.invoiceRequestedAt ? (
                      <button type="button" className="btn-invoice" disabled>
                        <Icons.CheckCircle size={12} /> Đã yêu cầu
                      </button>
                    ) : (() => {
                      const blockers = getInvoiceBlockers(course, pr);
                      const blocked = blockers.some((b) => !b.soft);
                      return (
                        <button
                          type="button"
                          className="btn-invoice"
                          disabled={blocked}
                          style={blocked ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                          title={
                            blocked
                              ? `Chưa xuất được — còn thiếu: ${blockers.map((b) => b.text).join(" ")}`
                              : "Yêu cầu xuất hoá đơn"
                          }
                          onClick={() => {
                            if (blocked) return;
                            void onGoToInvoice(course.courseCode);
                          }}
                        >
                          <Icons.Doc size={12} /> Yêu cầu xuất
                        </button>
                      );
                    })()}
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      className="remove-btn"
                      disabled={locked || (ar.uids.length === 1 && uidObj.courses.length === 1)}
                      onClick={() => void removeCourse(uidIdx, courseIdx)}
                      title={
                        ar.uids.length === 1 && uidObj.courses.length === 1
                          ? "Không thể xoá khoá học cuối cùng"
                          : "Xoá khoá học"
                      }
                    >
                      <Icons.Close size={14} />
                    </button>
                  )}
                </div>
                {(() => {
                  // Card cảnh báo thông minh: chỉ hiện khi gói chưa xuất/chưa yêu cầu HĐ và còn điều kiện thiếu.
                  if (course.invoiced || course.invoiceRequestedAt) return null;
                  const blockers = getInvoiceBlockers(course, pr);
                  if (!blockers.length) return null;
                  // Có blocker cứng → tông cảnh báo "chưa xuất được". Chỉ còn nhắc mềm → tông lưu ý (xuất được).
                  const hasHard = blockers.some((b) => !b.soft);
                  const sorted = [...blockers].sort((a, b) => Number(a.soft ?? false) - Number(b.soft ?? false));
                  const textColor = hasHard ? "var(--caution-text, #92400e)" : "var(--info-text, #1e40af)";
                  // G5: courseCode rỗng (gói mới chưa lưu) → dùng index để không trùng key.
                  const cardKey = course.courseCode
                    ? `${ar.id}::${course.courseCode}`
                    : `${ar.id}::idx${courseIdx}`;
                  const collapsed = notice.isCollapsed(cardKey);
                  return (
                    <div
                      style={{
                        margin: "6px 12px 2px",
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: hasHard ? "var(--warning-bg, #fffbeb)" : "var(--info-bg, #eff6ff)",
                        border: `1px solid ${hasHard ? "var(--warning-border, #fde68a)" : "var(--info-border, #bfdbfe)"}`,
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={!collapsed}
                        onClick={() => notice.toggle(cardKey)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            notice.toggle(cardKey);
                          }
                        }}
                        title={collapsed ? "Bấm để xem chi tiết" : "Bấm để thu gọn"}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          fontSize: 12.5, fontWeight: 700, color: textColor,
                          marginBottom: collapsed ? 0 : 4,
                          cursor: "pointer", userSelect: "none",
                        }}
                      >
                        <Icons.AlertCircle size={13} />
                        <span style={{ flex: 1 }}>{hasHard ? "Chưa xuất được hoá đơn — còn thiếu:" : "Lưu ý:"}</span>
                        <span
                          style={{
                            display: "inline-flex",
                            transition: "transform 0.15s",
                            transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
                          }}
                        >
                          <Icons.ChevronDown size={14} />
                        </span>
                      </div>
                      {!collapsed && (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: textColor, lineHeight: 1.5 }}>
                          {sorted.map((b) => (
                            <li key={b.key}>{b.text}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  const auditLine = activationAuditText(course);
                  return auditLine ? (
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--success-text, #15803d)", marginTop: 4, paddingLeft: 16, paddingRight: 16 }}>
                      ✓ {auditLine}
                    </div>
                  ) : null;
                })()}
                {course.leadSource === "gioi_thieu" &&
                  ((course.bonusSessionsReferee ?? 0) > 0 || (course.bonusSessionsReferrer ?? 0) > 0) && (() => {
                    const rs = getReferralStatus(course);
                    const panelStyle = REFERRAL_STATUS_PANEL_STYLE[rs];
                    const headerText = REFERRAL_STATUS_HEADER[rs];
                    const refereeKey = creditKey(uidObj.uid || "", course.courseCode, "referee");
                    const referrerKey = creditKey(uidObj.uid || "", course.courseCode, "referrer");
                    const courseActivated = Boolean(course.orderId?.trim());
                    const lockedTooltip = !courseActivated
                      ? "Cần điền Order ID (kích hoạt khoá) trước khi tick cộng buổi"
                      : "";
                    return (
                      <div style={{ padding: "10px 12px 10px 16px", borderRadius: 8, marginTop: 6, marginLeft: 12, marginRight: 12, ...panelStyle }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1, #111)", marginBottom: 6 }}>{headerText}</div>
                        {!courseActivated && (
                          <div style={{ fontSize: 12, color: "var(--caution-text, #92400e)", marginBottom: 6, fontStyle: "italic" }}>
                            Chưa kích hoạt khoá (chưa điền Order ID) — không thể tick cộng buổi.
                          </div>
                        )}
                        {(course.bonusSessionsReferee ?? 0) > 0 && (
                          <div style={{ fontSize: 13, color: "var(--text-1, #111)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <label
                              style={{ display: "flex", alignItems: "center", gap: 6, cursor: courseActivated ? "pointer" : "not-allowed", opacity: courseActivated ? 1 : 0.55 }}
                              title={lockedTooltip}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(course.refereeCreditedAt)}
                                disabled={!courseActivated || Boolean(creditInflight[refereeKey])}
                                onChange={(e) => handleCreditToggle(uidObj.uid || "", course.courseCode, "referee", e.target.checked)}
                              />
                              <span style={{ fontWeight: 600 }}>Đã cộng buổi</span>
                            </label>
                            <span style={{ flex: 1 }}>
                              Người được giới thiệu (UID: {uidObj.uid || "—"}) — cộng thêm {course.bonusSessionsReferee} buổi.
                              {" "}
                              {course.refereeCreditedAt
                                ? <span style={{ color: "var(--success-text)", fontWeight: 600 }}>Đã cộng lúc {formatPaymentDateFull(course.refereeCreditedAt)}{course.refereeCreditedBy ? ` · ${course.refereeCreditedBy}` : ""}</span>
                                : <span style={{ color: "var(--text-3)" }}>Chưa cộng</span>}
                              {creditError[refereeKey] && (
                                <div style={{ color: "var(--danger)", fontSize: 11.5, marginTop: 2 }}>{creditError[refereeKey]}</div>
                              )}
                            </span>
                          </div>
                        )}
                        {(course.bonusSessionsReferrer ?? 0) > 0 && (
                          <div style={{ fontSize: 13, color: "var(--text-1, #111)", marginTop: 6, display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <label
                              style={{ display: "flex", alignItems: "center", gap: 6, cursor: courseActivated ? "pointer" : "not-allowed", opacity: courseActivated ? 1 : 0.55 }}
                              title={lockedTooltip}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(course.referrerCreditedAt)}
                                disabled={!courseActivated || Boolean(creditInflight[referrerKey])}
                                onChange={(e) => handleCreditToggle(uidObj.uid || "", course.courseCode, "referrer", e.target.checked)}
                              />
                              <span style={{ fontWeight: 600 }}>Đã cộng buổi</span>
                            </label>
                            <span style={{ flex: 1 }}>
                              Người giới thiệu (UID: {course.referrerUid || "—"}) — cộng thêm {course.bonusSessionsReferrer} buổi.
                              {" "}
                              {course.referrerCreditedAt
                                ? <span style={{ color: "var(--success-text)", fontWeight: 600 }}>Đã cộng lúc {formatPaymentDateFull(course.referrerCreditedAt)}{course.referrerCreditedBy ? ` · ${course.referrerCreditedBy}` : ""}</span>
                                : <span style={{ color: "var(--text-3)" }}>Chưa cộng</span>}
                              {creditError[referrerKey] && (
                                <div style={{ color: "var(--danger)", fontSize: 11.5, marginTop: 2 }}>{creditError[referrerKey]}</div>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()
                }
                </Fragment>
              ))}
              </div>
              <datalist id={`packages-${ar.id}`}>
                {COURSE_PACKAGES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <div className="uid-group-foot">
                {!readOnly && (
                  <button type="button" className="uid-add-link" onClick={() => void addCourse(uidIdx)} disabled={locked}>
                    <Icons.Plus size={13} /> {isStructureSaving ? "Đang lưu..." : "Thêm gói học cho UID này"}
                  </button>
                )}
                <span style={{ color: "var(--text-3)" }}>
                  Tổng UID này:{" "}
                  <strong style={{ color: "var(--text)" }}>
                    {vnd(uidObj.courses.reduce((s, c) => s + (c.amount || 0), 0))}
                  </strong>
                </span>
              </div>
              </div>
            )})}
          </div>

          {structureError && (
            <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6, marginBottom: 4 }}>
              {structureError}
            </div>
          )}

          {!readOnly && (
            <button type="button" className="add-uid-card" onClick={openAddUidDialog} disabled={locked}>
              <Icons.Plus size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
              {isStructureSaving ? "Đang lưu..." : "Thêm UID khác (cho phép 1 PR mua nhiều khoá cho nhiều người)"}
            </button>
          )}

          {addUidDialogOpen && !readOnly && (
            <div className="gmv-prototype-modal-scrim" onClick={() => !locked && setAddUidDialogOpen(false)}>
              <div
                className="modal"
                style={{ width: "min(420px, 92vw)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-head">
                  <h3>Thêm UID mới</h3>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <HdsdLink moduleSlug="module3" topicSlug="them-uid-them-goi" />
                    <button
                      type="button"
                      className="drawer-close"
                      onClick={() => !locked && setAddUidDialogOpen(false)}
                      disabled={locked}
                    >
                      <Icons.Close size={16} />
                    </button>
                  </div>
                </div>
                <div className="modal-body">
                  <div className="field">
                    <label>UID <span style={{ color: "var(--danger)" }}>*</span></label>
                    <input
                      autoFocus
                      value={newUidValue}
                      onChange={(e) => {
                        setNewUidValue(e.target.value);
                        if (newUidError) setNewUidError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        void submitAddUid();
                      }}
                      placeholder="Nhập UID học viên"
                    />
                    {newUidError ? (
                      <div style={{ marginTop: 8, color: "var(--danger)", fontSize: 12 }}>{newUidError}</div>
                    ) : null}
                  </div>
                  {(requireChildPick || prChildren.length > 0) && (
                    <div className="field" style={{ marginTop: 12 }}>
                      <label>
                        Của bé nào?{requireChildPick && <span style={{ color: "var(--danger)" }}> *</span>}
                      </label>
                      <select
                        value={newUidChildName}
                        onChange={(e) => {
                          setNewUidChildName(e.target.value);
                          if (newUidError) setNewUidError("");
                        }}
                      >
                        <option value="">— Chọn bé —</option>
                        {prChildren.map((c, i) => (
                          <option key={i} value={c.name}>{c.name}</option>
                        ))}
                        <option value="__new__">+ Bé khác (gõ tên)</option>
                      </select>
                      {newUidChildName === "__new__" && (
                        <input
                          style={{ marginTop: 8 }}
                          value={newChildNameInput}
                          placeholder="Tên bé *"
                          onChange={(e) => {
                            setNewChildNameInput(e.target.value);
                            if (newUidError) setNewUidError("");
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="modal-foot">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setAddUidDialogOpen(false)}
                    disabled={locked}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void submitAddUid()}
                    disabled={locked}
                  >
                    {isStructureSaving ? "Đang lưu..." : "Thêm UID"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="drawer-scroll-actions" aria-hidden={!open}>
          <button
            type="button"
            className="btn btn-outline btn-icon"
            onClick={() => scrollDrawerBy(-360)}
            disabled={!canScrollUp}
            title="Cuộn lên"
          >
            <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
              <Icons.ChevronDown size={15} />
            </span>
          </button>
          <button
            type="button"
            className="btn btn-outline btn-icon"
            onClick={() => scrollDrawerBy(360)}
            disabled={!canScrollDown}
            title="Cuộn xuống"
          >
            <Icons.ChevronDown size={15} />
          </button>
        </div>

        <div className="drawer-foot" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={copyArId}>
              {copiedArId ? <Icons.Check size={13} /> : <Icons.Copy size={13} />}
              {copiedArId ? " Đã copy" : " Copy AR-ID"}
            </button>
            {(() => {
              const hasAnyNotice = (ar?.uids ?? []).some((u) =>
                u.courses.some(
                  (c) => !c.invoiced && !c.invoiceRequestedAt && getInvoiceBlockers(c, pr).length > 0
                )
              );
              if (!hasAnyNotice) return null;
              return (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => (notice.allCollapsed ? notice.expandAll() : notice.collapseAll())}
                  title="Thu gọn/mở tất cả cảnh báo trên mọi gói, mọi AR"
                >
                  <span
                    style={{
                      display: "inline-flex",
                      transform: notice.allCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    <Icons.ChevronDown size={13} />
                  </span>
                  {notice.allCollapsed ? " Mở rộng tất cả" : " Thu gọn tất cả"}
                </button>
              );
            })()}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline" onClick={requestCloseDrawer}>
              Đóng
            </button>
            {enriched.status === "activated" && (() => {
              const anyBlocked = (ar?.uids ?? []).some((u) =>
                u.courses.some(
                  (c) => !c.invoiced && !c.invoiceRequestedAt && getInvoiceBlockers(c, pr).some((b) => !b.soft)
                )
              );
              return (
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={anyBlocked}
                  style={anyBlocked ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                  title={
                    anyBlocked
                      ? "Còn gói học thiếu điều kiện xuất hoá đơn — xem cảnh báo dưới từng gói"
                      : "Yêu cầu xuất hoá đơn cho cả AR"
                  }
                  onClick={() => {
                    if (anyBlocked) return;
                    void onNavigateInvoice();
                  }}
                >
                  <Icons.Doc size={14} /> Yêu cầu xuất hoá đơn (B4)
                </button>
              );
            })()}
          </div>
        </div>
      </aside>

      {uncreditDialog.open && (
        <div
          className="gmv-prototype-modal-scrim"
          onClick={() => setUncreditDialog((p) => ({ ...p, open: false }))}
        >
          <div
            className="modal"
            style={{ width: "min(440px, 92vw)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Bỏ xác nhận cộng buổi</h3>
              <HdsdLink moduleSlug="module3" topicSlug="cong-buoi-gioi-thieu" />
            </div>
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, color: "var(--text-2)" }}>
                Bỏ tick sẽ ghi lại lý do vào audit log. Vui lòng nhập lý do:
              </div>
              <textarea
                value={uncreditDialog.reason}
                onChange={(e) => setUncreditDialog((p) => ({ ...p, reason: e.target.value }))}
                rows={3}
                placeholder="VD: Bù sai số buổi, cộng nhầm khoá học…"
                style={{ width: "100%", padding: 8, fontSize: 13, border: "1px solid var(--border)", borderRadius: 6 }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setUncreditDialog((p) => ({ ...p, open: false }))}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={!uncreditDialog.reason.trim()}
                  onClick={() => {
                    const { uid, courseCode, side, reason } = uncreditDialog;
                    setUncreditDialog((p) => ({ ...p, open: false }));
                    void submitCredit(uid, courseCode, side, false, reason.trim());
                  }}
                >
                  Xác nhận bỏ tick
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ActivationTab() {
  const { readOnly } = usePermission("module3");
  const {
    activeRequests,
    requests,
    navigate,
    nav,
    setNav,
    apiNote,
    setApiNote,
    orderIdConflictMessage,
    setOrderIdConflictMessage,
    dismissOrderIdConflict,
    updateActiveRequest,
    markPersisted,
    handleCreateActiveRequestFromForm,
    requestInvoiceForCourse,
  } = usePaymentFlow();
  const [openArId, setOpenArId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<ArTabId>("pending_order");
  const [page, setPage] = useState(1);
  const [orderIdDrafts, setOrderIdDrafts] = useState<Record<string, string>>({});
  const [editingKeys, setEditingKeys] = useState<Set<string>>(() => new Set());
  const [savingArIds, setSavingArIds] = useState<Set<string>>(() => new Set());
  const [copiedRowKey, setCopiedRowKey] = useState<string | null>(null);
  const [savedRowKey, setSavedRowKey] = useState<string | null>(null);
  const copyResetRef = useRef<number | null>(null);
  const savedResetRef = useRef<number | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [createOpen, setCreateOpen] = useState(false);
  // 1.5 — filter "Thưởng giới thiệu"
  const [referralFilter, setReferralFilter] = useState<"all" | "none" | "partial" | "full" | "any">("all");
  const [holdFilter, setHoldFilter] = useState<"all" | "now" | "hold">("all");

  // TOP3: activation urgent reminders banner
  type ActivationReminder = { id: string; payment_request_id: string; pr_code: string; customer_name: string; requested_by_name: string; requested_at: string; note: string | null };
  const [reminders, setReminders] = useState<ActivationReminder[]>([]);
  const loadReminders = useCallback(async () => {
    try {
      const res = await endpoints.activationUrgentRemind.list();
      setReminders(res.data.reminders);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadReminders(); }, [loadReminders]);
  const reminderByPrId = useMemo(() => {
    const m = new Map<string, ActivationReminder>();
    for (const r of reminders) m.set(r.payment_request_id, r);
    return m;
  }, [reminders]);

  useEffect(() => {
    if (nav.openArId) {
      setOpenArId(nav.openArId);
      setNav({});
    }
  }, [nav.openArId, setNav]);

  const rows = useMemo(() => activeRequests.map(enrichActiveRequest), [activeRequests]);

  const holdArs = useMemo(
    () => rows.filter((a) => a.holdActivation && a.status !== "activated" && a.status !== "invoiced"),
    [rows]
  );

  const counts = useMemo(
    () => ({
      all: rows.length,
      pending_order: rows.filter((a) => a.status === "pending_order").length,
      activated: rows.filter((a) => a.status === "activated").length,
      invoiced: rows.filter((a) => a.status === "invoiced").length,
    }),
    [rows]
  );

  const sumReady = useMemo(
    () => rows.filter((a) => a.status === "activated").reduce((s, a) => s + a.total, 0),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((a) => {
      if (tab !== "all" && a.status !== tab) return false;
      if (!inDateRange(a.createdAt, dateRange)) return false;
      if (referralFilter !== "all") {
        const rs = getArReferralStatus(a);
        if (referralFilter === "any") {
          if (rs === null) return false;
        } else {
          if (rs !== referralFilter) return false;
        }
      }
      if (holdFilter !== "all") {
        const isHold = !!a.holdActivation && a.status !== "activated" && a.status !== "invoiced";
        if (holdFilter === "hold" && !isHold) return false;
        if (holdFilter === "now" && isHold) return false;
      }
      if (!q) return true;
      return [a.id, a.prId || "", a.customerName, a.uids[0]?.uid || ""].some((v) =>
        v.toLowerCase().includes(q)
      );
    });
  }, [rows, tab, search, dateRange, referralFilter, holdFilter]);

  // Badge tab đếm ở cấp khoá học (toàn bộ, không lọc) — khác KPI (cấp AR).
  const tabCounts = useMemo(() => countCourseTabs(rows), [rows]);

  // Pipeline desktop: lọc AR (date/referral/hold) → trải khoá → lọc tab+search cấp khoá.
  const courseVisible = useMemo(() => {
    const nq = normVi(search.trim());
    const arFiltered = rows.filter((a) => {
      if (!inDateRange(a.createdAt, dateRange)) return false;
      if (referralFilter !== "all") {
        const rs = getArReferralStatus(a);
        if (referralFilter === "any") {
          if (rs === null) return false;
        } else if (rs !== referralFilter) {
          return false;
        }
      }
      if (holdFilter !== "all") {
        const isHold = !!a.holdActivation && a.status !== "activated" && a.status !== "invoiced";
        if (holdFilter === "hold" && !isHold) return false;
        if (holdFilter === "now" && isHold) return false;
      }
      return true;
    });
    return flatCourseRows(arFiltered).filter(
      (r) => courseRowMatchesTab(r, tab) && courseRowMatchesSearch(r, nq)
    );
  }, [rows, tab, search, dateRange, referralFilter, holdFilter]);

  const courseGroups = useMemo(() => groupRowsByAr(courseVisible), [courseVisible]);
  const coursePage = useMemo(() => paginate(courseGroups, page, AR_PER_PAGE), [courseGroups, page]);

  // Đổi bộ lọc/tab/tìm kiếm → về trang 1.
  useEffect(() => {
    setPage(1);
  }, [tab, search, dateRange, referralFilter, holdFilter]);

  // Dọn timer feedback khi unmount.
  useEffect(
    () => () => {
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
      if (savedResetRef.current) window.clearTimeout(savedResetRef.current);
    },
    []
  );

  const isMobile = useIsMobile();

  const openAr = openArId ? activeRequests.find((a) => a.id === openArId) ?? null : null;
  const openPr = openAr?.prId ? requests.find((p) => p.id === openAr.prId) ?? null : null;
  const persistActiveRequest = async (next: ActiveRequest) => {
    try {
      markPersisted();
      const res = await endpoints.activeRequests.update(next.id, {
        uids_data: toActiveRequestPatchUidsData(next),
      });
      const saved = fromApiActiveRequest(res.data);
      updateActiveRequest(next.id, () => saved);
      markPersisted();
      setApiNote("");
      if (saved.uids.some((u) => u.courses.some((c) => c.orderId?.trim()))) {
        notifyLedgerChanged();
      }
      loadReminders();
      return { ok: true as const, saved };
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      // BE 409: "order_id 'X' da ton tai o AR/course khac" → show modal in-app rõ ràng
      if (typeof detail === "string" && detail.includes("order_id") && detail.includes("ton tai")) {
        setOrderIdConflictMessage(detail);
        const m = /order_id '([^']+)'/.exec(detail);
        const orderId = m ? m[1] : "";
        const msg = orderId
          ? `Order ID '${orderId}' đã được dùng ở Active Request khác — không lưu được.`
          : "Order ID đã được dùng ở Active Request khác — không lưu được.";
        setApiNote(msg);
        return { ok: false as const, error: msg };
      }
      const error = (typeof detail === "string" && detail) || "Không lưu được thay đổi Active Request lên máy chủ.";
      setApiNote(error);
      return { ok: false as const, error };
    }
  };

  const copyUid = async (rowKey: string, uid: string) => {
    if (!uid) return;
    const fallbackCopy = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = uid;
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
    let ok: boolean;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(uid);
        ok = true;
      } else {
        ok = fallbackCopy();
      }
    } catch {
      ok = fallbackCopy();
    }
    if (!ok) {
      window.prompt("Không thể tự copy trong trình duyệt này. Copy UID thủ công:", uid);
      return;
    }
    setCopiedRowKey(rowKey);
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => setCopiedRowKey(null), 1400);
  };

  // Lưu Order ID inline. Đọc AR tươi từ activeRequests (không dùng snapshot dòng),
  // khoá theo AR để 2 lần lưu cùng AR không ghi đè full uids_data của nhau.
  const saveOrderIdInline = async (row: CourseRow) => {
    const draft = (orderIdDrafts[row.key] ?? row.orderId).trim();
    if (!draft || draft === row.orderId.trim()) return;
    if (savingArIds.has(row.arId)) return;
    const freshAr = activeRequests.find((a) => a.id === row.arId);
    if (!freshAr) return;
    const next = applyCourseOrderId(freshAr, row.courseCode, draft);
    setSavingArIds((prev) => {
      const s = new Set(prev);
      s.add(row.arId);
      return s;
    });
    const result = await persistActiveRequest(next);
    setSavingArIds((prev) => {
      const s = new Set(prev);
      s.delete(row.arId);
      return s;
    });
    if (result.ok) {
      setOrderIdDrafts((prev) => {
        const n = { ...prev };
        delete n[row.key];
        return n;
      });
      setEditingKeys((prev) => {
        const s = new Set(prev);
        s.delete(row.key);
        return s;
      });
      setSavedRowKey(row.key);
      if (savedResetRef.current) window.clearTimeout(savedResetRef.current);
      savedResetRef.current = window.setTimeout(() => setSavedRowKey(null), 1400);
    }
  };

  const renderReferralChip = (rs: CourseRow["referral"]) => {
    if (rs === null) return <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>;
    const cfg = {
      full: { bg: "var(--success-bg)", color: "var(--success-text)", label: "Đã cộng" },
      partial: { bg: "var(--caution-bg, #fef9c3)", color: "var(--caution-text, #92400e)", label: "1 phần" },
      none: { bg: "var(--danger-bg, #fee2e2)", color: "var(--danger-text, #b91c1c)", label: "Chưa cộng" },
    }[rs];
    return (
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: cfg.bg, color: cfg.color, fontWeight: 600, whiteSpace: "nowrap" }}>
        {cfg.label}
      </span>
    );
  };

  const renderCourseRow = (row: CourseRow, tint: string) => {
    const rem = row.prId ? reminderByPrId.get(row.prId) : undefined;
    const remTip = rem
      ? `Sales nhắc kích hoạt lúc ${new Date(rem.requested_at).toLocaleDateString("vi-VN")} ${new Date(rem.requested_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} — bởi ${rem.requested_by_name}${rem.note ? ` · "${rem.note}"` : ""}`
      : undefined;
    const borderColor = rem ? "#e65100" : tint; // nhắc gấp đè màu cam, không mất tín hiệu cũ
    const draftVal = orderIdDrafts[row.key] ?? row.orderId;
    const isSavingAr = savingArIds.has(row.arId);
    const isEditing = editingKeys.has(row.key);
    const showInput = !row.invoiced && (!row.activated || isEditing);
    const saveEnabled = !readOnly && draftVal.trim() !== "" && draftVal.trim() !== row.orderId.trim() && !isSavingAr;
    const iconBtnStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 24,
      height: 24,
      borderRadius: 6,
      border: "1px solid var(--border, #e5e7eb)",
      background: "var(--canvas, #fff)",
      cursor: "pointer",
      color: "var(--text-2, #555)",
      flex: "0 0 auto",
    };
    return (
      <tr
        key={row.key}
        className={openArId === row.arId ? "selected" : ""}
        onClick={() => setOpenArId(row.arId)}
        title={remTip}
        style={{ borderLeft: `3px solid ${borderColor}` }}
      >
        <td>
          <span className="ar-id-pill">{row.arId}</span>
          <div style={{ marginTop: 3 }}>
            {row.prId ? (
              <span className="pr-id-pill" style={{ fontSize: 11 }}>{row.prId}</span>
            ) : (
              <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>— Standalone —</span>
            )}
          </div>
        </td>
        <td>
          <div className="cell-name">{row.uidName || row.customerName || "—"}</div>
          {(row.saleName || (row.uidName && row.uidName !== row.customerName)) && (
            <div className="cell-sub">
              {row.uidName && row.uidName !== row.customerName ? `KH: ${row.customerName}` : ""}
              {row.uidName && row.uidName !== row.customerName && row.saleName ? " · " : ""}
              {row.saleName ? (
                <>
                  Sale: <strong>{row.saleName}</strong>
                </>
              ) : null}
            </div>
          )}
        </td>
        <td>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              title="Copy UID"
              aria-label={`Copy UID ${row.uid}`}
              disabled={!row.uid}
              onClick={(e) => {
                e.stopPropagation();
                copyUid(row.key, row.uid);
              }}
              style={{ ...iconBtnStyle, cursor: row.uid ? "pointer" : "not-allowed", color: copiedRowKey === row.key ? "var(--success-text, #047857)" : "var(--text-2, #555)" }}
            >
              {copiedRowKey === row.key ? <Icons.Check size={14} /> : <Icons.Copy size={14} />}
            </button>
            <span style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 12.5 }}>{row.uid || "—"}</span>
          </div>
        </td>
        <td>{row.packageName || "—"}</td>
        <td style={{ textAlign: "right" }}>
          <span style={{ fontWeight: 700, color: "var(--money)" }}>{vnd(row.amount)}</span>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          {row.invoiced ? (
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} title="Đã xuất hoá đơn — không sửa Order ID ở đây">
              {row.orderId || "—"}
            </span>
          ) : showInput ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={draftVal}
                placeholder="Dán Order ID"
                disabled={readOnly || isSavingAr}
                onChange={(e) => setOrderIdDrafts((p) => ({ ...p, [row.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveEnabled) saveOrderIdInline(row);
                }}
                style={{ width: 150, height: 30, padding: "0 8px", fontSize: 12.5, fontFamily: "ui-monospace, monospace", border: "1px solid var(--border, #d1d5db)", borderRadius: 6 }}
              />
              <button type="button" className="btn btn-primary" disabled={!saveEnabled} onClick={() => saveOrderIdInline(row)} style={{ height: 30, padding: "0 12px", fontSize: 12.5, whiteSpace: "nowrap" }}>
                {isSavingAr ? "Đang lưu…" : "Lưu"}
              </button>
              {savedRowKey === row.key && <span style={{ fontSize: 11, color: "var(--success-text, #047857)", whiteSpace: "nowrap" }}>Đã lưu ✓</span>}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>{row.orderId || "—"}</span>
              {!readOnly && (
                <button
                  type="button"
                  title="Sửa Order ID"
                  aria-label={`Sửa Order ID ${row.orderId}`}
                  onClick={() =>
                    setEditingKeys((s) => {
                      const n = new Set(s);
                      n.add(row.key);
                      return n;
                    })
                  }
                  style={iconBtnStyle}
                >
                  <Icons.Pencil size={13} />
                </button>
              )}
              {savedRowKey === row.key && <span style={{ fontSize: 11, color: "var(--success-text, #047857)", whiteSpace: "nowrap" }}>Đã lưu ✓</span>}
            </div>
          )}
        </td>
        <td>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            {row.activated ? (
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--success-bg)", color: "var(--success-text)", fontWeight: 600, whiteSpace: "nowrap" }}>✓ Đã kích hoạt</span>
            ) : (
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--warning-bg)", color: "var(--warning-text)", fontWeight: 600, whiteSpace: "nowrap" }}>⏳ Chờ điền</span>
            )}
            {row.holdActivation && !row.activated && (
              <span className="badge badge-warning" style={{ fontSize: 11 }} title={row.holdNote ? `Chưa muốn kích hoạt — "${row.holdNote}"` : "Chưa muốn kích hoạt"}>
                ⏸ Chưa muốn KH
              </span>
            )}
          </div>
        </td>
        <td>{renderReferralChip(row.referral)}</td>
        <td>
          {(() => {
            const ts = formatPaymentDateTime(row.createdAt);
            return (
              <>
                <div className="cell-time">{ts.date}</div>
                {ts.time ? <div className="time-relative">{ts.time}</div> : null}
              </>
            );
          })()}
        </td>
      </tr>
    );
  };

  return (
    <div className="gmv-prototype">
      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
          {!isMobile && (
            <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 720, lineHeight: 1.55 }}>
              Sau khi PR đủ tiền, tạo <strong style={{ color: "var(--text-2)" }}>Active Request</strong> và điền{" "}
              <strong style={{ color: "var(--text-2)" }}>Order ID CRM</strong> cho từng Course Code.{" "}
              <strong style={{ color: "var(--text-2)" }}>Lưu Order ID</strong> → ghi ngay vào{" "}
              <strong style={{ color: "var(--text-2)" }}>Sổ doanh thu</strong> (tab Báo cáo, lọc theo Pay Time PR). Khi đủ Order ID →
              sang B4 xuất hoá đơn.
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!readOnly && (
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <Icons.Plus size={15} strokeWidth={2.3} /> Tạo Active Request
              </button>
            )}
            <HdsdLink moduleSlug="module3" topicSlug="tong-quan" />
          </div>
        </div>

        {apiNote && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #f6d36b",
              background: "var(--warning-bg)",
              color: "var(--warning-text)",
              fontSize: 12.5,
              marginBottom: 8,
            }}
          >
            {apiNote}
          </div>
        )}

        {reminders.length > 0 && (
          <div style={{
            padding: "10px 14px", borderRadius: 10,
            border: "1px solid #ffcc80", background: "#fff3e0",
            fontSize: 12.5, marginBottom: 8,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <Icons.Bell size={15} style={{ color: "#e65100", flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong style={{ color: "#e65100" }}>Sales đang nhắc kích hoạt gấp ({reminders.length})</strong>
              <div style={{ marginTop: 4, lineHeight: 1.6 }}>
                {reminders.map((rem) => {
                  const dt = new Date(rem.requested_at);
                  return (
                    <div key={rem.id} style={{ color: "var(--text-2)" }}>
                      <strong>{rem.customer_name || rem.pr_code}</strong>
                      {" — nhắc bởi "}{rem.requested_by_name}
                      {" lúc "}{dt.toLocaleDateString("vi-VN")}{" "}
                      {dt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      {rem.note && <span style={{ color: "var(--text-3)" }}> · &ldquo;{rem.note}&rdquo;</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {holdArs.length > 0 && (
          <div style={{
            padding: "10px 14px", borderRadius: 10,
            border: "1px solid #ffd54f", background: "#fffde7",
            fontSize: 12.5, marginBottom: 8,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⏸</span>
            <div>
              <strong style={{ color: "#f57f17" }}>PH chưa muốn kích hoạt ({holdArs.length})</strong>
              <div style={{ marginTop: 4, lineHeight: 1.6 }}>
                {holdArs.map((a) => (
                  <div key={a.id} style={{ color: "var(--text-2)" }}>
                    <strong>{a.customerName || a.id}</strong>
                    {a.holdNote
                      ? <span style={{ color: "var(--text-3)" }}> — &ldquo;{a.holdNote}&rdquo;</span>
                      : <span style={{ color: "var(--text-3)" }}> — (không ghi chú)</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-icon">
              <Icons.Sparkle size={16} />
            </div>
            <div className="kpi-label">Tổng Active Request</div>
            <div className="kpi-value">{counts.all}</div>
            <div className="kpi-sub">{rows.reduce((s, a) => s + a.totalCourses, 0)} khoá học</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--warning-bg)", color: "var(--warning-text)" }}>
              <Icons.Clock size={16} />
            </div>
            <div className="kpi-label">AR chờ điền Order ID</div>
            <div className="kpi-value">{counts.pending_order}</div>
            <div className="kpi-sub">Còn khoá chưa có Order ID</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--success-bg)", color: "var(--success-text)" }}>
              <Icons.CheckCircle size={16} />
            </div>
            <div className="kpi-label">AR đã kích hoạt</div>
            <div className="kpi-value">{counts.activated}</div>
            <div className="kpi-sub">{vnd(sumReady)} sẵn sàng xuất HĐ</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--info-bg)", color: "var(--info-text)" }}>
              <Icons.Doc size={16} />
            </div>
            <div className="kpi-label">AR đã xuất HĐ</div>
            <div className="kpi-value">{counts.invoiced}</div>
            <div className="kpi-sub">AR đã hoàn tất</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <Icons.Search size={15} stroke="var(--text-3)" />
            <input
              placeholder="Tìm theo AR-ID, PR-ID, tên khách, UID, gói, Order ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: "var(--text-3)", marginRight: 4 }}>Thưởng giới thiệu:</span>
            {([
              { id: "all" as const, label: "Tất cả" },
              { id: "any" as const, label: "Có thưởng" },
              { id: "none" as const, label: "Chưa cộng" },
              { id: "partial" as const, label: "Cộng 1 phần" },
              { id: "full" as const, label: "Đã cộng" },
            ]).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`filter-chip ${referralFilter === f.id ? "active" : ""}`}
                onClick={() => setReferralFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Hàng dưới (dưới "Thưởng giới thiệu"): nhóm "Kích hoạt" trái + "Khoảng thời gian" phải */}
          <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-3)", marginRight: 4 }}>Kích hoạt:</span>
              {([
                { id: "all" as const, label: "Tất cả" },
                { id: "now" as const, label: "Kích hoạt ngay" },
                { id: "hold" as const, label: "Chưa muốn KH" },
              ]).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`filter-chip ${holdFilter === f.id ? "active" : ""}`}
                  onClick={() => setHoldFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ marginLeft: "auto" }}>
              <DateRangeFilter value={dateRange} onChange={setDateRange} />
            </div>
          </div>
        </div>

        <div className="table-card has-tabs">
          <div className="table-head with-tabs">
            <div className="tabs">
              {(
                [
                  { id: "pending_order" as const, label: "Chờ điền Order ID", icon: "Clock" as const, count: tabCounts.pending_order, attention: true },
                  { id: "activated" as const, label: "Đã kích hoạt", icon: "CheckCircle" as const, count: tabCounts.activated },
                  { id: "all" as const, label: "Tất cả", icon: "Database" as const, count: tabCounts.all },
                ] as const
              ).map((tc) => {
                const Ico = Icons[tc.icon];
                return (
                  <div key={tc.id} className={`tab ${tab === tc.id ? "active" : ""}`} onClick={() => setTab(tc.id)}>
                    <Ico size={14} /> {tc.label}
                    <span
                      className={`tab-count ${"attention" in tc && tc.attention && tc.count > 0 && tab !== tc.id ? "is-attention" : ""}`}
                    >
                      {tc.count}
                    </span>
                  </div>
                );
              })}
            </div>
            <span className="right-meta">{isMobile ? `${filtered.length} kết quả` : `${courseVisible.length} dòng khoá học`}</span>
          </div>

          {isMobile ? (
            <div className="mobile-card-list p-2">
              <ActivationRowCards
                rows={filtered}
                openArId={openArId}
                onSelect={setOpenArId}
                reminderByPrId={reminderByPrId}
                emptyText="Chưa có Active Request nào khớp với điều kiện lọc."
              />
            </div>
          ) : (
            <>
              <div className="tbl-wrap" style={{ overflowX: "auto" }}>
                <table className="tbl" style={{ minWidth: 1180 }}>
                  <thead>
                    <tr>
                      <th>AR-ID / PR-ID</th>
                      <th>Khách hàng</th>
                      <th>UID</th>
                      <th>Gói học</th>
                      <th style={{ textAlign: "right" }}>Tiền</th>
                      <th>Order ID</th>
                      <th>Trạng thái</th>
                      <th>Thưởng GT</th>
                      <th>Tạo lúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseVisible.length === 0 && (
                      <tr>
                        <td colSpan={9}>
                          <div className="empty">
                            <Icons.Sparkle size={20} />
                            <div>Chưa có khoá học nào khớp với điều kiện lọc.</div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {coursePage.rows.map((group, gi) =>
                      group.rows.map((row) => renderCourseRow(row, GROUP_TINTS[gi % GROUP_TINTS.length]))
                    )}
                  </tbody>
                </table>
              </div>
              {courseGroups.length > 0 && (
                <div className="pagi">
                  <span>
                    Trang {coursePage.page}/{coursePage.totalPages} · {courseVisible.length} dòng khoá học trong {courseGroups.length} AR
                  </span>
                  <div className="pagi-btns">
                    <button className="pagi-btn" disabled={coursePage.page <= 1} onClick={() => setPage(coursePage.page - 1)} aria-label="Trang trước">
                      <Icons.ChevronLeft size={13} />
                    </button>
                    {pageItems(coursePage.page, coursePage.totalPages).map((it, i) =>
                      it === "..." ? (
                        <span key={`gap-${i}`} className="pagi-gap">
                          …
                        </span>
                      ) : (
                        <button key={it} className={`pagi-btn ${it === coursePage.page ? "active" : ""}`} onClick={() => setPage(it)}>
                          {it}
                        </button>
                      )
                    )}
                    <button className="pagi-btn" disabled={coursePage.page >= coursePage.totalPages} onClick={() => setPage(coursePage.page + 1)} aria-label="Trang sau">
                      <Icons.ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ActivationDetailDrawer
        ar={openAr}
        pr={openPr}
        requestsForAutofill={requests}
        open={!!openArId}
        readOnly={readOnly}
        onClose={() => setOpenArId(null)}
        onUpdate={(next) => updateActiveRequest(next.id, () => next)}
        onPersist={persistActiveRequest}
        onNavigateInvoice={async () => {
          if (!openAr) return;
          try {
            const res = await endpoints.activeRequests.requestInvoice(openAr.id);
            const saved = fromApiActiveRequest(res.data);
            updateActiveRequest(openAr.id, () => saved);
            setApiNote("Đã yêu cầu xuất hoá đơn cho tất cả gói học trong AR này.");
          } catch {
            setApiNote("Không gửi được yêu cầu xuất hoá đơn, thử lại sau.");
          }
        }}
        onOpenPr={
          openAr?.prId
            ? () => navigate("paymentRequests", { openPrId: openAr.prId })
            : undefined
        }
        onGoToInvoice={async (courseCode) => {
          if (!openAr) return;
          await requestInvoiceForCourse(openAr.id, courseCode);
        }}
      />

      <ARCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        prs={requests}
        onCreate={(data) => {
          void handleCreateActiveRequestFromForm(data).then((ar) => {
            setCreateOpen(false);
            setOpenArId(ar.id);
            setTab("pending_order");
          });
        }}
      />

      {/* 2-04 — popup khi BE chặn order_id trùng */}
      {orderIdConflictMessage && (() => {
        const m = /order_id '([^']+)' da ton tai/.exec(orderIdConflictMessage);
        const orderId = m ? m[1] : "";
        return (
          <div
            className="gmv-prototype-modal-scrim"
            onClick={dismissOrderIdConflict}
            style={{ zIndex: 140 }}
          >
            <div className="modal" style={{ width: "min(480px, 100%)" }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h3>Order ID đã tồn tại — không lưu được</h3>
                  {orderId && (
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                      Order ID <strong>{orderId}</strong> đã được dùng ở Active Request khác
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <HdsdLink moduleSlug="module3" topicSlug="order-id-va-hold" />
                  <button className="drawer-close" onClick={dismissOrderIdConflict}>✕</button>
                </div>
              </div>
              <div className="modal-body">
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0" }}>
                  <span style={{ fontSize: 20, lineHeight: 1, color: "#ef4444" }}>⚠</span>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-2)" }}>
                    Mỗi Order ID CRM phải là <strong>duy nhất</strong> trên toàn hệ thống — không thể dùng cùng Order ID cho 2 gói học khác nhau.
                    Vui lòng kiểm tra lại Order ID đúng (CRM trả về số nào cho gói học này) và điền lại.
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button className="btn btn-primary" onClick={dismissOrderIdConflict}>
                  Đã hiểu
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
