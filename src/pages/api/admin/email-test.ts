/**
 * Admin: send a diagnostic test email and report the real result (access
 * enforced in middleware). Lets the owner confirm whether transactional mail
 * actually leaves the building — and see Resend's own error (e.g. the sandbox
 * "you can only send to your own email" restriction) — without digging in logs.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { sendEmail } from "@/lib/email/resend";

const Body = z.object({ to: z.string().email() });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "Enter a valid email address." }, 400);

  const result = await sendEmail(env, {
    to: parsed.data.to,
    subject: "ChiroSmarts email test",
    text:
      "This is a test message from the ChiroSmarts admin diagnostics.\n\n" +
      "If you received it, transactional email is working.",
    html:
      "<p>This is a test message from the ChiroSmarts admin diagnostics.</p>" +
      "<p>If you received it, transactional email is working.</p>",
  });

  return json({
    delivered: result.delivered,
    id: result.id ?? null,
    error: result.error ?? null,
    from: env.EMAIL_FROM || "ChiroSmarts <onboarding@resend.dev> (default sandbox)",
    hasKey: !!env.RESEND_API_KEY,
  });
};
