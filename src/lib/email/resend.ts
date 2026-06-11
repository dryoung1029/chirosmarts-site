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
        ...(args.attachments ? { attachments: args.attachments } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend error ${res.status}: ${body}`);
      return { delivered: false, error: `Resend ${res.status}` };
    }

    const data = (await res.json()) as { id?: string };
    return { delivered: true, id: data.id };
  } catch (e) {
    console.error("[email] Resend request failed", e);
    return { delivered: false, error: (e as Error).message };
  }
}
