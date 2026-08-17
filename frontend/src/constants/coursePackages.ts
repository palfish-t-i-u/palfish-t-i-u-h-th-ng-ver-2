/** Gói học gợi ý — datalist trong B3 + PR drawer. Synced with CRM remaining_lesson export 20/06/2026. */
export const COURSE_PACKAGES = [
  // ── 2/W NEW ──────────────────────────────────────
  "2/W- NEW 24 PHI+2 HN",
  "2/W- NEW 24 PHI+2 HCM",
  "2/W- NEW 24 US-UK+1 HN",
  "2/W- NEW 32 PHI+3 HN",
  "2/W- NEW 32 US-UK+2 HN",
  "2/W- NEW 48 PHI+5 HN",
  "2/W- NEW 48 PHI+5 HCM",
  "2/W- NEW 48 US-UK+2 HN",
  "2/W- NEW 72 PHI+7",
  "2/W- NEW 72 US-UK+5",
  "2/W- NEW 96 PHI+10 HN",
  "2/W- NEW 96 PHI+10 HCM",
  "2/W- NEW 96 US-UK+5 HN",
  "2/W- NEW 144 PHI+15 HN",
  "2/W- NEW 192 PHI+20 HN",

  // ── 2/W UPSALE ──────────────────────────────────
  "2/W- UPSALE 24 PHI+2 HN",
  "2/W- UPSALE 24 PHI+2 HCM",
  "2/W- UPSALE 24 US-UK+1 HN",
  "2/W- UPSALE 32 PHI+3 HN",
  "2/W- UPSALE 32 US-UK+2 HN",
  "2/W- UPSALE 48 PHI+5 HN",
  "2/W- UPSALE 48 PHI+5 HCM",
  "2/W- UPSALE 48 US-UK+2 HN",
  "2/W- UPSALE 48 US-UK+2 HCM",
  "2/W- UPSALE 72 PHI+7",
  "2/W- UPSALE 72 US-UK+5",
  "2/W- UPSALE 96 PHI+10 HN",
  "2/W- UPSALE 96 PHI+10 HCM",
  "2/W- UPSALE 96 US-UK+5 HN",
  "2/W- UPSALE 144 PHI+15 HN",
  "2/W- UPSALE 192 PHI+20 HN",

  // ── 2/W REFER (giới thiệu) ─────────────────────
  "2/W- Both AB REFER 24 PHI+2 HN",
  "2/W- Both AB REFER 24 PHI+2 HCM",
  "2/W- Both AB REFER 24 US-UK+1 HN",
  "2/W- Both AB (A-PH) REFER 32 PHI+3",
  "2/W- Both AB (A-PH) REFER 32 US-UK+2",
  "2/W- Both AB REFER 48 PHI+5 HN",
  "2/W- Both AB REFER 48 PHI+5 HCM",
  "2/W- Both AB REFER 48 US-UK+2 HN",
  "2/W- Both AB (A-PH) REFER 72 PHI+7",
  "2/W- Both AB (A-PH) REFER 72 US-UK+5",
  "2/W- Both AB REFER 96 PHI+10 HN",
  "2/W- Both AB REFER 96 PHI+10 HCM",
  "2/W- Both AB REFER 96 US-UK+5 HN",
  "2/W- Both AB REFER 144 PHI+15 HN",
  "2/W- Both AB REFER 192 PHI+20 HN",
  "2/W- Only A REFER 24 PHI+2 HN",
  "2/W- Only A REFER 48 PHI+5 HN",
  "2/W- Only A REFER 96 PHI+10 HN",

  // ── 12/M (monthly) ─────────────────────────────
  "12/M - NEW 30 PHI+10 HN",
  "12/M - NEW 60 PHI+20 HN",
  "12/M - NEW 90 PHI+30 HN",
  "12/M - NEW 120 PHI+40 HN",
  "12/M - NEW 150 PHI+50 HN",
  "12/M - UPSALE 30 PHI+10 HN",
  "12/M - UPSALE 60 PHI+20 HN",
  "12/M - UPSALE 90 PHI+30 HN",
  "12/M - UPSALE 120 PHI+40 HN",
  "12/M - UPSALE 150 PHI+50 HN",
  "12/M - Both AB REFER 60 PHI +20 HN",
  "12/M - Only A REFER 30 PHI +10 HN",
  "12/M - Only A REFER 60 PHI +20 HN",

  // ── 3/W ─────────────────────────────────────────
  "3/W - NEW 24 PHI+2+2 HN",
  "3/W - NEW 48 PHI+5+5 HN",
  "3/W - NEW 96 PHI+10+10 HN",
  "3/W- UPSALE 120 US-UK+6 HN",

  // ── 8/M ─────────────────────────────────────────
  "8/M - NEW 30 US-UK+5 HN",
  "8/M - NEW 60 US-UK+10 HN",
  "8/M - NEW 120 US-UK+20 HN",
  "8/M - UPSALE 30 US-UK+5 HN",
  "8/M - UPSALE 60 US-UK+10 HN",
  "8/M - Only A REFER 30 US-UK+5 HN",

  // ── Special ─────────────────────────────────────
  "3/W- COMBO 48 US-UK+2 HN",
  "5/W- VIP 96 US-UK+5 HN",
] as const;

/**
 * Lọc danh sách gói học gợi ý theo nguồn khách (leadSource).
 * - gia_han     → chỉ gói chứa "UPSALE"
 * - gioi_thieu  → gói chứa "REFER" hoặc "NEW"
 * - khác/rỗng   → toàn bộ (fallback)
 */
export function filterPackagesByLeadSource(
  leadSource: string | undefined | null,
): readonly string[] {
  if (leadSource === "gia_han") {
    return COURSE_PACKAGES.filter((p) => p.includes("UPSALE"));
  }
  if (leadSource === "gioi_thieu") {
    return COURSE_PACKAGES.filter((p) => p.includes("REFER") || p.includes("NEW"));
  }
  return COURSE_PACKAGES;
}

