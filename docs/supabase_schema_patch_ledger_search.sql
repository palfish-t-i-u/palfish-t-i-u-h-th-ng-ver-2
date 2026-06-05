-- Sổ doanh thu: index for search bar (uid, sdt are most commonly searched)
CREATE INDEX IF NOT EXISTS idx_sdt_uid_search
  ON so_doanh_thu (uid, sdt);

-- nhan_su_sale: index for batch team lookup and search
CREATE INDEX IF NOT EXISTS idx_nhan_su_sale_crm_name
  ON nhan_su_sale (crm_name)
  WHERE is_active = true;
