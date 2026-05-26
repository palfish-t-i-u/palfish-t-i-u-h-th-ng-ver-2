import { useEffect, useState } from "react";

interface Province {
  code: number;
  name: string;
}

/** Province + ward options from provinces.open-api.vn (same source as Tab1Form). */
export function useProvinceWardSelect(province: string) {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<string[]>([]);
  const [loadingWards, setLoadingWards] = useState(false);

  useEffect(() => {
    fetch("https://provinces.open-api.vn/api/p/")
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
    fetch(`https://provinces.open-api.vn/api/p/${p.code}?depth=3`)
      .then((r) => r.json())
      .then((data: { districts: { wards: { name: string }[] }[] }) => {
        const allWards = (data.districts || []).flatMap((d) =>
          (d.wards || []).map((w) => w.name)
        );
        setWards(allWards);
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
}: {
  province: string;
  ward: string;
  address: string;
  onProvinceChange: (value: string) => void;
  onWardChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  streetPlaceholder?: string;
}) {
  const { provinces, wards, loadingWards } = useProvinceWardSelect(province);

  const handleProvinceChange = (value: string) => {
    onProvinceChange(value);
    if (value !== province) onWardChange("");
  };

  return (
    <div className="vn-address-fields">
      <div className="addr-row" style={{ marginBottom: 8 }}>
        <select
          value={province}
          onChange={(e) => handleProvinceChange(e.target.value)}
          style={{ width: "100%" }}
        >
          <option value="">Tỉnh / Thành phố (tùy chọn)</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={ward}
          disabled={!province || loadingWards}
          onChange={(e) => onWardChange(e.target.value)}
          style={{ width: "100%" }}
        >
          <option value="">
            {loadingWards ? "Đang tải phường/xã…" : "Phường / Xã (tùy chọn)"}
          </option>
          {wards.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>
      <input
        placeholder={streetPlaceholder}
        value={address}
        onChange={(e) => onAddressChange(e.target.value)}
      />
    </div>
  );
}
