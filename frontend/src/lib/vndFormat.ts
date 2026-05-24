export function digitsOnly(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export function formatVndInput(raw: string): string {
  const d = digitsOnly(raw);
  if (!d) return "";
  return Number(d).toLocaleString("vi-VN");
}

export function formatVndNumber(n: number): string {
  if (!n) return "";
  return Math.trunc(n).toLocaleString("vi-VN");
}

export function parseVndInput(formatted: string): number {
  const d = digitsOnly(formatted);
  return d ? parseInt(d, 10) : 0;
}
