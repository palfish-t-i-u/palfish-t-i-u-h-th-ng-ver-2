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

afterEach(() => vi.restoreAllMocks());

describe("BillUploadZone — paste ảnh (Ctrl+V)", () => {
  it("dán ảnh khi đang trỏ vào ô (hover) → gọi onFile với đúng file", async () => {
    const onFile = vi.fn();
    render(<BillUploadZone hasBill={false} onFile={onFile} />);
    const zone = screen.getByRole("button", { name: /up bill/i });

    fireEvent.mouseEnter(zone); // active = true
    const file = imageFile();
    document.dispatchEvent(pasteEvent([{ kind: "file", type: "image/png", file }]));

    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(1));
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("dán ảnh khi KHÔNG trỏ vào ô → bỏ qua (không nhắm nhầm dòng)", async () => {
    const onFile = vi.fn();
    render(<BillUploadZone hasBill={false} onFile={onFile} />);
    // không mouseEnter → active = false
    document.dispatchEvent(pasteEvent([{ kind: "file", type: "image/png", file: imageFile() }]));

    await new Promise((r) => setTimeout(r, 0));
    expect(onFile).not.toHaveBeenCalled();
  });

  it("dán chữ (không có ảnh) khi hover → không gọi onFile, không chặn paste của input khác", async () => {
    const onFile = vi.fn();
    render(<BillUploadZone hasBill={false} onFile={onFile} />);
    const zone = screen.getByRole("button", { name: /up bill/i });

    fireEvent.mouseEnter(zone);
    const ev = pasteEvent([{ kind: "string", type: "text/plain", file: null }]);
    document.dispatchEvent(ev);

    await new Promise((r) => setTimeout(r, 0));
    expect(onFile).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false); // không hijack text paste
  });

  it("không nhận paste khi đang tải (uploading)", async () => {
    const onFile = vi.fn();
    render(<BillUploadZone hasBill={false} uploading onFile={onFile} />);
    // uploading → tabIndex -1, nhưng vẫn test guard bằng cách hover element theo class
    const zone = document.querySelector(".bill-dropzone") as HTMLElement;
    fireEvent.mouseEnter(zone);
    document.dispatchEvent(pasteEvent([{ kind: "file", type: "image/png", file: imageFile() }]));

    await new Promise((r) => setTimeout(r, 0));
    expect(onFile).not.toHaveBeenCalled();
  });

  it("hover đổi nhãn thành gợi ý 'Ctrl+V để dán'", () => {
    render(<BillUploadZone hasBill={false} onFile={vi.fn()} />);
    const zone = screen.getByRole("button", { name: /up bill/i });
    expect(screen.getByText("Up bill")).toBeTruthy();
    fireEvent.mouseEnter(zone);
    expect(screen.getByText("Ctrl+V để dán")).toBeTruthy();
    fireEvent.mouseLeave(zone);
    expect(screen.getByText("Up bill")).toBeTruthy();
  });
});
