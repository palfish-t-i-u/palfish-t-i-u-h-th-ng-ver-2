-- PalFish GMV — schema phân quyền (v2)
-- Chạy trên Supabase SQL Editor sau supabase_schema_patch.sql

-- ---------------------------------------------------------------------------
-- Bảng nhân sự sale (sync Metabase / seed team_hierarchy.json)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nhan_su_sale (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_name        varchar NOT NULL,
  email           varchar,
  sdt             varchar,
  display_name    varchar,
  depart6_name    varchar,
  depart7_name    varchar,
  depart8_name    varchar,
  team            varchar,
  sub_team        varchar,
  role            varchar NOT NULL DEFAULT 'sale'
    CHECK (role IN ('sale', 'leader', 'manager', 'system')),
  manager_email   varchar,
  leader_email    varchar,
  is_active       boolean NOT NULL DEFAULT true,
  synced_at       timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT nhan_su_sale_crm_name_key UNIQUE (crm_name)
);

CREATE UNIQUE INDEX IF NOT EXISTS nhan_su_sale_email_key
  ON nhan_su_sale (lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS idx_nhan_su_sale_team ON nhan_su_sale (team, sub_team);
CREATE INDEX IF NOT EXISTS idx_nhan_su_sale_role ON nhan_su_sale (role);

-- ---------------------------------------------------------------------------
-- Audit log đơn hàng
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS don_hang_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  don_hang_id   uuid NOT NULL REFERENCES don_hang(id) ON DELETE CASCADE,
  actor_email   varchar NOT NULL,
  actor_role    varchar NOT NULL,
  action        varchar NOT NULL,
  field         varchar,
  old_value     jsonb,
  new_value     jsonb,
  at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_don_hang_audit_order
  ON don_hang_audit (don_hang_id, at DESC);

-- ---------------------------------------------------------------------------
-- Cột bổ sung don_hang (phân quyền theo sale CRM)
-- ---------------------------------------------------------------------------
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS sale_crm_name varchar;
CREATE INDEX IF NOT EXISTS idx_don_hang_sale_crm ON don_hang (sale_crm_name);

-- Trigger updated_at nhân sự
CREATE OR REPLACE FUNCTION set_nhan_su_sale_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nhan_su_sale_updated ON nhan_su_sale;
CREATE TRIGGER trg_nhan_su_sale_updated
  BEFORE UPDATE ON nhan_su_sale
  FOR EACH ROW EXECUTE FUNCTION set_nhan_su_sale_updated_at();
