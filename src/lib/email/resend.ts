/**
 * Resend transactional email. ALL compliance/transactional mail (magic links,
 * receipts, certificates, renewal reminders) goes through here — never Brevo.
 *
 * Dev fallback: if RESEND_API_KEY is not set, we DON'T fail. We log the message
 * (including any magic-link URL) to the server console so the flow is testable
 * locally without an API key. The function returns `{ delivered: false }` in
 * that case so callers can surface the link in dev if they choose.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "ChiroSmarts <onboarding@resend.dev>";

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[]; // content = base64
}

export interface SendEmailResult {
  delivered: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(
  env: CloudflareEnv,
  args: SendEmailArgs,
): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM || DEFAULT_FROM;
  const replyTo = args.replyTo || env.EMAIL_REPLY_TO || undefined;

  // Sending real mail from Resend's shared sandbox domain is the #1 reason mail
  // lands in spam — it can't be SPF/DKIM-aligned to us. Flag it loudly in logs.
  if (apiKey && /@resend\.dev/i.test(from)) {
    console.warn(
      "[email] Sending from the Resend sandbox domain (resend.dev) — set EMAIL_FROM " +
        "to an address on a domain you've verified in Resend (SPF+DKIM+DMARC), or mail will be spam-filtered.",
    );
  }

  if (!apiKey) {
    // Local/dev path: no key configured. Log instead of sending.
    console.warn(
      `\n[email:dev] RESEND_API_KEY not set — not sending.\n` +
        `  to: ${args.to}\n  subject: ${args.subject}\n  text:\n${args.text}\n`,
    );
    return { delivered: false, error: "RESEND_API_KEY not set (dev fallback)" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(args.attachments ? { attachments: args.attachments } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend error ${res.status}: ${body}`);
      // Surface Resend's own message (e.g. sandbox "you can only send to your
      // own email") so admin diagnostics can show the real reason.
      return { delivered: false, error: `Resend ${res.status}: ${body.slice(0, 500)}` };
    }

    const data = (await res.json()) as { id?: string };
    return { delivered: true, id: data.id };
  } catch (e) {
    console.error("[email] Resend request failed", e);
    return { delivered: false, error: (e as Error).message };
  }
}
