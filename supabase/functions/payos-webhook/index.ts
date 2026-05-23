/**
 * Supabase Edge Function: payos-webhook
 *
 * URL sau khi deploy:
 *   https://<project-ref>.supabase.co/functions/v1/payos-webhook
 *
 * Đây là endpoint LUÔN SỐNG (không ngủ như Render free tier).
 * Đăng ký URL này trong PayOS Dashboard → Webhook URL.
 *
 * Env vars cần set (supabase secrets):
 *   SUPABASE_URL              — tự inject bởi Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — tự inject bởi Supabase
 *   PAYOS_CHECKSUM_KEY        — key bí mật để verify signature
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAmount(value: unknown): number {
  if (typeof value === "number") return Math.floor(value);
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function extractMaDon(description: string): string | null {
  const clean = description.replace(/\u00a0/g, " ").trim();
  const match = clean.match(/(KH|DH)\s*\d+/i);
  if (match) return match[0].replace(/\s/g, "").toUpperCase();
  return null;
}

/** Verify HMAC-SHA256 signature từ PayOS */
async function verifySignature(
  data: Record<string, unknown>,
  signature: string,
  checksumKey: string
): Promise<boolean> {
  try {
    // PayOS sort keys alphabetically rồi join "key=value&..."
    const sortedStr = Object.keys(data)
      .sort()
      .map((k) => `${k}=${data[k]}`)
      .join("&");

    const enc = new TextEncoder();
    const keyMat = await crypto.subtle.importKey(
      "raw", enc.encode(checksumKey),
      { name: "HMAC", hash: "SHA-256" },
      false, ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", keyMat, enc.encode(sortedStr));
    const computed = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return computed === signature;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Health check
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, service: "payos-webhook" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 1, message: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Verify signature nếu có PAYOS_CHECKSUM_KEY
  const checksumKey = Deno.env.get("PAYOS_CHECKSUM_KEY") ?? "";
  if (checksumKey && payload.signature) {
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const valid = await verifySignature(data, String(payload.signature), checksumKey);
    if (!valid) {
      console.warn("[payos-webhook] Invalid signature");
      return new Response(JSON.stringify({ error: 1, message: "Invalid signature" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Khởi tạo Supabase client
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // Parse payload
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const description = String(data.description ?? data.content ?? "").trim();
  const amount      = parseAmount(data.amount ?? data.transferAmount ?? 0);
  const orderCode   = String(data.orderCode ?? data.reference ?? "");
  const bankTxId    = orderCode || `PAYOS-${description.slice(0, 20)}`;

  if (!description) {
    return new Response(JSON.stringify({ error: 1, message: "Thiếu nội dung chuyển khoản" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[payos-webhook] description="${description}" amount=${amount} txId=${bankTxId}`);

  // Tìm đơn hàng
  let don: Record<string, unknown> | null = null;
  try {
    const maDon = extractMaDon(description);
    const query = maDon
      ? sb.table("don_hang").select("*").ilike("info_code", `%${maDon}%`).limit(1)
      : sb.table("don_hang").select("*").eq("info_code", description).limit(1);
    const { data: rows } = await query.execute();
    don = rows?.[0] ?? null;
  } catch (e) {
    console.error("[payos-webhook] find order error:", e);
  }

  let trangThaiDoiSoat = "KHONG_TIM_THAY";
  let donHangId: string | null = null;
  let amountOk = false;

  if (don) {
    donHangId = String(don.id);
    const expected = parseAmount(don.so_tien_can_thu ?? 0);
    amountOk = amount >= expected;
    trangThaiDoiSoat = amountOk ? "DA_KHOP" : "SAI_SO_TIEN";

    if (amountOk) {
      try {
        await sb.table("don_hang").update({
          tien_ve: true,
          trang_thai: "da_thanh_toan",
          trang_thai_thu_tuc: "CHO_XAC_NHAN",
        }).eq("id", donHangId).execute();
        console.log(`[payos-webhook] ✓ Updated don_hang id=${donHangId} tien_ve=true`);
      } catch (e) {
        console.error("[payos-webhook] update don_hang error:", e);
      }
    }
  }

  // Ghi log giao_dich
  try {
    const maDon = extractMaDon(description);
    await sb.table("giao_dich").insert({
      ma_giao_dich_bank: bankTxId,
      so_tien_nhan: amount,
      noi_dung_chuyen_khoan: description,
      info_code_thuc_te: maDon ? `Thanh toan ${maDon}` : description,
      thoi_gian_giao_dich: new Date().toISOString(),
      trang_thai_doi_soat: trangThaiDoiSoat,
      don_hang_id: donHangId,
    }).execute();
  } catch (e) {
    console.error("[payos-webhook] insert giao_dich error:", e);
  }

  return new Response(
    JSON.stringify({ error: 0, message: "Xử lý thành công", matched: !!don, amountOk }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
