// @ts-nocheck — Deno runtime, không dùng Node.js TypeScript checker
/**
 * Supabase Edge Function: payos-webhook
 *
 * URL: https://<project-ref>.supabase.co/functions/v1/payos-webhook
 * Env: PAYOS_CHECKSUM_KEY (supabase secrets)
 *
 * B2 payment_lines first, then legacy don_hang fallback (M1).
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function payosValueToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  return String(value);
}

function buildPayosSignString(data: Record<string, unknown>): string {
  const keys = Object.keys(data).sort();
  return keys
    .map((k) => {
      const v = data[k];
      if (v === null || v === undefined) return `${k}=`;
      return `${k}=${payosValueToString(v)}`;
    })
    .join("&");
}

async function verifyPayosSignature(
  data: Record<string, unknown>,
  signature: string,
  checksumKey: string
): Promise<boolean> {
  try {
    const sortedStr = buildPayosSignString(data);
    const enc = new TextEncoder();
    const keyMat = await crypto.subtle.importKey(
      "raw",
      enc.encode(checksumKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
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

function isPaymentSuccess(payload: Record<string, unknown>): boolean {
  if (payload.success === false) return false;
  const code = String(payload.code ?? "00");
  return code === "00";
}

function payosOrderCodeKeys(raw: unknown): string[] {
  const cleaned = String(raw ?? "").trim();
  const keys: string[] = [];
  if (cleaned) keys.push(cleaned);
  if (/^\d+$/.test(cleaned)) keys.push(String(parseInt(cleaned, 10)));
  return [...new Set(keys)];
}

async function findPaymentLineByPayosCode(
  sb: SupabaseClient,
  orderCodeRaw: unknown
): Promise<Record<string, unknown> | null> {
  for (const key of payosOrderCodeKeys(orderCodeRaw)) {
    const res = await sb
      .from("payment_lines")
      .select("*")
      .eq("payos_order_code", key)
      .limit(1);
    if (res.error) {
      console.warn("[payos-webhook] payment_lines lookup:", res.error.message);
      return null;
    }
    if (res.data?.[0]) return res.data[0];
  }
  return null;
}

async function recomputePaymentRequest(
  sb: SupabaseClient,
  paymentRequestId: string
): Promise<void> {
  const prRes = await sb
    .from("payment_requests")
    .select("target, state")
    .eq("id", paymentRequestId)
    .limit(1)
    .single();
  if (prRes.error || !prRes.data) return;
  if (String(prRes.data.state) === "cancelled") return;

  const linesRes = await sb
    .from("payment_lines")
    .select("amount, status")
    .eq("payment_request_id", paymentRequestId);
  if (linesRes.error) return;

  const received = (linesRes.data ?? [])
    .filter((line) => String(line.status).toLowerCase() === "paid")
    .reduce((sum, line) => sum + parseAmount(line.amount), 0);
  const target = parseAmount(prRes.data.target);
  let state = "pending";
  if (received <= 0) state = "pending";
  else if (received < target) state = "short";
  else if (received === target) state = "done";
  else state = "over";

  await sb
    .from("payment_requests")
    .update({ received, state, updated_at: new Date().toISOString() })
    .eq("id", paymentRequestId);
}

async function reconcilePaymentLineWebhook(
  sb: SupabaseClient,
  webhookData: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const orderCodeRaw = webhookData.orderCode ?? webhookData.reference ?? "";
  const line = await findPaymentLineByPayosCode(sb, orderCodeRaw);
  if (!line) return null;

  if (String(line.status).toLowerCase() === "paid") {
    return { matched: true, already_paid: true, payment_line_id: line.id };
  }

  const nowIso = new Date().toISOString();
  const upd = await sb
    .from("payment_lines")
    .update({ status: "paid", paid_at: nowIso, reject_reason: null })
    .eq("id", line.id);
  if (upd.error) {
    console.error("[payos-webhook] update payment_line error:", upd.error);
    return { matched: true, error: 1, message: upd.error.message };
  }

  const prId = String(line.payment_request_id ?? "");
  if (prId) await recomputePaymentRequest(sb, prId);

  console.log(`[payos-webhook] ✓ payment_line id=${line.id} → paid (PR ${prId})`);
  return {
    matched: true,
    error: 0,
    message: "Xu ly payment_line thanh cong",
    payos_order_code: String(orderCodeRaw),
    payment_line_id: line.id,
    payment_request_id: prId,
  };
}

async function findDonHang(
  sb: SupabaseClient,
  description: string
): Promise<Record<string, unknown> | null> {
  const maDon = extractMaDon(description);
  if (maDon) {
    const byCode = await sb
      .from("don_hang")
      .select("*")
      .ilike("info_code", `%${maDon}%`)
      .neq("trang_thai", "da_huy")
      .order("created_at", { ascending: false })
      .limit(1);
    if (byCode.error) throw byCode.error;
    if (byCode.data?.[0]) return byCode.data[0];

    const byMa = await sb
      .from("don_hang")
      .select("*")
      .eq("ma_don_hang", maDon)
      .neq("trang_thai", "da_huy")
      .order("created_at", { ascending: false })
      .limit(1);
    if (byMa.error) throw byMa.error;
    if (byMa.data?.[0]) return byMa.data[0];
    return null;
  }

  const exact = await sb
    .from("don_hang")
    .select("*")
    .eq("info_code", description)
    .neq("trang_thai", "da_huy")
    .limit(1);
  if (exact.error) throw exact.error;
  return exact.data?.[0] ?? null;
}

Deno.serve(async (req: Request) => {
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
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isPaymentSuccess(payload)) {
    return new Response(
      JSON.stringify({ error: 0, message: "Ignored non-success event" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const checksumKey = Deno.env.get("PAYOS_CHECKSUM_KEY") ?? "";
  const sig = payload.signature ? String(payload.signature) : "";
  const webhookData = (payload.data ?? {}) as Record<string, unknown>;

  if (checksumKey && sig) {
    const valid = await verifyPayosSignature(webhookData, sig, checksumKey);
    if (!valid) {
      console.warn("[payos-webhook] Invalid signature — check PAYOS_CHECKSUM_KEY");
      return new Response(JSON.stringify({ error: 1, message: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // B2 — payment_lines (PR flow)
  try {
    const lineResult = await reconcilePaymentLineWebhook(sb, webhookData);
    if (lineResult) {
      return new Response(JSON.stringify(lineResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[payos-webhook] payment_lines reconcile error:", e);
  }

  // M1 legacy — don_hang + giao_dich
  const description = String(
    webhookData.description ?? webhookData.content ?? ""
  ).trim();
  const amount = parseAmount(webhookData.amount ?? webhookData.transferAmount ?? 0);
  const orderCode = String(webhookData.orderCode ?? webhookData.reference ?? "");
  const bankTxId = orderCode || `PAYOS-${description.slice(0, 20)}`;

  if (!description && !orderCode) {
    return new Response(JSON.stringify({ error: 1, message: "Thiếu orderCode / nội dung CK" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[payos-webhook] legacy description="${description}" amount=${amount} txId=${bankTxId}`);

  let don: Record<string, unknown> | null = null;
  if (description) {
    try {
      don = await findDonHang(sb, description);
    } catch (e) {
      console.error("[payos-webhook] find order error:", e);
    }
  }

  let trangThaiDoiSoat = "chua_xu_ly";
  let donHangId: string | null = null;
  let amountOk = false;

  if (don) {
    donHangId = String(don.id);
    const expected = parseAmount(don.so_tien_can_thu ?? 0);
    amountOk = amount >= expected;
    trangThaiDoiSoat = amountOk ? "khop" : "sai_tien";

    if (amountOk) {
      const upd = await sb
        .from("don_hang")
        .update({
          tien_ve: true,
          trang_thai: "da_thanh_toan",
          trang_thai_thu_tuc: "CHO_XAC_NHAN",
        })
        .eq("id", donHangId);
      if (upd.error) {
        console.error("[payos-webhook] update don_hang error:", upd.error);
      } else {
        console.log(`[payos-webhook] ✓ Updated don_hang id=${donHangId} tien_ve=true`);
      }
    }
  }

  const maDon = extractMaDon(description);
  const ins = await sb.from("giao_dich").insert({
    ma_giao_dich_bank: bankTxId,
    so_tien_nhan: amount,
    noi_dung_chuyen_khoan: description || `PayOS ${orderCode}`,
    info_code_thuc_te: maDon ? `Thanh toan ${maDon}` : description || orderCode,
    thoi_gian_giao_dich: new Date().toISOString(),
    trang_thai_doi_soat: trangThaiDoiSoat,
    don_hang_id: donHangId,
  });
  if (ins.error) {
    console.error("[payos-webhook] insert giao_dich error:", ins.error);
  }

  return new Response(
    JSON.stringify({ error: 0, message: "Xử lý thành công", matched: !!don, amountOk }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
