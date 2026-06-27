const ONES = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function readGroup(h: number, t: number, u: number, showZeroHundred: boolean): string {
  const parts: string[] = [];
  if (h > 0) {
    parts.push(ONES[h] + " trăm");
    if (t === 0 && u > 0) parts.push("lẻ");
  } else if (showZeroHundred) {
    parts.push("không trăm");
    if (t === 0 && u > 0) parts.push("lẻ");
  }
  if (t > 1) {
    parts.push(ONES[t] + " mươi");
    if (u === 1) parts.push("mốt");
    else if (u === 4 && t >= 2) parts.push("tư");
    else if (u === 5) parts.push("lăm");
    else if (u > 0) parts.push(ONES[u]);
  } else if (t === 1) {
    parts.push("mười");
    if (u === 5) parts.push("lăm");
    else if (u > 0) parts.push(ONES[u]);
  } else if (u > 0) {
    parts.push(ONES[u]);
  }
  return parts.join(" ");
}

const UNITS = ["", " nghìn", " triệu", " tỷ"];

export default function numberToVietnameseWords(n: number): string {
  if (!n || n < 0) return "";
  if (n === 0) return "không đồng";

  const groups: number[] = [];
  let v = Math.floor(n);
  while (v > 0) {
    groups.push(v % 1000);
    v = Math.floor(v / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const h = Math.floor(g / 100);
    const t = Math.floor((g % 100) / 10);
    const u = g % 10;
    const showZero = i < groups.length - 1;
    const text = readGroup(h, t, u, showZero);
    if (text) parts.push(text + (UNITS[i] || ""));
  }

  const result = parts.join(" ");
  return result.charAt(0).toUpperCase() + result.slice(1) + " đồng";
}
