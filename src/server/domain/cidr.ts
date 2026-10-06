/** IPv4 CIDR matching for office-network detection. IPv4-mapped IPv6 addresses are accepted. */
function ipv4ToInt(ip: string): number | null {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const parts = v4.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
}

export function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const ipN = ipv4ToInt(ip.trim());
  const baseN = ipv4ToInt(base ?? "");
  if (ipN === null || baseN === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const size = 2 ** (32 - bits);
  return Math.floor(ipN / size) === Math.floor(baseN / size);
}

export const inAnyCidr = (ip: string, cidrs: string[]) => cidrs.some((c) => inCidr(ip, c));
