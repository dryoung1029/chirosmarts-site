/**
 * Internal admin notifications ("someone signed up", "you made a sale"). Sent to
 * every address in ADMIN_EMAILS via Resend. Always BEST-EFFORT and non-blocking:
 * a notification failure must never break the user flow that triggered it.
 *
 * These are operational alerts to the business, NOT marketing or compliance
 * mail — kept deliberately plain.
 */
import { sendEmail } from "@/lib/email/resend";
import { getSiteUrl } from "@/lib/env";

export function adminRecipients(env: CloudflareEnv): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Send an operational alert to every admin. Never throws. */
export async function notifyAdmins(
  env: CloudflareEnv,
  msg: { subject: string; lines: string[]; ctaPath?: string },
): Promise<void> {
  try {
    const recipients = adminRecipients(env);
    if (recipients.length === 0) return;

    const site = getSiteUrl(env).replace(/\/$/, "");
    const text =
      msg.lines.join("\n") + (msg.ctaPath ? `\n\n${site}${msg.ctaPath}` : "");
    const html =
      msg.lines.map((l) => `<p style="margin:0 0 6px">${l}</p>`).join("") +
      (msg.ctaPath ? `<p style="margin-top:12px"><a href="${site}${msg.ctaPath}">Open in admin →</a></p>` : "");
    const subject = `[ChiroSmarts] ${msg.subject}`;

    for (const to of recipients) {
      try {
        await sendEmail(env, { to, subject, html, text });
      } catch {
        /* best-effort per recipient */
      }
    }
  } catch {
    /* never let a notification break the caller */
  }
}
