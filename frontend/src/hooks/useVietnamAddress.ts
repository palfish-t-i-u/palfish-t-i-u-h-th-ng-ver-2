import { useCallback, useEffect, useState } from "react";

interface Province {
  code: number;
  name: string;
}

export function useVietnamAddress() {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<string[]>([]);
  const [tinh, setTinh] = useState("");
  const [phuong, setPhuong] = useState("");
  const [chiTiet, setChiTiet] = useState("");
  const [loadingWards, setLoadingWards] = useState(false);

  useEffect(() => {
    fetch("https://provinces.open-api.vn/api/v2/p/")
      .then((r) => r.json())
      .then((data: Province[]) => setProvinces(data))
      .catch(() => setProvinces([]));
  }, []);

  // Đơn vị hành chính 2 cấp (sáp nhập 2025): tỉnh → phường/xã, không còn quận/huyện.
  // depth=2 trả thẳng data.wards; sort alphabet (locale "vi").
  const onTinhChange = useCallback(
    (name: string) => {
      setTinh(name);
      setPhuong("");
      setWards([]);
      const p = provinces.find((x) => x.name === name);
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
    },
    [provinces]
  );

  function fullAddress(): string {
    const parts = [chiTiet, phuong, tinh].filter(Boolean);
    return parts.join(", ");
  }

  function setChiTietMatched(value: string) {
    setChiTiet(value);
  }

  function reset() {
    setTinh("");
    setPhuong("");
    setChiTiet("");
    setWards([]);
  }

  return {
    provinces,
    wards,
    tinh,
    quan: "",
    phuong,
    chiTiet,
    setPhuong,
    setChiTiet,
    setChiTietMatched,
    onTinhChange,
    fullAddress,
    reset,
    loadingWards,
    // giữ lại để không vỡ code cũ dùng các field này
    districts: [],
    loadingDistricts: false,
    onQuanChange: (_: string) => {},
  };
}
