import { useMemo } from "react";
import Combobox from "../ui/Combobox";
import { provinces, wardsByProvinceCode } from "../../data/vnProvinces";

/**
 * Province + ward options from bundled static data — generated from
 * vietnamese-provinces-database v4.0.0 (đơn vị hành chính 2 cấp sau sáp nhập
 * 2025: tỉnh → phường/xã, bỏ cấp quận/huyện).
 *
 * Wards đã pre-sort alphabet (locale "vi") trong data file.
 * Source: docs/superpowers/specs/2026-06-28-vn-provinces-static-migration-design.md
 */
export function useProvinceWardSelect(province: string) {
  const wards = useMemo<string[]>(() => {
    if (!province) return [];
    const p = provinces.find((x) => x.name === province);
    if (!p) return [];
    return [...(wardsByProvinceCode[p.code] ?? [])];
  }, [province]);

  return { provinces, wards, loadingWards: false as const };
}

export default function VietnamAddressFields({
  province,
  ward,
  address,
  onProvinceChange,
  onWardChange,
  onAddressChange,
  streetPlaceholder = "Số nhà, đường (VD: 119 Phúc Xá)",
  requireProvince = false,
  requireWard = false,
  requireStreet = false,
}: {
  province: string;
  ward: string;
  address: string;
  onProvinceChange: (value: string) => void;
  onWardChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  streetPlaceholder?: string;
  requireProvince?: boolean;
  requireWard?: boolean;
  requireStreet?: boolean;
}) {
  const { provinces, wards, loadingWards } = useProvinceWardSelect(province);

  const provinceOptions = useMemo(() => {
    const stripPrefix = (s: string) => s.replace(/^(Tỉnh|Thành phố)\s+/i, "");
    return provinces
      .map((p) => ({ value: p.name, label: p.name }))
      .sort((a, b) => stripPrefix(a.label).localeCompare(stripPrefix(b.label), "vi"));
  }, [provinces]);
  const wardOptions = useMemo(
    () => wards.map((w) => ({ value: w, label: w })),
    [wards]
  );

  const handleProvinceChange = (value: string) => {
    onProvinceChange(value);
    if (value !== province) onWardChange("");
  };

  return (
    <div className="vn-address-fields">
      <div className="addr-row" style={{ marginBottom: 8 }}>
        <Combobox
          value={province}
          onChange={handleProvinceChange}
          options={provinceOptions}
          placeholder="Tỉnh / Thành phố"
          emptyLabel="— Bỏ chọn —"
          invalid={requireProvince && !province}
        />
        <Combobox
          value={ward}
          onChange={onWardChange}
          options={wardOptions}
          disabled={!province || loadingWards}
          placeholder={loadingWards ? "Đang tải phường/xã…" : "Phường / Xã"}
          emptyLabel="— Bỏ chọn —"
          invalid={requireWard && !ward}
        />
      </div>
      <input
        className={requireStreet && !address.trim() ? "gmv-field-invalid" : undefined}
        placeholder={streetPlaceholder}
        value={address}
        onChange={(e) => onAddressChange(e.target.value)}
      />
    </div>
  );
}
