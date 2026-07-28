import { useEffect, useState } from "react";
import type { CreatePaymentRequestPayload, CustomerType, OwnerOption } from "../../types/paymentRequest";
import { endpoints } from "../../lib/api";
import { useMe } from "../../hooks/useMe";
import { LEAD_SOURCES, defaultChannelForSource, findSourceByKey, sourceHasChannels } from "../../constants/leadSource";
import CountryCombo, { COUNTRIES, findCountry } from "./CountryCombo";
import { applySmartPhoneInput, normalizeLocalPhone, crmPhoneFormat } from "./phoneUtils";
import { Icons } from "./Icons";
import VietnamAddressFields from "./VietnamAddressFields";
import Combobox from "../ui/Combobox";
import numberToVietnameseWords from "../../lib/numberToWords";
import { MoneyInput } from "../ui/MoneyInput";
import { HdsdLink } from "../help/HdsdLink";

interface FormState {
  uid: string;
  name: string;
  childName: string;
  country: string;
  phone: string;
  email: string;
  address: string;
  ward: string;
  province: string;
  target: string;
  note: string;
  taxId: string;
  customerType: CustomerType;
  companyName: string;
  leadSource: string;
  leadChannel: string;
  /** Khách là người Việt sống ở nước ngoài → địa chỉ chỉ chọn quốc gia. */
  isForeign: boolean;
  /** Mã quốc gia khi isForeign (vd "US"). */
  foreignCountry: string;
  /** Khách cần xuất hóa đơn → bắt buộc đủ Phường/Xã + Số nhà. */
  wantsInvoice: boolean;
}

const INITIAL: FormState = {
  uid: "",
  name: "",
  childName: "",
  country: "VN",
  phone: "",
  email: "",
  address: "",
  ward: "",
  province: "",
  target: "",
  note: "",
  taxId: "",
  customerType: "individual",
  companyName: "",
  leadSource: "",
  leadChannel: "",
  isForeign: false,
  foreignCountry: "",
  wantsInvoice: false,
};

// Danh sách quốc gia cho khách ở nước ngoài (bỏ VN), sort theo tên — hằng số module.
const FOREIGN_COUNTRY_OPTIONS = COUNTRIES.filter((c) => c.code !== "VN")
  .map((c) => ({ value: c.code, label: `${c.flag} ${c.name}` }))
  .sort((a, b) => a.label.localeCompare(b.label, "vi"));

export default function CreatePaymentRequestModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreatePaymentRequestPayload) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Tạo hộ (Leader/Manager): chọn sale sở hữu PR. "" = tự sở hữu.
  const { profile } = useMe();
  const canPickOwner = profile?.role === "leader" || profile?.role === "manager" || profile?.role === "system";
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  useEffect(() => {
    if (open) {
      setForm(INITIAL);
      setSubmitError(null);
      setOwnerEmail("");
    }
  }, [open]);
  useEffect(() => {
    if (!open || !canPickOwner) return;
    let alive = true;
    endpoints.paymentRequests
      .ownerOptions()
      .then((res) => { if (alive) setOwnerOptions(res.data?.options ?? []); })
      .catch(() => { if (alive) setOwnerOptions([]); });
    return () => { alive = false; };
  }, [open, canPickOwner]);

  if (!open) return null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const targetNum = parseInt(String(form.target).replace(/\D/g, ""), 10) || 0;
  const needsChannel = sourceHasChannels(form.leadSource);
  // Email không bắt buộc; nếu có giá trị thì phải đúng format (bug 1A-10)
  const emailTrimmed = form.email.trim();
  const emailValid = emailTrimmed === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);

  // Địa chỉ bắt buộc khi tạo PR:
  const addressOk = form.isForeign
    ? !!form.foreignCountry
    : true;

  const canSubmit = !!(
    form.name && form.phone && targetNum > 0 &&
    form.leadSource && (!needsChannel || form.leadChannel) &&
    emailValid && addressOk
  );

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    const foreignCountryName = form.isForeign
      ? COUNTRIES.find((c) => c.code === form.foreignCountry)?.name ?? form.foreignCountry
      : "";
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        uid: form.uid.trim() || undefined,
        name: form.name,
        child_name: form.childName.trim() || undefined,
        country: form.country,
        phone: form.phone,
        address: form.isForeign ? "" : form.address,
        ward: form.isForeign ? "" : form.ward,
        province: form.isForeign ? foreignCountryName : form.province,
        target: targetNum,
        note: form.note,
        owner_sale_email:
          ownerEmail && ownerEmail !== (profile?.email ?? "") ? ownerEmail : undefined,
        email: form.email.trim() || undefined,
        tax_id: form.taxId.trim() || undefined,
        customer_type: form.customerType,
        company_name: form.customerType === "business" ? form.companyName.trim() || undefined : undefined,
        lead_source: form.leadSource || undefined,
        lead_channel: form.leadChannel || undefined,
        wants_invoice: form.wantsInvoice || undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg || "Có lỗi khi tạo PR. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gmv-prototype-modal-scrim" onClick={onClose}>
      <div className="modal create-pr-modal" style={{ width: "min(680px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Tạo Payment Request mới</h3>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Bước 1 · Điền thông tin khách &amp; tổng tiền dự kiến → hệ thống xuất PR-ID
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <HdsdLink moduleSlug="paymentRequests" topicSlug="tao-lan-tt-chuan" />
            <button className="drawer-close" onClick={onClose}>
              <Icons.Close size={16} />
            </button>
          </div>
        </div>
        <div className="modal-body">
          {/* Tạo hộ: chỉ Leader/Manager thấy — PR đứng tên sale được chọn */}
          {canPickOwner && ownerOptions.length > 0 && (
            <div className="field">
              <label>Sale sở hữu PR</label>
              <Combobox
                value={ownerEmail}
                onChange={(v) => setOwnerEmail(v)}
                options={ownerOptions.map((o) => ({
                  value: o.email,
                  label: `${o.name}${o.is_self ? " (tôi)" : ""}${o.sub_team ? ` · ${o.sub_team}` : ""}`,
                }))}
                placeholder={`${profile?.displayName || profile?.crmName || "Tôi"} (tôi)`}
                emptyLabel="— Tôi tự sở hữu —"
              />
              <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.45, marginTop: 4 }}>
                Tạo hộ: PR đứng tên sale được chọn — doanh thu, KPI, BXH và thông báo
                Zalo/DingTalk sẽ theo sale đó. Hệ thống ghi nhật ký &quot;ai tạo hộ ai&quot;.
              </div>
            </div>
          )}

          {/* Nhóm 1: Trường bắt buộc tạo nhanh */}
          <div className="field-row">
            <div className="field">
              <label>
                Số điện thoại <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div className="phone-row">
                <CountryCombo value={form.country} onChange={(v) => set("country", v)} />
                {(() => {
                  const country = findCountry(form.country);
                  const norm = normalizeLocalPhone(form.phone, country);
                  return (
                    <input
                      className="phone-input"
                      placeholder={country.exampleLocal}
                      value={form.phone}
                      onChange={(e) => {
                        const r = applySmartPhoneInput(e.target.value);
                        setForm((f) => ({ ...f, phone: r.phone, ...(r.countryCode ? { country: r.countryCode } : {}) }));
                      }}
                      onBlur={() => {
                        const n = normalizeLocalPhone(form.phone, findCountry(form.country));
                        if (n.value !== form.phone) set("phone", n.value);
                      }}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      autoFocus
                      style={norm.warn ? { borderColor: "var(--danger)" } : undefined}
                    />
                  );
                })()}
              </div>
              {(() => {
                const country = findCountry(form.country);
                const norm = normalizeLocalPhone(form.phone, country);
                return (
                  <div style={{ fontSize: 11.5, color: norm.warn ? "var(--danger)" : "var(--text-2)", fontWeight: 600, marginTop: 3 }}>
                    {norm.warn
                      ? "SĐT chưa đúng — vui lòng kiểm tra lại (độ dài lệch so với mẫu)"
                      : form.phone
                      ? <>Lưu dạng: <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{crmPhoneFormat(form.phone, country)}</span></>
                      : "Dán cả cụm (VD: 84-352334789) sẽ tự tách đầu số; hoặc chỉ nhập đuôi số"}
                  </div>
                );
              })()}
            </div>
            <div className="field">
              <label>
                Tên khách hàng <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input placeholder="Họ và tên" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>
              Tổng tiền dự kiến <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <MoneyInput
              placeholder="VD: 12.000.000"
              value={form.target}
              onValueChange={(v) => set("target", v)}
            />
            {targetNum > 0 && (
              <div style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 600, fontStyle: "italic", marginTop: 3 }}>
                {numberToVietnameseWords(targetNum)}
              </div>
            )}
          </div>

          <div className="field-row">
            <div className="field">
              <label>
                Nguồn KH <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                value={form.leadSource}
                onChange={(e) => {
                  const next = e.target.value;
                  set("leadSource", next);
                  set("leadChannel", defaultChannelForSource(next) ?? "");
                }}
                style={{ font: "inherit", fontSize: 13 }}
              >
                <option value="">— Chọn nguồn —</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            {needsChannel && (
              <div className="field">
                <label>
                  Kênh <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <select
                  value={form.leadChannel}
                  onChange={(e) => set("leadChannel", e.target.value)}
                  style={{ font: "inherit", fontSize: 13 }}
                >
                  <option value="">— Chọn kênh —</option>
                  {findSourceByKey(form.leadSource)?.channels.map((ch) => (
                    <option key={ch.code} value={ch.code}>{ch.code} - {ch.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="field">
            <label>Tên con (học viên)</label>
            <input
              placeholder="VD: Nguyễn Minh Anh"
              value={form.childName}
              onChange={(e) => set("childName", e.target.value)}
            />
            <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.45, marginTop: 4 }}>
              Nếu để trống, nội dung chuyển khoản sẽ dùng tên khách hàng.
            </div>
          </div>

          <div className="field">
            <label>UID CRM</label>
            <input
              placeholder="UID CRM (bổ sung sau — cần trước khi kích hoạt)"
              value={form.uid}
              onChange={(e) => set("uid", e.target.value)}
            />
            <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.45, marginTop: 4 }}>
              Bổ sung sau — cần trước khi kích hoạt (bước B3).
            </div>
          </div>

          <div className="field">
            <label>
              Địa chỉ khách hàng
            </label>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${!form.isForeign ? "btn-primary" : "btn-outline"}`}
                onClick={() => setForm((f) => ({ ...f, isForeign: false, foreignCountry: "" }))}
              >
                Khách VN
              </button>
              <button
                type="button"
                className={`btn btn-sm ${form.isForeign ? "btn-primary" : "btn-outline"}`}
                onClick={() => setForm((f) => ({ ...f, isForeign: true, province: "", ward: "", address: "" }))}
              >
                Khách nước ngoài
              </button>
            </div>

            {!form.isForeign && (
              <div
                style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}
                onClick={() => set("wantsInvoice", !form.wantsInvoice)}
              >
                <input
                  type="checkbox"
                  checked={form.wantsInvoice}
                  onChange={(e) => set("wantsInvoice", e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ accentColor: "var(--danger)", margin: 0 }}
                />
                <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>
                  Khách hàng cần xuất hoá đơn?
                </span>
              </div>
            )}

            {form.isForeign ? (
              <Combobox
                value={form.foreignCountry}
                onChange={(v) => set("foreignCountry", v)}
                options={FOREIGN_COUNTRY_OPTIONS}
                placeholder="Chọn quốc gia"
                emptyLabel="— Bỏ chọn —"
                invalid={!form.foreignCountry}
              />
            ) : (
              <VietnamAddressFields
                province={form.province}
                ward={form.ward}
                address={form.address}
                onProvinceChange={(v) => set("province", v)}
                onWardChange={(v) => set("ward", v)}
                onAddressChange={(v) => set("address", v)}
                requireProvince={false}
              />
            )}
            {form.isForeign && (
              <div style={{ fontSize: 11.5, lineHeight: 1.45, marginTop: 6, color: addressOk ? "var(--text-3)" : "var(--danger)" }}>
                Bắt buộc chọn quốc gia khách đang ở.
              </div>
            )}
            {form.wantsInvoice && !form.isForeign && (
              <div style={{ fontSize: 11.5, lineHeight: 1.45, marginTop: 6, color: "var(--warning-text, #92400e)" }}>
                Cần bổ sung đầy đủ địa chỉ (Tỉnh/TP, Phường/Xã, Số nhà) trước 15h ngày N+1 để xuất HĐ.
              </div>
            )}
          </div>

          <div className="field">
            <label>Email khách hàng</label>
            <input
              type="email"
              placeholder="VD: khach@email.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              style={!emailValid ? { borderColor: "var(--danger)" } : undefined}
            />
            {!emailValid ? (
              <div style={{ fontSize: 11.5, color: "var(--danger)", lineHeight: 1.45, marginTop: 4 }}>
                Email không đúng định dạng (vd: ten@domain.com)
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.45, marginTop: 4 }}>
                Email khách hàng — TH khách cần hóa đơn → Thông tin này sẽ được tổng hợp vào mục &quot;Thông tin xuất hóa đơn&quot; trong tab &quot;Xuất hóa đơn&quot;
              </div>
            )}
          </div>

          <div className="field-row">
            <div className="field">
              <label>Loại khách hàng</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${form.customerType === "individual" ? "btn-primary" : "btn-outline"}`}
                  onClick={() => { set("customerType", "individual"); set("companyName", ""); }}
                >
                  Cá nhân
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${form.customerType === "business" ? "btn-primary" : "btn-outline"}`}
                  onClick={() => set("customerType", "business")}
                >
                  Doanh nghiệp
                </button>
              </div>
            </div>
            {form.customerType === "business" && (
              <div className="field" style={{ flex: 1 }}>
                <label>Tên công ty</label>
                <input
                  placeholder="VD: Công ty TNHH ABC"
                  value={form.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="field">
            <label>{form.customerType === "business" ? "Mã số thuế doanh nghiệp" : "Mã số thuế cá nhân"}</label>
            <input
              placeholder={form.customerType === "business" ? "VD: 0123456789" : "VD: 0123456789-001"}
              value={form.taxId}
              onChange={(e) =>
                // MST cá nhân có thể có dấu "-" (vd 0123456789-001). MST doanh nghiệp chỉ chứa số.
                set(
                  "taxId",
                  form.customerType === "individual"
                    ? e.target.value.replace(/[^\d-]/g, "")
                    : e.target.value.replace(/[^\d]/g, "")
                )
              }
            />
            <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.45, marginTop: 4 }}>
              Không bắt buộc — dùng khi khách cần xuất hóa đơn
            </div>
          </div>

          <div className="field">
            <label>Ghi chú</label>
            <textarea
              placeholder="Ghi chú nội bộ về thoả thuận với khách (số đợt, deadline, ...)"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>

          <div
            style={{
              background: "var(--primary-50)",
              border: "1px solid var(--primary-100)",
              borderRadius: 10,
              padding: "10px 12px",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Icons.AlertCircle size={16} stroke="var(--primary-700)" />
            <div style={{ fontSize: 12, color: "var(--primary-700)", lineHeight: 1.5 }}>
              Sau khi tạo, hệ thống sẽ sinh <strong>PR-ID</strong> và mở thẳng trang chi tiết để bạn tạo lần thanh toán đầu tiên (chuyển khoản QR, tiền mặt, quẹt thẻ hoặc trả góp).
            </div>
          </div>
        </div>
        <div className="modal-foot" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          {submitError && (
            <div style={{ fontSize: 12, color: "var(--danger)", padding: "6px 0", textAlign: "center" }}>
              {submitError}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-outline" onClick={onClose} disabled={submitting}>
              Huỷ
            </button>
            <button
              className="btn btn-primary"
              disabled={!canSubmit || submitting}
              style={(!canSubmit || submitting) ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
              onClick={handleSubmit}
            >
              <Icons.Plus size={14} /> {submitting ? "Đang tạo..." : "Tạo PR-ID & mở chi tiết"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
