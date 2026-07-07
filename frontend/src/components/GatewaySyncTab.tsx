import { useEffect, useState } from "react";
import { Icons } from "./payment-request/Icons";
import { formatPaymentDateFull } from "./payment-request/paymentRequestUtils";
import { EXT_VERSION_KEY, LAST_SYNC_AT, getExtVersion, isExtInstalled, setExtInstalled } from "./card-recon/mockGatewayTxns";
import Modal from "./ui/Modal";
import "../styles/prototype-payments.css";

const FIRST_SEEN_STORAGE_KEY = "gw_ext_first_seen";

const ONBOARDING_STEPS: [string, string][] = [
  [
    "Cài tiện ích vào trình duyệt",
    "Bạn tải file .zip ở dưới, giải nén, rồi nạp vào Chrome theo hướng dẫn 6 bước trong tab này.",
  ],
  [
    "Dán mã bí mật (Extension Secret)",
    'Bạn bấm icon tiện ích "PalFish GMV Sync" trên thanh công cụ trình duyệt, dán mã bí mật (xin từ quản trị viên qua tin nhắn riêng) vào ô Extension Secret rồi bấm "Lưu mã bí mật". Chỉ cần làm 1 lần — thiếu mã này thì giao dịch không đẩy về app được.',
  ],
  [
    "Đăng nhập mPOS",
    "Bạn mở mpos.vn và đăng nhập như thường ngày. Tiện ích tự nhận phiên đăng nhập của bạn để kéo giao dịch — không cần dán lại mật khẩu.",
  ],
  [
    "Đăng nhập Payoo",
    "Bạn mở portal.payoo.vn và đăng nhập. Tương tự mPOS, tiện ích dùng phiên đăng nhập có sẵn.",
  ],
  [
    'Bấm "Đồng bộ ngay"',
    "Sau khi đã đăng nhập cả 2 cổng, bạn quay lại tab này và bấm Đồng bộ ngay. Tiện ích sẽ kéo giao dịch về app trong vài giây.",
  ],
  [
    "Đồng bộ định kỳ",
    "Tiện ích tự đồng bộ lại mỗi 6 tiếng khi trình duyệt đang mở. Bạn không cần làm gì thêm — chỉ giữ trình duyệt mở.",
  ],
];

function RefreshIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <polyline points="21 3 21 8 16 8" />
    </svg>
  );
}

const LAST_SYNC_STORAGE_KEY = "gw_last_sync_result_v2";

type StoredSyncResult = {
  totalInserted: number | null;
  mposInserted: number | null;
  payooInserted: number | null;
  detail: string | null;
  error: string | null;
  at: string;
};

function loadStoredSyncResult(): StoredSyncResult | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.at !== "string") return null;
    return {
      totalInserted: typeof parsed.totalInserted === "number" ? parsed.totalInserted : null,
      mposInserted: typeof parsed.mposInserted === "number" ? parsed.mposInserted : null,
      payooInserted: typeof parsed.payooInserted === "number" ? parsed.payooInserted : null,
      detail: typeof parsed.detail === "string" ? parsed.detail : null,
      error: typeof parsed.error === "string" ? parsed.error : null,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

const STEPS: [string, string][] = [
  ["Tải tiện ích", 'Bấm "Tải tiện ích" ở trên, rồi giải nén file .zip ra một thư mục.'],
  ["Mở trang tiện ích Chrome", "Gõ chrome://extensions vào thanh địa chỉ → Enter."],
  ["Bật chế độ nhà phát triển", 'Bật công tắc "Developer mode" (góc trên bên phải).'],
  ["Nạp tiện ích", 'Bấm "Load unpacked" → chọn đúng thư mục vừa giải nén.'],
  ["Dán mã bí mật", 'Bấm icon tiện ích "PalFish GMV Sync" trên thanh trình duyệt → dán Extension Secret (xin từ quản trị viên) → bấm "Lưu mã bí mật".'],
  ["Đăng nhập mPOS / Payoo", "Mở mpos.vn và portal.payoo.vn, đăng nhập như thường ngày. Tiện ích tự kéo dữ liệu giao dịch về app."],
];

export default function GatewaySyncTab() {
  const initialStored = loadStoredSyncResult();
  const [installed, setInstalled] = useState(isExtInstalled());
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(
    initialStored ? formatPaymentDateFull(initialStored.at) : LAST_SYNC_AT,
  );
  const [synced, setSynced] = useState<number | null>(initialStored?.totalInserted ?? null);
  const [syncDetail, setSyncDetail] = useState<string | null>(initialStored?.detail ?? null);
  const [syncError, setSyncError] = useState<string | null>(initialStored?.error ?? null);
  const [storedInserted, setStoredInserted] = useState<StoredSyncResult | null>(initialStored);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string | null>(getExtVersion());
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(FIRST_SEEN_STORAGE_KEY) !== "1") {
        setShowOnboarding(true);
      }
    } catch {
      /* localStorage disabled — skip onboarding */
    }
  }, []);

  // Version mới nhất do scripts/build_extension_zip.py sinh cùng lúc với zip — cùng deploy nên không lệch
  useEffect(() => {
    let cancelled = false;
    fetch("/ext-version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.version === "string") setLatestVersion(data.version);
      })
      .catch(() => {
        /* thiếu file / offline — im lặng, không cảnh báo sai */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeOnboarding = () => {
    try {
      localStorage.setItem(FIRST_SEEN_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowOnboarding(false);
  };
  const openOnboarding = () => setShowOnboarding(true);

  useEffect(() => {
    const refresh = () => {
      setInstalled(isExtInstalled());
      setInstalledVersion(getExtVersion());
    };
    const reloadStored = () => {
      const next = loadStoredSyncResult();
      setStoredInserted(next);
      if (next) {
        setSynced(next.totalInserted);
        setSyncDetail(next.detail);
        setSyncError(next.error);
        setLastSync(formatPaymentDateFull(next.at));
      }
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("storage", reloadStored);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("storage", reloadStored);
    };
  }, []);

  const toggleInstalled = () => {
    const v = !installed;
    setExtInstalled(v);
    setInstalled(v);
  };

  const handleSync = () => {
    if (syncing || !installed) return;
    setSyncing(true);
    setSynced(null);
    setSyncDetail(null);
    setSyncError(null);

    let done = false;
    const finish = (
      inserted: number | null,
      detail: string | null,
      split: { mpos: number; payoo: number } | null,
      errMsg?: string,
    ) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onResult);
      setSyncing(false);
      const nowIso = new Date().toISOString();
      setLastSync(formatPaymentDateFull(nowIso));
      setSynced(inserted);
      setSyncDetail(detail);
      setSyncError(errMsg || null);
      if (errMsg) console.warn("[gateway-sync] ", errMsg);
      const entry: StoredSyncResult = {
        totalInserted: inserted,
        mposInserted: split?.mpos ?? null,
        payooInserted: split?.payoo ?? null,
        detail,
        error: errMsg || null,
        at: nowIso,
      };
      try {
        localStorage.setItem(LAST_SYNC_STORAGE_KEY, JSON.stringify(entry));
      } catch {
        /* localStorage full / disabled */
      }
      setStoredInserted(entry);
    };

    const onResult = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const data = ev.data;
      if (!data || data.type !== "gateway-sync-now-result") return;
      const resp = data.resp || {};
      // Extension 1.3.1+ gửi kèm version tại thời điểm sync — chính xác hơn cờ localStorage
      if (typeof resp.extVersion === "string") {
        setInstalledVersion(resp.extVersion);
        try {
          localStorage.setItem(EXT_VERSION_KEY, resp.extVersion);
        } catch {
          /* ignore */
        }
      }
      const inserted = typeof resp.inserted === "number" ? resp.inserted : null;
      const detail = typeof resp.summaryStr === "string" ? resp.summaryStr : null;
      const mposInserted = typeof resp.mposInserted === "number" ? resp.mposInserted : null;
      const payooInserted = typeof resp.payooInserted === "number" ? resp.payooInserted : null;
      const split = mposInserted != null && payooInserted != null
        ? { mpos: mposInserted, payoo: payooInserted }
        : null;
      finish(inserted, detail, split, resp.ok === false ? resp.error : undefined);
    };

    window.addEventListener("message", onResult);
    window.postMessage({ type: "gateway-sync-now" }, "*");

    // Timeout 180s — crawl backwards có thể kéo nhiều cửa sổ
    window.setTimeout(
      () => finish(null, null, null, "Hết thời gian — extension không phản hồi (180s)"),
      180000,
    );
  };

  return (
    <div className="gmv-prototype">
      <div className="page">
        {/* Page header: description + channel badges */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 720, lineHeight: 1.55 }}>
            Cài <strong style={{ color: "var(--text-2)" }}>1 lần</strong> tiện ích trình duyệt để app tự kéo giao dịch{" "}
            <strong style={{ color: "var(--text-2)" }}>mPOS</strong> & <strong style={{ color: "var(--text-2)" }}>Payoo</strong>{" "}
            về. Tiện ích dùng phiên đăng nhập sẵn của bạn — không cần nhập lại mật khẩu, không lưu mật khẩu ở đâu.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingTop: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>Kênh đang đồng bộ:</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: "var(--primary-bg)", color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icons.Bank size={11} aria-hidden="true" /> mPOS
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: "var(--success-bg)", color: "var(--success-text)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icons.Wallet size={11} aria-hidden="true" /> Payoo
              </span>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={openOnboarding}
              style={{ whiteSpace: "nowrap" }}
            >
              <Icons.AlertCircle size={13} /> Xem lại hướng dẫn
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--primary-bg)", color: "var(--primary)" }}>
              <Icons.Bank size={16} />
            </div>
            <div className="kpi-label">Giao dịch mPOS mới</div>
            <div className="kpi-value">
              {storedInserted?.mposInserted != null ? storedInserted.mposInserted : <span aria-label="Chưa có dữ liệu">—</span>}
            </div>
            <div className="kpi-sub">
              {storedInserted?.mposInserted != null
                ? `${storedInserted.mposInserted === 0 ? "Không có GD mới — " : ""}đồng bộ lúc ${formatPaymentDateFull(storedInserted.at)}`
                : "Chưa đồng bộ lần nào"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--success-bg)", color: "var(--success-text)" }}>
              <Icons.Wallet size={16} />
            </div>
            <div className="kpi-label">Giao dịch Payoo mới</div>
            <div className="kpi-value">
              {storedInserted?.payooInserted != null ? storedInserted.payooInserted : <span aria-label="Chưa có dữ liệu">—</span>}
            </div>
            <div className="kpi-sub">
              {storedInserted?.payooInserted != null
                ? `${storedInserted.payooInserted === 0 ? "Không có GD mới — " : ""}đồng bộ lúc ${formatPaymentDateFull(storedInserted.at)}`
                : "Chưa đồng bộ lần nào"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--warning-bg)", color: "var(--warning-text)" }}>
              <Icons.Clock size={16} />
            </div>
            <div className="kpi-label">Đồng bộ gần nhất</div>
            <div className="kpi-value" style={{ fontSize: 13 }}>{lastSync}</div>
            <div className="kpi-sub">Cập nhật tự động khi mở trình duyệt</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: installed ? "var(--success-bg)" : "var(--danger-bg)", color: installed ? "var(--success-text)" : "var(--danger-text)" }}>
              {installed ? <Icons.CheckCircle size={16} /> : <Icons.AlertCircle size={16} />}
            </div>
            <div className="kpi-label">Trạng thái tiện ích</div>
            <div className="kpi-value" style={{ fontSize: 13 }}>{installed ? "Đã cài" : "Chưa cài"}</div>
            <div className="kpi-sub">{installed ? "đang chạy nền" : "cần cài để đồng bộ"}</div>
          </div>
        </div>

        {/* Trạng thái + đồng bộ */}
        <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span
              className={`badge ${installed ? "is-done" : "is-over"}`}
              style={{ fontSize: 12.5 }}
            >
              <span className="dot" />
              {installed ? "Tiện ích đã cài & hoạt động" : "Chưa cài tiện ích"}
            </span>
            {installed && (
              <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                Đồng bộ gần nhất: <strong>{lastSync}</strong>
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              {installed ? (
                <button type="button" className="btn btn-outline btn-sm" onClick={handleSync} disabled={syncing}>
                  <RefreshIcon /> {syncing ? "Đang đồng bộ…" : "Đồng bộ ngay"}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>Làm theo hướng dẫn bên dưới để cài</span>
              )}
            </div>
          </div>
          {installed && latestVersion && (
            installedVersion !== latestVersion ? (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12.5,
                  color: "var(--warning-text)",
                  background: "var(--warning-bg)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  lineHeight: 1.6,
                }}
              >
                <Icons.AlertCircle size={14} /> <strong>Cần cập nhật tiện ích!</strong>{" "}
                Phiên bản trên máy bạn: <strong>{installedVersion ?? "không rõ"}</strong> · Phiên bản mới nhất:{" "}
                <strong>{latestVersion}</strong>
                <div style={{ marginTop: 4, fontSize: 11.5, opacity: 0.9 }}>
                  Cách cập nhật: tải zip mới ở dưới → giải nén ĐÈ vào đúng thư mục tiện ích cũ → mở chrome://extensions
                  → bấm nút Làm mới (⟳) trên thẻ PalFish GMV Sync → tải lại trang này (F5). Mã bí mật đã lưu sẽ giữ
                  nguyên.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-3)" }}>
                Phiên bản tiện ích: {installedVersion} — mới nhất
              </div>
            )
          )}
          {(synced != null || syncDetail || syncError) && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12.5,
                color: syncError ? "var(--danger-text, #b91c1c)" : "var(--success-text)",
                background: syncError ? "var(--danger-bg, #fee2e2)" : "var(--success-bg)",
                borderRadius: 8,
                padding: "8px 12px",
                lineHeight: 1.55,
              }}
            >
              {syncError ? (
                <>
                  <Icons.AlertCircle size={14} /> Đồng bộ lỗi: {syncError}
                </>
              ) : (
                <>
                  <Icons.CheckCircle size={14} /> Đã đồng bộ — ghi {synced ?? 0} giao dịch mới vào hệ thống.
                </>
              )}
              {syncDetail && (
                <div style={{ marginTop: 4, fontSize: 11.5, opacity: 0.85, fontFamily: "ui-monospace, monospace" }}>
                  Chi tiết: {syncDetail}
                </div>
              )}
              {!syncError && synced === 0 && (
                <div style={{ marginTop: 4, fontSize: 11.5, opacity: 0.85 }}>
                  Nếu mPOS/Payoo có giao dịch nhưng đây hiển thị 0: kiểm tra đã đăng nhập đúng tài khoản chưa, hoặc mở
                  Service Worker của tiện ích (chrome://extensions) xem log.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tải + hướng dẫn cài */}
        <div className="panel" style={{ padding: 16 }}>
          <div className="panel-head" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h4>Cài tiện ích đồng bộ</h4>
            <a
              className="btn btn-primary btn-sm"
              href="/palfish-gmv-sync.zip"
              download="palfish-gmv-sync.zip"
            >
              <Icons.Download size={14} /> Tải tiện ích (.zip)
            </a>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 12 }}>
            Chrome chỉ cho cài kiểu "Load unpacked" (giải nén rồi nạp thư mục) — đây là cách an toàn cho công cụ nội bộ.
          </div>

          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {STEPS.map(([title, desc], i) => (
              <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "var(--primary-bg, var(--surface-3))",
                    color: "var(--primary, var(--text-2))",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 1 }}>
                    {desc.split(/(chrome:\/\/extensions|Developer mode|Load unpacked)/g).map((part, idx) =>
                      ["chrome://extensions", "Developer mode", "Load unpacked"].includes(part) ? (
                        <code
                          key={idx}
                          style={{
                            background: "var(--surface-3)",
                            borderRadius: 4,
                            padding: "0 4px",
                            fontSize: 12,
                            color: "var(--text)",
                          }}
                        >
                          {part}
                        </code>
                      ) : (
                        <span key={idx}>{part}</span>
                      ),
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--text-3)" }}>
            Cài rồi mà chưa thấy dữ liệu? Mở mPOS/Payoo đăng nhập lại rồi bấm "Đồng bộ ngay". Tiện ích tự chạy lại định kỳ
            khi trình duyệt mở.
          </div>
        </div>

        {/* Demo: giả lập trạng thái cài (gỡ khi nối tiện ích thật) */}
        <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icons.AlertCircle size={13} />
          <span>Bản xem thử — chưa nối tiện ích thật.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={toggleInstalled}>
            {installed ? "Giả lập: GỠ tiện ích" : "Giả lập: ĐÃ cài tiện ích"}
          </button>
        </div>
      </div>

      <Modal open={showOnboarding} onClose={closeOnboarding} title="Hướng dẫn dùng tiện ích đồng bộ" wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 13.5, lineHeight: 1.55 }}>
          <p style={{ color: "var(--text-2)" }}>
            Chào bạn — đây là hướng dẫn lần đầu để dùng tiện ích đồng bộ giao dịch{" "}
            <strong style={{ color: "var(--text)" }}>mPOS</strong> &{" "}
            <strong style={{ color: "var(--text)" }}>Payoo</strong> về app. Bạn làm theo 6 bước dưới đây.
          </p>

          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {ONBOARDING_STEPS.map(([title, desc], i) => (
              <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--primary-bg, var(--surface-3))",
                    color: "var(--primary, var(--text-2))",
                    fontSize: 13,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{title}</div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{desc}</div>
                </div>
              </li>
            ))}
          </ol>

          <div
            style={{
              marginTop: 4,
              padding: "10px 12px",
              background: "var(--warning-bg)",
              borderRadius: 8,
              fontSize: 12.5,
              color: "var(--warning-text)",
              lineHeight: 1.55,
            }}
          >
            <strong>Lưu ý:</strong> Tiện ích chỉ đọc giao dịch — không thực hiện thanh toán, không sửa dữ liệu trên cổng mPOS hay Payoo.
            Mật khẩu của bạn không được lưu hay gửi đi đâu cả.
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={closeOnboarding}>
              Tôi đã hiểu
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
