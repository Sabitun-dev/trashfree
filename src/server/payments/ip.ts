// IP allow-list check for provider callbacks (exact IPv4 or CIDR such as "185.234.113.0/24").

function toInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function ipAllowed(ip: string | undefined, list: string[]): boolean {
  if (!list.length) return false;
  const v = ip ? toInt(ip.replace(/^::ffff:/, "")) : null;
  if (v === null) return false;
  return list.some((entry) => {
    const [base, bitsRaw] = entry.split("/");
    const b = toInt(base);
    if (b === null) return false;
    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    if (!(bits >= 0 && bits <= 32)) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((v & mask) >>> 0) === ((b & mask) >>> 0);
  });
}
