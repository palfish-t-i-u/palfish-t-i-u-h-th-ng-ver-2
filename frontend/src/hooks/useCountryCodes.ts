import { useEffect, useState } from "react";

export interface CountryCode {
  code: string;
  iso: string;
  name: string;
}

const FALLBACK: CountryCode[] = [
  { code: "+84", iso: "VN", name: "Vietnam" },
  { code: "+81", iso: "JP", name: "Japan" },
  { code: "+420", iso: "CZ", name: "Czechia" },
  { code: "+1", iso: "US", name: "United States" },
  { code: "+86", iso: "CN", name: "China" },
];

export function useCountryCodes() {
  const [codes, setCodes] = useState<CountryCode[]>(FALLBACK);
  const [phoneCode, setPhoneCode] = useState("+84");

  useEffect(() => {
    fetch("https://restcountries.com/v3.1/all?fields=name,cca2,idd")
      .then((r) => r.json())
      .then((data: Array<{ name: { common: string }; cca2: string; idd?: { root?: string; suffixes?: string[] } }>) => {
        const list: CountryCode[] = [];
        for (const item of data) {
          if (!item.idd?.root) continue;
          let code = item.idd.root;
          if (item.idd.suffixes?.length === 1) code += item.idd.suffixes[0];
          list.push({ code, iso: item.cca2, name: item.name.common });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        const vn = list.find((c) => c.iso === "VN");
        const rest = list.filter((c) => c.iso !== "VN");
        setCodes(vn ? [vn, ...rest] : list);
      })
      .catch(() => setCodes(FALLBACK));
  }, []);

  return { codes, phoneCode, setPhoneCode };
}
