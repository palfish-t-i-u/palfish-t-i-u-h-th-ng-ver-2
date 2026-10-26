# PLAN — Chuyển sync DingTalk→All File sang DWS export (gỡ quota + nhịp 3 phút)

- **Người soạn:** Claude (Opus 4.8) cho Minh
- **Ngày:** 2026-10-19
- **Mục đích:** Thay tầng đọc của sync DingTalk→All File từ range-API (ăn quota `付费API` của app GMV-Sync, đang 85% sắp vỡ trần) sang **DWS `sheet export`** (off-meter, ~2 call/workbook) — vừa gỡ nguy cơ vỡ quota, vừa cho phép **nhịp cập nhật 3 phút** như đã hứa chị Hiền.
- **Trạng thái:** PLAN — chưa code, chờ duyệt.

## Bối cảnh (đã điều tra 19/10)
- Quota `付费API` org Palfish VN = **5000/tháng**, đang **4269/5000 (85%)**, ~11 ngày còn lại → có thể vỡ trước cuối tháng → sync dừng → All File chị Hiền đứng.
- Breakdown (开发者平台→资源管理): 5000 **chỉ đếm app tự-dựng** (GMV-Sync + CS-Notif); "con voi" = `获取单元格区域` (đọc vùng ô) **3934 call** = chunk đọc 200 dòng của sync.
- **DWS `sheet export`** (async, qua `mcp-gw.dingtalk.com`, AppKey built-in của DWS) = **2 call DingTalk/workbook** (submit + 1 query; tải xlsx từ Alibaba OSS không tính), **KHÔNG nằm trong counter 5000**.
- Parity đã verify 19/10 (0 call DingTalk, so xlsx DWS vs All File qua Google SA): DWS **phủ 100% UID**, tiền khớp tuyệt đối. Chi tiết: memory `project_dingtalk-source-sheets-to-allfile`.

## Scope (đã rà ECS)
- Range-read CHỈ ở 2 file: `palfish-internal-notes/gmv-scripts/sync_vn_to_allfile.py` + `sync_tail.py` (ECS `/root/etl/`). `hcm_revenue_load.py` = 0 range → KHÔNG đụng.
- DWS đã cài sẵn ECS `/root/.local/bin/dws` (56MB, từ CS collector 15/10). Có profile Palfish VN nhưng là **Quỳnh** (`ding17aafd...:2357163223401712717337`) — chưa chắc có quyền xem sheet; **cần login Minh**.

## Thiết kế chốt
1. **Chỉ swap tầng ĐỌC.** Tầng GHI (Google Sheets, transform cột, tab `SM Hanoi`/`HCM REV`, mọi logic write_tab/ensure_rows) **giữ nguyên** → rủi ro tối thiểu, downstream (build_gmv_intermediate, palfish_finance_ledger) không đổi.
2. **Nguồn mới = xlsx từ DWS.** `dws sheet export --node <NODE> --profile <MINH_VN> --output tmp.xlsx` → parse bằng **openpyxl NORMAL mode** (read_only mis-parse file DingTalk). Node: HN `ZQYprEoWonqAGbpKuQr137oN81waOeDk` (tab `INCOME`, 37 cột), HCM `nYMoO1rWxaj5Gb0kc901roDRV47Z3je9` (tab `REVENUE`, 16 cột).
3. **Date đơn giản hơn.** xlsx cho `datetime` thật → format `yyyy/m/d` + `h:mm`; **BỎ** `ser_to_ymd`/floor serial → hết luôn bug off-by-one ngày (đơn giản hơn bản cũ).
4. **Gộp full+tail → 1 sync full.** DWS full chỉ 2 call/workbook nên chạy dày thoải mái → **bỏ `sync_tail.py`** khỏi luồng (giữ file làm fallback). Không còn khối "đơn hôm nay" phức tạp.
5. **Nhịp = GIỮ NHƯ HIỆN TẠI (user chốt 19/10):** khung tối VN **21:00 → 22:30**, đúng 5 mốc `21:00 / 21:45 / 22:00 / 22:15 / 22:30`. KHÔNG `*/3`, KHÔNG chạy ban ngày. (Mỗi lần = full DWS sync, ~4 call off-meter + tải OSS ~3.7MB — rẻ.) Lưu ý: chị Hiền vẫn thấy ~15 phút/lần (không phải 3 phút như tin 25/9) — nhịp này là lựa chọn của user.
6. **Fallback.** Env `SYNC_BACKEND=dws|range` (default dws); giữ nhánh range-API 1 tuần để lùi nhanh.

## Milestones

### M1 — Auth DWS Minh trên ECS
- G1-T1: Minh login Palfish VN trên ECS: `DWS_DISABLE_KEYCHAIN=1 /root/.local/bin/dws auth login --device` → quét QR → profile `ding17aafd5110fb2ba50e3c3ed4dba589cc:235717171365-1572920914`. (Minh làm; Claude tạo link device-flow như khi onboard CS.)
- G1-T2: Verify quyền đọc sheet: `dws sheet +list-sheets --node ZQYprEoWonqAGbpKuQr137oN81waOeDk --profile ding17aafd5110fb2ba50e3c3ed4dba589cc:235717171365-1572920914` → phải ra tab `INCOME`.
- G1-T3: Test `dws sheet export` HN + HCM trên ECS, đo thời gian (laptop: HN 20s, HCM 11s), xác nhận xlsx tải về đủ.

### M2 — Viết tầng đọc DWS (`sync_vn_to_allfile.py`)
- G2-T1: Hàm `export_workbook(node, profile)` → subprocess gọi `dws sheet export ... --output <tmp>.xlsx`, parse JSON stdout lấy `success`, retry 3 lần nếu lỗi/timeout.
- G2-T2: Hàm `read_via_dws(xlsx_path, tabname, ncols)` → openpyxl NORMAL mode, `iter_rows(min_row=2, max_col=ncols, values_only=True)`, lọc dòng non-empty, trả `[(rownum, [cells…])]` khớp output `read_full` (line 61).
- G2-T3: Date/giờ: `datetime`→`yyyy/m/d`, `h:mm`; bỏ `ser_to_ymd`/`frac_to_hhmm` cho cột serial; số nguyên tiền giữ nguyên.
- G2-T4: Trong `run()` (line 159): thay `sid_of`+`read_full` (line 161-163) bằng `export_workbook` + `read_via_dws`; header lấy từ row1 xlsx thay vì gọi API.
- G2-T5: Giữ `run()` transform (`start_col`/`ncols_out`: HN 2/35, HCM 0/16 — line 178-179) + `write_tab`/`ensure_rows` **y nguyên**.

### M3 — Gộp full/tail + flag fallback
- G3-T1: Env `SYNC_BACKEND` (dws|range, default dws); nhánh range = code cũ, giữ 1 tuần.
- G3-T2: 1 lần chạy = export HN + export HCM → ghi 2 tab `SM Hanoi`/`HCM REV` (như `full` hiện tại). Bỏ `sync_tail.py` khỏi cron (file ở lại làm fallback).
- G3-T3: Dọn token range-API (`dingtalk_app.txt`) khỏi đường DWS (chỉ nhánh range dùng).

### M4 — Parity gate + deploy ECS
- G4-T1: Dry-run ECS: chạy sync DWS (DRY, không ghi) → so số dòng + vài UID với bản range (đã khớp 100% trên laptop 19/10).
- G4-T2: Minh scp `sync_vn_to_allfile.py` (bản DWS) lên `/root/etl/` (classifier chặn Claude scp prod → Minh chạy, Claude đưa lệnh).
- G4-T3: Đổi crontab (ECS = CST = VN+1): GIỮ đúng 5 mốc hiện tại nhưng trỏ hết vào sync DWS hợp nhất → `0 22` + `45 22` + `0,15,30 23 /root/etl/sync_only_dws.sh` (= VN 21:00/21:45/22:00/22:15/22:30); BỎ `sync_tail` khỏi cron; giữ `*/2 build_only`.
- G4-T4: Verify tối đầu: All File cập nhật mỗi ~3 phút; counter GMV-Sync `付费API` **KHÔNG tăng**; nhắn chị Hiền xác nhận.

### M5 — Theo dõi & dọn
- G5-T1: Heartbeat `raw.etl_heartbeat('allfile_sync', now())` mỗi lần chạy → view `gmv_freshness` + alert nếu >10 phút chết (bắt token DWS hết hạn).
- G5-T2: Sau 1 tuần ổn: bỏ flag `range`, retire `sync_tail.py`.
- G5-T3: Cập nhật `gmv-scripts/ecs/README_DEPLOY.md` + memory note.

## Rủi ro & giảm thiểu
- **Token DWS Minh hết hạn ~30 ngày** → sync chết. Giảm: heartbeat + alert (G5-T1); re-auth = gửi link device-flow Minh bấm (không cần vào ECS), như CS collector.
- **Minh phải có quyền xem 2 sheet** (có — chủ sở hữu). Profile Quỳnh sẵn trên ECS KHÔNG chắc đủ quyền → dùng Minh.
- **Export async chậm/timeout** (HN ~20s): 20s < 3 phút nên OK; thêm retry 3 lần; nếu 1 workbook fail thì giữ bản ghi cũ (không xoá tab).
- **clientId DWS trên ECS = `dingmbw5n9ktkkbbjv3g`** (khác GMV-Sync `dingxeggoejgq4fci1nm`) → off-meter; bằng chứng breakdown chỉ có GMV-Sync+CS-Notif. Verify lại sau tối đầu (G4-T4).
- **openpyxl NORMAL mode** bắt buộc (read_only mis-parse DingTalk xlsx → ncols=1).

## Ước lượng (phút thật code, chưa tính chờ Minh QR / chờ tối verify)
- M1 ~30′ (phụ thuộc Minh quét QR) · M2 ~2h · M3 ~1h · M4 ~1h + 1 tối theo dõi · M5 ~30′ + 1 tuần quan sát.
- ~1 ngày công code + 1 tối verify.

## Runbook deploy (Minh chạy — Claude bị classifier chặn ghi prod + auth)
> Code đã xong + verify laptop 19/10: `sync_vn_to_allfile.py` có `SYNC_BACKEND=dws` (default), dry-run DWS đọc HN 17.326 / HCM 995 dòng, date/giờ đúng.

**B1 — Login DWS Minh (Palfish VN) trên ECS** (device-flow; authorize ĐÚNG tài khoản Minh trong org Palfish Vietnam):
```bash
ssh -i "C:\Users\Anh Minh\Downloads\ecs.pem" root@47.237.174.122
DWS_DISABLE_KEYCHAIN=1 /root/.local/bin/dws auth login --device   # mo link, quet/authorize Minh@Palfish VN
/root/.local/bin/dws profile list | grep -A2 Palfish            # LAY dung profile string "corpId:userId" cua Minh
```

**B2 — Test đọc sheet trên ECS** (thay <MINH_PROFILE> = profile string lấy ở B1):
```bash
/root/.local/bin/dws sheet +list-sheets --node ZQYprEoWonqAGbpKuQr137oN81waOeDk --profile <MINH_PROFILE>   # phai ra tab INCOME
```

**B3 — Đẩy code + wrapper** (scp từ laptop):
```bash
scp -i "C:\Users\Anh Minh\Downloads\ecs.pem" "D:\File làm việc\automation\palfish-internal-notes\gmv-scripts\sync_vn_to_allfile.py" root@47.237.174.122:/root/etl/
```
Tạo `/root/etl/sync_only_dws.sh` (chmod +x), thay `<MINH_PROFILE>`:
```bash
#!/bin/bash
cd /root/etl
export SYNC_BACKEND=dws DWS_BIN=/root/.local/bin/dws DWS_DISABLE_KEYCHAIN=1
export DWS_PROFILE=<MINH_PROFILE>
export GS_SA=/root/etl/gsheet_sa.json
mkdir -p logs
./venv/bin/python sync_vn_to_allfile.py live >> logs/sync_dws_$(date +%F).log 2>&1
```

**B4 — Chạy tay verify** (so với bản range + All File):
```bash
/root/etl/sync_only_dws.sh ; tail -n 30 /root/etl/logs/sync_dws_$(date +%F).log
```

**B5 — Đổi cron** (giữ 5 mốc VN 21:00/21:45/22:00/22:15/22:30, bỏ sync_tail):
```bash
( crontab -l | grep -vE 'sync_only|sync_tail' ; \
  echo '0 22 * * * /root/etl/sync_only_dws.sh' ; \
  echo '45 22 * * * /root/etl/sync_only_dws.sh' ; \
  echo '0,15,30 23 * * * /root/etl/sync_only_dws.sh' ) | crontab -
crontab -l
```

**B6 — Tối đầu theo dõi:** All File cập nhật 5 mốc; vào 开发者平台→资源管理 xem counter `付费API` GMV-Sync **không tăng** (chỉ `获取单元格区域` cũ đứng yên).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
