import { useEffect, useRef } from "react";

/**
 * setInterval có gate hiển thị: tab ẩn → nuốt tick (không gọi API, đỡ egress),
 * quay lại tab → nếu có tick bị nuốt thì chạy bù đúng 1 lần ngay.
 * Dùng cho poll định kỳ (pendingQr 30s, notifications 30s).
 */
export function useVisiblePoll(
  callback: () => void,
  intervalMs: number,
  enabled = true,
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let missedWhileHidden = false;

    const id = window.setInterval(() => {
      if (document.hidden) {
        missedWhileHidden = true;
        return;
      }
      cbRef.current();
    }, intervalMs);

    function onVisibilityChange() {
      if (document.hidden || !missedWhileHidden) return;
      missedWhileHidden = false;
      cbRef.current();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
