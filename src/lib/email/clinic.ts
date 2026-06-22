/**
 * Clinic-invite email. Like the magic link, the claim URL carries a one-time
 * token (we store only its hash) — clicking it proves the CA owns the address,
 * so it both authenticates them and joins them to the clinic.
 *
 * Dev fallback mirrors the magic link: with no RESEND_API_KEY the URL is logged
 * and returned so the inviting owner can copy it from the response.
 */
import { getSiteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email/resend";

export async function sendClinicInvite(
  env: CloudflareEnv,
  args: { to: string; clinicName: string; token: string; courseTitle?: string },
): Promise<{ url: string; delivered: boolean }> {
  const url = `${getSiteUrl(env)}/clinic/join?token=${args.token}`;
  const course = args.courseTitle ? `: ${args.courseTitle}` : "";
  const subject = `You're invited to train as a Chiropractic Assistant with ${args.clinicName}`;
  const result = await sendEmail(env, {
    to: args.to,
    subject,
    text:
      `${args.clinicName} has invited you to complete training on ChiroSmarts` +
      `${course}.\n\nAccept your invite and set up your ` +
      `account:\n\n${url}\n\nThis link expires in 30 days and can be used once.`,
    html: inviteHtml(url, args.clinicName, args.courseTitle),
  });
  return { url, delivered: result.delivered };
}

function inviteHtml(url: string, clinicName: string, courseTitle?: string): string {
  const course = courseTitle
    ? `<strong>${clinicName}</strong> has assigned you a seat in <strong>${courseTitle}</strong>.`
    : `<strong>${clinicName}</strong> has invited you to complete your Oregon
  Chiropractic Assistant training.`;
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
  <h2>You're invited to ChiroSmarts</h2>
  <p>${course}</p>
  <p><a href="${url}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Accept invite &amp; set up your account</a></p>
  <p style="color:#64748b;font-size:14px">Or paste this URL into your browser:<br>${url}</p>
  <p style="color:#94a3b8;font-size:13px">This link expires in 30 days and can be used once. If you weren't expecting it, you can ignore this email.</p>
  </body></html>`;
}
