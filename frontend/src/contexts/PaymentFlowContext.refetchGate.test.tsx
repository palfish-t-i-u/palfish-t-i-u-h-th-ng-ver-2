import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/msw/server";
import { PaymentFlowProvider, usePaymentFlow } from "./PaymentFlowContext";

vi.mock("../lib/supabase", () => {
  const channel = {
    on() { return channel; },
    subscribe() { return channel; },
  };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: () => {},
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    },
  };
});

let prListCalls = 0;

function Consumer() {
  const { loading, setEditingArId } = usePaymentFlow();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <button onClick={() => setEditingArId("AR-1")}>start-edit</button>
      <button onClick={() => setEditingArId(null)}>stop-edit</button>
    </div>
  );
}

/** Ẩn tab, rồi quay lại sau `ms` (Date.now spy) → useRefetchOnFocus gọi silentRefetch. */
function returnToTabAfter(ms: number) {
  const base = Date.now();
  const nowSpy = vi.spyOn(Date, "now").mockReturnValue(base);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
  nowSpy.mockReturnValue(base + ms);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  document.dispatchEvent(new Event("visibilitychange"));
  nowSpy.mockRestore();
}

async function mountAndSettle() {
  render(
    <PaymentFlowProvider>
      <Consumer />
    </PaymentFlowProvider>
  );
  await waitFor(() => expect(prListCalls).toBe(1));
  await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
  // để finally{} của loadData clear inFlightRef trước khi mô phỏng refetch
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("PaymentFlowContext — silentRefetch gate khi đang sửa AR (fix C 9/9)", () => {
  beforeEach(() => {
    prListCalls = 0;
    server.use(
      http.get("http://localhost:8000/api/v1/payment-requests", () => {
        prListCalls += 1;
        return HttpResponse.json({ requests: [], total: 0 });
      }),
      http.get("http://localhost:8000/api/v1/active-requests", () => HttpResponse.json([]))
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "hidden");
    vi.restoreAllMocks();
  });

  it("control: KHÔNG sửa AR → quay lại tab sau 31s thì refetch nền (GET PR list lần 2)", async () => {
    await mountAndSettle();
    act(() => returnToTabAfter(31_000));
    await waitFor(() => expect(prListCalls).toBe(2));
  });

  it("C: đang sửa AR (setEditingArId) → quay lại tab sau 31s KHÔNG refetch; clear rồi → refetch lại", async () => {
    await mountAndSettle();
    act(() => { screen.getByText("start-edit").click(); });

    act(() => returnToTabAfter(31_000));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(prListCalls).toBe(1);

    act(() => { screen.getByText("stop-edit").click(); });
    act(() => returnToTabAfter(31_000));
    await waitFor(() => expect(prListCalls).toBe(2));
  });
});
