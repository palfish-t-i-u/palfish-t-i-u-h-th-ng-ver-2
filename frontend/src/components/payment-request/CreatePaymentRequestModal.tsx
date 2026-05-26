import { useState } from "react";
import type { CreatePaymentRequestPayload } from "../../types/paymentRequest";
import { Button, Input, Modal, Select, Textarea } from "../ui";

const initialForm: CreatePaymentRequestPayload = {
  uid: "",
  name: "",
  country: "vn",
  phone: "",
  address: "",
  ward: "",
  province: "",
  target: 0,
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
  const [form, setForm] = useState<CreatePaymentRequestPayload>(initialForm);

  const set = (key: keyof CreatePaymentRequestPayload, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canSubmit = form.uid.trim() && form.name.trim() && form.phone.trim() && form.target > 0;

  return (
    <Modal open={open} onClose={onClose} title="Tạo Payment Request" wide className="max-w-4xl">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gmv-muted">UID CRM</span>
            <Input value={form.uid} onChange={(event) => set("uid", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gmv-muted">Tên khách hàng</span>
            <Input value={form.name} onChange={(event) => set("name", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gmv-muted">Quốc gia</span>
            <Select value={form.country} onChange={(event) => set("country", event.target.value)}>
              <option value="vn">vn +84</option>
              <option value="ph">ph +63</option>
              <option value="id">id +62</option>
              <option value="th">th +66</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gmv-muted">Số điện thoại</span>
            <Input value={form.phone} onChange={(event) => set("phone", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gmv-muted">Phường/Xã</span>
            <Input value={form.ward} onChange={(event) => set("ward", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gmv-muted">Tỉnh/Thành phố</span>
            <Input value={form.province} onChange={(event) => set("province", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs font-medium text-gmv-muted">Địa chỉ</span>
            <Input value={form.address} onChange={(event) => set("address", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gmv-muted">Tổng tiền</span>
            <Input value={form.target || ""} onChange={(event) => set("target", Number(event.target.value.replace(/\D/g, "")))} inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs font-medium text-gmv-muted">Ghi chú</span>
            <Textarea value={form.note} onChange={(event) => set("note", event.target.value)} rows={3} />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              onSubmit(form);
              setForm(initialForm);
            }}
          >
            + Tạo Payment Request
          </Button>
        </div>
      </div>
    </Modal>
  );
}

