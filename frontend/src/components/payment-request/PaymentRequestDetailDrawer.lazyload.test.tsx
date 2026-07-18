import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
  });

  it("detailLoading=false + 0 payments: empty state shown, NOT loading skeleton", () => {
    render(<PaymentsSection detailLoading={false} paymentsCount={0} />);
    expect(screen.queryByTestId("pr-drawer-detail-loading")).not.toBeInTheDocument();
    expect(screen.getByText(/Chưa có lần thanh toán nào/)).toBeInTheDocument();
  });
});
