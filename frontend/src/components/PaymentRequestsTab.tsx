// UI spec: PalFish CRM.html — Payment Request list (Hiếu prototype)
import { useEffect, useMemo, useState } from "react";
import "../styles/prototype-payments.css";
import { usePaymentFlow } from "../contexts/PaymentFlowContext";
import { useMe } from "../hooks/useMe";
import useIsMobile from "../hooks/useIsMobile";
import { usePermission } from "../hooks/usePermission";
import { endpoints } from "../lib/api";
import { compressImageFile } from "../lib/imageCompress";
import type {
  ActiveRequest,
  AddPaymentAttemptPayload,
  ArDraftRow,
  CreatePaymentRequestPayload,
  PatchPaymentRequestPayload,
  PaymentAttempt,
  PaymentRequest,
} from "../types/paymentRequest";
import CancelPrModal from "./payment-request/CancelPrModal";
import CreatePaymentRequestModal from "./payment-request/CreatePaymentRequestModal";
import { type DateRange, EMPTY_RANGE, inDateRange } from "./payment-request/DateRangeFilter";
import { Icons } from "./payment-request/Icons";
import PaymentRequestDetailDrawer from "./payment-request/PaymentRequestDetailDrawer";
import PaymentRequestKpiCards from "./payment-request/PaymentRequestKpiCards";
import PaymentRequestTable from "./payment-request/PaymentRequestTable";
import PaymentRequestToolbar from "./payment-request/PaymentRequestToolbar";
import QrViewModal from "./payment-request/QrViewModal";
import Modal from "./ui/Modal";
import { HdsdLink } from "./help/HdsdLink";
import TvtsFilterDropdown from "./payment-request/TvtsFilterDropdown";
import {
  type RequestBucket,
  type StatusFilter,
  applyTvtsFilter,
  buildArByPrId,
  deriveTvtsOptions,
  fromApiAttempt,
  fromApiPaymentRequest,
  isBackendLineId,
  normalizeRequest,
  nowStamp,
  paginate,
  paymentRequestMatchesSearch,
  visiblePaymentRequests,
} from "./payment-request/paymentRequestUtils";

const PAGE_SIZE = 20;

export default function PaymentRequestsTab() {
  const { readOnly } = usePermission("paymentRequests");
  const { profile } = useMe();
  // Cột TVTS phục vụ leader+ xem PR của team; sale chỉ thấy PR của mình nên ẩn cho gọn bảng
  const showTvts = (profile?.role ?? "sale") !== "sale";
  const {
    requests,
    activeRequests,
    loading,
    apiNote,
    loadData,
    updateRequest,
    updateActiveRequest,
    setEditingArId,
    handleCreate: ctxCreate,
    handleAddPayment: ctxAddPayment,
    handleCreateActiveRequest,
    handleAppendActiveRequest,
    saveActiveRequest,
    deleteActiveRequest,
    reportComplete,
    nav,
    setNav,
  } = usePaymentFlow();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [tab, setTab] = useState<RequestBucket>("tracking");
  const [hideTest, setHideTest] = useState(true);
  // Bộ lọc TVTS tạm thời (leader+): useState thường — chủ ý KHÔNG persist,
  // F5/thoát app/chuyển tab là về mặc định (spec: bộ lọc kiểu Google Sheet)
  const [tvtsSelected, setTvtsSelected] = useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PaymentRequest | null>(null);
  const [qrView, setQrView] = useState<{ qr: PaymentAttempt; request: PaymentRequest } | null>(null);
  const [uploadingBillId, setUploadingBillId] = useState<string | null>(null);
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);
  const [downloadingAllBills, setDownloadingAllBills] = useState(false);
  const [downloadingBillIndex, setDownloadingBillIndex] = useState<number | null>(null);
  const [billDownloadStatus, setBillDownloadStatus] = useState("");
  const [billModal, setBillModal] = useState<{
    open: boolean;
    code: string;
    lineId: string;
    idx: number;
    images: string[];
  }>({
    open: false,
    code: "",
    lineId: "",
    idx: 0,
    images: [],
  });

  const arByPrId = useMemo(() => buildArByPrId(activeRequests), [activeRequests]);

  useEffect(() => {
    if (!nav.openPrId) return;
    const pr = requests.find((r) => r.id === nav.openPrId);
    if (!pr) return;
    setSelectedId(nav.openPrId);
    setDrawerOpen(true);
    setNav({});
  }, [nav.openPrId, requests, setNav]);

  const selected = useMemo(
    () => requests.find((r) => r.id === selectedId) || null,
    [requests, selectedId]
  );

  const billModalQr = useMemo(() => {
    if (!billModal.open || !selected) return null;
    return selected.payments.find((p) => p.id === billModal.lineId) || null;
  }, [billModal.open, billModal.lineId, selected]);

  const billModalLineIsBackend = useMemo(
    () => isBackendLineId(billModal.lineId),
    [billModal.lineId]
  );

  const visibleRequests = useMemo(
    () => visiblePaymentRequests(requests, hideTest),
    [requests, hideTest]
  );

  // Options từ visibleRequests (TRƯỚC khi lọc) — panel luôn liệt kê đủ mọi TVTS đang có data
  const tvtsOptions = useMemo(() => deriveTvtsOptions(visibleRequests), [visibleRequests]);
  // Chèn filter TVTS trên visibleRequests → KPI/chips/tabs/bảng đều phản ánh (chốt C3)
  const tvtsFiltered = useMemo(
    () => applyTvtsFilter(visibleRequests, tvtsSelected),
    [visibleRequests, tvtsSelected]
  );

  const trackingRequests = useMemo(
    () => tvtsFiltered.filter((r) => r.state !== "cancelled"),
    [tvtsFiltered]
  );
  const cancelledRequests = useMemo(
    () => tvtsFiltered.filter((r) => r.state === "cancelled"),
    [tvtsFiltered]
  );
  const createdRequests = useMemo(
    () => tvtsFiltered.filter((r) => r.state !== "cancelled" && arByPrId[r.id]),
    [tvtsFiltered, arByPrId]
  );

  const filtered = useMemo(() => {
    return tvtsFiltered.filter((r) => {
      if (tab === "cancelled") {
        if (r.state !== "cancelled") return false;
      } else {
        if (r.state === "cancelled") return false;
        if (tab === "created" && !arByPrId[r.id]) return false;
      }
      if (tab !== "cancelled" && status !== "all" && r.state !== status) return false;
      if (!inDateRange(r.createdAt, dateRange)) return false;
      // Search accent-insensitive: PR-ID, tên khách, UID, SĐT, tên con (bé 1 + bé phụ)
      return paymentRequestMatchesSearch(r, search);
    });
  }, [tvtsFiltered, tab, status, dateRange, search, arByPrId]);

  // Đổi tab/filter → về trang 1; danh sách co lại thì paginate tự clamp
  useEffect(() => {
    setPage(1);
  }, [tab, status, dateRange, search, hideTest, tvtsSelected]);

  const pageSlice = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page]);

  const chips = useMemo(
    () => [
      { id: "all" as StatusFilter, label: "Tất cả", count: trackingRequests.length },
      {
        id: "pending" as StatusFilter,
        label: "Chưa TT",
        count: trackingRequests.filter((r) => r.state === "pending").length,
        color: "var(--text-2)",
      },
      {
        id: "short" as StatusFilter,
        label: "Thiếu",
        count: trackingRequests.filter((r) => r.state === "short").length,
        color: "var(--danger)",
      },
      {
        id: "done" as StatusFilter,
        label: "Đủ",
        count: trackingRequests.filter((r) => r.state === "done").length,
        color: "var(--success)",
      },
      {
        id: "over" as StatusFilter,
        label: "Thừa",
        count: trackingRequests.filter((r) => r.state === "over").length,
        color: "var(--warning)",
      },
    ],
    [trackingRequests]
  );

  const tabs = useMemo(
    () => [
      {
        key: "tracking" as RequestBucket,
        label: "Đang theo dõi",
        icon: "Wallet" as const,
        count: trackingRequests.length,
      },
      {
        key: "created" as RequestBucket,
        label: "Gói học đã tạo",
        icon: "Sparkle" as const,
        count: createdRequests.length,
      },
      {
        key: "cancelled" as RequestBucket,
        label: "Đã huỷ",
        icon: "XCircle" as const,
        count: cancelledRequests.length,
      },
    ],
    [trackingRequests, createdRequests, cancelledRequests]
  );

  const handleSelect = (request: PaymentRequest) => {
    setSelectedId(request.id);
    setDrawerOpen(true);
  };

  const handleUpdatePr = async (next: PaymentRequest) => {
    const previous = requests.find((r) => r.id === next.id) ?? null;
    // Bug 1A-08: cảnh báo nếu sửa target nhỏ hơn số đã thu — PR sẽ chuyển "Thừa"
    if (previous && next.target !== previous.target && next.target < previous.received) {
      const ok = window.confirm(
        `Tổng tiền dự kiến mới (${next.target.toLocaleString("vi-VN")}đ) ` +
        `nhỏ hơn số đã nhận (${previous.received.toLocaleString("vi-VN")}đ). ` +
        `PR sẽ chuyển sang trạng thái "Thừa". Vẫn lưu?`
      );
      if (!ok) return false;
    }
    updateRequest(next.id, () => next);

    const payload: PatchPaymentRequestPayload = {
      uid: next.uid.trim(),
      name: next.name.trim(),
      child_name: (next.childName || "").trim() || undefined,
      phone: next.phone.trim(),
      country: (next.country || "VN").trim(),
      address: (next.address || "").trim(),
      ward: (next.ward || "").trim(),
      province: (next.province || "").trim(),
      note: (next.note || "").trim(),
      email: (next.email || "").trim(),
      target: next.target,
      tax_id: (next.taxId || "").trim() || undefined,
      customer_type: next.customerType || "individual",
      company_name: next.customerType === "business" ? (next.companyName || "").trim() || undefined : undefined,
      lead_source: next.leadSource || undefined,
      lead_channel: next.leadChannel || undefined,
      wants_invoice: next.wantsInvoice ?? undefined,
    };

    try {
      const res = await endpoints.paymentRequests.update(next.id, payload);
      const savedRaw = res.data?.payment_request;
      if (savedRaw) {
        const saved = normalizeRequest(fromApiPaymentRequest(savedRaw));
        const prev = requests.find((r) => r.id === next.id);
        if (prev) {
          // Response PATCH không có sale_name — giữ lại tên TVTS đã load từ danh sách
          saved.saleName = saved.saleName || prev.saleName;
          const prevContentMap = new Map(
            prev.payments.map((p) => [p.id, { transferContent: p.transferContent, qrCode: p.qrCode, checkoutUrl: p.checkoutUrl, paymentLinkId: p.paymentLinkId }])
          );
          saved.payments = saved.payments.map((p) => {
            const cached = prevContentMap.get(p.id);
            if (cached) {
              return {
                ...p,
                transferContent: p.transferContent || cached.transferContent,
                qrCode: p.qrCode || cached.qrCode,
                checkoutUrl: p.checkoutUrl || cached.checkoutUrl,
                paymentLinkId: p.paymentLinkId || cached.paymentLinkId,
              };
            }
            return p;
          });
        }
        updateRequest(next.id, () => saved);
      }
      return true;
    } catch {
      if (previous) {
        updateRequest(next.id, () => previous);
      }
      alert("Không thể lưu thông tin khách hàng. Vui lòng thử lại.");
      return false;
    }
  };

  const handleCreate = async (payload: CreatePaymentRequestPayload) => {
    const saved = await ctxCreate(payload);
    setSelectedId(saved.id);
    setCreateOpen(false);
    setDrawerOpen(true);
    setTab("tracking");
  };

  const handleAddPayment = async (payload: AddPaymentAttemptPayload) => {
    if (!selected) return;
    const confirmed = await ctxAddPayment(selected.id, payload);
    if (payload.method === "qr" && confirmed && confirmed.payment.status !== "paid") {
      setQrView({ qr: confirmed.payment, request: confirmed.request });
    }
  };

  const handleCancelPayment = async (qr: PaymentAttempt) => {
    if (!selected) return;
    const prId = selected.id;
    const cancelledAt = nowStamp();
    const reason = "Sales huỷ lần thanh toán";
    // Snapshot trước optimistic để rollback nếu BE từ chối
    const previous = requests.find((r) => r.id === prId) ?? null;

    updateRequest(prId, (r) => ({
      ...r,
      payments: r.payments.map((p: PaymentAttempt) =>
        p.id === qr.id
          ? {
              ...p,
              cancelled: true,
              cancelledAt,
              status: "rejected" as const,
              paidAt: null,
              rejectReason: reason,
            }
          : p
      ),
    }));

    if (!isBackendLineId(qr.id)) return;
    try {
      const res = await endpoints.transactions.patchStatus(qr.id, "rejected", reason);
      const line = res.data.payment_line;
      updateRequest(prId, (r) => {
        const updatedPayments = r.payments.map((p: PaymentAttempt) =>
          p.id === qr.id
            ? {
                ...p,
                status: "rejected" as const,
                paidAt: null,
                rejectReason: line.reject_reason || reason,
                cancelled: true,
                cancelledAt: p.cancelledAt || cancelledAt,
              }
            : p
        );
        const prFromBe = fromApiPaymentRequest(res.data.payment_request);
        return normalizeRequest({ ...r, ...prFromBe, payments: updatedPayments });
      });
    } catch (err) {
      // BE từ chối → rollback FE để UI khớp DB
      if (previous) updateRequest(prId, () => previous);
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Không huỷ được lần thanh toán. Vui lòng thử lại.";
      alert(msg);
    }
  };

  const handleEditAmount = async (qr: PaymentAttempt, newAmount: number) => {
    if (!selected) return;
    const prId = selected.id;
    const oldAmount = qr.amount;

    updateRequest(prId, (r) => ({
      ...r,
      payments: r.payments.map((p: PaymentAttempt) =>
        p.id === qr.id ? { ...p, amount: newAmount } : p
      ),
    }));

    if (!isBackendLineId(qr.id)) return;
    try {
      const res = await endpoints.paymentRequests.patchPaymentLineAmount(qr.id, newAmount);
      updateRequest(prId, (r) => {
        const updatedPayments = r.payments.map((p: PaymentAttempt) =>
          p.id === qr.id ? { ...p, amount: res.data.payment_line.amount ?? newAmount } : p
        );
        const prFromBe = fromApiPaymentRequest(res.data.payment_request);
        return normalizeRequest({ ...r, ...prFromBe, payments: updatedPayments });
      });
    } catch {
      updateRequest(prId, (r) => ({
        ...r,
        payments: r.payments.map((p: PaymentAttempt) =>
          p.id === qr.id ? { ...p, amount: oldAmount } : p
        ),
      }));
    }
  };

  const handleRefreshLineContent = async (line: PaymentAttempt) => {
    if (!selected) return;
    const prId = selected.id;
    try {
      const res = await endpoints.paymentRequests.refreshPaymentLineContent(line.id);
      updateRequest(prId, (r) => ({
        ...r,
        payments: r.payments.map((p: PaymentAttempt) =>
          p.id === line.id
            ? {
                ...p,
                transferContent: res.data.payment_line.transfer_content ?? p.transferContent,
                nameForTransfer: res.data.payment_line.name_for_transfer ?? p.nameForTransfer ?? null,
                isContentStale: false,
              }
            : p
        ),
      }));
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Không cập nhật được nội dung QR.";
      alert(String(msg));
      throw err;
    }
  };

  const handleDismissLineStale = async (lineId: string) => {
    if (!selected) return;
    const prId = selected.id;
    // Optimistic: tắt cờ stale trong state đã nạp → mở lại drawer không hiện cảnh báo.
    updateRequest(prId, (r) => ({
      ...r,
      payments: r.payments.map((p: PaymentAttempt) =>
        p.id === lineId ? { ...p, isContentStale: false } : p
      ),
    }));
    try {
      await endpoints.paymentRequests.dismissPaymentLineStale(lineId);
    } catch (err) {
      // Dismiss là ý định rõ của sale; nếu server lỗi thì reload sẽ hiện lại — không nag.
      console.error("dismiss-stale failed", err);
    }
  };

  const handleMarkPaid = async (qr: PaymentAttempt) => {
    if (!selected) return;
    const prId = selected.id;
    // Snapshot trước optimistic — nếu BE từ chối thì rollback để KPI không sai
    const previous = requests.find((r) => r.id === prId) ?? null;
    updateRequest(prId, (r) => ({
      ...r,
      payments: r.payments.map((p: PaymentAttempt) =>
        p.id === qr.id ? { ...p, status: "paid", paidAt: nowStamp() } : p
      ),
    }));
    if (!isBackendLineId(qr.id)) return;
    try {
      const res = await endpoints.transactions.patchStatus(qr.id, "paid");
      const line = res.data.payment_line;
      updateRequest(prId, (r) => {
        const updatedPayments = r.payments.map((p: PaymentAttempt) =>
          p.id === qr.id
            ? { ...p, status: "paid" as const, paidAt: line.paid_at || nowStamp(), bill: !!(line.bill_image ?? p.billImage), billImage: line.bill_image ?? p.billImage ?? null }
            : p
        );
        const prFromBe = fromApiPaymentRequest(res.data.payment_request);
        return normalizeRequest({ ...r, ...prFromBe, payments: updatedPayments });
      });
    } catch (err) {
      // BE từ chối → rollback FE; KPI doanh thu không bị "ảo"
      if (previous) updateRequest(prId, () => previous);
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Không xác nhận được thanh toán. Vui lòng thử lại.";
      alert(msg);
    }
  };

  const getBillImages = (qr: PaymentAttempt): string[] => {
    if (qr.billImages?.length) return qr.billImages;
    return qr.billImage ? [qr.billImage] : [];
  };

  const handleBillView = (qr: PaymentAttempt) => {
    const images = getBillImages(qr);
    if (!images.length) return;
    setBillModal({
      open: true,
      code: qr.code,
      lineId: qr.id,
      idx: qr.idx,
      images,
    });
  };

  const handleBillFile = async (qr: PaymentAttempt, file: File) => {
    if (!selected) return;
    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn định dạng ảnh!");
      return;
    }
    if (!isBackendLineId(qr.id)) {
      alert("Giao dịch chưa lưu trên server — không upload được ảnh bill.");
      return;
    }
    setUploadingBillId(qr.id);
    try {
      const compressed = await compressImageFile(file);
      const blob = await (await fetch(compressed)).blob();
      const up = await endpoints.paymentRequests.uploadPaymentLineBill(qr.id, blob, `${qr.id}.jpg`);
      const line = up.data.payment_line;
      const mapped = fromApiAttempt(line, qr.idx);
      updateRequest(selected.id, (r) => ({
        ...r,
        payments: r.payments.map((p: PaymentAttempt) => (p.id === qr.id ? { ...p, ...mapped } : p)),
      }));
      if (billModal.open && billModal.lineId === qr.id) {
        setBillModal((m) => ({
          ...m,
          images: getBillImages(mapped),
        }));
      }
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const msg = err?.response?.data?.detail || err?.message || "Lỗi không xác định";
      alert(`Không lưu được ảnh biên lai: ${msg}`);
    } finally {
      setUploadingBillId(null);
    }
  };

  const handleBillDelete = async (qr: PaymentAttempt, billUrl?: string, deleteAll = false) => {
    if (!selected) return;
    if (!isBackendLineId(qr.id)) return;
    const currentImages = getBillImages(qr);
    if (!currentImages.length) return;
    setDeletingBillId(qr.id);
    try {
      const res = deleteAll
        ? await endpoints.paymentRequests.deleteAllPaymentLineBills(qr.id)
        : billUrl
        ? await endpoints.paymentRequests.deletePaymentLineBill(qr.id, billUrl)
        : await endpoints.paymentRequests.deleteLatestPaymentLineBill(qr.id);
      const line = res.data.payment_line;
      const mapped = fromApiAttempt(line, qr.idx);
      updateRequest(selected.id, (r) => ({
        ...r,
        payments: r.payments.map((p: PaymentAttempt) => (p.id === qr.id ? { ...p, ...mapped } : p)),
      }));
      if (billModal.open && billModal.lineId === qr.id) {
        const nextImages = getBillImages(mapped);
        setBillModal((m) => ({ ...m, images: nextImages, open: nextImages.length > 0 }));
      }
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const msg = err?.response?.data?.detail || err?.message || "Loi khong xac dinh";
      alert(`Khong xoa duoc bill: ${msg}`);
    } finally {
      setDeletingBillId(null);
    }
  };

  const parseDownloadFilename = (contentDisposition: string | undefined, fallback: string) => {
    if (!contentDisposition) return fallback;
    const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8?.[1]) {
      try {
        return decodeURIComponent(utf8[1].trim());
      } catch {
        /* ignore decode failure */
      }
    }
    const plain = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
    return plain?.[1]?.trim() || fallback;
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const navWithMsSave = navigator as Navigator & {
      msSaveOrOpenBlob?: (blobData: Blob, defaultName?: string) => boolean;
    };
    if (typeof navWithMsSave.msSaveOrOpenBlob === "function") {
      navWithMsSave.msSaveOrOpenBlob(blob, filename);
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Some embedded browsers finish download asynchronously; revoking too early can cancel silently.
    window.setTimeout(() => URL.revokeObjectURL(url), 15000);
  };

  const setDownloadStatusTransient = (text: string, timeoutMs = 2200) => {
    setBillDownloadStatus(text);
    if (!text) return;
    window.setTimeout(() => setBillDownloadStatus(""), timeoutMs);
  };

  const fallbackDirectImageDownload = (src: string, fallbackName: string) => {
    const a = document.createElement("a");
    a.href = src;
    a.download = fallbackName;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownloadSingleBill = async (idx: number) => {
    if (!billModal.lineId || idx < 0 || idx >= billModal.images.length) return;
    if (downloadingAllBills || downloadingBillIndex !== null) return;

    setDownloadingBillIndex(idx);
    setBillDownloadStatus("Dang tai bill...");
    try {
      if (billModalLineIsBackend) {
        const res = await endpoints.paymentRequests.downloadPaymentLineBill(billModal.lineId, idx);
        const fallback = `${billModal.code || billModal.lineId}-bill-${idx + 1}.jpg`;
        const filename = parseDownloadFilename(
          (res.headers?.["content-disposition"] as string | undefined) ??
            (res.headers?.["Content-Disposition"] as string | undefined),
          fallback
        );
        triggerBlobDownload(res.data, filename);
        setDownloadStatusTransient("Da bat dau tai bill");
        return;
      }
      fallbackDirectImageDownload(
        billModal.images[idx],
        `${billModal.code || "bill"}-${idx + 1}.jpg`
      );
      setDownloadStatusTransient("Da mo link tai bill");
    } catch {
      if (billModal.images[idx]) {
        fallbackDirectImageDownload(
          billModal.images[idx],
          `${billModal.code || "bill"}-${idx + 1}.jpg`
        );
        setDownloadStatusTransient("Tai API loi, da fallback link truc tiep");
      } else {
        setDownloadStatusTransient("Loi tai bill", 3000);
        alert("Không tải được ảnh bill.");
      }
    } finally {
      setDownloadingBillIndex(null);
    }
  };

  const handleDownloadAllBills = async () => {
    if (!billModal.open || !billModal.lineId || billModal.images.length === 0 || downloadingAllBills) return;
    setDownloadingAllBills(true);
    setBillDownloadStatus("Dang tao file ZIP...");
    try {
      if (billModalLineIsBackend) {
        const res = await endpoints.paymentRequests.downloadAllPaymentLineBills(billModal.lineId);
        const fallback = `${billModal.code || billModal.lineId}-bills.zip`;
        const filename = parseDownloadFilename(
          (res.headers?.["content-disposition"] as string | undefined) ??
            (res.headers?.["Content-Disposition"] as string | undefined),
          fallback
        );
        triggerBlobDownload(res.data, filename);
        setDownloadStatusTransient("Da bat dau tai ZIP");
      } else {
        billModal.images.forEach((src, idx) =>
          fallbackDirectImageDownload(src, `${billModal.code || "bill"}-${idx + 1}.jpg`)
        );
        setDownloadStatusTransient("Da mo tai tung bill");
      }
    } catch {
      if (billModal.images.length) {
        billModal.images.forEach((src, idx) =>
          fallbackDirectImageDownload(src, `${billModal.code || "bill"}-${idx + 1}.jpg`)
        );
        setDownloadStatusTransient("Tai ZIP loi, da fallback tung bill");
      } else {
        alert("Không tải được bộ bill.");
      }
    } finally {
      setDownloadingAllBills(false);
    }
  };

  const handleConfirmCancel = async ({ reason }: { reason: string }) => {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    // Snapshot PR trước optimistic — nếu BE từ chối (vì PR đã có lần TT paid hay
    // đã nhận tiền), rollback để PR không bị "cancelled giả".
    const previous = requests.find((r) => r.id === id) ?? null;
    const wasDrawerOpen = selected?.id === id && drawerOpen;
    updateRequest(id, (r) => ({
      ...r,
      cancelledAt: nowStamp(),
      cancelledReason: reason,
      state: "cancelled",
    }));
    setCancelTarget(null);
    if (selected?.id === id) setDrawerOpen(false);
    try {
      await endpoints.paymentRequests.cancel(id);
    } catch (err) {
      if (previous) updateRequest(id, () => previous);
      if (wasDrawerOpen) setDrawerOpen(true);
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Không huỷ được PR. Vui lòng thử lại.";
      alert(msg);
    }
  };

  const handleRestore = async (request: PaymentRequest) => {
    // Snapshot trước optimistic — nếu BE từ chối thì rollback
    const previous = requests.find((r) => r.id === request.id) ?? null;
    updateRequest(request.id, (r) => ({
      ...r,
      cancelledAt: null,
      cancelledReason: null,
      state: "pending",
    }));
    try {
      const res = await endpoints.paymentRequests.restore(request.id);
      const savedRaw = res.data?.payment_request;
      if (savedRaw) {
        const saved = normalizeRequest(fromApiPaymentRequest(savedRaw));
        updateRequest(request.id, () => saved);
      }
    } catch (err) {
      if (previous) updateRequest(request.id, () => previous);
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Không khôi phục được PR. Vui lòng thử lại.";
      alert(msg);
    }
  };

  const onCreateActiveRequest = async (rows: ArDraftRow[], opts?: { holdActivation?: boolean; holdNote?: string }) => {
    if (!selected || arByPrId[selected.id]) return;
    // Inline AR mini-window: tạo xong → giữ drawer mở, không navigate sang tab Kích hoạt khoá học
    // Context state cập nhật → drawer tự re-render với AR card mới
    await handleCreateActiveRequest(selected, rows, opts);
  };

  const onAppendActiveRequest = async (rows: ArDraftRow[], opts?: { holdActivation?: boolean; holdNote?: string }) => {
    if (!selected) return;
    const existingAr = arByPrId[selected.id];
    if (!existingAr) return;
    await handleAppendActiveRequest(selected, existingAr.id, rows, opts);
  };

  // Local-only update — KHÔNG gọi server mỗi keystroke (race condition: response chậm
  // overwrite state mới hơn, làm mất ký tự user vừa gõ). Server save dùng Save button.
  const handleActiveRequestMiniMutate = (
    arId: string,
    updater: (ar: ActiveRequest) => ActiveRequest
  ) => {
    updateActiveRequest(arId, updater);
  };

  const isMobile = useIsMobile();

  return (
    <div className="gmv-prototype">
      <div className="page page--fit">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          {!isMobile && (
            <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 640, lineHeight: 1.55 }}>
              Mỗi <strong style={{ color: "var(--text-2)" }}>Payment Request</strong> đại diện cho một thương vụ. Một PR có thể gồm{" "}
              <strong style={{ color: "var(--text-2)" }}>nhiều lần thanh toán</strong> (chuyển khoản nhiều lần hoặc 1 lần CK cho nhiều đơn). Khi đủ 100% sẽ chuyển sang bước Active Request.
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!readOnly && (
              <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <Icons.Plus size={15} strokeWidth={2.3} /> Tạo Payment Request
              </button>
            )}
            <HdsdLink moduleSlug="paymentRequests" topicSlug="tao-payment-request" />
          </div>
        </div>

        {tab !== "cancelled" && <PaymentRequestKpiCards requests={trackingRequests} />}

        <PaymentRequestToolbar
          search={search}
          status={status}
          dateRange={dateRange}
          chips={chips}
          showChips={tab !== "cancelled"}
          hideTest={hideTest}
          onSearch={setSearch}
          onStatus={setStatus}
          onDateRange={setDateRange}
          onHideTestChange={setHideTest}
          tvtsFilter={
            showTvts ? (
              <TvtsFilterDropdown
                options={tvtsOptions}
                selected={tvtsSelected}
                onChange={setTvtsSelected}
              />
            ) : undefined
          }
        />

        {apiNote && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #f6d36b",
              background: "var(--warning-bg)",
              color: "var(--warning-text)",
              fontSize: 12.5,
            }}
          >
            {apiNote}
          </div>
        )}

        <PaymentRequestTable
          requests={pageSlice.rows}
          total={filtered.length}
          page={pageSlice.page}
          totalPages={pageSlice.totalPages}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedId={drawerOpen ? selected?.id ?? null : null}
          tab={tab}
          onTabChange={setTab}
          tabs={tabs}
          onSelect={handleSelect}
          onCancelClick={setCancelTarget}
          onRestoreClick={handleRestore}
          arByPrId={arByPrId}
          showTvts={showTvts}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <HdsdLink moduleSlug="paymentRequests" topicSlug="tong-quan" />
          <button className="btn btn-outline btn-sm" onClick={() => void loadData()} disabled={loading}>
            {loading ? "Đang tải..." : "Tải lại dữ liệu"}
          </button>
        </div>
      </div>

      <PaymentRequestDetailDrawer
        request={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdatePr={handleUpdatePr}
        onAddPayment={handleAddPayment}
        onCancelPayment={handleCancelPayment}
        onMarkPaid={handleMarkPaid}
        onEditAmount={handleEditAmount}
        onBillFile={handleBillFile}
        onBillView={handleBillView}
        uploadingBillId={uploadingBillId}
        deletingBillId={deletingBillId}
        onCreateActiveRequest={onCreateActiveRequest}
        onAppendActiveRequest={onAppendActiveRequest}
        onCancelRequest={() => selected && setCancelTarget(selected)}
        activeRequestId={selected ? arByPrId[selected.id]?.id ?? null : null}
        activeRequest={selected ? arByPrId[selected.id] ?? null : null}
        onActiveRequestMutate={handleActiveRequestMiniMutate}
        onActiveRequestSave={saveActiveRequest}
        onActiveRequestDelete={deleteActiveRequest}
        onReportComplete={async (reason) => { if (selected) await reportComplete(selected.id, reason); }}
        onEditingArIdChange={setEditingArId}
        onShowQr={(qr) => selected && setQrView({ qr, request: selected })}
        readOnly={readOnly}
        onRefreshLineContent={handleRefreshLineContent}
        onDismissLineStale={handleDismissLineStale}
        onTransferred={() => void loadData()}
      />

      <CreatePaymentRequestModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} />
      <CancelPrModal pr={cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleConfirmCancel} />

      <QrViewModal
        qr={qrView?.qr ?? null}
        request={qrView?.request ?? null}
        onClose={() => setQrView(null)}
      />

      <Modal
        open={billModal.open}
        onClose={() => setBillModal((m) => ({ ...m, open: false }))}
        title={`Bill: ${billModal.code}`}
        headerExtra={<HdsdLink moduleSlug="paymentRequests" topicSlug="thieu-anh-bill" />}
        wide
        overlayClassName="z-[120]"
        className="text-center"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            {billModal.images.length} bill
            {billDownloadStatus ? (
              <span style={{ marginLeft: 10, color: "var(--text-2)", fontWeight: 600 }}>
                {billDownloadStatus}
              </span>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={
                !billModal.lineId ||
                (!billModalLineIsBackend && billModal.images.length === 0) ||
                deletingBillId === billModal.lineId ||
                billModal.images.length === 0 ||
                downloadingAllBills ||
                downloadingBillIndex !== null
              }
              onClick={() => void handleDownloadAllBills()}
            >
              <Icons.Download size={13} /> {downloadingAllBills ? "Đang tải..." : "Tải tất cả"}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ color: "var(--danger)" }}
              disabled={
                !billModalQr ||
                deletingBillId === billModal.lineId ||
                billModal.images.length === 0 ||
                downloadingAllBills ||
                downloadingBillIndex !== null
              }
              onClick={async () => {
                if (!billModalQr) return;
                await handleBillDelete(billModalQr, undefined, true);
              }}
            >
              <Icons.XCircle size={13} /> Xoá tất cả
            </button>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
            maxHeight: "70vh",
            overflowY: "auto",
            paddingRight: 4,
            textAlign: "left",
          }}
        >
          {billModal.images.map((src, idx) => (
            <div
              key={`${src}-${idx}`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--surface-2)",
                padding: 10,
              }}
            >
              <img
                src={src}
                alt={`Biên lai ${idx + 1}`}
                style={{
                  width: "100%",
                  maxHeight: 260,
                  objectFit: "contain",
                  borderRadius: 8,
                  background: "white",
                  border: "1px solid var(--border)",
                  cursor: "zoom-in",
                }}
                onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
              />
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>Bill #{idx + 1}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={
                      !billModal.lineId ||
                      deletingBillId === billModal.lineId ||
                      downloadingAllBills ||
                      downloadingBillIndex !== null
                    }
                    onClick={() => void handleDownloadSingleBill(idx)}
                  >
                    <Icons.Download size={12} /> {downloadingBillIndex === idx ? "Đang tải..." : "Tải ảnh"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ color: "var(--danger)" }}
                    disabled={!billModalQr || deletingBillId === billModal.lineId || downloadingAllBills}
                    onClick={async () => {
                      if (!billModalQr) return;
                      await handleBillDelete(billModalQr, src);
                    }}
                  >
                    <Icons.XCircle size={12} /> Xoá bill này
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
