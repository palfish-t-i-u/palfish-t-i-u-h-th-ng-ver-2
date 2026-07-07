# Plan: Fix đồng bộ mPOS/Payoo — zip lệch version + secret onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Ngày:** 06/07/2026 · **Executor dự kiến:** Sonnet 4.6, subagent parallel · **Người duyệt:** Minh

**Goal:** Kế toán cài extension từ app là sync mPOS/Payoo chạy được ngay — hết lỗi "180s không phản hồi" (zip cũ 18/6) và hết lỗi ngầm thiếu Extension Secret.

**Architecture:** Sửa extension (báo lỗi rõ khi thiếu secret + timeout tải file mPOS + bump version 1.3.0), bổ sung bước "dán mã bí mật" vào hướng dẫn FE, viết script đóng gói zip từ `crm-token-extension/` để zip không bao giờ lệch code nữa. Task Render env là việc TAY của Minh (không giao subagent vì đụng secret).

**Tech Stack:** Chrome extension MV3 (vanilla JS, không có test harness — guardrail bằng `node --check` + grep), React 19 + Vitest + testing-library (FE), Python stdlib (script zip).

**Bối cảnh lỗi (điều tra 06/07):**
- `frontend/public/palfish-gmv-sync.zip` đóng gói lần cuối 18/6 (commit `cd66073`), thiếu toàn bộ 6 fix ngày 4/7 (`7614205`→`c02b55a`: crawl backwards, sequential, timeout 15s Payoo, guard content script, cookie header). Kế toán cài zip → bản cũ → lỗi "Hết thời gian — extension không phản hồi (180s)".
- Hướng dẫn 5 bước trên tab không có bước dán Extension Secret → thiếu secret thì extension trả `ok: true` giả, app hiện XANH "ghi 0 giao dịch".
- `_fetchBase64Creds` (tải file mPOS) chưa có timeout → 1 request treo là treo cả lượt sync.

---

## Điều phối subagent (orchestrator đọc trước)

### Waves

| Wave | Task | Agent | Files sở hữu | Phụ thuộc |
|------|------|-------|--------------|-----------|
| 1 (parallel) | Task 1: Extension — secret check, timeout mPOS, bump 1.3.0 | Agent A | `crm-token-extension/**` | — |
| 1 (parallel) | Task 2: FE hướng dẫn — thêm bước dán secret + test | Agent B | `frontend/src/components/GatewaySyncTab.tsx`, `frontend/src/components/GatewaySyncTab.test.tsx` | — |
| 2 | Task 3: Script build zip + đóng gói lại | Agent C | `scripts/build_extension_zip.py`, `frontend/public/palfish-gmv-sync.zip` | Task 1 xong |
| 3 | Task 4: Verify Render env (VIỆC TAY — Minh làm, KHÔNG giao subagent) | Human | Render dashboard | — |
| 3 | Task 5: Validation tổng + squash + push + rollout | Orchestrator | — | Task 1-3 xong |

- Wave 1: dispatch Agent A và Agent B **cùng lúc** — không đụng file nhau.
- Wave 2 chỉ chạy sau khi Task 1 đã commit (zip đóng gói từ code MỚI).
- Mỗi agent chỉ được sửa file trong cột "Files sở hữu". Muốn sửa file khác → dừng, báo orchestrator.

### Guardrails toàn cục (nhúng vào prompt của MỌI subagent)

1. **KHÔNG** sửa file ngoài danh sách sở hữu của task.
2. **KHÔNG** commit/echo/log bất kỳ giá trị secret nào (`GATEWAY_EXTENSION_INGEST_TOKEN`, `CRM_EXTENSION_INGEST_TOKEN`, JWT, key Supabase).
3. **KHÔNG** parallel hóa vòng lặp cửa sổ Payoo (`syncPayoo`) — đã từng OOM Render 512MB (commit `5153b57`). Grep `Promise.allSettled` trong thân `syncPayoo` phải = 0.
4. **KHÔNG** xóa guard `chrome.runtime?.id` trong `content-app-flag.js` (fix `a4fa3ba`).
5. **KHÔNG** đổi timeout 180s phía FE (`GatewaySyncTab.tsx`, `CardReconciliationTab.tsx`) — ngoài scope.
6. **KHÔNG** đụng flow `payment_request` / `payment_line` / backend routes.
7. Type-check FE bằng `npx tsc -b` (KHÔNG dùng `--noEmit` — Vercel chạy `tsc -b`).
8. Gate nào fail 2 lần liên tiếp → DỪNG, báo cáo output nguyên văn, không mò lần 3.

---

## Task 1 (Agent A): Extension — báo lỗi thiếu secret + timeout mPOS + bump version

**Files:**
- Modify: `crm-token-extension/background.js` (hàm `_fetchBase64Creds` ~dòng 370, hàm `runGatewaySync` ~dòng 507)
- Modify: `crm-token-extension/manifest.json` (dòng 4: version)

**Không có unit-test harness cho extension** — gate là `node --check` + grep + review diff.

- [ ] **Step 1.1: Thêm timeout 30s cho `_fetchBase64Creds`**

Thay toàn bộ hàm `_fetchBase64Creds` hiện tại (bắt đầu `async function _fetchBase64Creds(url) {`) bằng:

```js
async function _fetchBase64Creds(url, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const cookie = await _buildCookieHeader(url);
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  } finally {
    clearTimeout(timer);
  }
}
```

Lưu ý: `signal` phủ cả giai đoạn đọc body (`arrayBuffer()`), giống pattern `_fetchJsonCreds` ngay phía trên.

- [ ] **Step 1.2: Sửa `runGatewaySync` — chặn sớm khi thiếu secret + trả `ok:false` khi có nguồn lỗi**

Thay toàn bộ hàm `runGatewaySync` hiện tại bằng:

```js
async function runGatewaySync(trigger = "alarm") {
  _saveState("idle", `Đang đồng bộ mPOS/Payoo… (${trigger})`);

  // Thiếu mã bí mật → báo lỗi NGAY, không sync mù rồi hiện xanh giả
  const ingestToken = await _getGatewayIngestToken();
  if (!ingestToken) {
    const err = "Chưa cấu hình mã bí mật — mở popup tiện ích PalFish GMV Sync, dán Extension Secret rồi bấm Lưu.";
    _saveState("error", err);
    return {
      ok: false, error: err, inserted: 0,
      mposInserted: 0, payooInserted: 0, payooPulled: 0,
      mposOk: false, summary: [err], summaryStr: err,
    };
  }

  const summary = [];
  let inserted = 0;
  let payooPulled = 0;
  let payooInserted = 0;
  let mposInserted = 0;
  let mposOk = false;
  let payooOk = false;
  try {
    const payoo = await syncPayoo();
    payooOk = !!payoo.ok;
    payooPulled = payoo.pulled || 0;
    payooInserted = payoo.inserted || 0;
    inserted += payooInserted;
    summary.push(payoo.ok ? `Payoo: kéo ${payoo.pulled} GD, ghi ${payoo.inserted || 0} (${payoo.windowsScanned || 1} cửa sổ)` : `Payoo lỗi: ${payoo.error || "?"}`);
  } catch (e) {
    summary.push(`Payoo lỗi: ${e}`);
  }
  try {
    const mpos = await syncMpos();
    mposOk = mpos.length > 0 && mpos.every((r) => r.ok);
    mposInserted = mpos.reduce((sum, r) => sum + (r.inserted || 0), 0);
    inserted += mposInserted;
    const detail = mpos.map((r) => `${r.kind}${r.ok ? `✓${r.inserted || 0}` : `✗(${r.error || "?"})`}`).join(" ");
    summary.push(`mPOS: ${detail}`);
  } catch (e) {
    summary.push(`mPOS lỗi: ${e}`);
  }
  const allOk = payooOk && mposOk;
  const summaryStr = summary.join(" · ");
  _saveState(allOk ? "ok" : "error", `Đồng bộ ${new Date().toLocaleTimeString("vi-VN")} — ${summaryStr}`);
  return {
    ok: allOk,
    error: allOk ? undefined : (payooOk || mposOk ? "Một phần đồng bộ thất bại — xem chi tiết" : "Đồng bộ thất bại — xem chi tiết"),
    inserted, mposInserted, payooInserted, payooPulled, mposOk, summary, summaryStr,
  };
}
```

Thay đổi so với bản cũ (để reviewer soi nhanh):
- Check `_getGatewayIngestToken()` ngay đầu → thiếu thì `ok:false` + message hướng dẫn.
- `mposOk` chuyển từ "≥1 file ok" thành "TẤT CẢ file ok" (settlement fail cũng phải đỏ).
- Track thêm `payooOk`; `ok` tổng = `payooOk && mposOk` (trước đây hard-code `ok: true`).
- `_saveState("error", ...)` khi có lỗi để popup cũng hiện đúng trạng thái.

FE **không cần sửa**: cả `GatewaySyncTab.tsx` (dòng ~193) lẫn `CardReconciliationTab.tsx` đã đọc `resp.ok === false ? resp.error : undefined` → tự hiện đỏ.

- [ ] **Step 1.3: Bump version manifest**

`crm-token-extension/manifest.json` dòng 4: `"version": "1.2.3"` → `"version": "1.3.0"`.

- [ ] **Step 1.4: Chạy gates**

```bash
node --check crm-token-extension/background.js && echo SYNTAX_OK
# Expected: SYNTAX_OK

grep -c "AbortController" crm-token-extension/background.js
# Expected: 2 (một trong _fetchJsonCreds, một trong _fetchBase64Creds)

awk '/^async function syncPayoo/,/^}/' crm-token-extension/background.js | grep -c "allSettled"
# Expected: 0 (vòng lặp Payoo vẫn tuần tự)

grep -c "chrome.runtime?.id" crm-token-extension/content-app-flag.js
# Expected: 1 (guard còn nguyên)

grep '"version"' crm-token-extension/manifest.json
# Expected: "version": "1.3.0",
```

- [ ] **Step 1.5: Commit**

```bash
git add crm-token-extension/background.js crm-token-extension/manifest.json
git commit -m "fix(ext): bao loi ro khi thieu secret + timeout 30s tai file mPOS, bump 1.3.0"
```

---

## Task 2 (Agent B): FE — thêm bước "Dán mã bí mật" vào hướng dẫn + test

**Files:**
- Modify: `frontend/src/components/GatewaySyncTab.tsx` (mảng `ONBOARDING_STEPS` dòng 10-31, mảng `STEPS` dòng 72-78, chuỗi "5 bước" dòng ~430)
- Create: `frontend/src/components/GatewaySyncTab.test.tsx`

- [ ] **Step 2.1: Viết test FAIL trước**

Tạo `frontend/src/components/GatewaySyncTab.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import GatewaySyncTab from "./GatewaySyncTab";

describe("GatewaySyncTab — hướng dẫn cài đặt", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("danh sách bước cài đặt có bước dán mã bí mật (Extension Secret)", () => {
    render(<GatewaySyncTab />);
    // Xuất hiện ở cả hướng dẫn 5 bước trên tab lẫn onboarding modal (modal tự mở lần đầu)
    expect(screen.getAllByText(/mã bí mật/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Extension Secret/i).length).toBeGreaterThanOrEqual(1);
  });

  it("onboarding modal nói đúng số bước (6 bước, không còn 5)", () => {
    render(<GatewaySyncTab />);
    expect(screen.queryByText(/5 bước/)).toBeNull();
    expect(screen.getAllByText(/6 bước/).length).toBeGreaterThanOrEqual(1);
  });
});
```

Lưu ý cho executor: bắt chước setup của test hiện có (ví dụ `frontend/src/components/reports/BC01SalesPerformance.test.tsx`) nếu cần provider/mocks. Component này không gọi API — chỉ cần localStorage sạch để onboarding modal tự mở.

- [ ] **Step 2.2: Chạy test, xác nhận FAIL**

```bash
cd frontend && npx vitest run src/components/GatewaySyncTab.test.tsx
# Expected: FAIL (chưa có chữ "mã bí mật" trong component)
```

- [ ] **Step 2.3: Sửa `ONBOARDING_STEPS`** — chèn bước mới SAU phần tử đầu tiên ("Cài tiện ích vào trình duyệt"):

```ts
  [
    "Dán mã bí mật (Extension Secret)",
    'Bạn bấm icon tiện ích "PalFish GMV Sync" trên thanh công cụ trình duyệt, dán mã bí mật (xin từ quản trị viên qua tin nhắn riêng) vào ô Extension Secret rồi bấm "Lưu mã bí mật". Chỉ cần làm 1 lần — thiếu mã này thì giao dịch không đẩy về app được.',
  ],
```

- [ ] **Step 2.4: Sửa `STEPS`** — chèn bước mới SAU "Nạp tiện ích" (trước "Đăng nhập mPOS / Payoo"):

```ts
  ["Dán mã bí mật", 'Bấm icon tiện ích "PalFish GMV Sync" trên thanh trình duyệt → dán Extension Secret (xin từ quản trị viên) → bấm "Lưu mã bí mật".'],
```

- [ ] **Step 2.5: Sửa chuỗi đếm bước** — tìm mọi chỗ ghi "5 bước" trong file này và đổi thành "6 bước":

```bash
grep -n "5 bước" frontend/src/components/GatewaySyncTab.tsx
# 2 chỗ dự kiến: ONBOARDING_STEPS[0] desc ("hướng dẫn 5 bước trong tab này") + đoạn mở đầu modal ("Bạn làm theo 5 bước dưới đây")
```

- [ ] **Step 2.6: Chạy test PASS + type-check**

```bash
cd frontend && npx vitest run src/components/GatewaySyncTab.test.tsx
# Expected: 2 passed

cd frontend && npx tsc -b
# Expected: exit 0, không output lỗi
```

- [ ] **Step 2.7: Commit**

```bash
git add frontend/src/components/GatewaySyncTab.tsx frontend/src/components/GatewaySyncTab.test.tsx
git commit -m "feat(gateway-sync): them buoc dan ma bi mat vao huong dan cai tien ich"
```

---

## Task 3 (Agent C — chạy SAU Task 1): Script build zip + đóng gói lại

**Files:**
- Create: `scripts/build_extension_zip.py`
- Regenerate: `frontend/public/palfish-gmv-sync.zip`

- [ ] **Step 3.1: Tạo script**

Tạo `scripts/build_extension_zip.py`:

```python
"""Dong goi crm-token-extension/ -> frontend/public/palfish-gmv-sync.zip.

Chay sau MOI lan sua extension — zip nay la file ke toan tai tu app,
de lech code la lap lai su co 06/07/2026 (ke toan chay ban cu 18/6).

Usage: python scripts/build_extension_zip.py
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "crm-token-extension"
OUT = ROOT / "frontend" / "public" / "palfish-gmv-sync.zip"
FILES = ["manifest.json", "background.js", "content-app-flag.js", "popup.html", "popup.js"]


def main() -> int:
    missing = [f for f in FILES if not (SRC / f).is_file()]
    if missing:
        print(f"LOI: thieu file trong {SRC}: {missing}")
        return 1
    version = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))["version"]
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for name in FILES:
            z.write(SRC / name, name)
    print(f"OK: {OUT.relative_to(ROOT)} (extension v{version}, {len(FILES)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3.2: Chạy script**

```bash
python scripts/build_extension_zip.py
# Expected: OK: frontend\public\palfish-gmv-sync.zip (extension v1.3.0, 5 files)
```

- [ ] **Step 3.3: Verify zip khớp 100% code repo** (gate chống lệch — chính là lỗi gốc)

```bash
unzip -p frontend/public/palfish-gmv-sync.zip manifest.json | grep '"version"'
# Expected: "version": "1.3.0",

for f in manifest.json background.js content-app-flag.js popup.html popup.js; do
  unzip -p frontend/public/palfish-gmv-sync.zip "$f" | diff - "crm-token-extension/$f" > /dev/null && echo "$f OK" || echo "$f LECH";
done
# Expected: 5 dòng "... OK", KHÔNG có dòng "LECH"
```

- [ ] **Step 3.4: Commit**

```bash
git add scripts/build_extension_zip.py frontend/public/palfish-gmv-sync.zip
git commit -m "chore(ext): script dong goi zip + rebuild zip v1.3.0 (het lech code 18/6)"
```

---

## Task 4 (VIỆC TAY — Minh tự làm, KHÔNG giao subagent vì đụng secret)

- [ ] **4.1** Mở Render dashboard → service `palfish-gmv-api` (prod) → Environment. So sánh giá trị `CRM_EXTENSION_INGEST_TOKEN` và `GATEWAY_EXTENSION_INGEST_TOKEN`.
- [ ] **4.2** Lặp lại với service sandbox (`palfish-gmv-api-sandbox`).
- [ ] **4.3** Nếu 2 giá trị KHÁC nhau trên bất kỳ service nào → đặt cả 2 về CÙNG một giá trị (popup extension chỉ có 1 ô nhập, dùng chung cho cả CRM lẫn gateway). Render tự restart service khi lưu env.
- [ ] **4.4** Gửi giá trị secret cho kế toán qua **tin nhắn riêng** (không nhóm chat chung). Nếu nghi lộ sau này: đổi trên Render → nhắn mọi người dán lại.

---

## Task 5 (Orchestrator): Validation tổng + squash + push + rollout

- [ ] **Step 5.1: Chạy lại toàn bộ gates trên cây làm việc đã gộp đủ 3 task**

```bash
node --check crm-token-extension/background.js && echo SYNTAX_OK
cd frontend && npx tsc -b && npm run test
# Expected: SYNTAX_OK, tsc exit 0, toàn bộ unit test pass (kể cả GatewaySyncTab.test.tsx mới)
```

- [ ] **Step 5.2: Verify zip lần cuối** (chạy lại vòng `diff` ở Step 3.3 — 5 file OK).

- [ ] **Step 5.3: Squash 3 commit thành 1** (quy ước dự án: gom commit liên quan)

```bash
git reset --soft HEAD~3
git commit -m "fix(gateway-ext): het loi 180s + secret onboarding — rebuild zip 1.3.0, bao loi thieu secret, timeout mPOS, them buoc dan ma vao huong dan"
```

⚠️ Chỉ squash khi cả 3 commit của Task 1/2/3 nằm liền nhau trên nhánh hiện tại và CHƯA push. Nếu đã push hoặc có commit khác chen giữa → bỏ qua bước squash, giữ nguyên.

- [ ] **Step 5.4: Push + xác nhận deploy**

```bash
git push origin main
```

Vercel prod (`palfish-gmv-manager`) auto-deploy nhánh `main`. Sau khi deploy xong, mở app → tab Đồng bộ mPOS/Payoo → tải zip → `unzip -p` kiểm tra manifest trong zip tải về là `1.3.0`.

(Backend KHÔNG đổi code — không cần deploy Render trong plan này.)

- [ ] **Step 5.5: Smoke test tay trên máy Minh (bản 1.3.0)**

1. `chrome://extensions` → Remove extension cũ → Load unpacked lại từ `crm-token-extension/` (hoặc thư mục giải nén zip mới).
2. **Xóa secret trong popup** (xóa ô, bấm Lưu) → vào app bấm "Đồng bộ ngay" → **PHẢI hiện ĐỎ** "Chưa cấu hình mã bí mật…" trong vài giây (không chờ 180s, không xanh giả).
3. Dán lại secret → sync lại → xanh, có số liệu chi tiết Payoo/mPOS.
4. F5 tab app, kiểm tra hướng dẫn hiển thị 6 bước, có bước "Dán mã bí mật".

- [ ] **Step 5.6: Rollout cho kế toán** (nhắn kèm thứ tự CHÍNH XÁC — viết rõ, không rút gọn):

1. Gỡ tiện ích cũ tại `chrome://extensions` (bấm Remove).
2. Vào app → tab Đồng bộ mPOS/Payoo → bấm "Tải tiện ích (.zip)" → giải nén ra thư mục MỚI.
3. `chrome://extensions` → Load unpacked → chọn thư mục vừa giải nén. Kiểm tra version hiện **1.3.0**.
4. Bấm icon tiện ích → dán mã bí mật (Minh gửi riêng) → "Lưu mã bí mật".
5. Đăng nhập mpos.vn và portal.payoo.vn như thường ngày.
6. **F5 tab app** rồi bấm "Đồng bộ ngay". Lần đầu quét lùi tối đa 31 ngày — có thể chậm hơn các lần sau.

---

## Rủi ro còn lại (chấp nhận, ngoài scope)

- **Lần sync đầu tiên trên máy mới vẫn có thể chạm 180s** trong tình huống xấu nhất (11 cửa sổ Payoo × 15s timeout + 2 file mPOS × 30s ≈ 225s). Sau lần đầu có watermark, các lần sau chỉ 1-2 cửa sổ. Nếu thực tế kế toán vẫn vướng → mở task riêng nâng timeout FE / thêm progress streaming.
- Badge "Tiện ích đã cài & hoạt động" vẫn dựa localStorage vĩnh viễn (không chứng minh extension đang sống). Đã có guard `chrome.runtime?.id` đỡ phần lớn; heartbeat thật là việc tương lai.
- Nút "Hiện mã bí mật" trên tab cho manager — anh Minh đã quyết định CHƯA làm (06/07).
