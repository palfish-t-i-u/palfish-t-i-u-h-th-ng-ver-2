import { useEffect, useState } from "react";
import type { CreatePaymentRequestPayload } from "../../types/paymentRequest";
import CountryCombo from "./CountryCombo";
import { Icons } from "./Icons";
import VietnamAddressFields from "./VietnamAddressFields";

interface FormState {
  uid: string;
  name: string;
  country: string;
  phone: string;
  address: string;
  ward: string;
  province: string;
  target: string;
  note: string;
}

const INITIAL: FormState = {
  uid: "",
  name: "",
  country: "VN",
  phone: "",
  address: "",
  ward: "",
  province: "",
  target: "",
  note: "",
};

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

  useEffect(() => {
    if (open) setForm(INITIAL);
  }, [open]);

  if (!open) return null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const targetNum = parseInt(String(form.target).replace(/\D/g, ""), 10) || 0;
  const canSubmit = !!(form.uid && form.name && form.phone && targetNum > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      uid: form.uid,
      name: form.name,
      country: form.country,
      phone: form.phone,
      address: form.address,
      ward: form.ward,
      province: form.province,
      target: targetNum,
      note: form.note,
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

          <div className="field-row">
            <div className="field">
              <label>
                Số điện thoại <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div className="phone-row">
                <CountryCombo value={form.country} onChange={(v) => set("country", v)} />
                <input
                  className="phone-input"
                  placeholder="9xx xxx xxx"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
            </div>
            <div className="field">
              <label>
                Tổng tiền dự kiến <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                placeholder="VD: 12.000.000"
                value={form.target}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "");
                  set("target", v ? Number(v).toLocaleString("vi-VN") : "");
                }}
              />
            </div>
          </div>

          <div className="field">
            <label>Địa chỉ khách hàng</label>
            <VietnamAddressFields
              province={form.province}
              ward={form.ward}
              address={form.address}
              onProvinceChange={(v) => set("province", v)}
              onWardChange={(v) => set("ward", v)}
              onAddressChange={(v) => set("address", v)}
            />
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
