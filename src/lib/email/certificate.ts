/**
 * Certificate-issued email (compliance mail → Resend, never Brevo). Links to the
 * public verification page and attaches the PDF so the student has a copy.
 */
import { getSiteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email/resend";

export async function sendCertificateEmail(
  env: CloudflareEnv,
  args: {
    to: string;
    legalName: string;
    courseTitle: string;
    certNumber: string;
    verificationCode: string;
    pdf: Uint8Array;
  },
): Promise<{ url: string; delivered: boolean }> {
  const site = getSiteUrl(env).replace(/\/$/, "");
  const url = `${site}/verify/${args.verificationCode}`;
  const subject = `Your ChiroSmarts certificate — ${args.courseTitle}`;
  const result = await sendEmail(env, {
    to: args.to,
    subject,
    text:
      `Congratulations, ${args.legalName}!\n\n` +
      `You've completed "${args.courseTitle}". Your certificate is attached.\n\n` +
      `Certificate No. ${args.certNumber}\n` +
      `Verify it anytime at:\n${url}\n`,
    html: certHtml(url, `${site}/email/certificate.png`, args),
    attachments: [
      { filename: `ChiroSmarts-Certificate-${args.certNumber}.pdf`, content: base64(args.pdf) },
    ],
  });
  return { url, delivered: result.delivered };
}

function certHtml(
  url: string,
  imgUrl: string,
  args: { legalName: string; courseTitle: string; certNumber: string },
): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
  <img src="${imgUrl}" alt="" width="300" style="display:block;max-width:300px;height:auto;margin:0 0 12px">
  <h2>Congratulations, ${args.legalName}! 🎉</h2>
  <p>You've completed <strong>${args.courseTitle}</strong>. Your certificate is attached to this email.</p>
  <p><strong>Certificate No.</strong> ${args.certNumber}</p>
  <p><a href="${url}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">View &amp; verify your certificate</a></p>
  <p style="color:#64748b;font-size:14px">Or paste this URL into your browser:<br>${url}</p>
  </body></html>`;
}

/** Base64-encode bytes without relying on Node Buffer. */
function base64(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    str += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(str);
}
