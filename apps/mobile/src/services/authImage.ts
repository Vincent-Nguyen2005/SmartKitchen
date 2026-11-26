/**
 * Where and how to load an image the gateway serves only to signed-in users (Hồ sơ avatars, Kho item photos).
 * Kept free of React Native imports so it runs under the plain Node unit tests; components/AuthImage.tsx uses it.
 *
 * Why not `<Image source={{ uri, headers }}>`: on Android (Expo Go) the image loader sent neither the Authorization
 * nor the ngrok header, so every avatar request got 401 and the initials stayed. The bytes are fetched with `fetch`
 * (which does send headers) and shown from a cached file (phones) or an object URL (web).
 */

export type ImageTarget =
  /** A public image on another site (e.g. a catalog picture): shown directly, no headers. */
  | { kind: "external"; uri: string }
  /** A gateway image: fetched with `headers`, cached on phones under `cacheName`. */
  | { kind: "gateway"; uri: string; headers: Record<string, string>; cacheName: string };

export type ImageTargetOptions = {
  /** Gateway origin, e.g. https://example.ngrok-free.dev (a trailing slash is ignored). */
  baseUrl: string;
  accessToken: string | null;
  /** Headers every gateway call adds (the ngrok one), from services/api gatewayHeaders(). */
  extraHeaders?: Record<string, string>;
};

/**
 * Cache file name for a gateway path. Uploaded files get a new random 128-bit name on every upload (avatars and Kho
 * photos), so the path itself is the version: a new photo is a new path and a new cache entry, never a stale one.
 */
export const cacheNameFor = (path: string): string => {
  const clean = path.split(/[?#]/)[0].replace(/^\/+/, "").replace(/[^A-Za-z0-9._-]+/g, "_");
  const query = path.includes("?") ? `_${simpleHash(path)}` : "";
  const base = clean.replace(/\.(jpe?g|png|webp)$/i, "");
  const extension = /\.(jpe?g|png|webp)$/i.exec(clean)?.[0].toLowerCase() ?? ".jpg";
  return `${base}${query}${extension}`.slice(-180);
};

/** Short stable hash (FNV-1a) so query strings still give distinct, file-safe names. */
const simpleHash = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
};

/** null when there is nothing to show (no URL, or a gateway image without a session). */
export function imageTarget(url: string | null | undefined, options: ImageTargetOptions): ImageTarget | null {
  const value = url?.trim();
  if (!value) return null;
  if (/^(https?:|data:|file:|blob:)/i.test(value)) {
    const base = options.baseUrl.replace(/\/+$/, "");
    // An absolute URL to our own gateway still needs the token.
    if (!base || !value.startsWith(`${base}/`)) return { kind: "external", uri: value };
    return gatewayTarget(value.slice(base.length), options);
  }
  return gatewayTarget(value.startsWith("/") ? value : `/${value}`, options);
}

const gatewayTarget = (path: string, options: ImageTargetOptions): ImageTarget | null => {
  if (!options.accessToken) return null;
  return {
    kind: "gateway",
    uri: `${options.baseUrl.replace(/\/+$/, "")}${path}`,
    headers: { Accept: "image/*", ...options.extraHeaders, Authorization: `Bearer ${options.accessToken}` },
    cacheName: cacheNameFor(path),
  };
};
