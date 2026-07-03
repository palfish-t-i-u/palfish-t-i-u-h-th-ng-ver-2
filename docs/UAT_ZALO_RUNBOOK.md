# UAT Zalo Notifications IH2/Offline — Runbook (Phương án C)

**Ngày:** 03/07/2026
**Người thực thi:** anh Hiếu (Zalo OA admin) + Claude Code
**Thời lượng dự kiến:** ~15 phút (worst case ~30 phút nếu Zalo API image reject payload → cần fix)
**Rủi ro:** prod IH2 báo tiền tạm đứng ~15 phút giữa Bước 2 → Bước 5. Tin queue lại trong `zalo_outbox` prod, sẽ nhả sau khi hoàn tất Bước 5.

---

## Bối cảnh
Sandbox + prod dùng chung 1 Zalo OA (Palfish Vietnam). Zalo chỉ chấp nhận 1 `refresh_token` hoạt động — mint token mới cho sandbox sẽ đá prod ra. Vì vậy phải:
1. Mint chìa mới cho sandbox → paste sandbox DB
2. Chạy UAT full 4 case (worker thật gửi Zalo thật)
3. Mint chìa MỚI cho prod → paste prod DB
4. Xoá chìa sandbox (tránh xung đột tương lai)

## Đã prep sẵn
- [x] Script UAT extended: `scripts/uat_staging_zalo.py` (4 case A/B/C/D + `[TEST UAT]` prefix, embed worker → chỉ cần 1 terminal)
- [x] Test bill URL (public, sandbox storage):
      `https://pxgybyfiwywksesyogti.supabase.co/storage/v1/object/public/bills/payment-lines/fed212a9-29c8-4ad7-8cd3-f5bf2c019aa9/bill-20260701113059902087.jpg`
- [x] Sandbox creds trong `backend/.env.sandbox` (đã test JWT vẫn valid)
- [x] Group ID target: `df7d5a31765c9f02c64d` (IH2 & OFF - Báo tiền, đã map trong `zalo_team_groups.Inhouse 2`)
- [x] Migration A + C1 đã apply trên sandbox DB

## Cần chuẩn bị trước khi bắt đầu
- [ ] Anh Hiếu đã login `https://oa.zalo.me/` bằng tài khoản admin **Palfish Vietnam**
- [ ] Terminal 1 mở sẵn tại `E:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2`
- [ ] Đã `pip install supabase python-dotenv httpx` trong venv
- [ ] Mở nhóm Zalo `IH2 & OFF - Báo tiền` sẵn để verify bằng mắt

---

## BƯỚC 1 — Mint chìa sandbox mới (~5 phút)

### 1.1 Vào OA portal
- Truy cập https://developers.zalo.me/tools/explorer/access-token
- Chọn OA `Palfish Vietnam` (OA ID `953422767266282024`, App ID `83298551201629166`)
- Click **Get access token** → Zalo redirect login → chấp nhận scope `send_message` + `upload_file`
- Redirect trả về URL có `?code=abcdef...`. Copy giá trị `code`.

### 1.2 Đổi code lấy access_token + refresh_token
Terminal 1:
```bash
cd backend
python -c "
import httpx
code = 'PASTE_CODE_HERE'
r = httpx.post(
    'https://oauth.zaloapp.com/v4/oa/access_token',
    data={'code': code, 'app_id': '83298551201629166', 'grant_type': 'authorization_code'},
    headers={'secret_key': '2hnL4S8YX4fNJgjOsy38'},
    timeout=15,
)
print(r.json())
"
```

Output kỳ vọng:
```json
{"access_token": "eE...", "refresh_token": "B7...", "expires_in": "90000"}
```

**Ghi lại 2 giá trị này** (dùng cho Bước 2). Chú ý: từ Bước 1.2 xong, chìa cũ prod đã bị revoke — **đồng hồ 15 phút bắt đầu chạy**.

---

## BƯỚC 2 — Paste chìa mới vào sandbox DB (~1 phút)

Terminal 1:
```bash
export SB_URL="https://pxgybyfiwywksesyogti.supabase.co"
export SB_KEY="$(grep '^SUPABASE_SERVICE_ROLE_KEY=' backend/.env.sandbox | cut -d= -f2-)"
# Tính expires_at = now + 24h (giá trị `expires_in` Zalo trả ~86400-90000 giây)
export EXP="2026-07-04T18:00:00Z"

curl -X PATCH "$SB_URL/rest/v1/zalo_oa_credentials?id=eq.1" \
  -H "apikey: $SB_KEY" \
  -H "Authorization: Bearer $SB_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"access_token\":\"PASTE_ACCESS_TOKEN_HERE\",
    \"refresh_token\":\"PASTE_REFRESH_TOKEN_HERE\",
    \"expires_at\":\"$EXP\"
  }"
```

Verify: response phải trả về row đã update, không có `error`.

---

## BƯỚC 3 — Chạy UAT script (~2-3 phút)

Terminal 1:
```bash
cd E:/PalFish/DA/pf-gmv-reconciliation/palfish-t-i-u-h-th-ng-ver-2
python scripts/uat_staging_zalo.py --all
```

Script sẽ:
1. Chặn nếu SUPABASE_URL không phải sandbox
2. Insert 4 rows outbox (case A/B/C/D) với prefix `🧪 [TEST UAT]`
3. Nhúng worker chạy 8 ticks × 10s = ~80 giây → tự gửi Zalo
4. Verify DB (sent_at, image_sent_at, image_error)
5. Print checklist verify bằng mắt

Output kỳ vọng cuối:
```
=== TỔNG KẾT: 4/4 case pass DB verify ===
```

---

## BƯỚC 4 — Verify tại nhóm Zalo (~1 phút)

Mở nhóm `IH2 & OFF - Báo tiền`, xác nhận nhận đủ:

| Case | Nội dung kỳ vọng |
|------|------------------|
| **A** | Text `🧪 [TEST UAT] 🆕 Yêu cầu kích hoạt khoá học ... KH: Nguyễn Văn UAT ... SĐT: 0999000111` **+ ảnh BIDV 2,000đ ngay sau** |
| **B** | Text `🧪 [TEST UAT] 🆕 ... KH: Trần Thị UAT B ... SĐT: 0999000222` **+ tin fallback `📎 Bill: https://.../does-not-exist-uat-bill.jpg`** |
| **C** | Text `🧪 [TEST UAT] ✅ ĐÃ KÍCH HOẠT THÀNH CÔNG ... KH của Lê Văn UAT C ... SĐT: 0999000333 · UID: UID-UAT-C` |
| **D** | Text `🧪 [TEST UAT] 💰 Đã vào - KH UAT DVN | Sale Test UAT · Team Inhouse 2 | 2,000đ | 18:00 03/07/2026` |

**Case A** là mấu chốt — nếu ảnh KHÔNG lên nhóm nhưng script báo `image_sent_at` có giá trị → Zalo API accepted payload nhưng silent-drop → check log worker. Nếu script báo `image_error` → xem section **Fix ảnh fail** dưới.

---

## BƯỚC 5 — Mint chìa mới cho prod (~3 phút)

⚠️ **Chú ý:** phải mint CHÌA MỚI (không dùng lại chìa sandbox — nếu paste sandbox token vào prod thì lần refresh tiếp theo lại đá sandbox creds → vòng lặp vô hạn).

### 5.1 Repeat Bước 1.1 + 1.2
Lặp lại quy trình mint code + đổi token trên OA portal, lấy access_token + refresh_token MỚI.

### 5.2 Paste vào prod DB
Terminal 1:
```bash
export PB_URL="https://jozcvbbypwvzaefteoxn.supabase.co"
export PB_KEY="$(grep '^SUPABASE_SERVICE_ROLE_KEY=' backend/.env | cut -d= -f2-)"
export EXP="2026-07-04T18:00:00Z"

curl -X PATCH "$PB_URL/rest/v1/zalo_oa_credentials?id=eq.1" \
  -H "apikey: $PB_KEY" \
  -H "Authorization: Bearer $PB_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"access_token\":\"PASTE_NEW_PROD_ACCESS_TOKEN\",
    \"refresh_token\":\"PASTE_NEW_PROD_REFRESH_TOKEN\",
    \"expires_at\":\"$EXP\"
  }"
```

### 5.3 Verify prod worker resume
- Prod worker Render sẽ tự poll tin mới. Nếu có tin queue trong lúc UAT (Bước 1.2 → 5.2) → sẽ nhả trong ~30 giây.
- Kiểm tra nhóm IH2 xem có tin `💰 Đã vào` cũ nhả ra không.
- Nếu có tin nhả cách quá lâu → nhắn nhóm `IH2 & OFF - Báo tiền`: "Bỏ qua tin cũ vừa nhả, đã có sự cố kỹ thuật".

---

## BƯỚC 6 — Dọn dẹp (~1 phút)

### 6.1 Xoá creds sandbox
```bash
curl -X DELETE "$SB_URL/rest/v1/zalo_oa_credentials?id=eq.1" \
  -H "apikey: $SB_KEY" \
  -H "Authorization: Bearer $SB_KEY"
```
**Tại sao:** nếu ai đó bật sandbox worker sau này với chìa cũ → refresh sẽ đá prod ra lần nữa. Xoá creds sandbox = worker sandbox sẽ error `_read_credentials` ngay từ đầu, an toàn.

### 6.2 Xoá test rows khỏi sandbox outbox (optional)
```bash
curl -X DELETE "$SB_URL/rest/v1/zalo_outbox?source_table=eq.uat_synthetic" \
  -H "apikey: $SB_KEY" \
  -H "Authorization: Bearer $SB_KEY"
```

---

## Fix ảnh fail (nếu Case A gặp lỗi Zalo API)

Handoff docs cảnh báo Zalo có thể reject payload upload → attachment_id. Nếu Case A báo `image_error` chứa `-2xx` code:

1. Đọc lỗi: `curl "$SB_URL/rest/v1/zalo_outbox?id=eq.<CASE_A_ID>&select=image_error" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"`
2. Nếu error là `-201`, `-216`, `-14001`... → payload attachment_id không được chấp nhận. Thử **variant 2**:
   - Mở `backend/zalo_notifier.py:390-404`
   - Thay đổi payload từ `attachment_id` sang direct URL:
     ```python
     payload = {
         "recipient": {"group_id": group_id},
         "message": {
             "attachment": {
                 "type": "template",
                 "payload": {
                     "template_type": "media",
                     "elements": [{"media_type": "image", "url": image_url}],  # ← thay attachment_id
                 },
             },
         },
     }
     ```
   - Bỏ qua step `_upload_image` (comment out `attachment_id = _upload_image(...)`)
3. Chạy lại chỉ Case A: `python scripts/uat_staging_zalo.py --case A`

Nếu variant 2 pass → giữ variant 2 làm mặc định, commit.

---

## Rollback nếu UAT fail giữa chừng

| Đến bước | Rollback |
|----------|----------|
| Bước 1 xong, chưa Bước 2 | Không cần rollback (chưa update DB). Nhưng prod worker đã bị đá — vẫn phải làm Bước 5 để mint chìa prod lại. |
| Bước 2 xong, script fail | Làm ngay Bước 5 + 6 để restore prod. Ghi lại lỗi để debug sau. |
| Bước 3 verify DB fail 1 case | Nếu Case A ảnh fail → xem "Fix ảnh fail". Case khác fail → check log worker terminal 1. Prod vẫn đứng — làm Bước 5 ngay để không đứng lâu hơn. |
| Bước 5 mint prod fail | ⚠️ Prod đứng lâu. Login lại portal, retry mint. Nếu portal xuống → prod sẽ chạy tiếp khi mint xong sau (tin queue trong outbox). |

---

## Checklist nghiệm thu cuối
- [ ] Bước 1-6 xong không lỗi
- [ ] 4 tin `[TEST UAT]` lên nhóm đúng như bảng Bước 4
- [ ] Script báo `4/4 case pass DB verify`
- [ ] Prod worker resume, tin `💰` cũ nhả (nếu có)
- [ ] Sandbox creds đã xoá
- [ ] Cập nhật memory + docs: đánh dấu UAT pass, unblock Task 2 (go-live prod migrations + merge sandbox→main)

Sau khi tất cả tick → tiếp Task 2 trong handoff (chạy 2 migration prod + merge sandbox→main).
