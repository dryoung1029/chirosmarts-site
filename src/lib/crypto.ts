/**
 * Small crypto helpers built on the Web Crypto API (available in Cloudflare
 * Workers and Node 22). Used for magic-link tokens and session tokens.
 *
 * Pattern: we hand the user a high-entropy RANDOM token (in the magic-link URL
 * or the session cookie) but store only its SHA-256 hash in D1. A database leak
 * therefore never exposes a usable token.
 */

const encoder = new TextEncoder();

/** A URL-safe random token (default 32 bytes ≈ 43 chars base64url). */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

/** Hex SHA-256 of the input string. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A short, unguessable id (e.g. for primary keys). */
export function newId(prefix: string): string {
  return `${prefix}_${randomToken(12)}`;
}

/** A human-friendly, unambiguous code (e.g. certificate verification codes). */
export function readableCode(len = 10): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I,L,O,0,1
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => alphabet[b % alphabet.length]).join("");
}

function base64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
