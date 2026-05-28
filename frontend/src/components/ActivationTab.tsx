import { useEffect, useMemo, useRef, useState } from "react";
import { COURSE_PACKAGES } from "../constants/coursePackages";
import { usePaymentFlow } from "../contexts/PaymentFlowContext";
import { endpoints } from "../lib/api";
import type { ActiveRequest, ActiveCourse, ActiveUidGroup, PaymentRequest } from "../types/paymentRequest";
import type { ActiveRequestStatus } from "../types/paymentRequest";
import {
  AR_STATUS_META,
  enrichActiveRequest,
  flatCourses,
  nextCourseCode,
  vnd,
} from "./payment-flow/paymentFlowUtils";
import CountryCombo from "./payment-request/CountryCombo";
import DateRangeFilter, { EMPTY_RANGE, type DateRange, inDateRange } from "./payment-request/DateRangeFilter";
import { Icons } from "./payment-request/Icons";
import { formatPaymentDateTime, fromApiActiveRequest, toActiveRequestPatchUidsData } from "./payment-request/paymentRequestUtils";
import { downloadTaxInvoiceZip } from "../utils/taxInvoiceXlsxExport";
import type { InvoiceRow } from "./payment-flow/paymentFlowUtils";
import "../styles/prototype-payments.css";

type ArTabId = "pending_order" | "activated" | "all";

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
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [customerName, setCustomerName] = useState("");

  useEffect(() => {
    if (!open) return;
    setLinkedPrId(null);
    setFirstUid("");
    setCustomerName("");
    setAmount("");
    setIsAmountFocused(false);
    setPkgName("");
  }, [open]);

  if (!open) return null;

  const linkedPr = linkedPrId ? prs.find((p) => p.id === linkedPrId) : null;
  const amountNum = parseInt(String(amount).replace(/\D/g, ""), 10) || 0;
  const canSubmit = firstUid.trim() && pkgName.trim() && amountNum > 0 && (linkedPr ? true : customerName.trim());

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
          <button type="button" className="drawer-close" onClick={onClose}>
            <Icons.Close size={16} />
          </button>
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
                    if (!amount) setAmount(String(p.target));
                  }
                }
              }}
            />
            {linkedPr && linkedPr.state !== "done" && linkedPr.state !== "over" && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--warning-text)", display: "flex", gap: 6, alignItems: "center" }}>
                <Icons.AlertCircle size={13} /> PR này chưa thanh toán đủ — thường chỉ kích hoạt khi đủ tiền.
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
                <input
                  value={isAmountFocused ? amount : amount ? Number(amount).toLocaleString("vi-VN") : ""}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onFocus={() => setIsAmountFocused(true)}
                  onBlur={() => setIsAmountFocused(false)}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, "");
                    setAmount(v);
                  }}
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
}) {
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
  const arBodyScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [copiedArId, setCopiedArId] = useState(false);
  const copyResetTimer = useRef<number | null>(null);
  const uidTouchedRef = useRef<Record<number, { uid: boolean; phone: boolean; country: boolean }>>({});
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
  const isStructureSaving = !!savingStructureKey;
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
    const remaining = pr ? Math.max(0, pr.target - total) : 0;
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

  const addUid = async (nextUidValue: string) => {
    const newCode = nextCourseCode(ar);
    const remaining = pr ? Math.max(0, pr.target - total) : 0;
    return await persistStructure("add-uid", {
      ...ar,
      uids: [
        ...ar.uids,
        {
          uid: nextUidValue,
          phone: "",
          country: "VN",
          courses: [{ courseCode: newCode, packageName: "", amount: remaining || 0, orderId: "", invoiced: false }],
        },
      ],
    });
  };

  const openAddUidDialog = () => {
    if (isStructureSaving) return;
    setNewUidValue("");
    setNewUidError("");
    setAddUidDialogOpen(true);
  };

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
    const ok = await addUid(uid);
    if (!ok) return;
    setAddUidDialogOpen(false);
    setNewUidValue("");
    setNewUidError("");
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
      <aside className={`drawer ${open ? "open" : ""}`} style={{ width: "min(1020px, 96vw)" }}>
        <div className="drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="ar-id-pill">{ar.id}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{ar.customerName}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                {pr ? (
                  <>
                    Liên kết <strong style={{ color: "var(--primary-700)" }}>{pr.id}</strong> ·{" "}
                  </>
                ) : (
                  <>Standalone · </>
                )}
                Tạo bởi <strong style={{ color: "var(--text-2)" }}>{ar.createdBy || "—"}</strong> · {ar.createdAt}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ARStatusBadge status={enriched.status} />
            <button type="button" className="drawer-close" onClick={requestCloseDrawer}>
              <Icons.Close size={16} />
            </button>
          </div>
        </div>

        <div className="drawer-body ar-drawer-body" ref={arBodyScrollRef}>
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
                {onOpenPr && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={onOpenPr}>
                    <Icons.ChevronRight size={13} /> Mở PR
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
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

          <div
            className="ar-uid-list"
            onWheel={(e) => e.stopPropagation()}
            onScroll={(e) => e.stopPropagation()}
          >
            {ar.uids.map((uidObj, uidIdx) => {
              const uidKey = uidObj.uid.trim();
              const isUidFromPr = !!uidKey && (
                (!!pr && uidKey === String(pr.uid || "").trim()) || !!prByUid.get(uidKey)
              );
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
              <div key={uidIdx} className="uid-group">
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
                  placeholder="9xx xxx xxx"
                  style={{
                    width: 140,
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
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void saveUidHeader(uidIdx)}
                  disabled={!isUidDirty || isStructureSaving}
                  title={isUidDirty ? "Lưu UID/SĐT/quốc gia lên Supabase" : "Chưa có thay đổi"}
                >
                  <Icons.Check size={12} strokeWidth={2.5} /> Lưu
                </button>
                <span className="spacer" />
                <span className="num-pill">{uidObj.courses.length} khoá</span>
                {ar.uids.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ color: "var(--danger)" }}
                    disabled={isStructureSaving}
                    onClick={() => void removeUid(uidIdx)}
                  >
                    <Icons.XCircle size={13} /> Xoá UID
                  </button>
                )}
              </div>
              <div className="course-row-head">
                <span />
                <span>Gói học</span>
                <span style={{ textAlign: "right" }}>Số tiền</span>
                <span>Course Code</span>
                <span>Order ID</span>
                <span>Lưu</span>
                <span>Yêu cầu xuất</span>
                <span />
              </div>
              {uidObj.courses.map((course, courseIdx) => (
                <div key={course.courseCode} className="course-row">
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
                  <input
                    className="amt-input"
                    value={courseDrafts[course.courseCode]?.amount ?? (course.amount ? String(course.amount) : "")}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
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
                      disabled={isStructureSaving || !isCourseDirty(course.courseCode) || !!savingCourse[course.courseCode]}
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
                      <span style={{ fontSize: 10.5, color: "var(--success-text)", whiteSpace: "nowrap" }}>Đã lưu</span>
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
                    ) : (
                      <button
                        type="button"
                        className="btn-invoice"
                        disabled={!course.orderId?.trim()}
                        title={course.orderId ? "Yêu cầu xuất hoá đơn" : "Cần điền Order ID trước"}
                        onClick={() => void onGoToInvoice(course.courseCode)}
                      >
                        <Icons.Doc size={12} /> Yêu cầu xuất
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="remove-btn"
                    disabled={isStructureSaving || (ar.uids.length === 1 && uidObj.courses.length === 1)}
                    onClick={() => void removeCourse(uidIdx, courseIdx)}
                    title={
                      ar.uids.length === 1 && uidObj.courses.length === 1
                        ? "Không thể xoá khoá học cuối cùng"
                        : "Xoá khoá học"
                    }
                  >
                    <Icons.Close size={14} />
                  </button>
                </div>
              ))}
              <datalist id={`packages-${ar.id}`}>
                {COURSE_PACKAGES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <div className="uid-group-foot">
                <button type="button" className="uid-add-link" onClick={() => void addCourse(uidIdx)} disabled={isStructureSaving}>
                  <Icons.Plus size={13} /> {isStructureSaving ? "Đang lưu..." : "Thêm gói học cho UID này"}
                </button>
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

          <button type="button" className="add-uid-card" onClick={openAddUidDialog} disabled={isStructureSaving}>
            <Icons.Plus size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {isStructureSaving ? "Đang lưu..." : "Thêm UID khác (cho phép 1 PR mua nhiều khoá cho nhiều người)"}
          </button>

          {addUidDialogOpen && (
            <div className="gmv-prototype-modal-scrim" onClick={() => !isStructureSaving && setAddUidDialogOpen(false)}>
              <div
                className="modal"
                style={{ width: "min(420px, 92vw)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-head">
                  <h3>Thêm UID mới</h3>
                  <button
                    type="button"
                    className="drawer-close"
                    onClick={() => !isStructureSaving && setAddUidDialogOpen(false)}
                    disabled={isStructureSaving}
                  >
                    <Icons.Close size={16} />
                  </button>
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
                </div>
                <div className="modal-foot">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setAddUidDialogOpen(false)}
                    disabled={isStructureSaving}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void submitAddUid()}
                    disabled={isStructureSaving}
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
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline" onClick={requestCloseDrawer}>
              Đóng
            </button>
            {enriched.status === "activated" && (
              <button type="button" className="btn btn-success" onClick={onNavigateInvoice}>
                <Icons.Doc size={14} /> Yêu cầu xuất hoá đơn (B4)
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default function ActivationTab() {
  const {
    activeRequests,
    requests,
    navigate,
    nav,
    setNav,
    apiNote,
    setApiNote,
    updateActiveRequest,
    handleCreateActiveRequestFromForm,
    requestInvoiceForCourse,
  } = usePaymentFlow();
  const [openArId, setOpenArId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<ArTabId>("pending_order");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (nav.openArId) {
      setOpenArId(nav.openArId);
      setNav({});
    }
  }, [nav.openArId, setNav]);

  const rows = useMemo(() => activeRequests.map(enrichActiveRequest), [activeRequests]);

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
      if (!q) return true;
      return [a.id, a.prId || "", a.customerName, a.uids[0]?.uid || ""].some((v) =>
        v.toLowerCase().includes(q)
      );
    });
  }, [rows, tab, search, dateRange]);

  const openAr = openArId ? activeRequests.find((a) => a.id === openArId) ?? null : null;
  const openPr = openAr?.prId ? requests.find((p) => p.id === openAr.prId) ?? null : null;
  const persistActiveRequest = async (next: ActiveRequest) => {
    try {
      const res = await endpoints.activeRequests.update(next.id, {
        uids_data: toActiveRequestPatchUidsData(next),
      });
      const saved = fromApiActiveRequest(res.data);
      updateActiveRequest(next.id, () => saved);
      setApiNote("");
      return { ok: true as const, saved };
    } catch {
      const error = "Không lưu được thay đổi Active Request lên máy chủ.";
      setApiNote(error);
      return { ok: false as const, error };
    }
  };

  return (
    <div className="gmv-prototype">
      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 720, lineHeight: 1.55 }}>
            Sau khi PR đủ tiền, tạo <strong style={{ color: "var(--text-2)" }}>Active Request</strong> và điền{" "}
            <strong style={{ color: "var(--text-2)" }}>Order ID CRM</strong> cho từng Course Code. Khi đủ Order ID →
            sang B4 xuất hoá đơn.
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <Icons.Plus size={15} strokeWidth={2.3} /> Tạo Active Request
          </button>
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
            <div className="kpi-label">Chờ điền Order ID</div>
            <div className="kpi-value">{counts.pending_order}</div>
            <div className="kpi-sub">Ops chưa điền hết Order ID</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--success-bg)", color: "var(--success-text)" }}>
              <Icons.CheckCircle size={16} />
            </div>
            <div className="kpi-label">Đã kích hoạt</div>
            <div className="kpi-value">{counts.activated}</div>
            <div className="kpi-sub">{vnd(sumReady)} sẵn sàng xuất HĐ</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--info-bg)", color: "var(--info-text)" }}>
              <Icons.Doc size={16} />
            </div>
            <div className="kpi-label">Đã xuất HĐ</div>
            <div className="kpi-value">{counts.invoiced}</div>
            <div className="kpi-sub">AR đã hoàn tất</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <Icons.Search size={15} stroke="var(--text-3)" />
            <input
              placeholder="Tìm theo AR-ID, PR-ID, tên khách, UID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ marginLeft: "auto" }}>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        <div className="table-card has-tabs">
          <div className="table-head with-tabs">
            <div className="tabs">
              {(
                [
                  { id: "pending_order" as const, label: "Chờ điền Order ID", icon: "Clock" as const, count: counts.pending_order, attention: true },
                  { id: "activated" as const, label: "Đã kích hoạt", icon: "CheckCircle" as const, count: counts.activated },
                  { id: "all" as const, label: "Tất cả", icon: "Database" as const, count: counts.all },
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
            <span className="right-meta">{filtered.length} kết quả</span>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>AR-ID</th>
                  <th>PR-ID</th>
                  <th>Khách hàng</th>
                  <th style={{ textAlign: "center" }}>UID</th>
                  <th style={{ textAlign: "right" }}>Tổng tiền</th>
                  <th style={{ textAlign: "center" }}>Order ID</th>
                  <th>Trạng thái</th>
                  <th>Tạo lúc</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty">
                        <Icons.Sparkle size={20} />
                        <div>Chưa có Active Request nào khớp với điều kiện lọc.</div>
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className={openArId === a.id ? "selected" : ""}
                    onClick={() => setOpenArId(a.id)}
                  >
                    <td>
                      <span className="ar-id-pill">{a.id}</span>
                    </td>
                    <td>
                      {a.prId ? (
                        <span className="pr-id-pill" style={{ fontSize: 11.5 }}>
                          {a.prId}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)", fontSize: 12 }}>— Standalone —</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-name">{a.customerName}</div>
                      <div className="cell-sub">UID: {a.uids[0]?.uid || "—"}</div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="qr-count">
                        <span className="num-done">{a.uids.length}</span>
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: 700, color: "var(--money)" }}>{vnd(a.total)}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="qr-count">
                        <span
                          className="num-done"
                          style={{
                            color: a.orderedCount === a.totalCourses ? "var(--success-text)" : "var(--warning-text)",
                          }}
                        >
                          {a.orderedCount}
                        </span>
                        <span className="slash">/</span>
                        <span className="num-total">{a.totalCourses}</span>
                      </span>
                    </td>
                    <td>
                      <ARStatusBadge status={a.status} />
                    </td>
                    <td>
                      {(() => {
                        const ts = formatPaymentDateTime(a.createdAt);
                        return (
                          <>
                            <div className="cell-time">{ts.date}</div>
                            {ts.time ? <div className="time-relative">{ts.time}</div> : null}
                          </>
                        );
                      })()}
                    </td>
                    <td>
                      <span className="row-action">
                        <Icons.ChevronRight size={15} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ActivationDetailDrawer
        ar={openAr}
        pr={openPr}
        requestsForAutofill={requests}
        open={!!openArId}
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
    </div>
  );
}
