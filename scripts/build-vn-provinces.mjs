#!/usr/bin/env node
/**
 * Build static VN provinces data from vietnamese-provinces-database release.
 * Run: node scripts/build-vn-provinces.mjs
 * Output: frontend/src/data/vnProvinces.ts
 *
 * Spec: docs/superpowers/specs/2026-06-28-vn-provinces-static-migration-design.md
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import https from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// adm-zip is a CJS package installed in frontend/node_modules.
// We use createRequire anchored to frontend/package.json so Node resolves
// it from there regardless of where this script physically lives.
const require = createRequire(join(REPO_ROOT, "frontend", "package.json"));
const AdmZip = require("adm-zip");

const VERSION = "v4.0.0";
const ZIP_URL = `https://github.com/thanglequoc/vietnamese-provinces-database/releases/download/${VERSION}/vietnamese_provinces_database_${VERSION}_json.zip`;
// Fallback: the JSON data lives directly in the repo (no zip release asset for v4).
// Pinned to tag (not master) for reproducibility — update VERSION + this URL together.
const JSON_URL = `https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/${VERSION}/json/simplified_json_generated_data_vn_units.json`;
const OUTPUT = join(REPO_ROOT, "frontend/src/data/vnProvinces.ts");

const EXPECTED_PROVINCES = 34;
const MIN_WARDS = 3000;

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

async function fetchRaw() {
  // First try the zip release asset (would work if project adds one later)
  try {
    console.log(`→ Trying zip release: ${ZIP_URL}`);
    const zipBuf = await download(ZIP_URL);
    console.log(`✓ Got zip ${(zipBuf.length / 1024).toFixed(1)} KB`);

    const zip = new AdmZip(zipBuf);
    const entries = zip.getEntries().filter((e) => e.entryName.endsWith(".json"));
    if (entries.length === 0) throw new Error("No JSON file inside zip");
    const jsonEntry = entries.find((e) => /provinces/i.test(e.entryName)) || entries[0];
    console.log(`→ Extracting ${jsonEntry.entryName}`);
    return JSON.parse(jsonEntry.getData().toString("utf-8"));
  } catch (err) {
    console.warn(`⚠ Zip unavailable (${err.message}), falling back to raw JSON`);
  }

  // Fall back to raw JSON file in the repo
  console.log(`→ Downloading JSON: ${JSON_URL}`);
  const buf = await download(JSON_URL);
  console.log(`✓ Got ${(buf.length / 1024).toFixed(1)} KB`);
  return JSON.parse(buf.toString("utf-8"));
}

async function main() {
  const raw = await fetchRaw();

  // raw shape (PascalCase keys from this repo):
  // [{Code: "01", Name: "...", FullName: "...", Wards: [{Code, Name, ...}]}]
  // Parse defensively — log if shape differs.
  if (!Array.isArray(raw)) {
    console.error("Top-level JSON shape:", typeof raw, Object.keys(raw || {}).slice(0, 5));
    throw new Error("Expected array at top level");
  }

  // Normalise: accept either PascalCase or snake_case field names
  const getCode = (obj) => obj.code ?? obj.Code;
  // For provinces, prefer FullName (e.g. "Thành phố Hà Nội") over short Name ("Hà Nội").
  // This must match what the old provinces.open-api.vn API returned so existing PR records
  // (which store full names like "Thành phố Hà Nội") continue to resolve correctly.
  const getProvinceFullName = (obj) => obj.full_name ?? obj.FullName ?? obj.name ?? obj.Name;
  // For wards, FullName includes the ward type prefix (e.g. "Phường Ba Đình") — use Name
  // ("Ba Đình") which is what the old API returned for ward options.
  const getWardName = (obj) => obj.name ?? obj.Name;
  const getWards = (obj) => obj.wards ?? obj.Wards ?? [];

  const provinces = raw.map((p) => {
    const code = getCode(p);
    const name = getProvinceFullName(p);
    if (code == null || typeof name !== "string") {
      throw new Error(`Bad province shape: ${JSON.stringify(p).slice(0, 200)}`);
    }
    return { code: Number(code), name };
  });

  const wardsByProvinceCode = {};
  let totalWards = 0;
  for (const p of raw) {
    const code = Number(getCode(p));
    const wards = getWards(p);
    if (!Array.isArray(wards)) continue;
    const names = wards.map((w) => {
      const wName = getWardName(w);
      if (typeof wName !== "string") {
        throw new Error(`Bad ward shape in province ${code}: ${JSON.stringify(w).slice(0, 200)}`);
      }
      return wName;
    });
    names.sort((a, b) => a.localeCompare(b, "vi"));
    wardsByProvinceCode[code] = names;
    totalWards += names.length;
  }

  // Sanity checks
  if (provinces.length !== EXPECTED_PROVINCES) {
    throw new Error(`Expected ${EXPECTED_PROVINCES} provinces, got ${provinces.length}`);
  }
  if (totalWards < MIN_WARDS) {
    throw new Error(`Expected ≥${MIN_WARDS} wards, got ${totalWards}`);
  }

  // Sort provinces theo locale "vi", bỏ prefix "Tỉnh"/"Thành phố"
  const stripPrefix = (s) => s.replace(/^(Tỉnh|Thành phố)\s+/i, "");
  provinces.sort((a, b) => stripPrefix(a.name).localeCompare(stripPrefix(b.name), "vi"));

  const banner = [
    `// Generated from vietnamese-provinces-database ${VERSION}`,
    `// Generated at: ${new Date().toISOString()}`,
    `// DO NOT EDIT MANUALLY — run: node scripts/build-vn-provinces.mjs`,
    `// Source: ${JSON_URL}`,
  ].join("\n");

  const tsBody = `${banner}

export const VN_PROVINCES_VERSION = ${JSON.stringify(VERSION)} as const;

export interface Province {
  code: number;
  name: string;
}

export const provinces: ReadonlyArray<Province> = ${JSON.stringify(provinces, null, 2)} as const;

export const wardsByProvinceCode: Readonly<Record<number, ReadonlyArray<string>>> = ${JSON.stringify(wardsByProvinceCode, null, 2)} as const;
`;

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, tsBody, "utf-8");

  const sizeKB = (tsBody.length / 1024).toFixed(1);
  console.log(`✓ ${provinces.length} provinces, ${totalWards} wards → ${OUTPUT} (${sizeKB} KB)`);
}

main().catch((err) => {
  console.error("✗ Build failed:", err.message);
  process.exit(1);
});
