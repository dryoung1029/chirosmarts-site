/**
 * Cloudflare Stream signed playback tokens.
 *
 * We sign short-lived RS256 JWTs in the Worker using a Stream signing key
 * (created once via the /stream/keys API), so we never call the Stream API per
 * playback request. The token replaces the video UID in the playback URLs and
 * authorizes HLS/iframe playback for a bounded window.
 *
 * Required secrets (see .dev.vars.example):
 *   CF_STREAM_CUSTOMER_CODE   – the customer-<code> playback subdomain
 *   CF_STREAM_SIGNING_KEY_ID  – the signing key id (becomes the JWT `kid`)
 *   CF_STREAM_SIGNING_KEY_JWK – base64-encoded JWK (RSA private key) from the API
 *
 * Without these, Stream is "not configured" and the player falls back to the
 * dev simulator so seat-time can still be exercised locally.
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 2; // 2h (Stream allows up to 24h)

export function isStreamConfigured(env: CloudflareEnv): boolean {
  return !!(
    env.CF_STREAM_CUSTOMER_CODE &&
    env.CF_STREAM_SIGNING_KEY_ID &&
    env.CF_STREAM_SIGNING_KEY_JWK
  );
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlJson(obj: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

/**
 * Produce a signed playback token for `videoUid`, valid for `ttlSeconds`.
 * Throws if Stream isn't configured (callers should check isStreamConfigured).
 */
export async function signStreamToken(
  env: CloudflareEnv,
  videoUid: string,
  ttlSeconds = TOKEN_TTL_SECONDS,
): Promise<string> {
  const kid = env.CF_STREAM_SIGNING_KEY_ID!;
  const jwk = JSON.parse(atob(env.CF_STREAM_SIGNING_KEY_JWK!)) as JsonWebKey;

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid };
  const payload = {
    sub: videoUid,
    kid,
    exp: now + ttlSeconds,
    nbf: now - 5, // small skew tolerance
  };

  const signingInput = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

/**
 * Whether the Stream MANAGEMENT API (account id + API token) is available. This
 * is separate from playback signing — it lets the Worker read a video's true
 * duration when an admin attaches an existing Stream UID to a lesson.
 */
export function isStreamManagementConfigured(env: CloudflareEnv): boolean {
  return !!(env.CF_ACCOUNT_ID && env.CF_STREAM_API_TOKEN);
}

/**
 * Read a Stream video's true runtime (seconds) via the management API. Used when
 * registering an existing video on a lesson — `duration_seconds` is the seat-time
 * gate's denominator, so it must be Stream's real value, never a guess.
 */
export async function fetchStreamDuration(
  env: CloudflareEnv,
  uid: string,
): Promise<{ ok: true; duration: number } | { ok: false; error: string }> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}`,
    { headers: { Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}` } },
  );
  const data = (await res.json().catch(() => ({}))) as any;
  if (res.status === 404 || data?.success === false) {
    return { ok: false, error: `No Stream video found for UID "${uid}" (check the UID).` };
  }
  const r = data?.result;
  if (!r?.readyToStream) {
    return { ok: false, error: `Video "${uid}" is still processing — try again shortly.` };
  }
  const duration = Math.round(r.duration ?? 0);
  if (!duration || duration <= 0) {
    return { ok: false, error: `Stream reports a 0s duration for "${uid}".` };
  }
  return { ok: true, duration };
}

const STREAM_MGMT = "https://api.cloudflare.com/client/v4";
const mgmtHeaders = (env: CloudflareEnv) => ({
  Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}`,
});

export interface StreamCaption {
  language: string;
  label?: string;
  generated?: boolean;
  status?: "inprogress" | "ready" | "error";
}

/** List the caption tracks on a Stream video (management API). */
export async function listStreamCaptions(
  env: CloudflareEnv,
  uid: string,
): Promise<StreamCaption[]> {
  const res = await fetch(
    `${STREAM_MGMT}/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}/captions`,
    { headers: mgmtHeaders(env) },
  );
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || data?.success === false) {
    throw new Error(`Stream captions list failed: ${JSON.stringify(data?.errors ?? data)}`);
  }
  return (data?.result ?? []) as StreamCaption[];
}

/** Kick off AI caption generation for a language (returns immediately). */
export async function generateStreamCaption(
  env: CloudflareEnv,
  uid: string,
  language = "en",
): Promise<void> {
  const res = await fetch(
    `${STREAM_MGMT}/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}/captions/${language}/generate`,
    { method: "POST", headers: mgmtHeaders(env) },
  );
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || data?.success === false) {
    throw new Error(`Stream caption generate failed: ${JSON.stringify(data?.errors ?? data)}`);
  }
}

/** Download a generated caption as WebVTT text. */
export async function fetchStreamCaptionVtt(
  env: CloudflareEnv,
  uid: string,
  language = "en",
): Promise<string> {
  const res = await fetch(
    `${STREAM_MGMT}/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}/captions/${language}/vtt`,
    { headers: mgmtHeaders(env) },
  );
  if (!res.ok) throw new Error(`Stream caption VTT download failed (HTTP ${res.status}).`);
  return res.text();
}

/** Whether a video has finished processing, plus its true runtime (seconds). */
export async function fetchStreamVideoStatus(
  env: CloudflareEnv,
  uid: string,
): Promise<{ found: boolean; ready: boolean; duration: number }> {
  const res = await fetch(`${STREAM_MGMT}/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}`, {
    headers: mgmtHeaders(env),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (res.status === 404 || data?.success === false) {
    return { found: false, ready: false, duration: 0 };
  }
  const r = data?.result;
  const duration = Math.round(r?.duration ?? 0);
  return { found: true, ready: !!r?.readyToStream && duration > 0, duration };
}

export interface StreamPlaybackUrls {
  iframe: string;
  hls: string;
  dash: string;
  thumbnail: string;
}

/** Build the playback URLs for a signed token (or a raw uid in dev). */
export function streamPlaybackUrls(
  env: CloudflareEnv,
  tokenOrUid: string,
): StreamPlaybackUrls {
  const base = `https://${env.CF_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${tokenOrUid}`;
  return {
    iframe: `${base}/iframe`,
    hls: `${base}/manifest/video.m3u8`,
    dash: `${base}/manifest/video.mpd`,
    thumbnail: `${base}/thumbnails/thumbnail.jpg`,
  };
}
