/**
 * Lifecycle flow emails (Resend) — welcome, review request, renewal reminder.
 * Triggered inline (welcome) or by the daily cron engine (review, renewal).
 * Copy lives here; tweak freely. All include the standard unsubscribe footer.
 */
import { getSiteUrl } from "@/lib/env";
import { sendEmail, type SendEmailResult } from "@/lib/email/resend";
import { emailFooterHtml, emailFooterText } from "@/lib/email/footer";

const wrap = (site: string, inner: string, reason: string) =>
  `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#13272B;line-height:1.55">${inner}${emailFooterHtml(site, reason)}</div>`;

const btn = (href: string, label: string) =>
  `<p style="margin:1.5rem 0"><a href="${href}" style="background:#0B6B63;color:#fff;text-decoration:none;padding:0.7rem 1.3rem;border-radius:8px;font-weight:600;display:inline-block">${label}</a></p>`;

export async function sendWelcomeEmail(
  env: CloudflareEnv,
  args: { to: string; name: string },
): Promise<SendEmailResult> {
  const site = getSiteUrl(env).replace(/\/$/, "");
  const hi = args.name ? `Hi ${args.name},` : "Hi there,";
  return sendEmail(env, {
    to: args.to,
    subject: "Welcome to ChiroSmarts",
    text:
      `${hi}\n\nWelcome to ChiroSmarts — Oregon's online training for chiropractic assistants.\n\n` +
      `Your account is ready. Pick up where you left off or browse courses here:\n${site}/dashboard\n\n` +
      `We'll email you a heads-up before your annual Oregon CA renewal is due, plus the occasional ` +
      `practical CE tip. You can unsubscribe from those anytime.\n\n— The ChiroSmarts team\n\n` +
      emailFooterText(site, "you created a ChiroSmarts account"),
    html: wrap(
      site,
      `<h2 style="color:#0B6B63">Welcome to ChiroSmarts</h2><p>${hi}</p>` +
        `<p>You're all set. ChiroSmarts is Oregon's online training for chiropractic assistants — initial certification and your annual CE, all in one place.</p>` +
        btn(`${site}/dashboard`, "Go to my dashboard") +
        `<p style="color:#51646A;font-size:0.9rem">We'll remind you before your annual Oregon CA renewal is due, plus send the occasional practical CE tip.</p>`,
      "you created a ChiroSmarts account",
    ),
  });
}

export async function sendReviewRequestEmail(
  env: CloudflareEnv,
  args: { to: string; name: string; courseTitle: string; reviewUrl: string },
): Promise<SendEmailResult> {
  const site = getSiteUrl(env).replace(/\/$/, "");
  const hi = args.name ? `Hi ${args.name},` : "Hi there,";
  return sendEmail(env, {
    to: args.to,
    subject: "Quick favor — how was your ChiroSmarts course?",
    text:
      `${hi}\n\nCongrats again on completing "${args.courseTitle}"!\n\n` +
      `Would you take 60 seconds to share how it went? Your words help other Oregon CAs ` +
      `decide to get certified:\n${args.reviewUrl}\n\nThank you!\n— The ChiroSmarts team\n\n` +
      emailFooterText(site, "you completed a ChiroSmarts course"),
    html: wrap(
      site,
      `<h2 style="color:#0B6B63">How was it?</h2><p>${hi}</p>` +
        `<p>Congrats again on completing <strong>${args.courseTitle}</strong>! Would you take 60 seconds to share how it went? Your words help other Oregon CAs decide to get certified.</p>` +
        btn(args.reviewUrl, "Leave a quick review") +
        `<p style="color:#51646A;font-size:0.9rem">Thank you — it genuinely helps.</p>`,
      "you completed a ChiroSmarts course",
    ),
  });
}

export async function sendRenewalReminderEmail(
  env: CloudflareEnv,
  args: { to: string; name: string; deadlineLabel: string; renewalUrl: string },
): Promise<SendEmailResult> {
  const site = getSiteUrl(env).replace(/\/$/, "");
  const hi = args.name ? `Hi ${args.name},` : "Hi there,";
  return sendEmail(env, {
    to: args.to,
    subject: `Your Oregon CA renewal is coming up (${args.deadlineLabel})`,
    text:
      `${hi}\n\nYour Oregon CA renewal deadline is ${args.deadlineLabel}. You need 6 CE hours ` +
      `to renew — including vitals and cultural competency.\n\n` +
      `Knock it out in one sitting with the ChiroSmarts Renewal Pack:\n${args.renewalUrl}\n\n` +
      `— The ChiroSmarts team\n\n` +
      emailFooterText(site, "you're a certified Oregon CA on our reminder list"),
    html: wrap(
      site,
      `<h2 style="color:#0B6B63">Renewal time is near</h2><p>${hi}</p>` +
        `<p>Your Oregon CA renewal deadline is <strong>${args.deadlineLabel}</strong>. You need <strong>6 CE hours</strong> to renew — including vitals and cultural competency.</p>` +
        `<p>Knock it all out in one sitting with the ChiroSmarts <strong>Renewal Pack</strong>:</p>` +
        btn(args.renewalUrl, "Get the Renewal Pack →") +
        `<p style="color:#51646A;font-size:0.9rem">Already renewed? You can ignore this — we'll catch you next year.</p>`,
      "you're a certified Oregon CA on our reminder list",
    ),
  });
}
