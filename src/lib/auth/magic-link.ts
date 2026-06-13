/**
 * Magic-link auth (no passwords). We email the user a one-time link containing a
 * random token; we store only the token's hash. The same flow handles both
 * login and signup — we never reveal whether an email already has an account.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { randomToken, sha256Hex, newId } from "@/lib/crypto";
import { isoInSeconds, nowIso, isPast } from "@/lib/time";
import { sendEmail } from "@/lib/email/resend";
import { emailFooterHtml, emailFooterText } from "@/lib/email/footer";

const TOKEN_TTL_SECONDS = 60 * 15; // 15 minutes

/**
 * Create a magic link for `email`, persist its hash, and email the link.
 * Returns the raw URL too, so dev (no Resend key) can surface it.
 */
export async function createAndSendMagicLink(
  db: Db,
  env: CloudflareEnv,
  email: string,
): Promise<{ url: string; delivered: boolean }> {
  const normalized = email.trim().toLowerCase();

  // intent is informational only (login vs signup) — flow is identical.
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalized))
    .get();

  const token = randomToken();
  const tokenHash = await sha256Hex(token);

  await db.insert(schema.magicLinks).values({
    id: newId("ml"),
    email: normalized,
    tokenHash,
    intent: existing ? "login" : "signup",
    expiresAt: isoInSeconds(TOKEN_TTL_SECONDS),
  });

  const siteUrl = getSiteUrl(env);
  const url = `${siteUrl}/auth/callback?token=${token}`;
  const reason = "You're receiving this because someone entered this address to sign in to ChiroSmarts.";

  const result = await sendEmail(env, {
    to: normalized,
    subject: "Your ChiroSmarts sign-in link",
    text:
      `Sign in to ChiroSmarts:\n\n${url}\n\n` +
      `This link expires in 15 minutes and can be used once. ` +
      `If you didn't request it, you can ignore this email.` +
      emailFooterText(siteUrl, reason),
    html: magicLinkHtml(url, emailFooterHtml(siteUrl, reason)),
  });

  return { url, delivered: result.delivered };
}

/**
 * Verify a raw token from the callback URL. On success, marks the link consumed
 * and returns the associated email. Single-use and expiry are enforced here.
 */
export async function consumeMagicLink(
  db: Db,
  token: string,
): Promise<{ ok: true; email: string } | { ok: false; reason: string }> {
  if (!token) return { ok: false, reason: "missing token" };
  const tokenHash = await sha256Hex(token);

  const link = await db
    .select()
    .from(schema.magicLinks)
    .where(eq(schema.magicLinks.tokenHash, tokenHash))
    .get();

  if (!link) return { ok: false, reason: "invalid link" };
  if (link.consumedAt) return { ok: false, reason: "link already used" };
  if (isPast(link.expiresAt)) return { ok: false, reason: "link expired" };

  await db
    .update(schema.magicLinks)
    .set({ consumedAt: nowIso() })
    .where(eq(schema.magicLinks.id, link.id));

  return { ok: true, email: link.email };
}

function magicLinkHtml(url: string, footer = ""): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
  <h2>Sign in to ChiroSmarts</h2>
  <p>Click the button below to sign in. This link expires in 15 minutes and can be used once.</p>
  <p><a href="${url}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Sign in</a></p>
  <p style="color:#64748b;font-size:14px">Or paste this URL into your browser:<br>${url}</p>
  <p style="color:#94a3b8;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
  ${footer}
  </body></html>`;
}
