import React, { useEffect, useRef, useState } from "react";
import { Image, Platform, type ImageResizeMode, type ImageStyle, type StyleProp } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { GATEWAY_BASE_URL, gatewayFetch, gatewayHeaders } from "../services/api";
import { imageTarget, type ImageTarget } from "../services/authImage";

/**
 * Images the gateway serves only to signed-in users (Hồ sơ avatars, Gia đình member avatars, Kho item photos), and
 * public images on other sites. Gateway images are fetched with the token and the ngrok header (see
 * services/authImage.ts for why `<Image headers>` is not used), then shown from a cache file on phones or an object
 * URL on web. While loading, and if anything fails, `fallback` is shown (initials / placeholder), never a broken image.
 */

const CACHE_FOLDER = "auth-images";
/** Phones: gateway path → cached file URI, so lists and screens reuse a photo without touching the disk again. */
const memoryCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

/** Through the shared gatewayFetch: the newest token, and a 401 refreshes the session once and retries once. */
const download = async (target: Extract<ImageTarget, { kind: "gateway" }>): Promise<Uint8Array> => {
  const { Authorization: token, ...headers } = target.headers;
  const response = await gatewayFetch(target.path, { headers, accessToken: token?.replace(/^Bearer /, ""), timeoutMs: 30_000 });
  if (!response.ok) throw new Error(`Image request failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("Empty image");
  return bytes;
};

/** Phones: the cached file for this image, downloading it once (files are immutable: a new photo is a new path). */
const cachedFileUri = (target: Extract<ImageTarget, { kind: "gateway" }>): Promise<string> => {
  const known = memoryCache.get(target.cacheName);
  if (known) return Promise.resolve(known);
  const pending = inFlight.get(target.cacheName);
  if (pending) return pending;
  const work = (async () => {
    const folder = new Directory(Paths.cache, CACHE_FOLDER);
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    const file = new File(folder, target.cacheName);
    if (!file.exists || file.size === 0) {
      const bytes = await download(target);
      try {
        await file.write(bytes);
      } catch (error) {
        if (file.exists) file.delete();
        throw error;
      }
    }
    memoryCache.set(target.cacheName, file.uri);
    return file.uri;
  })().finally(() => inFlight.delete(target.cacheName));
  inFlight.set(target.cacheName, work);
  return work;
};

/** Drops a cached file that would not display (corrupt or partial), so the next render downloads it again. */
const forget = (target: ImageTarget | null) => {
  if (target?.kind !== "gateway" || Platform.OS === "web") return;
  memoryCache.delete(target.cacheName);
  try {
    const file = new File(new Directory(Paths.cache, CACHE_FOLDER), target.cacheName);
    if (file.exists) file.delete();
  } catch {
    // Best effort only.
  }
};

type LoadState = { key: string | null; uri: string | null; failed: boolean };

/** The URI to render for `url` (null while loading or when there is nothing to show) and whether it failed. */
export function useAuthImageUri(url: string | null | undefined, accessToken: string | null): { target: ImageTarget | null; uri: string | null; failed: boolean; markFailed: () => void } {
  const target = imageTarget(url, { baseUrl: GATEWAY_BASE_URL, accessToken, extraHeaders: gatewayHeaders() });
  const key = target ? (target.kind === "gateway" ? target.cacheName : target.uri) : null;
  const [state, setState] = useState<LoadState>(() => ({
    key,
    uri: target?.kind === "external" ? target.uri : target && Platform.OS !== "web" ? memoryCache.get(target.cacheName) ?? null : null,
    failed: false,
  }));

  // Key of the image currently shown; a token refresh must not reload (and flicker) an image that is already up.
  const shown = useRef<string | null>(null);
  shown.current = state.key === key && state.uri && !state.failed ? key : null;

  useEffect(() => {
    if (!target) { setState({ key, uri: null, failed: false }); return; }
    if (shown.current === key) return;
    if (target.kind === "external") { setState({ key, uri: target.uri, failed: false }); return; }
    let active = true;
    let objectUrl: string | null = null;
    const cached = Platform.OS === "web" ? undefined : memoryCache.get(target.cacheName);
    setState({ key, uri: cached ?? null, failed: false });
    if (cached) return;
    const load = Platform.OS === "web"
      ? download(target).then((bytes) => {
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
        if (!active) URL.revokeObjectURL(objectUrl);
        return objectUrl;
      })
      : cachedFileUri(target);
    load
      .then((uri) => { if (active) setState({ key, uri, failed: false }); })
      .catch(() => { if (active) setState({ key, uri: null, failed: true }); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // The token only matters for a download; a new token retries an image that failed (e.g. after a 401).
  }, [key, accessToken]);

  // Until the effect runs for a new URL, never show the previous image (e.g. right after a new upload).
  const current = state.key === key ? state : { key, uri: null, failed: false };
  return {
    target,
    uri: current.uri,
    failed: current.failed,
    markFailed: () => {
      forget(target);
      setState({ key, uri: null, failed: true });
    },
  };
}

type Props = {
  url: string | null | undefined;
  accessToken: string | null;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel: string;
  resizeMode?: ImageResizeMode;
  /** Shown while loading, when there is no image, and when it fails. */
  fallback: React.ReactElement;
};

export default function AuthImage({ url, accessToken, style, accessibilityLabel, resizeMode = "cover", fallback }: Props): React.JSX.Element {
  const { uri, failed, markFailed } = useAuthImageUri(url, accessToken);
  if (!uri || failed) return fallback;
  return <Image accessibilityLabel={accessibilityLabel} source={{ uri }} onError={markFailed} resizeMode={resizeMode} style={style} />;
}
