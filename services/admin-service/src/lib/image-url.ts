/**
 * Validation for pasted ingredient image links. The server only stores the string; it never
 * fetches, downloads or proxies it (no SSRF surface). Clients load the image directly.
 */
export const MAX_IMAGE_URL_LENGTH = 2048;

const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const isPrivateIpv4 = (host: string): boolean => {
  const match = ipv4.exec(host);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return a === 10 // 10.0.0.0/8
    || a === 127 // loopback
    || a === 0 // "this network"
    || (a === 172 && b >= 16 && b <= 31) // 172.16.0.0/12
    || (a === 192 && b === 168) // 192.168.0.0/16
    || (a === 169 && b === 254) // link-local
    || (a === 100 && b >= 64 && b <= 127); // carrier-grade NAT
};

const isPrivateIpv6 = (host: string): boolean => {
  if (!host.startsWith("[")) return false;
  const address = host.slice(1, -1).toLowerCase();
  if (address === "::1" || address === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(address)) return true; // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(address)) return true; // fe80::/10 link-local
  const mapped = /^::ffff:(.+)$/.exec(address); // IPv4-mapped, e.g. ::ffff:7f00:1
  return mapped !== null;
};

/** Returns null when the URL is acceptable, otherwise a short reason. */
export const imageUrlProblem = (value: string): string | null => {
  if (value.length > MAX_IMAGE_URL_LENGTH) return `Image URL must be at most ${MAX_IMAGE_URL_LENGTH} characters`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Image URL is not a valid URL";
  }
  if (url.protocol !== "https:") return "Image URL must use https";
  if (url.username || url.password) return "Image URL must not contain credentials";
  // WHATWG URL normalises hosts, so 0x7f.1, 2130706433 and 127.1 all become 127.0.0.1 here.
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return "Image URL must not point to a local host";
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) return "Image URL must not point to a private network address";
  return null;
};
