import { useEffect, useState } from "react";
import type { CreatePaymentRequestPayload, CustomerType } from "../../types/paymentRequest";
import { LEAD_SOURCES, defaultChannelForSource, findSourceByKey, sourceHasChannels } from "../../constants/leadSource";
import CountryCombo, { COUNTRIES, findCountry } from "./CountryCombo";
import { Icons } from "./Icons";
import VietnamAddressFields from "./VietnamAddressFields";
import Combobox from "../ui/Combobox";

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
  /** Khách cần xuất hóa đơn → bắt buộc đủ Phường/Xã + Số nhà, đường. */
  needsInvoice: boolean;
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
  needsInvoice: false,
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
  onSubmit: (payload: CreatePaymentRequestPayload) => void;
}) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [isTargetFocused, setIsTargetFocused] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(INITIAL);
      setIsTargetFocused(false);
    }
  }, [open]);

  if (!open) return null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const targetNum = parseInt(String(form.target).replace(/\D/g, ""), 10) || 0;
  const needsChannel = sourceHasChannels(form.leadSource);
  // Email không bắt buộc; nếu có giá trị thì phải đúng format (bug 1A-10)
  const emailTrimmed = form.email.trim();
  const emailValid = emailTrimmed === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);

  // Địa chỉ bắt buộc (kế toán 27/6):
  // - Khách nước ngoài: chỉ cần chọn quốc gia.
  // - Khách VN: bắt buộc Tỉnh/Thành; nếu cần hóa đơn → đủ cả Phường/Xã + Số nhà, đường.
  const addressOk = form.isForeign
    ? !!form.foreignCountry
    : !!form.province &&
      (!form.needsInvoice || (!!form.ward && !!form.address.trim()));

  const canSubmit = !!(
    form.uid && form.name && form.phone && targetNum > 0 &&
    form.leadSource && (!needsChannel || form.leadChannel) &&
    emailValid && addressOk
  );

  const handleSubmit = () => {
    if (!canSubmit) return;
    const foreignCountryName = form.isForeign
      ? COUNTRIES.find((c) => c.code === form.foreignCountry)?.name ?? form.foreignCountry
      : "";
    onSubmit({
      uid: form.uid,
      name: form.name,
      child_name: form.childName.trim() || undefined,
      country: form.country,
      phone: form.phone,
      address: form.isForeign ? "" : form.address,
      ward: form.isForeign ? "" : form.ward,
      province: form.isForeign ? foreignCountryName : form.province,
      target: targetNum,
      note: form.note,
      email: form.email.trim() || undefined,
      tax_id: form.taxId.trim() || undefined,
      customer_type: form.customerType,
      company_name: form.customerType === "business" ? form.companyName.trim() || undefined : undefined,
      lead_source: form.leadSource || undefined,
      lead_channel: form.leadChannel || undefined,
    });
  };

  return (
    <div className="gmv-prototype-modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(680px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Tạo Payment Request mới</h3>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Bước 1 · Điền thông tin khách &amp; tổng tiền dự kiến → hệ thống xuất PR-ID
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>
            <Icons.Close size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="field-row">
            <div className="field">
              <label>
                UID CRM <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input placeholder="VD: 3213123123" value={form.uid} onChange={(e) => set("uid", e.target.value)} />
            </div>
            <div className="field">
              <label>
                Tên khách hàng <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input placeholder="Họ và tên" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
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

          <div className="field-row">
            <div className="field">
              <label>
                Số điện thoại <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div className="phone-row">
                <CountryCombo value={form.country} onChange={(v) => set("country", v)} />
                <input
                  className="phone-input"
                  placeholder={findCountry(form.country).exampleLocal}
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 600, marginTop: 3 }}>
                Chỉ nhập phần số, không cần mã quốc gia
              </div>
            </div>
            <div className="field">
              <label>
                Tổng tiền dự kiến <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                placeholder="VD: 12.000.000"
                value={
                  isTargetFocused
                    ? form.target
                    : form.target
                    ? Number(form.target).toLocaleString("vi-VN")
                    : ""
                }
                inputMode="numeric"
                pattern="[0-9]*"
                onFocus={() => setIsTargetFocused(true)}
                onBlur={() => setIsTargetFocused(false)}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "");
                  set("target", v);
                }}
              />
            </div>
          </div>

          <div className="field">
            <label>
              Địa chỉ khách hàng <span style={{ color: "var(--danger)" }}>*</span>
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                color: "var(--text-2)",
                marginBottom: 8,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={form.isForeign}
                onChange={(e) => {
                  const v = e.target.checked;
                  // Đổi chế độ → xoá dữ liệu địa chỉ của chế độ kia để tránh lẫn.
                  setForm((f) => ({
                    ...f,
                    isForeign: v,
                    province: "",
                    ward: "",
                    address: "",
                    foreignCountry: "",
                  }));
                }}
              />
              Khách ở nước ngoài (người Việt sống ở nước ngoài)
            </label>

            {form.isForeign ? (
              <Combobox
                value={form.foreignCountry}
                onChange={(v) => set("foreignCountry", v)}
                options={FOREIGN_COUNTRY_OPTIONS}
                placeholder="Quốc gia khách đang ở * — gõ để tìm"
                emptyLabel="— Bỏ chọn —"
                invalid={!form.foreignCountry}
              />
            ) : (
              <>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12.5,
                    color: "var(--text-2)",
                    marginBottom: 8,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.needsInvoice}
                    onChange={(e) => set("needsInvoice", e.target.checked)}
                  />
                  Khách cần xuất hóa đơn (bắt buộc đủ Phường/Xã + Số nhà, đường)
                </label>
                <VietnamAddressFields
                  province={form.province}
                  ward={form.ward}
                  address={form.address}
                  onProvinceChange={(v) => set("province", v)}
                  onWardChange={(v) => set("ward", v)}
                  onAddressChange={(v) => set("address", v)}
                  requireProvince
                  requireWard={form.needsInvoice}
                  requireStreet={form.needsInvoice}
                />
              </>
            )}

            {!addressOk && (
              <div style={{ fontSize: 11.5, color: "var(--danger)", lineHeight: 1.45, marginTop: 4 }}>
                {form.isForeign
                  ? "Bắt buộc chọn quốc gia khách đang ở."
                  : !form.province
                  ? "Bắt buộc chọn Tỉnh / Thành phố."
                  : "Khách cần hóa đơn → điền đủ Phường/Xã và Số nhà, đường."}
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
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>
            Huỷ
          </button>
          <button
            className="btn btn-primary"
            disabled={!canSubmit}
            style={!canSubmit ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
            onClick={handleSubmit}
          >
            <Icons.Plus size={14} /> Tạo PR-ID &amp; mở chi tiết
          </button>
        </div>
      </div>
    </div>
  );
}
