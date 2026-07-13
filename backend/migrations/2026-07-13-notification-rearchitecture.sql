-- Migration 2026-07-13: Notification re-architecture (T5, spec anh Hiếu 13/7)
--  Part B: Zalo payment_paid content -> mã PR · lần #k · net vào TK · lũy kế/tổng
--          (giữ bố cục cũ emoji/nhãn, chỉ đổi nội dung)
--  Part C: dingtalk_outbox +event_type 'pr_fully_paid' (đơn đủ tiền) + dedup index
-- Target: sandbox (pxgybyfiwywksesyogti) -> smoke -> PRODUCTION (jozcvbbypwvzaefteoxn)
-- Idempotent (CREATE OR REPLACE / IF NOT EXISTS). Base: 2026-07-10-zalo-payment-paid-net-amount.sql
-- Anti-pattern: function KHÔNG được raise — chạy trong trigger ghi payment_lines,
-- lỗi ở đây = chặn xác nhận tiền = chặn đối soát. Mọi field dùng COALESCE default.

CREATE OR REPLACE FUNCTION public.build_payment_paid_message(line_row payment_lines)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_customer   TEXT;
  v_child      TEXT;
  v_sale_team  TEXT;
  v_sale_name  TEXT;
  v_target     NUMERIC;
  v_net        NUMERIC;
  v_k          INT;
  v_cumulative NUMERIC;
  v_percent    INT;
  v_time_fmt   TEXT;
  v_method_label TEXT;
  v_child_seg  TEXT := '';
BEGIN
  SELECT pr.sale_email, pr.name, pr.child_name, ns.team,
         COALESCE(ns.display_name, ns.crm_name), pr.target
    INTO v_sale_email, v_customer, v_child, v_sale_team, v_sale_name, v_target
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = line_row.payment_request_id
    LIMIT 1;

  -- Net vào TK: card/installment đã kế toán xác nhận (verified_received) dùng net;
  -- còn lại (kể cả chưa xác nhận) fallback amount (gross) — khớp _line_net BE (G2).
  IF LOWER(COALESCE(line_row.method, '')) IN ('card', 'installment')
     AND line_row.verified_received IS NOT NULL THEN
    v_net := line_row.verified_received;
  ELSE
    v_net := line_row.amount;
  END IF;

  -- Lần #k: rank 1-based theo created_at trong toàn bộ payment_lines của PR
  -- (khớp idx hiển thị "Lần #k" trên FE — payment_request_routes._serialize_payment_request_list_item).
  SELECT COUNT(*) INTO v_k
    FROM public.payment_lines
   WHERE payment_request_id = line_row.payment_request_id
     AND created_at <= line_row.created_at;

  -- Lũy kế: tổng net của các lần ĐÃ TRẢ (paid) — cùng công thức _sum_paid_amount BE.
  SELECT COALESCE(SUM(
           CASE WHEN LOWER(COALESCE(method, '')) IN ('card', 'installment')
                     AND verified_received IS NOT NULL
                THEN verified_received ELSE amount END
         ), 0)
    INTO v_cumulative
    FROM public.payment_lines
   WHERE payment_request_id = line_row.payment_request_id
     AND LOWER(COALESCE(status, '')) = 'paid';

  v_percent := CASE WHEN COALESCE(v_target, 0) > 0
                     THEN ROUND(v_cumulative * 100 / v_target)
                     ELSE 0 END;

  v_time_fmt := to_char(
    COALESCE(line_row.paid_at, line_row.confirmed_at, line_row.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'HH24:MI DD/MM/YYYY'
  );

  v_method_label := CASE LOWER(COALESCE(line_row.method, ''))
    WHEN 'qr' THEN 'Chuyển khoản QR'
    WHEN 'cash' THEN 'Tiền mặt'
    WHEN 'card' THEN 'Thẻ'
    WHEN 'installment' THEN
      CASE WHEN COALESCE(NULLIF(TRIM(line_row.installment_platform), ''), '') <> ''
           THEN 'Trả góp ' || TRIM(line_row.installment_platform)
           ELSE 'Trả góp' END
    ELSE '?'
  END;

  IF v_child IS NOT NULL AND TRIM(v_child) <> '' THEN
    v_child_seg := format(' · Bé %s', TRIM(v_child));
  END IF;

  RETURN
    format(E'\U0001F4B0 ĐÃ VÀO TK · %s · Lần #%s', line_row.payment_request_id, v_k) ||
    E'\n' ||
    format(E'\U0001F538 KH %s%s · Sale %s · Team %s',
           COALESCE(NULLIF(TRIM(v_customer), ''), '?'), v_child_seg,
           COALESCE(NULLIF(TRIM(v_sale_name), ''), NULLIF(TRIM(v_sale_email), ''), '?'),
           COALESCE(NULLIF(TRIM(v_sale_team), ''), '?')) ||
    E'\n' ||
    format(E'\U0001F538 Net vào TK: %s VND · %s · %s',
           to_char(v_net, 'FM999,999,999,999'), v_method_label, COALESCE(v_time_fmt, '?')) ||
    E'\n' ||
    format(E'\U0001F538 Lũy kế: %s / %s VND (%s%%)',
           to_char(v_cumulative, 'FM999,999,999,999'), to_char(COALESCE(v_target, 0), 'FM999,999,999,999'), v_percent);
END;
$function$;

-- Part C: cho phép event_type 'pr_fully_paid' + dedup 1 dòng/PR/event
ALTER TABLE public.dingtalk_outbox DROP CONSTRAINT IF EXISTS dingtalk_outbox_event_type_check;
ALTER TABLE public.dingtalk_outbox ADD CONSTRAINT dingtalk_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'payment_paid'::text, 'course_activated'::text, 'activation_urgent_reminder'::text,
    'activation_request_created'::text, 'pr_fully_paid'::text
  ]));

-- Dedup: nếu tạo index FAIL vì có dòng trùng cũ -> dedupe (giữ dòng mới nhất) rồi chạy lại.
CREATE UNIQUE INDEX IF NOT EXISTS dingtalk_outbox_source_event_uidx
  ON public.dingtalk_outbox (source_table, source_id, event_type);
