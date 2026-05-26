import { useEffect, useState } from "react";
import type { AddPaymentAttemptPayload, PaymentMethod, PaymentRequest } from "../../types/paymentRequest";
import { Button, Input, Modal, Select } from "../ui";
import { METHOD_LABEL, vnd } from "./paymentRequestUtils";

export default function AddPaymentAttemptModal({
  request,
  open,
  onClose,
  onSubmit,
}: {
  request: PaymentRequest | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: AddPaymentAttemptPayload) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("qr");
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState("MB Bank");
  const [cardLast4, setCardLast4] = useState("");
  const [installmentMonths, setInstallmentMonths] = useState("6");
  const [cashier, setCashier] = useState("");

  useEffect(() => {
    if (!open || !request) return;
    setMethod("qr");
    setAmount(String(Math.max(0, request.target - request.received)));
    setBank("MB Bank");
    setCardLast4("");
    setInstallmentMonths("6");
    setCashier("");
  }, [open, request]);

  if (!request) return null;

  const parsedAmount = Number(amount.replace(/\D/g, ""));
  const canSubmit = parsedAmount > 0;

  return (
    <Modal open={open} onClose={onClose} title="Thêm lần thanh toán" wide className="max-w-3xl">
      <div className="flex flex-col gap-4">
        <div className="rounded-gmv-md border border-gmv-border bg-gmv-bg p-3">
          <div className="font-bold text-gmv-text-strong">{request.id} · {request.name}</div>
          <div className="mt-1 text-sm text-gmv-muted">Còn thiếu: <strong>{vnd(Math.max(0, request.target - request.received))}</strong></div>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gmv-muted">Phương thức</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMethod(key)}
                className={`min-h-[84px] rounded-gmv-md border p-3 text-left transition ${
                  method === key ? "border-gmv-primary bg-gmv-primary-soft text-gmv-primary" : "border-gmv-border bg-gmv-canvas text-gmv-text hover:bg-gmv-bg"
                }`}
              >
                <span className="block font-bold">{METHOD_LABEL[key]}</span>
                <span className="mt-2 block text-xs text-gmv-muted">
                  {key === "qr" ? "QR / chuyển khoản" : key === "cash" ? "Thu trực tiếp" : key === "card" ? "POS / thẻ" : "Trả nhiều kỳ"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gmv-muted">Số tiền</span>
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" />
          </label>
          {method === "qr" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gmv-muted">Ngân hàng</span>
              <Select value={bank} onChange={(event) => setBank(event.target.value)}>
                <option>MB Bank</option>
                <option>BIDV</option>
                <option>Techcombank</option>
                <option>Vietcombank</option>
              </Select>
            </label>
          )}
          {method === "cash" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gmv-muted">Người thu</span>
              <Input value={cashier} onChange={(event) => setCashier(event.target.value)} />
            </label>
          )}
          {method === "card" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gmv-muted">4 số cuối thẻ</span>
              <Input value={cardLast4} onChange={(event) => setCardLast4(event.target.value)} maxLength={4} />
            </label>
          )}
          {method === "installment" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gmv-muted">Kỳ trả góp</span>
              <Select value={installmentMonths} onChange={(event) => setInstallmentMonths(event.target.value)}>
                <option value="3">3 tháng</option>
                <option value="6">6 tháng</option>
                <option value="9">9 tháng</option>
                <option value="12">12 tháng</option>
              </Select>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button disabled={!canSubmit} onClick={() => onSubmit({ amount: parsedAmount, method, bank, cardLast4, installmentMonths, cashier })}>
            + Thêm thanh toán
          </Button>
        </div>
      </div>
    </Modal>
  );
}

