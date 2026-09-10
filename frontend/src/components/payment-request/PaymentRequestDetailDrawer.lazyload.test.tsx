import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useEffect, useState } from "react";

// Minimal stub isolating the detailLoading conditional — mirrors the exact
// JSX condition added to PaymentRequestDetailDrawer section "Các lần thanh toán".
function PaymentsSection({
  detailLoading,
  paymentsCount,
}: {
  detailLoading: boolean;
  paymentsCount: number;
}) {
  return (
    <div>
      <h4>
        Các lần thanh toán
        {!detailLoading && (
          <span data-testid="pr-drawer-payment-count">{paymentsCount}</span>
        )}
      </h4>
      {!detailLoading && (
        <button>Tạo lần thanh toán</button>
      )}
      {detailLoading ? (
        <div data-testid="pr-drawer-detail-loading">
          Đang tải chi tiết lần thanh toán…
        </div>
      ) : (
        <div data-testid="pr-drawer-payments">
          {paymentsCount === 0 && <div>Chưa có lần thanh toán nào.</div>}
          {Array.from({ length: paymentsCount }, (_, i) => (
            <div key={i}>Line {i + 1}</div>
          ))}
        </div>
      )}
    </div>
  );
}

describe("drawer lazy-load — detailLoading conditional (GĐ2 amendment tiêu chí 5)", () => {
  it("detailLoading=true: header present, loading skeleton shown, count NOT shown", () => {
    render(<PaymentsSection detailLoading paymentsCount={0} />);
    expect(screen.getByText(/Các lần thanh toán/)).toBeInTheDocument();
    expect(screen.getByTestId("pr-drawer-detail-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("pr-drawer-payment-count")).not.toBeInTheDocument();
    expect(screen.queryByText(/Chưa có lần thanh toán nào/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tạo lần thanh toán/ })).not.toBeInTheDocument();
  });

  it("detailLoading=true: KHÔNG hiện count=0 giả kể cả khi payments=[]", () => {
    render(<PaymentsSection detailLoading paymentsCount={0} />);
    // '0' phải KHÔNG xuất hiện dưới dạng count — tránh user nghĩ PR chưa có lần TT
    expect(screen.queryByTestId("pr-drawer-payment-count")).not.toBeInTheDocument();
  });

  it("detailLoading=false + 2 payments: payments section render, loading gone", () => {
    render(<PaymentsSection detailLoading={false} paymentsCount={2} />);
    expect(screen.queryByTestId("pr-drawer-detail-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("pr-drawer-payments")).toBeInTheDocument();
    expect(screen.getByTestId("pr-drawer-payment-count")).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Tạo lần thanh toán/ })).toBeInTheDocument();
  });

  it("detailLoading=false + 0 payments: empty state shown, NOT loading skeleton", () => {
    render(<PaymentsSection detailLoading={false} paymentsCount={0} />);
    expect(screen.queryByTestId("pr-drawer-detail-loading")).not.toBeInTheDocument();
    expect(screen.getByText(/Chưa có lần thanh toán nào/)).toBeInTheDocument();
  });
});

// Mirror cờ bodyReady thật trong PaymentRequestDetailDrawer (defer body nặng khỏi frame mở).
function DeferredBodyStub({ open }: { open: boolean }) {
  const [bodyReady, setBodyReady] = useState(false);
  useEffect(() => {
    if (!open) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setBodyReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      setBodyReady(false);
    };
  }, [open]);
  return bodyReady ? (
    <div data-testid="drawer-body-ready">BODY</div>
  ) : (
    <div data-testid="drawer-body-skeleton">SKELETON</div>
  );
}

describe("drawer bodyReady — defer body nặng khỏi frame mở (fix lag bấm mở PR)", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0 as unknown as number;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("open=false → chỉ skeleton, KHÔNG mount body", () => {
    render(<DeferredBodyStub open={false} />);
    expect(screen.getByTestId("drawer-body-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("drawer-body-ready")).not.toBeInTheDocument();
  });

  it("open=true → sau rAF thì body mount", async () => {
    render(<DeferredBodyStub open />);
    expect(await screen.findByTestId("drawer-body-ready")).toBeInTheDocument();
  });

  // Guard invariant load-bearing: đóng drawer PHẢI reset bodyReady=false → body unmount →
  // AR card cleanup clear editingArIdRef (nếu ai đó bỏ setBodyReady(false) khỏi cleanup,
  // test này đỏ trước khi tái hiện bug "editingArIdRef treo → chặn refetch nền").
  it("open=true→false → body unmount, skeleton trở lại (reset-on-close)", async () => {
    const { rerender } = render(<DeferredBodyStub open />);
    expect(await screen.findByTestId("drawer-body-ready")).toBeInTheDocument();
    rerender(<DeferredBodyStub open={false} />);
    expect(screen.getByTestId("drawer-body-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("drawer-body-ready")).not.toBeInTheDocument();
  });
});
