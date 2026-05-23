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
    fetch("https://provinces.open-api.vn/api/p/")
      .then((r) => r.json())
      .then((data: Province[]) => setProvinces(data))
      .catch(() => setProvinces([]));
  }, []);

  // Bỏ cấp huyện — load thẳng phường/xã từ tỉnh (depth=3, flatten)
  const onTinhChange = useCallback(
    (name: string) => {
      setTinh(name);
      setPhuong("");
      setWards([]);
      const p = provinces.find((x) => x.name === name);
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
