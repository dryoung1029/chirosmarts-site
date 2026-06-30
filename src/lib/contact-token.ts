/**
 * Stateless per-contact tokens for personalized email links (no DB lookup).
 * Used by the birth-month-capture link in the re-permission / renewal emails:
 * the link carries the contact's email + an HMAC token, verified here. Low
 * stakes (sets a renewal month), so a short HMAC over the email is sufficient.
 */
const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(env: CloudflareEnv, message: string): Promise<string> {
  const secret = env.CONTACT_TOKEN_SECRET || "chirosmarts-contact-token-fallback";
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message.toLowerCase().trim()));
  return b64url(sig).slice(0, 24);
}

export async function makeContactToken(env: CloudflareEnv, email: string): Promise<string> {
  return hmac(env, email);
}

export async function verifyContactToken(
  env: CloudflareEnv,
  email: string,
  token: string,
): Promise<boolean> {
  if (!email || !token) return false;
  const expected = await makeContactToken(env, email);
  // Constant-time-ish compare.
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/** The full birth-month-capture URL for a contact (used in emails / CSV export). */
export async function renewalSetupUrl(env: CloudflareEnv, siteUrl: string, email: string): Promise<string> {
  const t = await makeContactToken(env, email);
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/renewal/my-month?e=${encodeURIComponent(email)}&t=${t}`;
}
