import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/db/client";
import { sendEmail } from "@/lib/email/resend";
import { adminEmails } from "@/lib/admin";
import { logEvent } from "@/lib/events";

const schema = z.object({
  email: z.string().email(),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  from: z.string().max(200).optional(),
  website: z.string().optional(), // honeypot
});

/** Where support messages are delivered. Falls back to the admin allowlist. */
function supportInbox(env: CloudflareEnv): string {
  if (env.EMAIL_REPLY_TO) return env.EMAIL_REPLY_TO;
  const admins = [...adminEmails(env)];
  return admins[0] ?? "contact@chirosmarts.com";
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const form = await request.formData();
  const parsed = schema.safeParse({
    email: form.get("email"),
    subject: form.get("subject"),
    message: form.get("message"),
    from: form.get("from") ?? undefined,
    website: form.get("website") ?? undefined,
  });

  if (!parsed.success) {
    return redirect(
      "/help/contact?error=" +
        encodeURIComponent("Please enter your email, a subject, and a message."),
      303,
    );
  }

  const d = parsed.data;

  // Honeypot tripped → silently accept without sending (don't tip off bots).
  if (d.website && d.website.trim() !== "") {
    return redirect("/help/contact?sent=1", 303);
  }

  // A signed-in user can't spoof someone else's address; use the session email.
  const replyEmail = locals.user?.email ?? d.email;
  const who = locals.user
    ? `${locals.user.email} (signed in, role: ${locals.user.role})`
    : `${d.email} (not signed in)`;

  const lines = [
    `From: ${who}`,
    d.from ? `Page: ${d.from}` : null,
    `Subject: ${d.subject}`,
    "",
    d.message,
  ].filter(Boolean);
  const text = lines.join("\n");
  const html =
    `<p><strong>From:</strong> ${who}</p>` +
    (d.from ? `<p><strong>Page:</strong> ${d.from}</p>` : "") +
    `<p><strong>Subject:</strong> ${d.subject}</p>` +
    `<hr><p style="white-space:pre-wrap">${d.message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</p>`;

  const result = await sendEmail(env, {
    to: supportInbox(env),
    subject: `[Support] ${d.subject}`,
    text,
    html,
    replyTo: replyEmail,
  });

  // Record the request in the audit trail regardless of delivery outcome.
  const db = getDb(env);
  await logEvent(db, {
    userId: locals.user?.id ?? null,
    type: "support_request",
    payload: {
      email: replyEmail,
      subject: d.subject,
      from: d.from ?? null,
      delivered: result.delivered,
      error: result.error ?? null,
    },
  });

  if (!result.delivered) {
    return redirect(
      "/help/contact?error=" +
        encodeURIComponent(
          "We couldn't send your message right now. Please email " +
            supportInbox(env) +
            " directly.",
        ),
      303,
    );
  }

  return redirect("/help/contact?sent=1", 303);
};
