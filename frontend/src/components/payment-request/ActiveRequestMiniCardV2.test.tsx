import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../test/msw/server";
import { ActiveRequestMiniCardV2 } from "./PaymentRequestDetailDrawer";
import type { ActiveRequest, PaymentRequest } from "../../types/paymentRequest";

const NOW = "2026-09-08T04:00:47Z";

function makeAr(overrides: Partial<ActiveRequest["uids"][number]["courses"][number]> = {}): ActiveRequest {
  return {
    id: "AR-1",
    prId: "PR-1",
    customerName: "chị Mai",
    createdAt: NOW,
    createdBy: "sale@test",
    holdActivation: false,
    updatedAt: NOW,
    uids: [
      {
        uid: "3304812073",
        phone: "905815681",
        country: "VN",
        courses: [
          {
            courseCode: "CC-1572-001",
            packageName: "2/W- NEW 144 PHI+15 HN",
            amount: 24_033_750,
            orderId: "",
            invoiced: false,
            invoiceRequestedAt: null,
            ...overrides,
          },
        ],
      },
    ],
  };
}

function makeRequest(): PaymentRequest {
  return {
    id: "PR-1",
    name: "chị Mai",
    uid: "3304812073",
    phone: "905815681",
    country: "VN",
    address: "",
    target: 25_000_000,
    source: "",
    createdAt: NOW,
    received: 25_000_000,
    doneCount: 1,
    totalCount: 1,
    delta: 0,
    state: "done",
    payments: [
      {
        id: "l1",
        idx: 0,
        amount: 25_000_000,
        status: "paid",
        createdAt: NOW,
        code: "ABCDE",
        bill: true,
        method: "qr",
      },
    ],
  } as PaymentRequest;
}

function setup(opts: { ar?: ActiveRequest; onSave?: (next: ActiveRequest) => Promise<void> } = {}) {
  const onActiveRequestMutate = vi.fn();
  const onActiveRequestSave = vi.fn(opts.onSave ?? (async () => {}));
  const onActiveRequestDelete = vi.fn(async () => {});
  const card = (ar: ActiveRequest) => (
    <ActiveRequestMiniCardV2
      ar={ar}
      request={makeRequest()}
      onActiveRequestMutate={onActiveRequestMutate}
      onActiveRequestSave={onActiveRequestSave}
      onActiveRequestDelete={onActiveRequestDelete}
    />
  );
  const { rerender } = render(card(opts.ar ?? makeAr()));
  // Giả lập context đổi `ar` trong lúc đang sửa (hold toggle / BE bump updatedAt)
  const rerenderWithAr = (ar: ActiveRequest) => rerender(card(ar));
  return { onActiveRequestMutate, onActiveRequestSave, rerenderWithAr };
}

const clickEdit = () => fireEvent.click(screen.getByRole("button", { name: "Sửa thông tin gói học" }));
const clickSave = () => fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin Active Request" }));

describe("ActiveRequestMiniCardV2 — sửa AR (fix lag 9/9: draft cục bộ + thoát form ngay)", () => {
  it("B: khi đang sửa, blur ô số tiền/UID và gõ ô referral KHÔNG ghi context (onActiveRequestMutate không được gọi)", () => {
    const { onActiveRequestMutate } = setup({ ar: makeAr({ leadSource: "gioi_thieu" }) });
    clickEdit();

    const amount = screen.getByPlaceholderText("Số tiền");
    fireEvent.change(amount, { target: { value: "20000000" } });
    fireEvent.blur(amount);

    const uid = screen.getByPlaceholderText("UID CRM");
    fireEvent.change(uid, { target: { value: "999" } });
    fireEvent.blur(uid);

    const referrer = screen.getByPlaceholderText("UID người giới thiệu");
    fireEvent.change(referrer, { target: { value: "1" } });
    fireEvent.change(referrer, { target: { value: "12" } });
    fireEvent.change(referrer, { target: { value: "123" } });

    expect(onActiveRequestMutate).not.toHaveBeenCalled();
    // draft vẫn phản ánh lên UI
    expect((referrer as HTMLInputElement).value).toBe("123");
  });

  it("B: Lưu đẩy đúng draft (số tiền + UID đã sửa) qua onActiveRequestSave đúng 1 lần, giữ holdActivation từ ar", () => {
    const { onActiveRequestMutate, onActiveRequestSave, rerenderWithAr } = setup();
    clickEdit();

    const amount = screen.getByPlaceholderText("Số tiền");
    fireEvent.change(amount, { target: { value: "20000000" } });
    fireEvent.blur(amount);
    const uid = screen.getByPlaceholderText("UID CRM");
    fireEvent.change(uid, { target: { value: "999" } });
    fireEvent.blur(uid);

    // Trong lúc đang sửa, context đổi `ar`: hold bật + BE bump updatedAt (vd. toggle hold / append)
    rerenderWithAr({ ...makeAr(), holdActivation: true, updatedAt: "2026-09-09T00:00:00Z" });

    clickSave();

    expect(onActiveRequestMutate).not.toHaveBeenCalled();
    expect(onActiveRequestSave).toHaveBeenCalledTimes(1);
    const arg = onActiveRequestSave.mock.calls[0][0] as ActiveRequest;
    expect(arg.id).toBe("AR-1");
    // uids từ DRAFT (không bị ar mới ghi đè)
    expect(arg.uids[0].uid).toBe("999");
    expect(arg.uids[0].courses[0].amount).toBe(20_000_000);
    // field ngoài form lấy từ `ar` SỐNG (hold vừa persist không bị draft cũ đè)
    expect(arg.holdActivation).toBe(true);
    // updatedAt lấy từ SNAPSHOT lúc Sửa → BE 409 nếu AR đã đổi (không để draft cũ xoá gói mới)
    expect(arg.updatedAt).toBe(NOW);
  });

  it("A: Lưu thoát form NGAY, không chờ promise save resolve", () => {
    const { onActiveRequestSave } = setup({ onSave: () => new Promise<void>(() => {}) });
    clickEdit();
    const amount = screen.getByPlaceholderText("Số tiền");
    expect(amount).toHaveStyle({ display: "block" });

    clickSave();

    expect(onActiveRequestSave).toHaveBeenCalledTimes(1);
    // promise chưa resolve nhưng form đã đóng
    expect(screen.getByRole("button", { name: "Lưu thông tin Active Request" })).toBeDisabled();
    expect(amount).toHaveStyle({ display: "none" });
  });

  it("B6: radio hold khi đang sửa vẫn ghi thẳng context (không vào draft)", async () => {
    server.use(
      http.patch("*/api/v1/active-requests/:id", () => HttpResponse.json({ ok: true }))
    );
    const { onActiveRequestMutate } = setup();
    clickEdit();

    fireEvent.click(screen.getByLabelText("Chưa tạo gói học"));

    await waitFor(() =>
      expect(onActiveRequestMutate).toHaveBeenCalledWith("AR-1", expect.any(Function))
    );
  });
});
