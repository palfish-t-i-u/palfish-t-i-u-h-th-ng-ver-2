import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CreatePaymentRequestModal from "./CreatePaymentRequestModal";

function renderModal(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(
    <CreatePaymentRequestModal open={true} onClose={onClose} onSubmit={onSubmit} />
  );
  return { onClose, onSubmit };
}

function fillRequiredFields() {
  // SĐT
  const phoneInput = document.querySelector(".phone-input") as HTMLInputElement;
  fireEvent.change(phoneInput, { target: { value: "0912345678" } });

  // Tên KH
  const nameInput = screen.getByPlaceholderText("Họ và tên");
  fireEvent.change(nameInput, { target: { value: "Nguyễn Văn A" } });

  // Tổng tiền — MoneyInput calls onValueChange(digits)
  const targetInput = screen.getByPlaceholderText("VD: 12.000.000");
  fireEvent.change(targetInput, { target: { value: "10000000" } });

  // Nguồn KH — "gia_han" has no channels, simplest case
  const sourceLabel = screen.getByText("Nguồn KH");
  const fieldDiv = sourceLabel.closest(".field");
  const sourceSelect = fieldDiv!.querySelector("select") as HTMLSelectElement;
  fireEvent.change(sourceSelect, { target: { value: "gia_han" } });
}

describe("CreatePaymentRequestModal — UID optional", () => {
  it("renders UID field at bottom with hint text", () => {
    renderModal();
    expect(screen.getByText(/Bổ sung sau.*kích hoạt/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/UID CRM \(bổ sung sau/i)).toBeDefined();
  });

  it("UID field is NOT required — canSubmit true without UID", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderModal(onSubmit);
    fillRequiredFields();

    const submitBtn = screen.getByRole("button", { name: /Tạo PR-ID/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it("submits without UID — payload uid is undefined", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderModal(onSubmit);
    fillRequiredFields();

    const submitBtn = screen.getByRole("button", { name: /Tạo PR-ID/i });
    fireEvent.click(submitBtn);

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.uid).toBeUndefined();
  });

  it("submits with UID when filled — payload uid has value", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderModal(onSubmit);
    fillRequiredFields();

    const uidInput = screen.getByPlaceholderText(/UID CRM \(bổ sung sau/i);
    fireEvent.change(uidInput, { target: { value: "3213123123" } });

    const submitBtn = screen.getByRole("button", { name: /Tạo PR-ID/i });
    fireEvent.click(submitBtn);

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.uid).toBe("3213123123");
  });

  it("SĐT is still required — button disabled when phone empty", () => {
    renderModal();
    // fill only name + target + source
    const nameInput = screen.getByPlaceholderText("Họ và tên");
    fireEvent.change(nameInput, { target: { value: "Nguyễn Văn A" } });
    const targetInput = screen.getByPlaceholderText("VD: 12.000.000");
    fireEvent.change(targetInput, { target: { value: "10000000" } });
    const sourceSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(sourceSelect, { target: { value: "online" } });

    const submitBtn = screen.getByRole("button", { name: /Tạo PR-ID/i });
    expect(submitBtn).toBeDisabled();
  });

  it("SĐT is rendered first — phone-input appears before name input in DOM order", () => {
    renderModal();
    const phoneInput = document.querySelector(".phone-input") as HTMLInputElement;
    const nameInput = screen.getByPlaceholderText("Họ và tên");
    // phone-input should precede name input in document order
    const pos = phoneInput.compareDocumentPosition(nameInput);
    // DOCUMENT_POSITION_FOLLOWING = 4 means nameInput comes after phoneInput
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows error from onSubmit rejection", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Server error 500"));
    renderModal(onSubmit);
    fillRequiredFields();

    const submitBtn = screen.getByRole("button", { name: /Tạo PR-ID/i });
    fireEvent.click(submitBtn);

    await vi.waitFor(() => screen.getByText(/Server error 500/i));
  });

  it("button shows Đang tạo... while submitting", async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((res) => { resolveSubmit = res; }));
    renderModal(onSubmit);
    fillRequiredFields();

    const submitBtn = screen.getByRole("button", { name: /Tạo PR-ID/i });
    fireEvent.click(submitBtn);

    await vi.waitFor(() => screen.getByText(/Đang tạo/i));
    resolveSubmit();
  });
});

describe("CreatePaymentRequestModal — smart SĐT (20/7)", () => {
  it("dán '84-352334789' → tự cắt đầu số, ô còn đuôi số", async () => {
    renderModal();
    const phone = screen.getByPlaceholderText("987 654 321") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "84-352334789" } });
    expect(phone.value).toBe("352334789");
  });
  it("blur '0352334789' → tự bỏ số 0 đầu (khớp mẫu 9 số VN)", () => {
    renderModal();
    const phone = screen.getByPlaceholderText("987 654 321") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "0352334789" } });
    fireEvent.blur(phone);
    expect(phone.value).toBe("352334789");
  });
  it("digits trần dính 84 → KHÔNG tự cắt (G11), hiện cảnh báo lệch độ dài", () => {
    renderModal();
    const phone = screen.getByPlaceholderText("987 654 321") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "84987654321" } });
    fireEvent.blur(phone);
    expect(phone.value).toBe("84987654321"); // không đoán mò
    expect(screen.getByText(/SĐT chưa đúng/i)).toBeInTheDocument();
  });
  it("nhập đuôi hợp lệ → hiện preview 'Lưu dạng: 84-352334789'", () => {
    renderModal();
    const phone = screen.getByPlaceholderText("987 654 321") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "352334789" } });
    expect(screen.getByText("84-352334789")).toBeInTheDocument();
  });
});
