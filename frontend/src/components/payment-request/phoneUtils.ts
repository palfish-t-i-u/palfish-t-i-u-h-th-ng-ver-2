import { COUNTRIES, findCountry, type Country } from "./CountryCombo";

/** Smart-paste SĐT (18/7): sale copy "420-777710688" / "+84 352 334 789" từ CRM/chat
 *  dán vào ô đuôi số → tự cắt đầu số + chọn country. CHỈ nhận diện khi có separator
 *  sau đầu số VÀ đầu số tồn tại trong COUNTRIES (G11 — không đoán mò chuỗi digits trần). */
export function smartParsePhonePaste(raw: string): { dial?: string; local: string } {
  const m = raw.trim().match(/^\+?(\d{1,3})[-\s]+([\d\s().-]{4,})$/);
  if (m) {
    const dial = m[1];
    if (COUNTRIES.some((c) => c.dial === `+${dial}`)) {
      return { dial, local: m[2].replace(/\D/g, "") };
    }
  }
  return { local: raw.replace(/\D/g, "") };
}

/** Chuẩn hoá đuôi số theo country + cảnh báo độ dài (G11 — cảnh báo, KHÔNG sửa hộ/chặn).
 *  - Bỏ đúng 1 số "0" đầu KHI: sau khi bỏ khớp độ dài mẫu VÀ không còn bắt đầu bằng 0
 *    ("0352334789" VN → "352334789"; "0083329127" giữ nguyên — số 0 đầu thật).
 *  - warn khi lệch >1 so với exampleLocal (1 mẫu, nhiều nước có range → tolerance ±1). */
export function normalizeLocalPhone(local: string, country: Country): { value: string; warn: boolean } {
  const expected = country.exampleLocal.replace(/\D/g, "").length;
  let v = local.replace(/\D/g, "");
  if (v.startsWith("0") && !v.startsWith("00") && v.length - 1 === expected && !v.slice(1).startsWith("0")) {
    v = v.slice(1);
  }
  const warn = v.length > 0 && Math.abs(v.length - expected) > 1;
  return { value: v, warn };
}

/** Format gửi/hiển thị CRM: "84-352334789" (đầu số-đuôi số, user chốt 18/7). */
export function crmPhoneFormat(local: string, country: Country): string {
  const v = local.replace(/\D/g, "");
  if (!v) return "";
  return `${country.dial.replace("+", "")}-${v}`;
}

/** Format hiển thị chuẩn công ty: "84-396249966" (đầu số-đuôi số).
 *  MIRROR của BE Python `utils/zalo_message_builder.py::format_phone_intl` và SQL
 *  `public.format_phone_intl` (migration 2026-07-04) — sửa semantics phải sync 3 nơi.
 *  Khác BE: dùng findCountry (248 nước, generated) thay map tay cụt → khách DE/CZ... đúng dial.
 *  - bỏ ký tự ≠ số → bỏ TOÀN BỘ số 0 đầu → nếu dính sẵn dial VÀ phần còn lại > 5 ký tự thì cắt dial. */
export function formatPhoneIntl(countryCode: string | null | undefined, raw: string | null | undefined): string {
  const digitsAll = (raw || "").replace(/\D/g, "");
  if (!digitsAll) return "";
  const country = findCountry(countryCode);
  const dial = country.dial.replace("+", "");
  const expectedLocal = country.exampleLocal.replace(/\D/g, "").length;
  let digits = digitsAll.replace(/^0+/, "");
  if (digits.startsWith(dial) && digits.length > expectedLocal) {
    const afterDial = digits.slice(dial.length);
    if (Math.abs(afterDial.length - expectedLocal) <= 1) {
      digits = afterDial;
    }
  }
  return `${dial}-${digits}`;
}

/** Handler chung cho ô nhập SĐT (tạo PR / sửa PR / AR row): smart-paste tách đầu số.
 *  Trả countryCode khi nhận diện được (có separator + dial tồn tại — G11), caller set country. */
export function applySmartPhoneInput(raw: string): { phone: string; countryCode?: string } {
  const parsed = smartParsePhonePaste(raw);
  if (parsed.dial) {
    const c = COUNTRIES.find((x) => x.dial === `+${parsed.dial}`);
    return { phone: parsed.local, ...(c ? { countryCode: c.code } : {}) };
  }
  return { phone: parsed.local };
}
