export function formatKrw(n: number | null | undefined): string {
  return typeof n === "number" ? `₩${n.toLocaleString("ko-KR")}` : "—";
}

export function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}
