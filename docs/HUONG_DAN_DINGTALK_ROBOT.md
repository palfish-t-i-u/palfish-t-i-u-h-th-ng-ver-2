# Hướng dẫn cấu hình DingTalk Robot cho PalFish GMV

> **Mục tiêu:** Setup DingTalk Custom Robot (自定义机器人) để hệ thống PalFish GMV tự động gửi thông báo payment_paid, course_activated, urgent reminder vào nhóm DingTalk của từng team Sale.

> **Chiến lược (anh Hiếu đề xuất):** Tạo 1 tổ chức DingTalk riêng (ngoài org chính 北京读我科技有限公司) → tạo robot → add vào nhóm test → nắm full luồng setup → viết yêu cầu cụ thể gửi IT tổng bộ Beijing.

---

## Tổng quan kiến trúc

```
PalFish GMV Backend (FastAPI)
    │
    ├── dingtalk_outbox (Supabase)     ← PG trigger tự enqueue khi payment_paid / course_activated
    │       │
    │       ▼
    ├── dingtalk_outbox_worker         ← poll 30s, batch 20 row
    │       │
    │       ▼
    └── dingtalk_notifier.py
            │
            │  POST + HMAC-SHA256 sign
            ▼
        https://oapi.dingtalk.com/robot/send?access_token=xxx&timestamp=xxx&sign=xxx
            │
            ▼
        Nhóm DingTalk (mỗi team 1 robot riêng)
```

Mỗi nhóm DingTalk có 1 **Custom Robot** (自定义机器人) với:
- **Webhook URL** — endpoint để POST tin nhắn
- **Secret** — chuỗi bắt đầu bằng `SEC...`, dùng để ký HMAC-SHA256

Code backend đã hoàn thiện. Việc còn lại là **tạo robot + lấy webhook/secret + nhập vào hệ thống**.

---

## Phần A: Tạo tổ chức DingTalk mới (POC)

> Bước này chỉ dành cho POC/test. Production sẽ dùng org chính 北京读我科技有限公司 (do IT Beijing quản lý).

### A1. Đăng ký tài khoản DingTalk (nếu chưa có)

1. Tải app DingTalk: [Android/iOS](https://www.dingtalk.com/download) hoặc [Desktop](https://www.dingtalk.com/download)
2. Đăng ký bằng số điện thoại
3. Xác minh OTP

### A2. Tạo tổ chức mới

**Trên Desktop:**
1. Click vào tên tổ chức hiện tại (góc trái trên, dưới avatar)
2. Chọn **"创建团队"** (Create an Enterprise/Team) hoặc **"New"**
3. Điền thông tin:
   - **Tên tổ chức**: VD `PalFish GMV Test`
   - **Ngành nghề**: Giáo dục / Education
   - **Khu vực**: Vietnam
4. Click **"创建"** (Create)

**Trên Mobile:**
1. Vào **Contacts** (通讯录)
2. Tap icon **"+"** → **"Create an enterprise / Team"**
3. Điền tên, ngành, khu vực → **Next**

Sau khi tạo xong, bạn là **Super Admin** của org này.

### A3. Mời thành viên vào org

1. Vào **Admin Console** (oa.dingtalk.com) hoặc trong app → **Contacts**
2. Invite bằng link/QR hoặc nhập số điện thoại
3. Mời ít nhất 1 người khác (VD: Hoang Hieu) để tạo nhóm test

---

## Phần B: Tạo nhóm chat + Custom Robot

### B1. Tạo nhóm chat

1. Trong DingTalk, click **"+"** → **"Initiate Group Chat"** (发起群聊)
2. Chọn thành viên (ít nhất 2 người, kể cả mình)
3. Đặt tên nhóm: VD `Test GMV Bot`
4. Click **"Create"**

> Nếu đã có nhóm test (như "Test GMV Bot" trong screenshot), dùng luôn nhóm đó.

### B2. Thêm Custom Robot vào nhóm

1. Mở nhóm chat
2. Click **icon Settings ⚙️** (góc phải trên)
3. Chọn **"Group Management"** (群管理) → **"Group Assistant"** (智能群助手) hoặc **"Bots"**
4. Click **"Add Robot"** (添加机器人) → click icon **"+"**
5. Chọn **"Custom"** (自定义) — **KHÔNG phải** Enterprise Internal Application

   > **Custom Robot vs Enterprise Internal Robot:**
   > | | Custom Robot (自定义) | Enterprise Internal Robot |
   > |---|---|---|
   > | Tạo ở đâu | Group Settings → Group Assistant | DingTalk Developer Console |
   > | Auth | Webhook + Signing | AppKey + AppSecret, OAuth |
   > | Chiều | **Chỉ gửi** (outbound only) | Hai chiều (gửi + nhận) |
   > | Cần quyền | Không | Cần quyền `qyapi_robot_sendmsg` |
   > | Use case | Thông báo, alert | Chatbot tương tác |
   >
   > **PalFish GMV dùng Custom Robot** vì chỉ cần gửi thông báo 1 chiều.

6. Đặt tên robot: VD `PalFish GMV Notifier`
7. (Tùy chọn) Upload avatar cho robot

### B3. Cấu hình Security Settings

DingTalk yêu cầu chọn ít nhất 1 trong 3 chế độ bảo mật:

| Chế độ | Mô tả | PalFish dùng? |
|--------|-------|---------------|
| **Keyword** (关键词) | Tin nhắn phải chứa ít nhất 1 từ khóa đã cấu hình | Không |
| **IP Whitelist** (IP地址段) | Chỉ chấp nhận request từ IP đã whitelist | Không (backend trên Render, IP động) |
| **Signing (加签)** ✅ | Mỗi request phải có chữ ký HMAC-SHA256 hợp lệ | **CÓ — chọn cái này** |

**Chọn "Signing" (加签):**

1. Tick checkbox **"Signing"** (加签)
2. Hệ thống sẽ hiện ra **Secret** — chuỗi bắt đầu bằng `SEC`, VD: `SECa1b2c3d4e5f6...`
3. **Copy Secret ngay** — chỉ hiện 1 lần tại đây (sau có thể xem lại trong Settings)

### B4. Lấy Webhook URL + Secret

1. Click **"Finish"** (完成)
2. Hệ thống hiện **Webhook URL**, dạng:
   ```
   https://oapi.dingtalk.com/robot/send?access_token=abc123def456...
   ```
3. **Copy cả Webhook URL và Secret**, lưu vào nơi an toàn

> ⚠️ **BẢO MẬT:**
> - Webhook URL = ai có link đều gửi được tin vào nhóm → giữ bí mật
> - Secret = chỉ dùng để ký request → không share ra ngoài
> - Nếu bị lộ: vào Settings → robot → **Rotate Secret** (tạo secret mới, secret cũ vô hiệu)

### B5. Xem lại thông tin robot đã tạo

Nếu cần xem lại webhook/secret sau khi đã tạo:
1. Mở nhóm → Settings ⚙️ → Group Assistant / Bots
2. Click vào tên robot đã tạo
3. Webhook URL hiển thị tại đây
4. Secret có thể xem/rotate tại đây

---

## Phần C: Test gửi tin nhắn

### C1. Test bằng curl (nhanh nhất)

```bash
# Thay YOUR_WEBHOOK và YOUR_SECRET
WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=YOUR_ACCESS_TOKEN"
SECRET="SECyour_secret_here"

# Tính timestamp (milliseconds)
TIMESTAMP=$(python3 -c "import time; print(int(time.time()*1000))")

# Tính signature
SIGN=$(python3 -c "
import hmac, hashlib, base64, urllib.parse
ts='$TIMESTAMP'; sec='$SECRET'
s = f'{ts}\n{sec}'.encode('utf-8')
h = hmac.new(sec.encode('utf-8'), s, hashlib.sha256).digest()
print(urllib.parse.quote_plus(base64.b64encode(h)))
")

# Gửi tin nhắn
curl -s "$WEBHOOK&timestamp=$TIMESTAMP&sign=$SIGN" \
  -H "Content-Type: application/json" \
  -d '{"msgtype":"text","text":{"content":"Test từ PalFish GMV - setup thành công!"}}'
```

**Response thành công:**
```json
{"errcode": 0, "errmsg": "ok"}
```

**Lỗi thường gặp:**

| errcode | errmsg | Nguyên nhân |
|---------|--------|-------------|
| 310000 | `sign not match` | Secret sai hoặc timestamp quá cũ (>1 giờ) |
| 310000 | `keywords not in content` | Nếu dùng mode Keyword mà tin không chứa từ khóa |
| 300001 | `token not exist` | Webhook URL sai hoặc robot đã bị xóa |
| 130101 | `send too fast` | Vượt quá 20 tin/phút |

### C2. Test bằng Python script

```python
# test_dingtalk_send.py
import hmac, hashlib, base64, time, urllib.parse, json
import httpx  # hoặc requests

WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN"
SECRET  = "SECyour_secret"

# 1. Tính signature
timestamp = str(int(time.time() * 1000))
string_to_sign = f"{timestamp}\n{SECRET}".encode("utf-8")
hmac_code = hmac.new(SECRET.encode("utf-8"), string_to_sign, hashlib.sha256).digest()
sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))

# 2. Build URL
url = f"{WEBHOOK}&timestamp={timestamp}&sign={sign}"

# 3. Gửi
payload = {
    "msgtype": "text",
    "text": {"content": "🎉 Test DingTalk từ PalFish GMV - kết nối thành công!"}
}
resp = httpx.post(url, json=payload, headers={"Content-Type": "application/json"})
print(resp.status_code, resp.json())
```

### C3. Test qua hệ thống PalFish GMV (sau khi nhập webhook/secret)

1. Đăng nhập hệ thống PalFish GMV (admin)
2. Vào **DingTalk → Nhóm thông báo** → Thêm nhóm mới:
   - `team_code`: tên team (VD: `TEST_TEAM`)
   - `webhook_url`: paste URL vừa copy
   - `secret`: paste secret vừa copy
   - `group_name`: mô tả (VD: "Nhóm test DingTalk")
   - `is_active`: Bật
3. Vào **DingTalk → Cấu hình** → chọn nhóm vừa thêm → click **"Test Gửi DingTalk"**
4. Kiểm tra nhóm DingTalk — tin nhắn test phải xuất hiện

---

## Phần D: Thuật toán ký HMAC-SHA256 (tham khảo)

DingTalk dùng chế độ **Signing (加签)** để xác thực request. Mỗi request phải kèm 2 query params:

```
&timestamp=1700000000000&sign=URL_ENCODED_BASE64_HMAC
```

### Thuật toán chi tiết

```
1. timestamp = thời gian hiện tại (milliseconds since epoch)
   VD: 1700000000000

2. string_to_sign = "{timestamp}\n{secret}"
   VD: "1700000000000\nSECa1b2c3..."

3. hmac_raw = HMAC-SHA256(key=secret, message=string_to_sign)
   // key và message đều encode UTF-8

4. sign = URL_ENCODE(BASE64(hmac_raw))
```

### Lưu ý quan trọng

- Timestamp phải là **milliseconds** (nhân 1000), không phải seconds
- Timestamp phải nằm trong **1 giờ** so với server time DingTalk — quá hạn sẽ bị reject
- `string_to_sign` dùng ký tự `\n` (newline thật), không phải literal backslash-n
- Secret bắt đầu bằng `SEC` — đừng nhầm với access_token trong URL
- Encode: HMAC-SHA256 → base64 → URL-encode (percent-encoding)

### Rate limit

- **20 tin nhắn / phút / robot**
- Vượt quá → errcode `130101`, errmsg `send too fast, exceed 20 times per minute`
- Hệ thống PalFish GMV: worker gửi batch 20 row mỗi 30s — gần giới hạn nếu traffic cao

---

## Phần E: Message format (định dạng tin nhắn)

### Text (đang dùng)

```json
{
  "msgtype": "text",
  "text": {
    "content": "Nội dung tin nhắn"
  }
}
```

### Markdown (nâng cấp sau nếu cần)

```json
{
  "msgtype": "markdown",
  "markdown": {
    "title": "Tiêu đề (chỉ hiện ở notification preview)",
    "text": "#### Thanh toán thành công\n> Khách: Nguyễn Văn A\n\n**Số tiền:** 5,000,000 VNĐ"
  }
}
```

> Markdown hỗ trợ: `#` heading, `>` quote, `**bold**`, `[link](url)`, `![image](url)`, ordered/unordered list.

### @ người trong nhóm

```json
{
  "msgtype": "text",
  "text": { "content": "Có thanh toán mới!" },
  "at": {
    "atMobiles": ["84901234567"],
    "isAtAll": false
  }
}
```

---

## Phần F: Checklist cho Production (request IT tổng bộ)

Sau khi POC thành công trên org test, gửi yêu cầu cho IT Beijing với nội dung:

### Yêu cầu cụ thể

> **Kính gửi IT,**
>
> Đội PalFish Vietnam cần setup DingTalk Custom Robot cho hệ thống GMV Reconciliation. Yêu cầu:
>
> 1. **Với mỗi nhóm DingTalk của team Sale** (hiện có X nhóm), cần thêm 1 Custom Robot:
>    - Vào Group Settings → Group Assistant → Add Robot → Custom
>    - Tên robot: `PalFish GMV Notifier`
>    - Security: chọn **Signing (加签)**
>    - Copy **Webhook URL** + **Secret** gửi lại cho đội VN
>
> 2. Danh sách nhóm cần setup:
>    | Team | Tên nhóm DingTalk | Ghi chú |
>    |------|-------------------|---------|
>    | SALE_HCM | (tên nhóm HCM) | |
>    | SALE_HN | (tên nhóm Hà Nội) | |
>    | OPS | (nhóm vận hành) | Nhận urgent reminder |
>    | ... | ... | |
>
> 3. Sau khi setup, gửi lại cho Minh:
>    - Webhook URL của từng nhóm
>    - Secret của từng nhóm
>    - Minh sẽ nhập vào hệ thống qua admin UI
>
> **Lưu ý:** Robot chỉ gửi tin 1 chiều (thông báo thanh toán, kích hoạt khóa học). Không cần Enterprise Internal Application hay quyền đặc biệt nào.

### Checklist IT

- [ ] Tạo Custom Robot cho mỗi nhóm Sale
- [ ] Chọn security mode: Signing (加签)
- [ ] Gửi webhook URL + secret cho đội VN
- [ ] Đội VN nhập vào hệ thống (DingTalk → Nhóm thông báo)
- [ ] Test gửi qua tab Cấu hình → xác nhận tin xuất hiện trong nhóm
- [ ] Bật is_active → hệ thống tự động gửi thông báo

---

## Tham khảo

- [DingTalk Open Platform — Custom Robot Access](https://open.dingtalk.com/document/robots/custom-robot-access)
- [DingTalk Help — Get Webhook URL](https://help.dingtalk.io/open/dingstart/obtain-the-webhook-address-of-a-custom-robot)
- [DingTalk Open Platform — Security Settings](https://open.dingtalk.com/document/robots/customize-robot-security-settings)
- Code backend: `backend/dingtalk_notifier.py`, `backend/dingtalk_outbox_worker.py`
- Code frontend: `frontend/src/components/admin/DingTalk*.tsx`
- Plan gốc: `docs/superpowers/plans/2026-06-26-dingtalk-group-notifications.md`
