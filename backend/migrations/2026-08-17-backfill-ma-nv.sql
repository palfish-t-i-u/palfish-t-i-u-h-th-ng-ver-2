-- Backfill nhan_su_sale.ma_nv — matched by NAME (not email)
-- BQ full_name (strip diacritics) = nhan_su_sale.crm_name
-- + 4 manual overrides confirmed by Minh
-- Run AFTER 2026-08-14-payslips-m4-rbac-audit.sql (adds ma_nv column)
-- Idempotent: overwrites existing ma_nv.
-- Source: pf-salary.payroll.C_raw_staff_info_merged, queried 2026-08-17
--
-- Unmatched (2):
--   duyen.nguyen3891@gmail.com (Nguyen Thi Kim Duyen) — not in BQ
--   hienaom2906@gmail.com (CRM: "Vu Thi Khanh Huyen" vs BQ HN0118 "Vũ Thị Khánh Hiền") — likely HN0118, CRM name typo, needs HR confirm
--
-- BQ duplicate names (first/lowest code used):
--   Nguyễn Phương Thảo: HN0042 (kept) / HN0116
--   Nguyễn Thị Lan: HN0049 (kept) / HN0144
--   Phạm Thị Linh: HN0043 (kept) / HN0145
--   Hoàng Thị Hồng Thắm: HN0044 (kept) / HN0189

UPDATE nhan_su_sale ns
SET ma_nv = m.code
FROM (VALUES
  -- Name-matched (53)
  ('dao.trang.hd@gmail.com', 'HN0001'),
  ('huongrubby2112@gmail.com', 'HN0003'),
  ('lananhlt220894@gmail.com', 'HN0004'),
  ('tathuyvanbg@gmail.com', 'HN0005'),
  ('transansan.12@gmail.com', 'HN0006'),
  ('nguyenkieutrang13011999@gmail.com', 'HN0007'),
  ('buithihongvan98txtk@gmail.com', 'HN0008'),
  ('lk.chi269@gmail.com', 'HN0009'),
  ('trangnt98.chc@gmail.com', 'HN0010'),
  ('thuynhungle10@gmail.com', 'HN0011'),
  ('lthmy188@gmail.com', 'HN0012'),
  ('thanhhothi2812@gmail.com', 'HN0013'),
  ('thaongoc31072000@gmail.com', 'HN0015'),
  ('phamthaok53yka@gmail.com', 'HN0016'),
  ('duongbui12082000@gmail.com', 'HN0017'),
  ('haotuyet1603@gmail.com', 'HN0018'),
  ('trinhvu030596@gmail.com', 'HN0019'),
  ('cuacon24@gmail.com', 'HN0020'),
  ('lethuytrang084@gmail.com', 'HN0021'),
  ('kieuthuquynh1902@gmail.com', 'HN0025'),
  ('sadynga211@gmail.com', 'HN0026'),
  ('nhungocnguyen2223@gmail.com', 'HN0027'),
  ('bwitae0408@gmail.com', 'HN0028'),
  ('dangkimthuong06052002@gmail.com', 'HN0030'),
  ('thuynp.palfish@gmail.com', 'HN0031'),
  ('hoangngan160195@gmail.com', 'HN0032'),
  ('luahong526@gmail.com', 'HN0033'),
  ('tuminho2517@gmail.com', 'HN0034'),
  ('n.thaoanh2507@gmail.com', 'HN0035'),
  ('lethithuyen010902@gmail.com', 'HN0036'),
  ('phamthuylinhqtkd@gmail.com', 'HN0038'),
  ('huongvu1227@gmail.com', 'HN0040'),
  ('hoanghongthamtrs@gmail.com', 'HN0044'),
  ('nglan0803@gmail.com', 'HN0049'),
  ('ilovehanakosomuch@gmail.com', 'HN0050'),
  ('suongmai03012000@gmail.com', 'HN0051'),
  ('ngabuipalfish@gmail.com', 'HN0110'),
  ('vthuy5495@gmail.com', 'HN0111'),
  ('camly13023771@gmail.com', 'HN0112'),
  ('hungcuongusshh@gmail.com', 'HN0114'),
  ('vuhothanhhuong96@gmail.com', 'HN0115'),
  ('haiyen.cv.1011@gmail.com', 'HN0117'),
  ('maithixuanlien@gmail.com', 'HN0119'),
  ('lanhkieu2003@gmail.com', 'HN0121'),
  ('tathuphuong3@gmail.com', 'HN0122'),
  ('trangchu98vp@gmail.com', 'HN0123'),
  ('work.nvhoang@gmail.com', 'HN0147'),
  ('huyen8107@gmail.com', 'HN0148'),
  ('ikellyu.4work@gmail.com', 'HN0150'),
  ('thihuyenc8@gmail.com', 'HN0157'),
  ('dinhngochai5901@gmail.com', 'HN0158'),
  ('tth.trinhhoa1800@gmail.com', 'HN0159'),
  ('ilovenino05052000@gmail.com', 'HN0177'),
  ('lechun041@gmail.com', 'HN0181'),
  ('thuyvtt4321@gmail.com', 'HN0182'),
  ('huonghuong31801@gmail.com', 'HN0187'),
  ('htn2199@gmail.com', 'HN0190'),
  -- Manual overrides (confirmed by Minh 17/8)
  ('anhminhcv0512@gmail.com', 'HN0087'),
  ('hieuhn.mplanner@gmail.com', 'HN0002'),
  ('thuhien250801@gmail.com', 'HN0062'),
  ('vietduc1504@gmail.com', 'HN0153')
) AS m(email, code)
WHERE LOWER(TRIM(ns.email)) = m.email;
