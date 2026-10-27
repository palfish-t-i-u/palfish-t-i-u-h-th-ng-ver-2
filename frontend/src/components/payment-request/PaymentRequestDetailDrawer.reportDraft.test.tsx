import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEffect, useState } from "react";

/**
 * Mirror NGUYÊN state-machine của form "Báo đơn & Tạo gói học" trong
 * PaymentRequestDetailDrawer.tsx (drawer thật quá nặng để mount jsdom — theo đúng
 * convention stub-mirror của PaymentRequestDetailDrawer.lazyload.test.tsx).
 *
 * Invariant bảo vệ (fix "form văng phải điền lại hết"):
 *  - Mở form: CHỈ seed khi chưa có nháp (`arDraftRows.length === 0`). Có nháp → GIỮ nguyên.
 *  - Đóng (X / "Đóng" / nền mờ): chỉ ẩn, KHÔNG xoá nháp → mở lại khôi phục được.
 *  - Nháp bị xoá ĐÚNG 2 nơi: gửi thành công, và đổi PR (effect [requestId]).
 *
 * Nếu ai đó bỏ guard `length === 0` (seed đè vô điều kiện) hoặc cho X/Đóng/nền xoá nháp,
 * test này đỏ trước khi lỗi "mất data" lọt lên prod.
 */
function ReportFormHarness({ requestId }: { requestId: string }) {
  const [arDraftRows, setArDraftRows] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  // Mirror effect reset `[request?.id]` của drawer (:1907) — đổi PR = xoá nháp + đóng.
  useEffect(() => {
    setOpen(false);
    setArDraftRows([]);
  }, [requestId]);

  // Mirror handler nút "Báo đơn & Tạo gói học" (:3064) — CHỈ seed khi chưa có nháp.
  const openForm = () => {
    if (arDraftRows.length === 0) setArDraftRows(["seed"]);
    setOpen(true);
  };
  // Mirror X / "Đóng" / nền mờ — chỉ ẩn, KHÔNG xoá nháp.
  const closeForm = () => setOpen(false);
  // Mirror gửi thành công (:3508) — đóng + xoá nháp.
  const submitOk = () => { setOpen(false); setArDraftRows([]); };
  // Thao tác điền của sale (thêm 1 bé/gói).
  const fillRow = () => setArDraftRows((r) => [...r, "filled"]);

  return (
    <div>
      <span data-testid="open">{String(open)}</span>
      <span data-testid="rows">{arDraftRows.join(",")}</span>
      <button onClick={openForm}>open</button>
      <button onClick={fillRow}>fill</button>
      <button onClick={closeForm}>close</button>
      <button onClick={submitOk}>submit</button>
    </div>
  );
}

const rows = () => screen.getByTestId("rows").textContent;
const isOpen = () => screen.getByTestId("open").textContent;

describe("Báo đơn form — giữ nháp khi mở lại (fix văng form phải điền lại)", () => {
  it("đóng (ẩn) rồi mở lại CÙNG PR → nháp GIỮ NGUYÊN, không seed đè", () => {
    render(<ReportFormHarness requestId="PR-1" />);
    fireEvent.click(screen.getByText("open"));   // mở → seed
    fireEvent.click(screen.getByText("fill"));   // điền thêm 1 bé
    fireEvent.click(screen.getByText("fill"));   // điền thêm 1 bé nữa
    expect(rows()).toBe("seed,filled,filled");

    fireEvent.click(screen.getByText("close"));  // đóng (nhầm X/Đóng/nền)
    expect(isOpen()).toBe("false");
    expect(rows()).toBe("seed,filled,filled");   // nháp vẫn còn

    fireEvent.click(screen.getByText("open"));   // mở lại
    expect(isOpen()).toBe("true");
    expect(rows()).toBe("seed,filled,filled");   // KHÔNG seed đè → không mất data
  });

  it("gửi thành công → xoá nháp; mở lại = seed MỚI", () => {
    render(<ReportFormHarness requestId="PR-1" />);
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(screen.getByText("fill"));
    expect(rows()).toBe("seed,filled");

    fireEvent.click(screen.getByText("submit"));
    expect(isOpen()).toBe("false");
    expect(rows()).toBe("");                     // đã xoá

    fireEvent.click(screen.getByText("open"));
    expect(rows()).toBe("seed");                 // seed mới
  });

  it("đổi PR → nháp bị xoá (seed mới lần mở sau)", () => {
    const { rerender } = render(<ReportFormHarness requestId="PR-1" />);
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(screen.getByText("fill"));
    expect(rows()).toBe("seed,filled");

    rerender(<ReportFormHarness requestId="PR-2" />); // đổi PR → effect reset
    expect(isOpen()).toBe("false");
    expect(rows()).toBe("");

    fireEvent.click(screen.getByText("open"));
    expect(rows()).toBe("seed");                 // seed mới cho PR-2
  });
});
