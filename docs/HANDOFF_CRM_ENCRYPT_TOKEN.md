# Handoff: Encrypt CRM Token trong DB

**Giao cho**: Giang
**Mức ưu tiên**: P1 (nên làm sớm nhưng không khẩn cấp — luồng CRM vẫn hoạt động bình thường khi chưa bật encrypt)
**Liên quan đến**: OTHER-03 trong audit 2026-06-03

---

## Bối cảnh — Vấn đề thực tế

App PalFish GMV dùng **Chrome Extension** để tự động lấy cookie đăng nhập từ CRM PalFish (`sea.pri.ibanyu.com`). Cookie này chính là "chìa khoá" truy cập toàn bộ hệ thống CRM của công ty — nếu ai có cookie này, họ đăng nhập CRM được luôn mà không cần mật khẩu.

**Hiện tại**, cookie này lưu **plaintext** (nguyên văn) trong bảng `crm_tokens` trên Supabase. Nghĩa là nếu database bị lộ (leak credentials, backup bị truy cập trái phép, v.v.) → kẻ tấn công đọc được cookie → đăng nhập CRM PalFish bằng tài khoản công ty → xem toàn bộ dữ liệu khách hàng.

**Mục tiêu**: Encrypt (mã hoá) cookie trước khi lưu vào DB. Khi cần dùng → decrypt (giải mã) ra. Nếu database bị lộ, kẻ tấn công chỉ thấy chuỗi mã hoá vô nghĩa.

---

## Tại sao fix lần trước không hoạt động?

Giang đã thêm code encrypt/decrypt vào **backend** (`crm_routes.py`). Code đó đúng logic. Nhưng vấn đề là:

### Extension ghi token **thẳng vào Supabase**, bỏ qua backend

```
Luồng hiện tại:

Chrome Extension
    ↓
    POST trực tiếp vào Supabase REST API  ← GHI PLAINTEXT VÀO DB
    (dùng anon key, không qua backend)
    ↓
crm_tokens table: cookie_value = "ipalfish_device_id=abc123..."  (plaintext)

Khi user bấm "LẤY DỮ LIỆU":

Backend đọc crm_tokens
    ↓
Thấy CRM_ENCRYPT_KEY đã set → thử decrypt
    ↓
"ipalfish_device_id=abc123..." KHÔNG PHẢI Fernet token → decrypt FAIL
    ↓
raw = "" → báo "Chưa có token CRM"  ← LỖI
```

Xem `crm-token-extension/background.js` dòng 47-59:
```javascript
// Extension ghi TRỰC TIẾP vào Supabase — không qua backend
const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_tokens`, {
    method: "POST",
    headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
        id: 1,
        cookie_value: payload,  // ← PLAINTEXT
        updated_at: new Date().toISOString(),
    }),
});
```

Extension cũng gọi backend `/system/update-crm-token` nhưng chỉ là fire-and-forget (dòng 66-71, `.catch(() => {})`). Và endpoint này giờ yêu cầu auth (Đạt thêm `resolve_actor` + `require_min_role("manager")`) → extension không có auth header → bị reject → token không bao giờ đi qua backend để encrypt.

---

## Cách sửa

Có 2 lựa chọn. **Cách A đơn giản hơn**, Cách B bảo mật hơn.

### Cách A — Extension encrypt trước khi ghi vào Supabase (Khuyến nghị)

Encrypt ngay trong extension trước khi ghi vào DB. Backend decrypt khi đọc. Không cần thay đổi luồng ghi.

**Bước 1**: Extension import thư viện encrypt

Vì extension chạy trong browser, không dùng được `cryptography` (Python). Dùng **Web Crypto API** (có sẵn trong Chrome) hoặc một thư viện JS nhẹ tương thích Fernet.

Lựa chọn đơn giản nhất: dùng **AES-GCM** (Web Crypto API, built-in) thay vì Fernet.

**Bước 2**: Thay đổi file `crm-token-extension/background.js`

```javascript
// Thêm ở đầu file
const CRM_ENCRYPT_KEY = "base64-encoded-256-bit-key-here";
// Key này phải GIỐNG key trên Render (nhưng format có thể khác)

async function encryptToken(plaintext) {
    const keyBytes = Uint8Array.from(atob(CRM_ENCRYPT_KEY), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    // Trả về: iv (12 bytes) + ciphertext, base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
}
```

**Bước 3**: Sửa `_pushToken` để encrypt trước khi ghi

```javascript
async function _pushToken(bundle) {
    const payload = JSON.stringify(bundle);
    const encrypted = await encryptToken(payload);  // ← THÊM

    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_tokens`, {
        ...
        body: JSON.stringify({
            id: 1,
            cookie_value: encrypted,  // ← ĐỔI từ payload → encrypted
            updated_at: new Date().toISOString(),
        }),
    });
    ...
}
```

**Bước 4**: Sửa backend `_get_auth_bundle` để decrypt AES-GCM

```python
# crm_routes.py — thay block decrypt hiện tại

import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_AES_KEY = os.getenv("CRM_ENCRYPT_KEY")
_aes = AESGCM(base64.b64decode(_AES_KEY)) if _AES_KEY else None

def _decrypt_token(raw: str) -> str:
    """Thử decrypt. Nếu fail → coi là plaintext (backwards compat)."""
    if not _aes or not raw:
        return raw
    try:
        data = base64.b64decode(raw)
        iv, ciphertext = data[:12], data[12:]
        return _aes.decrypt(iv, ciphertext, None).decode()
    except Exception:
        # Token có thể là plaintext cũ → dùng nguyên
        return raw
```

**Quan trọng**: Khi decrypt fail, **trả về `raw` gốc** (plaintext) thay vì `""`. Đây là backwards compatibility — token cũ (plaintext) vẫn đọc được, token mới (encrypted) cũng đọc được.

**Bước 5**: Xoá code Fernet cũ

Xoá block Fernet ở đầu `crm_routes.py` (dòng 36-48) và thay bằng AES-GCM ở trên.

**Bước 6**: Set `CRM_ENCRYPT_KEY` trên Render

```bash
# Tạo key 256-bit, base64
python -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())"
```

Paste key này vào:
- Render Environment: `CRM_ENCRYPT_KEY=<key>`
- Extension `background.js`: `const CRM_ENCRYPT_KEY = "<key>"`

---

### Cách B — Extension ghi qua backend thay vì Supabase trực tiếp

Bỏ đường ghi trực tiếp vào Supabase. Extension chỉ gửi token qua backend endpoint.

**Ưu điểm**: Backend kiểm soát toàn bộ, dùng Fernet như code hiện tại.
**Nhược điểm**: Extension cần auth header → phức tạp hơn. Backend Render down → token không cập nhật.

Nếu chọn cách này:

1. Sửa `background.js`: bỏ đoạn ghi Supabase trực tiếp (dòng 47-72), chỉ giữ fallback gọi backend (dòng 78-91)
2. Extension cần gửi Supabase JWT trong Authorization header → cần lấy JWT từ frontend app (phức tạp, extension và app ở domain khác)
3. Hoặc bỏ auth check trên `/system/update-crm-token` (thêm lại lỗ hổng AUTH-03)

→ **Không khuyến nghị** trừ khi có thời gian refactor extension lớn.

---

## File cần sửa

| File | Thay đổi |
|------|---------|
| `crm-token-extension/background.js` | Thêm `encryptToken()`, sửa `_pushToken()` |
| `backend/crm_routes.py` | Đổi Fernet → AES-GCM, sửa `_get_auth_bundle()` fallback plaintext |
| Render Environment | Set `CRM_ENCRYPT_KEY` (AES-256 key, base64) |

## Kiểm tra

1. Xoá token cũ: `DELETE FROM crm_tokens WHERE id = 1;`
2. Mở CRM → extension gửi token mới (encrypted)
3. Check DB: `SELECT LEFT(cookie_value, 20) FROM crm_tokens WHERE id = 1;` → phải thấy chuỗi base64, KHÔNG phải `{"cookie":"ipalfish...`
4. Bấm "LẤY DỮ LIỆU" → đồng bộ thành công
5. Restart backend (simulate deploy) → bấm "LẤY DỮ LIỆU" lại → vẫn hoạt động

## Lưu ý quan trọng

- **Backwards compatibility bắt buộc**: `_decrypt_token()` PHẢI trả về plaintext gốc khi decrypt fail. Không được trả `""`. Vì trong giai đoạn chuyển đổi, DB có thể chứa cả token cũ (plaintext) lẫn mới (encrypted).
- **Key phải giống nhau** giữa extension và backend. Nếu key khác → extension encrypt bằng key A, backend decrypt bằng key B → fail.
- Extension chạy trên máy user → key bị lộ trong source code extension là chấp nhận được (extension chỉ cài local, không public). Nhưng nếu muốn tốt hơn, có thể dùng key derivation từ user's Supabase JWT.
