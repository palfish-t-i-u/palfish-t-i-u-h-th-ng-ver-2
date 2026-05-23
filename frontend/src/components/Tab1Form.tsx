import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BANK_INFO } from "../constants/bank";
import { useCountryCodes } from "../hooks/useCountryCodes";
import { useVietnamAddress } from "../hooks/useVietnamAddress";
import { endpoints } from "../lib/api";
import { formatApiError } from "../lib/apiErrors";
import { formatVndInput, parseVndInput } from "../lib/vndFormat";
import { isVnCountryCode } from "../lib/vnPhone";
import { LEAD_KENH_OPTIONS, NGUON_OPTIONS, type Order } from "../types/order";
import { Button, Input, Select } from "./ui";
import { Card, CardBody, CardHeader } from "./ui/Card";
import { cn } from "../lib/cn";

interface CrmCustomer {
  crmUid: string;
  hoTen: string;
  sdt: string;
  diaChi: string;
}

function parsePhone(sdt: string): { code: string; rest: string } {
  const m = sdt.trim().match(/^(\+\d{1,4})\s*(.*)$/);
  if (m) return { code: m[1], rest: m[2].trim() };
  return { code: "+84", rest: sdt.trim() };
}

// ---------------------------------------------------------------------------
// Inline payment card — dùng PayOS QR
// ---------------------------------------------------------------------------
type QrCopyState = { kind: "idle" } | { kind: "ok" } | { kind: "downloaded" } | { kind: "err"; msg: string };

function InlinePaymentCard({
  maDonHang,
  tongTien,
  infoCode,
  onNewOrder,
}: {
  maDonHang: string;
  tongTien: number;
  infoCode: string;
  onNewOrder: () => void;
}) {
  const amountLabel = tongTien > 0 ? tongTien.toLocaleString("vi-VN") : "—";
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [qrCopy, setQrCopy] = useState<QrCopyState>({ kind: "idle" });

  // PayOS state
  const [payosLoading, setPayosLoading] = useState(true);
  const [payosQrUrl, setPayosQrUrl] = useState<string>("");
  const [payosCheckoutUrl, setPayosCheckoutUrl] = useState<string>("");
  const [payosError, setPayosError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setPayosLoading(true);
    setPayosError("");
    endpoints.payos
      .createLink({ amount: tongTien, infoCode, maDonHang })
      .then((res) => {
        if (cancelled) return;
        const { qrCode, checkoutUrl } = res.data;
        // Render EMV QR string thành ảnh qua qrserver.com
        setPayosQrUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrCode)}`
        );
        setPayosCheckoutUrl(checkoutUrl);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Không tạo được QR PayOS.";
        setPayosError(msg);
      })
      .finally(() => { if (!cancelled) setPayosLoading(false); });
    return () => { cancelled = true; };
  }, [tongTien, infoCode, maDonHang]);

  const flash = useCallback((s: QrCopyState) => {
    setQrCopy(s);
    setTimeout(() => setQrCopy({ kind: "idle" }), 2500);
  }, []);

  async function fetchQrBlob(): Promise<Blob | null> {
    if (!payosQrUrl) return null;
    try {
      const res = await fetch(payosQrUrl, { mode: "cors", cache: "no-store" });
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.type.startsWith("image/") ? blob : null;
    } catch { return null; }
  }

  async function blobFromCanvas(): Promise<Blob | null> {
    const img = imgRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
    } catch { return null; }
  }

  async function handleCopyQr() {
    const supports =
      typeof window !== "undefined" &&
      typeof window.ClipboardItem !== "undefined" &&
      !!navigator.clipboard?.write;
    if (supports) {
      try {
        const item = new window.ClipboardItem({
          "image/png": (async () => {
            const blob = (await fetchQrBlob()) || (await blobFromCanvas());
            if (!blob) throw new Error("no-blob");
            return blob;
          })(),
        });
        await navigator.clipboard.write([item]);
        flash({ kind: "ok" });
        return;
      } catch { /* fall through */ }
    }
    const blob = (await fetchQrBlob()) || (await blobFromCanvas());
    if (!blob) {
      flash({ kind: "err", msg: "Không lấy được ảnh QR. Thử chụp màn hình." });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `QR-${maDonHang}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash({ kind: "downloaded" });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>✅ Đơn đã tạo — Thông tin thanh toán</span>
          <Button variant="secondary" size="sm" onClick={onNewOrder}>
            + Tạo đơn mới
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        <p className="mb-4 text-center text-sm text-gmv-muted">
          Mã đơn: <strong className="text-gmv-text-strong">{maDonHang}</strong>
        </p>

        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          {/* Bank info */}
          <div className="flex-1 space-y-2 text-sm leading-relaxed">
            <InfoLine label="Tên tài khoản" value={BANK_INFO.accountName} />
            <InfoLine label="Ngân hàng" value={BANK_INFO.displayName} />
            <InfoLine label="Số tài khoản" value={BANK_INFO.accountNo} />
            <InfoLine label="Số tiền" value={`${amountLabel} VNĐ`} />
            <div className="pt-2">
              <div className="mb-1 text-gmv-text">Nội dung chuyển khoản:</div>
              <span className="inline-block rounded-gmv-sm border border-dashed border-gmv-warn bg-gmv-warn-soft px-2.5 py-1 text-base font-bold text-gmv-warn">
                {infoCode}
              </span>
              <p className="mt-1 text-xs italic text-gmv-danger">
                ⚠️ Khách PHẢI ghi đúng nội dung này khi chuyển khoản
              </p>
            </div>
            {payosCheckoutUrl && (
              <div className="pt-1">
                <a
                  href={payosCheckoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-gmv-md border border-gmv-primary px-3 py-1.5 text-sm font-semibold text-gmv-primary hover:bg-gmv-primary-soft"
                >
                  Mở trang thanh toán PayOS →
                </a>
              </div>
            )}
          </div>

          {/* PayOS QR */}
          <div className="flex flex-col items-center justify-start border-t border-dashed border-gmv-border pt-4 md:w-[260px] md:border-l md:border-t-0 md:pl-5 md:pt-0">
            {payosLoading && (
              <div className="flex h-[240px] w-[240px] items-center justify-center rounded-gmv-md border border-gmv-border">
                <span className="animate-spin text-2xl text-gmv-muted">⟳</span>
              </div>
            )}
            {payosError && !payosLoading && (
              <div className="flex h-[200px] w-full flex-col items-center justify-center rounded-gmv-md border border-gmv-danger/30 bg-gmv-danger-soft p-4 text-center text-xs text-gmv-danger">
                <p className="font-semibold">Không tạo được QR PayOS</p>
                <p className="mt-1 opacity-75">{payosError}</p>
              </div>
            )}
            {!payosLoading && payosQrUrl && (
              <>
                <img
                  ref={imgRef}
                  src={payosQrUrl}
                  alt="QR PayOS thanh toán"
                  crossOrigin="anonymous"
                  className="rounded-gmv-md border border-gmv-border p-1"
                  width={240}
                  height={240}
                />
                <p className="mt-2 text-center text-xs font-semibold text-gmv-primary">
                  Quét bằng App Ngân Hàng bất kỳ
                </p>
                <p className="mt-0.5 text-center text-xs italic text-gmv-muted">
                  Nội dung CK: <strong>{infoCode}</strong>
                </p>
                <div className="mt-3 flex flex-col items-center gap-2">
                  <Button type="button" variant="primary" size="sm" onClick={handleCopyQr}>
                    Copy mã QR
                  </Button>
                  {qrCopy.kind === "ok" && (
                    <span className="text-xs font-semibold text-gmv-ok">✓ Đã copy — paste vào Zalo / chat</span>
                  )}
                  {qrCopy.kind === "downloaded" && (
                    <span className="text-xs font-semibold text-gmv-warn">↓ Đã tải file QR</span>
                  )}
                  {qrCopy.kind === "err" && (
                    <span className="text-xs font-semibold text-gmv-danger">✗ {qrCopy.msg}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      {label}: <span className="font-bold text-gmv-primary">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
function FormRow({
  label,
  required,
  topAlign,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  topAlign?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-2 md:flex-row",
        topAlign ? "md:items-start" : "md:items-center"
      )}
    >
      <label
        className={cn(
          "shrink-0 text-sm font-semibold text-gmv-text-strong md:w-[180px] md:text-right",
          topAlign && "md:pt-2.5"
        )}
      >
        {label}
        {required && <span className="text-gmv-danger"> *</span>}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

interface Props {
  onOrderCreated: (order: Order) => void;
  dbExcel: { uid: string; diaChi: string }[];
  createdBy?: string;
}

const PACKAGES_DATALIST_ID = "kh-packages-datalist";

export default function Tab1Form({ onOrderCreated, dbExcel, createdBy }: Props) {
  // UIDs: ít nhất 1 ô; ô đầu = UID chính (auto-fill khách), các ô sau = UID con.
  const [uids, setUids] = useState<string[]>([""]);
  const [tenKhach, setTenKhach] = useState("");
  const [goiHoc, setGoiHoc] = useState("");
  const [tongTienRaw, setTongTienRaw] = useState(""); // chỉ digits
  const [datCoc, setDatCoc] = useState(false);
  const [nguon, setNguon] = useState("");
  const [leadKenh, setLeadKenh] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [packages, setPackages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [diaChiMatched, setDiaChiMatched] = useState(false);
  const [payment, setPayment] = useState<{
    open: boolean;
    maDonHang: string;
    tongTien: number;
    infoCode: string;
  }>({ open: false, maDonHang: "", tongTien: 0, infoCode: "" });

  const { codes, phoneCode, setPhoneCode } = useCountryCodes();
  const addr = useVietnamAddress();
  const [soMay, setSoMay] = useState("");
  const [uidSuggestions, setUidSuggestions] = useState<CrmCustomer[]>([]);
  const [uidDropdownOpen, setUidDropdownOpen] = useState(false);
  const [uidSearching, setUidSearching] = useState(false);
  const uidDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uidBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    endpoints.packages
      .list()
      .then((res) => setPackages(res.data.packages))
      .catch(() =>
        setPackages([
          "2/W- NEW 24 PHI+2 (HN 河内) | Giá: 7.280.000 VND",
          "2/W- UPSALE 48 PHI+5 (HN 河内) | Giá: 14.840.000 VND",
          "2/W- UPSALE 96 PHI+10 (HN 河内) | Giá: 29.680.000 VND",
        ])
      );
  }, []);

  useEffect(() => {
    return () => {
      if (uidDebounceRef.current) clearTimeout(uidDebounceRef.current);
      if (uidBlurTimerRef.current) clearTimeout(uidBlurTimerRef.current);
    };
  }, []);

  // Khi đổi sang "Đặt cọc" → reset gói + nguồn + lead
  useEffect(() => {
    if (datCoc) {
      setGoiHoc("");
      setNguon("");
      setLeadKenh("");
    }
  }, [datCoc]);

  // Khi đổi nguồn khác "Bán mới" → reset leadKenh
  useEffect(() => {
    if (nguon !== "Bán mới") setLeadKenh("");
  }, [nguon]);

  function triggerUidSearch(value: string) {
    if (uidDebounceRef.current) clearTimeout(uidDebounceRef.current);
    if (value.trim().length < 2) {
      setUidSuggestions([]);
      setUidDropdownOpen(false);
      return;
    }
    uidDebounceRef.current = setTimeout(async () => {
      setUidSearching(true);
      try {
        const res = await endpoints.crm.searchCustomers(value.trim());
        setUidSuggestions(res.data.customers || []);
        setUidDropdownOpen(true);
      } catch {
        setUidSuggestions([]);
        setUidDropdownOpen(false);
      } finally {
        setUidSearching(false);
      }
    }, 300);
  }

  function pickCustomer(c: CrmCustomer) {
    setUids((prev) => {
      const next = [...prev];
      next[0] = c.crmUid;
      return next;
    });
    setTenKhach(c.hoTen || "");
    const { code, rest } = parsePhone(c.sdt || "");
    setPhoneCode(code);
    setSoMay(rest);
    if (c.diaChi) {
      addr.setChiTietMatched(c.diaChi);
      setDiaChiMatched(true);
    }
    setStatusMsg({ text: `✓ Đã tự điền thông tin khách "${c.hoTen}"`, ok: true });
    setUidDropdownOpen(false);
    setUidSuggestions([]);
  }

  function handlePrimaryUIDBlur() {
    const primary = uids[0]?.trim();
    if (dbExcel.length === 0 || !primary) return;
    const found = dbExcel.find((r) => r.uid.toLowerCase() === primary.toLowerCase());
    if (found) {
      setStatusMsg({ text: "✓ UID hợp lệ. Đã tìm thấy địa chỉ trong dữ liệu gốc!", ok: true });
      if (found.diaChi && !addr.chiTiet) {
        addr.setChiTietMatched(found.diaChi);
        setDiaChiMatched(true);
      }
    } else {
      setStatusMsg({ text: "Không tìm thấy UID này trong file dữ liệu gốc.", ok: false });
    }
  }

  function updateUid(idx: number, value: string) {
    setUids((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
    if (idx === 0) {
      setStatusMsg(null);
      setDiaChiMatched(false);
      triggerUidSearch(value);
    }
  }

  function addUidRow() {
    setUids((prev) => [...prev, ""]);
  }

  function removeUidRow(idx: number) {
    setUids((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  function clearForm() {
    setUids([""]);
    setTenKhach("");
    setSoMay("");
    setPhoneCode("+84");
    setGoiHoc("");
    setTongTienRaw("");
    setDatCoc(false);
    setNguon("");
    setLeadKenh("");
    setGhiChu("");
    setDiaChiMatched(false);
    setStatusMsg(null);
    addr.reset();
  }

  async function handleSubmit() {
    const primaryUid = uids[0]?.trim() || "";
    const uidPhu = uids.slice(1).map((u) => u.trim()).filter(Boolean);

    if (!primaryUid) {
      setStatusMsg({ text: "Vui lòng nhập UID CRM 1 — mọi đơn phải gắn với khách đã có.", ok: false });
      return;
    }
    if (!addr.chiTiet.trim()) {
      setStatusMsg({ text: "Vui lòng nhập địa chỉ chi tiết (số nhà, tên đường).", ok: false });
      return;
    }
    if (!soMay.trim()) {
      setStatusMsg({ text: "Vui lòng nhập số điện thoại khách.", ok: false });
      return;
    }

    const amount = parseVndInput(tongTienRaw);

    if (!datCoc) {
      if (!goiHoc.trim()) {
        setStatusMsg({ text: "Vui lòng chọn gói học (hoặc tick Đặt cọc nếu chỉ cọc trước).", ok: false });
        return;
      }
      if (!nguon) {
        setStatusMsg({ text: "Vui lòng chọn Nguồn doanh thu.", ok: false });
        return;
      }
      if (nguon === "Bán mới" && !leadKenh) {
        setStatusMsg({ text: 'Nguồn "Bán mới" cần chọn Lead tới từ kênh.', ok: false });
        return;
      }
    }

    if (amount <= 0) {
      setStatusMsg({ text: "Vui lòng nhập số tiền CK hợp lệ.", ok: false });
      return;
    }

    const sdtHoanChinh = `${phoneCode} ${soMay.trim()}`;
    setSubmitting(true);
    setStatusMsg(null);

    const payload = {
      uid: primaryUid,
      uidPhu,
      tenKhach: tenKhach.trim() || "Chưa cập nhật",
      diaChi: addr.fullAddress(),
      sdt: sdtHoanChinh,
      maVung: phoneCode,
      tinh: addr.tinh,
      quan: addr.quan,
      phuong: addr.phuong,
      diaChiChiTiet: addr.chiTiet,
      goiHoc,
      tongTien: amount,
      nguon,
      leadKenh,
      datCoc,
      ghiChu,
      createdBy,
    };

    const attempt = async () => endpoints.orders.create(payload);
    const isNetworkErr = (e: unknown) => {
      const err = e as { code?: string; response?: unknown; message?: string };
      return (
        !err?.response &&
        (err?.code === "ECONNABORTED" ||
          err?.code === "ERR_NETWORK" ||
          /network|timeout/i.test(err?.message || ""))
      );
    };
    try {
      let res;
      try {
        res = await attempt();
      } catch (e) {
        if (isNetworkErr(e)) {
          setStatusMsg({ text: "Mạng chậm / server đang khởi động. Đang thử lại sau 3s...", ok: false });
          await new Promise((r) => setTimeout(r, 3000));
          res = await attempt();
        } else {
          throw e;
        }
      }
      const order = res.data;
      onOrderCreated(order);
      setPayment({
        open: true,
        maDonHang: order.maDonHang,
        tongTien: order.tongTien,
        infoCode: order.infoCode,
      });
      clearForm();
    } catch (err) {
      setStatusMsg({
        text: formatApiError(err, "Không tạo được đơn hàng."),
        ok: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mx-auto flex max-w-[800px] justify-center">
        <Card>
          <CardHeader>Form tạo QR thanh toán</CardHeader>
          <CardBody>
            <div
              className={cn(
                "mb-4 min-h-[18px] text-center text-sm font-semibold",
                statusMsg ? (statusMsg.ok ? "text-gmv-ok" : "text-gmv-warn") : "text-transparent"
              )}
            >
              {statusMsg?.text ?? " "}
            </div>

            {uids.map((u, idx) => (
              <FormRow
                key={idx}
                label={`UID CRM ${idx + 1}`}
                required={idx === 0}
              >
                <div className="relative flex gap-2">
                  <Input
                    placeholder={
                      idx === 0
                        ? "Gõ UID hoặc tên khách (≥2 ký tự để tìm)..."
                        : "Nhập UID con (cùng 1 lần thanh toán)..."
                    }
                    required={idx === 0}
                    value={u}
                    onChange={(e) => updateUid(idx, e.target.value)}
                    onFocus={() => {
                      if (idx === 0 && u.trim().length >= 2 && uidSuggestions.length > 0)
                        setUidDropdownOpen(true);
                    }}
                    onBlur={() => {
                      if (idx !== 0) return;
                      if (uidBlurTimerRef.current) clearTimeout(uidBlurTimerRef.current);
                      uidBlurTimerRef.current = setTimeout(() => {
                        setUidDropdownOpen(false);
                        handlePrimaryUIDBlur();
                      }, 180);
                    }}
                  />
                  {idx === 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={addUidRow}
                      title="Thêm dòng UID (khách thanh toán >= 2 bé)"
                      className="shrink-0"
                    >
                      +
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeUidRow(idx)}
                      title="Xóa dòng UID này"
                      className="shrink-0"
                    >
                      −
                    </Button>
                  )}
                  {idx === 0 && uidDropdownOpen && (uidSearching || uidSuggestions.length > 0) && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-[260px] overflow-y-auto rounded-gmv-md border border-gmv-border bg-gmv-canvas shadow-gmv-2">
                      {uidSearching && (
                        <div className="p-2 text-xs text-gmv-muted">Đang tìm...</div>
                      )}
                      {!uidSearching && uidSuggestions.length === 0 && (
                        <div className="p-2 text-xs text-gmv-muted">Không có gợi ý</div>
                      )}
                      {uidSuggestions.map((c) => (
                        <div
                          key={c.crmUid}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pickCustomer(c);
                          }}
                          className="cursor-pointer border-b border-gmv-border p-2 text-sm last:border-0 hover:bg-gmv-primary-soft"
                        >
                          <div className="font-bold text-gmv-primary">
                            {c.crmUid} — {c.hoTen}
                          </div>
                          <div className="text-[11px] text-gmv-muted">
                            {c.sdt || "—"} · {c.diaChi || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </FormRow>
            ))}

            <FormRow label="Tên khách hàng">
              <Input
                placeholder="Họ tên khách (phục vụ xuất hóa đơn)"
                value={tenKhach}
                onChange={(e) => setTenKhach(e.target.value)}
              />
            </FormRow>

            <FormRow label="Địa chỉ Khách hàng" required topAlign>
              <div className="flex flex-col gap-2.5">
                <div className="flex min-w-0 gap-2">
                  <Select
                    className="min-w-0 flex-1"
                    value={addr.tinh}
                    onChange={(e) => addr.onTinhChange(e.target.value)}
                  >
                    <option value="">Tỉnh/Thành phố (tùy chọn)</option>
                    {addr.provinces.map((p) => (
                      <option key={p.code} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    className="min-w-0 flex-1"
                    value={addr.phuong}
                    disabled={!addr.tinh || (!addr.wards.length && !addr.loadingWards)}
                    onChange={(e) => addr.setPhuong(e.target.value)}
                  >
                    <option value="">
                      {addr.loadingWards ? "Đang tải…" : "Phường/Xã (tùy chọn)"}
                    </option>
                    {addr.wards.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </Select>
                </div>
                <Input
                  placeholder="Số nhà, tên đường (bắt buộc)..."
                  className={diaChiMatched ? "border-gmv-ok bg-gmv-ok-soft" : undefined}
                  value={addr.chiTiet}
                  onChange={(e) => {
                    addr.setChiTiet(e.target.value);
                    setDiaChiMatched(false);
                  }}
                />
              </div>
            </FormRow>

            <FormRow label="SĐT Khách hàng" required topAlign>
              <div className="flex flex-col gap-1.5">
                {/* Mã vùng + số điện thoại — grouped input */}
                <div className="flex min-w-0 items-stretch gap-2">
                  <Select
                    className="w-full max-w-[140px] shrink-0"
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value)}
                    title="Chọn mã vùng quốc gia"
                  >
                    {codes.map((c) => (
                      <option key={`${c.iso}-${c.code}`} value={c.code}>
                        {c.code} — {c.iso}
                      </option>
                    ))}
                  </Select>
                  {/* Input ghép prefix hiển thị mã vùng đang chọn */}
                  <div className="flex flex-1 items-center overflow-hidden rounded-gmv-md border border-gmv-border bg-gmv-bg focus-within:border-gmv-primary focus-within:ring-1 focus-within:ring-gmv-primary/20">
                    <span className="shrink-0 select-none border-r border-gmv-border bg-gmv-surface px-2.5 text-sm font-semibold text-gmv-primary">
                      {phoneCode}
                    </span>
                    <input
                      type="tel"
                      placeholder={
                        isVnCountryCode(phoneCode)
                          ? "0987 654 321"
                          : "Nhập số điện thoại..."
                      }
                      value={soMay}
                      onChange={(e) => setSoMay(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gmv-text-strong placeholder:text-gmv-muted/60 focus:outline-none"
                    />
                  </div>
                </div>
                <span className="text-xs italic text-gmv-muted">
                  Mã vùng đã chọn ở trên — chỉ cần nhập số điện thoại, không cần nhập lại mã vùng.
                </span>
              </div>
            </FormRow>

            <FormRow label="Gói học" required={!datCoc}>
              <Input
                list={PACKAGES_DATALIST_ID}
                placeholder={datCoc ? "(Không cần khi Đặt cọc)" : "Gõ để tìm gói học..."}
                value={goiHoc}
                disabled={datCoc}
                onChange={(e) => setGoiHoc(e.target.value)}
              />
              <datalist id={PACKAGES_DATALIST_ID}>
                {packages.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </FormRow>

            <FormRow label="Tổng số tiền CK" required topAlign>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <Input
                    placeholder="Số tiền cần chuyển khoản lần này (VD: 5.000.000)"
                    value={formatVndInput(tongTienRaw)}
                    onChange={(e) => setTongTienRaw(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                  />
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm font-semibold text-gmv-text-strong">
                    <input
                      type="checkbox"
                      checked={datCoc}
                      onChange={(e) => setDatCoc(e.target.checked)}
                    />
                    Đặt cọc?
                  </label>
                </div>
                <span className="text-xs italic text-gmv-muted">
                  Tick "Đặt cọc" khi khách cọc trước (không cần gói + nguồn). Bỏ tick = chuyển full tiền gói.
                </span>
              </div>
            </FormRow>

            <FormRow label="Nguồn doanh thu" required={!datCoc}>
              <Select
                value={nguon}
                disabled={datCoc}
                onChange={(e) => setNguon(e.target.value)}
              >
                <option value="" disabled hidden>
                  {datCoc ? "(Không cần khi Đặt cọc)" : "-- Chọn nguồn --"}
                </option>
                {NGUON_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </FormRow>

            {nguon === "Bán mới" && !datCoc && (
              <FormRow label="Lead tới từ kênh" required>
                <Select value={leadKenh} onChange={(e) => setLeadKenh(e.target.value)}>
                  <option value="" disabled hidden>
                    -- Chọn kênh --
                  </option>
                  {LEAD_KENH_OPTIONS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </Select>
              </FormRow>
            )}

            <FormRow label="Ghi chú">
              <Input value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
            </FormRow>

            <div className="mt-8 text-center">
              <Button onClick={handleSubmit} disabled={submitting} variant="primary" className="px-8">
                {submitting ? "Đang tạo..." : "Tạo mã QR thanh toán"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Inline QR card — xuất hiện ngay sau khi tạo đơn thành công */}
      {payment.open && (
        <div className="mx-auto mt-6 max-w-[800px]">
          <InlinePaymentCard
            maDonHang={payment.maDonHang}
            tongTien={payment.tongTien}
            infoCode={payment.infoCode}
            onNewOrder={() => setPayment((p) => ({ ...p, open: false }))}
          />
        </div>
      )}
    </>
  );
}
