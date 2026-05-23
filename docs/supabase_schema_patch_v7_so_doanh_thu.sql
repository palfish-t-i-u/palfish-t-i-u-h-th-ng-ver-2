-- PalFish GMV — Module 5: Sổ doanh thu + Doanh thu Sale (pivot đọc từ bảng này)
-- Chạy trên Supabase SQL Editor sau các patch v1..v6 (v5_invoice nếu có M3/M4)
-- Sau khi chạy xong: NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Sổ doanh thu — mỗi dòng = 1 khoản thu (tự động từ M3 hoặc Hiền điền tay)
-- Cột căn file HNxHCM GMV.xlsx + spec docs/MODULE_SO_DOANH_THU.md
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS so_doanh_thu (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ngày tiền về — dùng cho cột tháng pivot (Month of payment)
  ngay_tien_ve      date NOT NULL,

  bank_time         time,
  gateway           varchar,
  ten_khach         varchar,
  sdt               varchar,
  uid               varchar,
  goi_hoc           varchar,
  fixed_non_fixed   varchar,
  pay_time          timestamptz,

  so_tien_vnd       bigint NOT NULL DEFAULT 0,
  gmv_rmb           numeric(14, 2) NOT NULL DEFAULT 0,
  ty_gia_vnd_rmb    numeric(10, 2) NOT NULL DEFAULT 3700,

  payment_method    varchar,
  loai              varchar,
  loai_2            varchar,

  sale_crm_name     varchar,
  team              varchar,
  team_pivot_label  varchar,

  note              text,
  note2             text,

  loai_nhap         varchar NOT NULL DEFAULT 'tay'
    CHECK (loai_nhap IN ('tu_dong', 'tay')),

  don_hang_id       uuid REFERENCES don_hang(id) ON DELETE SET NULL,
  ma_don_hang       varchar,
  crm_order_id      varchar,

  created_by_email  varchar,
  updated_by_email  varchar,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE so_doanh_thu IS 'Module 5 — Sổ doanh thu: tự động (M3) + điền tay (Hiền/System)';
COMMENT ON COLUMN so_doanh_thu.ngay_tien_ve IS 'Ngày tiền về — pivot Doanh thu Sale group theo YYYY/M';
COMMENT ON COLUMN so_doanh_thu.loai_nhap IS 'tu_dong = push từ Module 3; tay = Thu Hiền thêm/sửa';
COMMENT ON COLUMN so_doanh_thu.team_pivot_label IS 'Tên team hiển thị pivot (vd. HN inhouse) — map từ team app';

-- M3 không tạo trùng dòng cho cùng đơn
CREATE UNIQUE INDEX IF NOT EXISTS idx_so_doanh_thu_don_tu_dong
  ON so_doanh_thu (don_hang_id)
  WHERE loai_nhap = 'tu_dong' AND don_hang_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_so_doanh_thu_ngay
  ON so_doanh_thu (ngay_tien_ve DESC);

CREATE INDEX IF NOT EXISTS idx_so_doanh_thu_sale_team
  ON so_doanh_thu (team, sale_crm_name, ngay_tien_ve);

CREATE INDEX IF NOT EXISTS idx_so_doanh_thu_loai_nhap
  ON so_doanh_thu (loai_nhap, created_at DESC);

-- ---------------------------------------------------------------------------
-- Audit — mỗi lần Hiền/System sửa dòng Sổ
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS so_doanh_thu_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  so_doanh_thu_id uuid NOT NULL REFERENCES so_doanh_thu(id) ON DELETE CASCADE,
  actor_email     varchar NOT NULL,
  actor_role      varchar NOT NULL DEFAULT 'ops',
  action          varchar NOT NULL,
  field           varchar,
  old_value       jsonb,
  new_value       jsonb,
  at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_so_doanh_thu_audit_row
  ON so_doanh_thu_audit (so_doanh_thu_id, at DESC);

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_so_doanh_thu_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_so_doanh_thu_updated ON so_doanh_thu;
CREATE TRIGGER trg_so_doanh_thu_updated
  BEFORE UPDATE ON so_doanh_thu
  FOR EACH ROW EXECUTE FUNCTION set_so_doanh_thu_updated_at();

-- ---------------------------------------------------------------------------
-- Bắt buộc sau ALTER — PostgREST reload schema
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
