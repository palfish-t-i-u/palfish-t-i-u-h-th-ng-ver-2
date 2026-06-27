import { useEffect, useMemo, useState } from "react";
import Combobox from "../ui/Combobox";

interface Province {
  code: number;
  name: string;
}

/**
 * Province + ward options from provinces.open-api.vn — API v2 (đơn vị hành
 * chính 2 cấp sau sáp nhập 2025: tỉnh → phường/xã, bỏ cấp quận/huyện).
 * Tên phường/xã được sort theo alphabet (locale "vi").
 */
export function useProvinceWardSelect(province: string) {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<string[]>([]);
  const [loadingWards, setLoadingWards] = useState(false);

  useEffect(() => {
    fetch("https://provinces.open-api.vn/api/v2/p/")
      .then((r) => r.json())
      .then((data: Province[]) => setProvinces(data))
      .catch(() => setProvinces([]));
  }, []);

  useEffect(() => {
    if (!province) {
      setWards([]);
      return;
    }
    const p = provinces.find((x) => x.name === province);
    if (!p) return;

    setLoadingWards(true);
    fetch(`https://provinces.open-api.vn/api/v2/p/${p.code}?depth=2`)
      .then((r) => r.json())
      .then((data: { wards?: { name: string }[] }) => {
        const names = (data.wards || []).map((w) => w.name);
        names.sort((a, b) => a.localeCompare(b, "vi"));
        setWards(names);
      })
      .catch(() => setWards([]))
      .finally(() => setLoadingWards(false));
  }, [province, provinces]);

  return { provinces, wards, loadingWards };
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
