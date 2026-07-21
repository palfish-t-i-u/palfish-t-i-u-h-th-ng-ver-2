import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BillUploadZone from "./BillUploadZone";

function imageFile(name = "bill.png", type = "image/png"): File {
  return new File(["fake-bytes"], name, { type });
}

/** Dựng paste event có clipboardData giả (jsdom không tự dựng ClipboardEvent đầy đủ). */
function pasteEvent(items: Array<{ kind: string; type: string; file: File | null }>): Event {
  const files = items.map((i) => i.file).filter((f): f is File => !!f);
  const clipboardData = {
    items: items.map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file })),
    files,
  };
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: clipboardData });
  return ev;
}

function openModal() {
  fireEvent.click(screen.getByRole("button", { name: /Up bill/i }));
}

afterEach(() => vi.restoreAllMocks());

describe("BillUploadZone — modal up bill", () => {
  it("bấm 'Up bill' → mở modal có hướng dẫn 3 cách", () => {
    render(<BillUploadZone hasBill={false} onFile={vi.fn()} />);
    expect(screen.queryByText("Dán ảnh (Ctrl+V)")).toBeNull(); // chưa mở
    openModal();
    expect(screen.getByText("Dán ảnh (Ctrl+V)")).toBeTruthy();
    expect(screen.getByText(/kéo-thả ảnh vào đây/)).toBeTruthy();
    expect(screen.getByText(/bấm để chọn file/)).toBeTruthy();
  });

  it("dán ảnh khi modal mở → up ngay (gọi onFile với đúng file)", async () => {
    const onFile = vi.fn();
    render(<BillUploadZone hasBill={false} onFile={onFile} />);
    openModal();
    const file = imageFile();
    document.dispatchEvent(pasteEvent([{ kind: "file", type: "image/png", file }]));
    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(1));
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("dán ảnh khi modal CHƯA mở → bỏ qua (không nghe paste toàn trang khi đóng)", async () => {
    const onFile = vi.fn();
    render(<BillUploadZone hasBill={false} onFile={onFile} />);
    document.dispatchEvent(pasteEvent([{ kind: "file", type: "image/png", file: imageFile() }]));
    await new Promise((r) => setTimeout(r, 0));
    expect(onFile).not.toHaveBeenCalled();
  });

  it("dán chữ (không ảnh) khi modal mở → không gọi onFile, không chặn paste", async () => {
    const onFile = vi.fn();
    render(<BillUploadZone hasBill={false} onFile={onFile} />);
    openModal();
    const ev = pasteEvent([{ kind: "string", type: "text/plain", file: null }]);
    document.dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 0));
    expect(onFile).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("kéo-thả ảnh vào vùng thả → up ngay", async () => {
    const onFile = vi.fn();
    render(<BillUploadZone hasBill={false} onFile={onFile} />);
    openModal();
    const zone = screen.getByRole("button", { name: /Vùng thả ảnh/i });
    const file = imageFile("drop.png");
    fireEvent.drop(zone, { dataTransfer: { files: [file], items: [] } });
    await waitFor(() => expect(onFile).toHaveBeenCalledWith(file));
  });

  it("Esc đóng modal", () => {
    render(<BillUploadZone hasBill={false} onFile={vi.fn()} />);
    openModal();
    expect(screen.getByText("Dán ảnh (Ctrl+V)")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Dán ảnh (Ctrl+V)")).toBeNull();
  });

  it("sau khi up xong, nghe paste dừng lại khi đóng modal", async () => {
    const onFile = vi.fn();
    render(<BillUploadZone hasBill={false} onFile={onFile} />);
    openModal();
    fireEvent.keyDown(window, { key: "Escape" }); // đóng
    document.dispatchEvent(pasteEvent([{ kind: "file", type: "image/png", file: imageFile() }]));
    await new Promise((r) => setTimeout(r, 0));
    expect(onFile).not.toHaveBeenCalled();
  });
});
