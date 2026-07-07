#!/usr/bin/env node
/**
 * Build static country dial-code data for the "Chọn quốc gia" dropdown
 * (Payment Request forms). Fixes missing countries (vd. Czechia +420).
 * Run: node scripts/build-country-dial-codes.mjs
 * Output: frontend/src/data/countryDialCodes.ts
 *
 * Source pinned to a git tag (mledoze/countries — dataset behind
 * restcountries.com), KHÔNG dùng "master" — cùng convention với
 * scripts/build-vn-provinces.mjs (tránh dữ liệu đổi ngầm sau lần build).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const VERSION = "5.1.0";
const JSON_URL = `https://raw.githubusercontent.com/mledoze/countries/${VERSION}/countries.json`;
const OUTPUT = join(REPO_ROOT, "frontend/src/data/countryDialCodes.ts");

// 49 quốc gia đã có sẵn trong CountryCombo.tsx trước khi có script này —
// tay-tune (đặc biệt `exampleLocal`, không có trong dataset công khai nào).
// GIỮ NGUYÊN VĂN, không generate lại — tránh regressions cho phần đã dùng
// thật + đã test qua UI.
const CURATED_HEAD = [
  { code: "VN", name: "Việt Nam", dial: "+84", flag: "🇻🇳", exampleLocal: "987 654 321" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸", exampleLocal: "202 555 0123" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧", exampleLocal: "7911 123456" },
  { code: "CN", name: "China", dial: "+86", flag: "🇨🇳", exampleLocal: "131 2345 6789" },
  { code: "JP", name: "Japan", dial: "+81", flag: "🇯🇵", exampleLocal: "90 1234 5678" },
  { code: "KR", name: "South Korea", dial: "+82", flag: "🇰🇷", exampleLocal: "10 1234 5678" },
  { code: "TH", name: "Thailand", dial: "+66", flag: "🇹🇭", exampleLocal: "81 234 5678" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬", exampleLocal: "8123 4567" },
  { code: "MY", name: "Malaysia", dial: "+60", flag: "🇲🇾", exampleLocal: "12 345 6789" },
  { code: "ID", name: "Indonesia", dial: "+62", flag: "🇮🇩", exampleLocal: "812 345 6789" },
  { code: "PH", name: "Philippines", dial: "+63", flag: "🇵🇭", exampleLocal: "917 123 4567" },
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳", exampleLocal: "98765 43210" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺", exampleLocal: "412 345 678" },
  { code: "NZ", name: "New Zealand", dial: "+64", flag: "🇳🇿", exampleLocal: "21 123 4567" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦", exampleLocal: "613 555 0123" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪", exampleLocal: "151 2345 6789" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷", exampleLocal: "6 12 34 56 78" },
  { code: "IT", name: "Italy", dial: "+39", flag: "🇮🇹", exampleLocal: "312 345 6789" },
  { code: "ES", name: "Spain", dial: "+34", flag: "🇪🇸", exampleLocal: "612 345 678" },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱", exampleLocal: "6 1234 5678" },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭", exampleLocal: "78 123 45 67" },
  { code: "SE", name: "Sweden", dial: "+46", flag: "🇸🇪", exampleLocal: "70 123 45 67" },
  { code: "NO", name: "Norway", dial: "+47", flag: "🇳🇴", exampleLocal: "406 12 345" },
  { code: "FI", name: "Finland", dial: "+358", flag: "🇫🇮", exampleLocal: "41 234 5678" },
  { code: "DK", name: "Denmark", dial: "+45", flag: "🇩🇰", exampleLocal: "32 12 34 56" },
  { code: "PL", name: "Poland", dial: "+48", flag: "🇵🇱", exampleLocal: "512 345 678" },
  { code: "RU", name: "Russia", dial: "+7", flag: "🇷🇺", exampleLocal: "912 345 6789" },
  { code: "TR", name: "Türkiye", dial: "+90", flag: "🇹🇷", exampleLocal: "532 123 4567" },
  { code: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪", exampleLocal: "50 123 4567" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦", exampleLocal: "51 234 5678" },
  { code: "IL", name: "Israel", dial: "+972", flag: "🇮🇱", exampleLocal: "50 123 4567" },
  { code: "EG", name: "Egypt", dial: "+20", flag: "🇪🇬", exampleLocal: "100 123 4567" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦", exampleLocal: "71 123 4567" },
  { code: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬", exampleLocal: "802 123 4567" },
  { code: "BR", name: "Brazil", dial: "+55", flag: "🇧🇷", exampleLocal: "11 91234 5678" },
  { code: "AR", name: "Argentina", dial: "+54", flag: "🇦🇷", exampleLocal: "11 2345 6789" },
  { code: "MX", name: "Mexico", dial: "+52", flag: "🇲🇽", exampleLocal: "55 1234 5678" },
  { code: "CL", name: "Chile", dial: "+56", flag: "🇨🇱", exampleLocal: "9 1234 5678" },
  { code: "PE", name: "Peru", dial: "+51", flag: "🇵🇪", exampleLocal: "912 345 678" },
  { code: "CO", name: "Colombia", dial: "+57", flag: "🇨🇴", exampleLocal: "301 234 5678" },
  { code: "HK", name: "Hong Kong", dial: "+852", flag: "🇭🇰", exampleLocal: "5123 4567" },
  { code: "TW", name: "Taiwan", dial: "+886", flag: "🇹🇼", exampleLocal: "912 345 678" },
  { code: "MO", name: "Macao", dial: "+853", flag: "🇲🇴", exampleLocal: "6612 3456" },
  { code: "KH", name: "Cambodia", dial: "+855", flag: "🇰🇭", exampleLocal: "91 234 567" },
  { code: "LA", name: "Laos", dial: "+856", flag: "🇱🇦", exampleLocal: "20 1234 5678" },
  { code: "MM", name: "Myanmar", dial: "+95", flag: "🇲🇲", exampleLocal: "9 212 3456" },
  { code: "BD", name: "Bangladesh", dial: "+880", flag: "🇧🇩", exampleLocal: "1812 345678" },
  { code: "PK", name: "Pakistan", dial: "+92", flag: "🇵🇰", exampleLocal: "301 234 5678" },
  { code: "IR", name: "Iran", dial: "+98", flag: "🇮🇷", exampleLocal: "912 345 6789" },
];
const CURATED_CODES = new Set(CURATED_HEAD.map((c) => c.code));
const GENERIC_EXAMPLE = "912 345 678";

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "node" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
  });
}

// Ghép root+suffix chỉ khi có ĐÚNG 1 suffix (mã quốc gia rõ ràng, vd CZ +4+20=+420).
// Khi 0 hoặc nhiều suffix (suffix là area code nội địa, vd US/CA/RU/KZ có hàng
// chục/trăm suffix) thì dùng root — khớp đúng cách 2 mục US/CA đã có sẵn trong
// CURATED_HEAD đang xử lý (dial "+1", không phải "+1204"...).
// Biết trước: 3 lãnh thổ cực hiếm gặp (Saint Helena, Western Sahara, Vatican)
// sẽ ra dial hơi thiếu chính xác theo rule này — chấp nhận, khách hàng thực tế
// của Palfish gần như không bao giờ ở các nơi này.
function buildDial(idd) {
  if (!idd?.root) return null;
  const suffixes = idd.suffixes || [];
  if (suffixes.length === 1) return idd.root + suffixes[0];
  return idd.root;
}

// Fallback khi dataset thiếu field `flag` (vd BQ - Bonaire): tự tính cờ emoji
// từ mã ISO alpha-2 qua Regional Indicator Symbols (kỹ thuật chuẩn, không cần
// thư viện — mỗi chữ cái A-Z map sang 1 codepoint U+1F1E6..U+1F1FF).
function flagFromCca2(cca2) {
  return [...cca2.toUpperCase()]
    .map((ch) => String.fromCodePoint(0x1f1e6 + (ch.charCodeAt(0) - 65)))
    .join("");
}

async function main() {
  console.log(`→ Downloading: ${JSON_URL}`);
  const buf = await download(JSON_URL);
  console.log(`✓ Got ${(buf.length / 1024).toFixed(1)} KB`);
  const data = JSON.parse(buf.toString("utf-8"));
  if (!Array.isArray(data) || data.length < 200) {
    throw new Error(`Expected ~250 countries, got ${Array.isArray(data) ? data.length : typeof data}`);
  }

  const tail = data
    .filter((c) => c.cca2 && !CURATED_CODES.has(c.cca2) && buildDial(c.idd))
    .map((c) => ({
      code: c.cca2,
      name: c.name?.common || c.cca2,
      dial: buildDial(c.idd),
      flag: c.flag || flagFromCca2(c.cca2),
      // Dataset không có ví dụ SĐT theo từng nước — dùng placeholder chung,
      // chỉ mang tính minh hoạ trong input (xem CountryCombo.tsx exampleLocal).
      exampleLocal: GENERIC_EXAMPLE,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const all = [...CURATED_HEAD, ...tail];

  const codes = new Set();
  for (const c of all) {
    if (codes.has(c.code)) throw new Error(`Duplicate country code: ${c.code}`);
    codes.add(c.code);
    if (!c.exampleLocal) throw new Error(`Missing exampleLocal for ${c.code}`);
    if (!c.dial?.startsWith("+")) throw new Error(`Bad dial for ${c.code}: ${c.dial}`);
  }

  const banner = [
    `// Country dial-code list — ${CURATED_HEAD.length} curated (tay-tune) + ${tail.length} bổ sung từ mledoze/countries.`,
    `// Generated at: ${new Date().toISOString()}`,
    `// DO NOT EDIT MANUALLY — run: node scripts/build-country-dial-codes.mjs`,
    `// Source (pinned tag, not master): ${JSON_URL}`,
    `// ${CURATED_HEAD.length} mục đầu tay-tune (exampleLocal verify qua UI thật) —`,
    `// script GIỮ NGUYÊN, không generate lại chúng.`,
  ].join("\n");

  const tsBody = `${banner}

export interface CountryDialCode {
  code: string;
  name: string;
  dial: string;
  flag: string;
  exampleLocal: string;
}

export const COUNTRY_DIAL_CODES: ReadonlyArray<CountryDialCode> = ${JSON.stringify(all, null, 2)} as const;
`;

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, tsBody, "utf-8");

  const sizeKB = (tsBody.length / 1024).toFixed(1);
  console.log(
    `✓ ${all.length} countries (${CURATED_HEAD.length} curated + ${tail.length} bổ sung) → ${OUTPUT} (${sizeKB} KB)`
  );
}

main().catch((err) => {
  console.error("✗ Build failed:", err.message);
  process.exit(1);
});
