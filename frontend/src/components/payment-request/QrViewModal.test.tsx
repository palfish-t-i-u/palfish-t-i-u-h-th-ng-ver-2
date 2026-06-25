/**
 * Extreme regression test suite cho QrViewModal.
 *
 * Bối cảnh: prod incident 23/6/2026 — sale gửi nhầm QR PR cũ (4.550.000) cho
 * khách PR mới (17.650.000) vì clipboard không được update khi bấm "Chụp mã QR"
 * (img thiếu crossOrigin → html-to-image.toBlob CORS-tainted → silent failure).
 *
 * Mục tiêu test:
 *  1. Codify shipped fix (commit 86257da + 58c98fc): chống regression.
 *  2. Cover edge cases: cross-PR switching, edit-amount mid-modal, URL encoding.
 *  3. Guardrail chặt: mỗi test khẳng định ĐÚNG 1 hành vi với assertion cụ thể
 *     (exact attribute / regex chính xác) → model thấp hơn vẫn buộc chạy
 *     rigorous, không thể "test pass nhờ may rủi".
 *
 * Triết lý guardrail (cho model thấp như Sonnet 4.6 / Opus 4.6):
 *  - Không assertion dạng "container exists" — luôn check VALUE cụ thể.
 *  - Không truthy check khi cần exact match.
 *  - Mọi test phải có ≥ 2 assertion (input + output) để model không thể
 *    skip implementation và vẫn pass.
 *  - imgUrl assertions dùng URLSearchParams parse, không substring match,
 *    để tránh false positive khi URL encoding thay đổi.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PaymentAttempt, PaymentRequest } from "../../types/paymentRequest";
import { BANK_INFO } from "../../constants/bank";
import QrViewModal from "./QrViewModal";

// ─────────────────────────── Fixtures ───────────────────────────

function makeRequest(over: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "PR-2026-0066",
    name: "Trần Xuân",
    childName: "Nguyễn Thị Phương Linh",
    uid: "U0066",
    phone: "985004656",
    country: "VN",
    address: "",
    target: 17_650_000,
    source: "manual",
    createdAt: "2026-06-23T11:08:09+07:00",
    received: 0,
    doneCount: 0,
    totalCount: 1,
    delta: -17_650_000,
    state: "pending",
    payments: [],
    ...over,
  };
}

function makeQr(over: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: "0c61d981-0f97-428e-b186-d3cbcf6d0fb0",
    idx: 1,
    amount: 17_650_000,
    status: "pending",
    createdAt: "2026-06-23T11:08:26+07:00",
    code: "FHETL",
    transferContent: "84985004656 Nguyen Thi Phuong Linh FHETL",
    bill: false,
    method: "qr",
    ...over,
  };
}

/** PR cũ (đã PAID) — workflow gây bug: clipboard giữ QR cũ. */
function makeOldRequest(): PaymentRequest {
  return makeRequest({
    id: "PR-2026-0057",
    name: "Trần Kim Ngân",
    childName: "Trần Hoàng Yến Nhi",
    phone: "906698067",
    target: 4_550_000,
  });
}
function makeOldQr(): PaymentAttempt {
  return makeQr({
    id: "aea0d265-5a38-4e58-8660-227084c76f9c",
    amount: 4_550_000,
    code: "FHE4L",
    transferContent: "84906698067 Tran Hoang Yen Nhi FHE4L",
    status: "paid",
  });
}

// ─────────────────────────── Helpers ───────────────────────────

/** Lấy <img> chính của VietQR. data-qr-capture-hide overlay loại trừ. */
function getQrImg(): HTMLImageElement {
  const img = screen.getByAltText("VietQR");
  if (!(img instanceof HTMLImageElement)) {
    throw new Error("Expected <img alt=VietQR>");
  }
  return img;
}

/** Parse `amount` / `addInfo` / `accountName` từ img.vietqr.io URL. */
function parseQrParams(url: string): {
  amount: number;
  addInfo: string;
  accountName: string;
  pathPng: string;
} {
  const u = new URL(url);
  return {
    amount: Number(u.searchParams.get("amount")),
    addInfo: u.searchParams.get("addInfo") ?? "",
    accountName: u.searchParams.get("accountName") ?? "",
    pathPng: u.pathname,
  };
}

/** Fire load synchronously so React updates state. */
function loadImg(img: HTMLImageElement) {
  fireEvent.load(img);
}
function errorImg(img: HTMLImageElement) {
  fireEvent.error(img);
}

function getCaptureButton(): HTMLButtonElement {
  // Primary action — match by Vietnamese label OR loading label
  const btn = screen.getAllByRole("button").find((b) => {
    const t = b.textContent ?? "";
    return /Chụp mã QR|Đang tải QR/.test(t) && b.className.includes("btn-primary");
  });
  if (!btn) throw new Error("Capture button not found");
  return btn as HTMLButtonElement;
}

function getCopyButton(): HTMLButtonElement {
  const btn = screen.getAllByRole("button").find((b) => {
    const t = b.textContent ?? "";
    // "Copy mã QR" (idle) OR "Đang tải QR..." (loading) — distinguished from
    // "Copy nội dung CK" which has different text & icon
    return (/Copy mã QR|Đang tải QR/.test(t)) && !/nội dung CK/.test(t);
  });
  if (!btn) throw new Error("Copy QR button not found");
  return btn as HTMLButtonElement;
}

// ═══════════════════════════════════════════════════════════════
// GROUP 1: Basic rendering contracts
// ═══════════════════════════════════════════════════════════════

describe("QrViewModal — basic rendering", () => {
  it("không render gì khi qr=null", () => {
    expect.assertions(1);
    const { container } = render(
      <QrViewModal qr={null} request={makeRequest()} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("không render gì khi request=null", () => {
    expect.assertions(1);
    const { container } = render(
      <QrViewModal qr={makeQr()} request={null} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("render modal khi cả qr + request có giá trị", () => {
    expect.assertions(2);
    render(
      <QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />,
    );
    expect(screen.getByText(/QR thanh toán · Lần #1/)).toBeInTheDocument();
    expect(getQrImg()).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 2: URL building — codify amount / addInfo / accountName
// ═══════════════════════════════════════════════════════════════

describe("QrViewModal — img.vietqr.io URL building", () => {
  it("URL chứa ĐÚNG amount từ qr.amount (không phải target/received)", () => {
    expect.assertions(2);
    render(
      <QrViewModal qr={makeQr({ amount: 17_650_000 })} request={makeRequest({ target: 999 })} onClose={() => {}} />,
    );
    const params = parseQrParams(getQrImg().src);
    expect(params.amount).toBe(17_650_000);
    expect(params.amount).not.toBe(999); // không phải target
  });

  it("URL chứa transferContent (không phải code) làm addInfo nếu có", () => {
    expect.assertions(1);
    render(
      <QrViewModal
        qr={makeQr({ transferContent: "84985004656 Nguyen FHETL", code: "FHETL" })}
        request={makeRequest()}
        onClose={() => {}}
      />,
    );
    expect(parseQrParams(getQrImg().src).addInfo).toBe("84985004656 Nguyen FHETL");
  });

  it("URL fallback về qr.code khi transferContent rỗng/null", () => {
    expect.assertions(1);
    render(
      <QrViewModal
        qr={makeQr({ transferContent: null, code: "FHETL" })}
        request={makeRequest()}
        onClose={() => {}}
      />,
    );
    expect(parseQrParams(getQrImg().src).addInfo).toBe("FHETL");
  });

  it("URL chứa accountName từ BANK_INFO (pháp nhân nhận tiền)", () => {
    expect.assertions(1);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    expect(parseQrParams(getQrImg().src).accountName).toBe(BANK_INFO.accountName);
  });

  it("path PNG đúng pattern {bin}-{accountNo}-compact2.png", () => {
    expect.assertions(1);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    const { pathPng } = parseQrParams(getQrImg().src);
    expect(pathPng).toBe(`/image/${BANK_INFO.bin}-${BANK_INFO.accountNo}-compact2.png`);
  });

  it("URL khác nhau cho 2 PR khác nhau (smoke test phân biệt PR-0057 vs PR-0066)", () => {
    expect.assertions(2);
    const { unmount } = render(
      <QrViewModal qr={makeOldQr()} request={makeOldRequest()} onClose={() => {}} />,
    );
    const urlOld = getQrImg().src;
    unmount();
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    const urlNew = getQrImg().src;
    expect(urlOld).not.toBe(urlNew);
    expect(parseQrParams(urlOld).amount).not.toBe(parseQrParams(urlNew).amount);
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 3: crossOrigin & key — fix gốc cho prod incident
// ═══════════════════════════════════════════════════════════════

describe("QrViewModal — CORS + key guardrails (commit 58c98fc + 86257da)", () => {
  it("<img> PHẢI có crossOrigin='anonymous' (toBlob không CORS-taint)", () => {
    expect.assertions(1);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    // Quan trọng: KHÔNG dùng `getAttribute("crossorigin")` vì jsdom có thể normalize.
    // Dùng `.crossOrigin` property — đảm bảo browser đặt CORS mode khi fetch.
    expect(getQrImg().crossOrigin).toBe("anonymous");
  });

  it("URL thay đổi PHẢI làm <img> remount (test gián tiếp qua key) — verify URL src thực sự đổi", () => {
    expect.assertions(2);
    const { rerender } = render(
      <QrViewModal qr={makeQr({ amount: 1_000_000 })} request={makeRequest()} onClose={() => {}} />,
    );
    const urlBefore = getQrImg().src;
    rerender(
      <QrViewModal qr={makeQr({ amount: 2_000_000 })} request={makeRequest()} onClose={() => {}} />,
    );
    const urlAfter = getQrImg().src;
    expect(urlBefore).not.toBe(urlAfter);
    expect(parseQrParams(urlAfter).amount).toBe(2_000_000);
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 4: imgReady state machine + button enable/disable
// ═══════════════════════════════════════════════════════════════

describe("QrViewModal — imgReady state + button gating", () => {
  it("ngay sau mount: nút Chụp + Copy disabled (imgReady=false)", () => {
    expect.assertions(2);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    expect(getCaptureButton()).toBeDisabled();
    expect(getCopyButton()).toBeDisabled();
  });

  it("sau khi img onLoad fire: nút Chụp + Copy enabled", () => {
    expect.assertions(2);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    loadImg(getQrImg());
    expect(getCaptureButton()).not.toBeDisabled();
    expect(getCopyButton()).not.toBeDisabled();
  });

  it("img onError fire: nút Chụp + Copy giữ disabled (không cho thao tác QR lỗi)", () => {
    expect.assertions(2);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    errorImg(getQrImg());
    expect(getCaptureButton()).toBeDisabled();
    expect(getCopyButton()).toBeDisabled();
  });

  it("load → error: phải về lại disabled (không stuck enabled khi ảnh fail sau đó)", () => {
    expect.assertions(2);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    const img = getQrImg();
    loadImg(img);
    expect(getCaptureButton()).not.toBeDisabled();
    errorImg(img);
    expect(getCaptureButton()).toBeDisabled();
  });

  it("label nút Chụp đổi sang 'Đang tải QR…' khi !imgReady", () => {
    expect.assertions(2);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    expect(getCaptureButton().textContent).toMatch(/Đang tải QR/);
    loadImg(getQrImg());
    expect(getCaptureButton().textContent).toMatch(/Chụp mã QR/);
  });

  it("label nút Copy đổi sang 'Đang tải QR…' khi !imgReady", () => {
    expect.assertions(2);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    expect(getCopyButton().textContent).toMatch(/Đang tải QR/);
    loadImg(getQrImg());
    expect(getCopyButton().textContent).toMatch(/Copy mã QR/);
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 5: Cross-PR switching — REPRODUCE prod incident sequence
// ═══════════════════════════════════════════════════════════════

describe("QrViewModal — cross-PR switching (prod incident reproduction)", () => {
  it("đổi từ PR cũ (đã load) sang PR mới: nút PHẢI re-disable cho đến khi ảnh mới load", () => {
    expect.assertions(4);
    const { rerender } = render(
      <QrViewModal qr={makeOldQr()} request={makeOldRequest()} onClose={() => {}} />,
    );
    // 1. Load ảnh QR cũ xong → enabled
    loadImg(getQrImg());
    expect(getCaptureButton()).not.toBeDisabled();

    // 2. Đổi sang QR mới (mô phỏng sale đóng modal + mở PR khác)
    rerender(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);

    // 3. URL phải đổi
    expect(parseQrParams(getQrImg().src).amount).toBe(17_650_000);

    // 4. Nút PHẢI disabled (imgReady reset)
    expect(getCaptureButton()).toBeDisabled();
    expect(getCopyButton()).toBeDisabled();
  });

  it("đổi PR: sau khi ảnh MỚI load xong mới enable lại nút", () => {
    expect.assertions(2);
    const { rerender } = render(
      <QrViewModal qr={makeOldQr()} request={makeOldRequest()} onClose={() => {}} />,
    );
    loadImg(getQrImg());
    rerender(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    expect(getCaptureButton()).toBeDisabled(); // sau khi đổi
    loadImg(getQrImg()); // ảnh mới load xong
    expect(getCaptureButton()).not.toBeDisabled(); // mới enable
  });

  it("đổi PR khi ảnh MỚI lỗi (CDN trả 5xx): nút giữ disabled, không cho chụp ảnh broken", () => {
    expect.assertions(1);
    const { rerender } = render(
      <QrViewModal qr={makeOldQr()} request={makeOldRequest()} onClose={() => {}} />,
    );
    loadImg(getQrImg());
    rerender(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    errorImg(getQrImg());
    expect(getCaptureButton()).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 6: Edit-amount mid-modal (TOP 1-B feature)
// ═══════════════════════════════════════════════════════════════

describe("QrViewModal — edit amount mid-modal", () => {
  it("amount đổi từ X sang Y: img src đổi + nút re-disabled", () => {
    expect.assertions(3);
    const { rerender } = render(
      <QrViewModal qr={makeQr({ amount: 1_000_000 })} request={makeRequest()} onClose={() => {}} />,
    );
    loadImg(getQrImg());
    expect(getCaptureButton()).not.toBeDisabled();

    rerender(
      <QrViewModal qr={makeQr({ amount: 2_000_000 })} request={makeRequest()} onClose={() => {}} />,
    );
    expect(parseQrParams(getQrImg().src).amount).toBe(2_000_000);
    expect(getCaptureButton()).toBeDisabled();
  });

  it("panel 'SỐ TIỀN' (bên phải) PHẢI khớp với amount trong URL ảnh (bên trái)", () => {
    expect.assertions(2);
    render(
      <QrViewModal qr={makeQr({ amount: 17_650_000 })} request={makeRequest()} onClose={() => {}} />,
    );
    // Scope vào BankInfoRow "Số tiền": label + value cùng cấp.
    const sotienLabel = screen.getByText("Số tiền");
    const row = sotienLabel.closest('div[style*="flex-direction: column"]');
    if (!row) throw new Error("Số tiền row not found");
    // info-value div bên trong — chứa số tiền đã format vi-VN
    const valueEl = row.querySelector(".info-value");
    expect(valueEl?.textContent).toBe("17.650.000 đ");
    // Cross-check: cùng amount trong img URL
    expect(parseQrParams(getQrImg().src).amount).toBe(17_650_000);
  });

  it("amount = 0: vẫn render không crash + URL chứa amount=0", () => {
    expect.assertions(2);
    render(<QrViewModal qr={makeQr({ amount: 0 })} request={makeRequest()} onClose={() => {}} />);
    expect(parseQrParams(getQrImg().src).amount).toBe(0);
    expect(getQrImg()).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 7: URL encoding edge cases
// ═══════════════════════════════════════════════════════════════

describe("QrViewModal — URL encoding edge cases", () => {
  it("addInfo chứa khoảng trắng: URL encoded thành %20 (parse decode ra ký tự gốc)", () => {
    expect.assertions(1);
    render(
      <QrViewModal
        qr={makeQr({ transferContent: "84985004656 Nguyen Phuong Linh FHETL" })}
        request={makeRequest()}
        onClose={() => {}}
      />,
    );
    expect(parseQrParams(getQrImg().src).addInfo).toBe(
      "84985004656 Nguyen Phuong Linh FHETL",
    );
  });

  it("addInfo dài 40 ký tự (giới hạn img.vietqr.io): vẫn vào URL nguyên si (không cắt FE)", () => {
    expect.assertions(2);
    const content40 = "8401234567890 Nguyen Van A B C D EF FHE9V"; // 41 chars to test
    render(
      <QrViewModal
        qr={makeQr({ transferContent: content40 })}
        request={makeRequest()}
        onClose={() => {}}
      />,
    );
    const addInfo = parseQrParams(getQrImg().src).addInfo;
    expect(addInfo).toBe(content40);
    expect(addInfo.length).toBe(content40.length); // không bị FE cắt
  });

  it("accountName có dấu '-' (PALFISH SINGAPORE - VIETNAM): URL parse đúng, không bị split", () => {
    expect.assertions(1);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    expect(parseQrParams(getQrImg().src).accountName).toContain("- VIETNAM");
  });

  it("URL được URL-encode đúng — round-trip qua URL parser không lệch", () => {
    expect.assertions(1);
    render(
      <QrViewModal
        qr={makeQr({ transferContent: "test & encode = special?chars" })}
        request={makeRequest()}
        onClose={() => {}}
      />,
    );
    // Nếu URL không encode đúng, special chars sẽ làm URL parser hiểu sai
    // (ví dụ `&` sẽ split thành param mới, `=` sẽ ăn vào value).
    // URLSearchParams decode đúng nếu encode đúng.
    expect(parseQrParams(getQrImg().src).addInfo).toBe("test & encode = special?chars");
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 8: Failure modes & race conditions
// ═══════════════════════════════════════════════════════════════

describe("QrViewModal — failure modes & races", () => {
  it("rapid prop change qua nhiều lần rerender không crash", () => {
    expect.assertions(1);
    const { rerender } = render(
      <QrViewModal qr={makeQr({ amount: 100 })} request={makeRequest()} onClose={() => {}} />,
    );
    for (let i = 0; i < 20; i++) {
      rerender(
        <QrViewModal qr={makeQr({ amount: i * 1000 })} request={makeRequest()} onClose={() => {}} />,
      );
    }
    // Sau 20 lần rerender, vẫn render đúng amount cuối
    expect(parseQrParams(getQrImg().src).amount).toBe(19_000);
  });

  it("đổi request giữa chừng: thông tin khách hiển thị PHẢI khớp request mới", () => {
    expect.assertions(1);
    const { rerender } = render(
      <QrViewModal qr={makeOldQr()} request={makeOldRequest()} onClose={() => {}} />,
    );
    rerender(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    expect(screen.getByText(/Trần Xuân/)).toBeInTheDocument();
  });

  it("nút Đóng gọi onClose", () => {
    expect.assertions(1);
    const onClose = vi.fn();
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("bấm scrim (vùng tối ngoài modal) gọi onClose", () => {
    expect.assertions(1);
    const onClose = vi.fn();
    const { container } = render(
      <QrViewModal qr={makeQr()} request={makeRequest()} onClose={onClose} />,
    );
    const scrim = container.querySelector(".gmv-prototype-modal-scrim");
    if (!scrim) throw new Error("Scrim not found");
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("click vào nội dung modal KHÔNG gọi onClose (stopPropagation)", () => {
    expect.assertions(1);
    const onClose = vi.fn();
    const { container } = render(
      <QrViewModal qr={makeQr()} request={makeRequest()} onClose={onClose} />,
    );
    const modal = container.querySelector(".modal");
    if (!modal) throw new Error("Modal content not found");
    fireEvent.click(modal);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 9: Spinner overlay (UX feedback cho sale)
// ═══════════════════════════════════════════════════════════════

describe("QrViewModal — spinner overlay", () => {
  /**
   * "Đang tải QR…" text xuất hiện ở 3 nơi khi !imgReady: overlay trên ảnh +
   * label nút Chụp + label nút Copy. Test scope tách bạch — overlay là <div>
   * có data-qr-capture-hide='true' bọc <span>Đang tải QR…</span>, KHÁC với
   * nút (button) cũng có cùng text.
   */
  function getOverlayContainer(): HTMLElement | null {
    const overlays = document.querySelectorAll<HTMLElement>(
      'div[data-qr-capture-hide="true"]',
    );
    for (const el of overlays) {
      if ((el.textContent ?? "").includes("Đang tải QR…")) return el;
    }
    return null;
  }

  it("hiển thị overlay loading TRÊN ẢNH khi !imgReady (phân biệt với label nút)", () => {
    expect.assertions(2);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    const overlay = getOverlayContainer();
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain("Đang tải QR…");
  });

  it("ẩn overlay TRÊN ẢNH sau khi img onLoad (label nút có thể vẫn còn nếu state khác)", () => {
    expect.assertions(2);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    expect(getOverlayContainer()).not.toBeNull();
    loadImg(getQrImg());
    expect(getOverlayContainer()).toBeNull();
  });

  it("overlay có data-qr-capture-hide='true' để loại trừ khỏi html-to-image.toBlob", () => {
    expect.assertions(1);
    render(<QrViewModal qr={makeQr()} request={makeRequest()} onClose={() => {}} />);
    // getOverlayContainer đã lọc theo attribute → existence chính là assertion.
    // Thêm assertion exact attribute để khoá ràng buộc rõ hơn.
    expect(getOverlayContainer()?.getAttribute("data-qr-capture-hide")).toBe("true");
  });
});
