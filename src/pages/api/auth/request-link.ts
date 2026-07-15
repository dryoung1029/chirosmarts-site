import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/db/client";
import { createAndSendMagicLink } from "@/lib/auth/magic-link";
import { logEvent } from "@/lib/events";

const schema = z.object({
  email: z.string().email(),
  next: z.string().optional(),
});

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const form = await request.formData();
  const parsed = schema.safeParse({
    email: form.get("email"),
    next: form.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return redirect("/login?error=invalid+email", 303);
  }

  const db = getDb(env);
  const { url, delivered, error } = await createAndSendMagicLink(
    db,
    env,
    parsed.data.email,
  );

  // "sent=1" never reveals whether the email has an account — that's fine to
  // always claim regardless of delivery. A real Resend failure is different:
  // it happens indiscriminately (bad key, unverified domain, sandbox
  // restriction, rate limit) regardless of the address, so surfacing it
  // doesn't leak account existence — and pretending it succeeded just leaves
  // the user staring at an inbox that will never get anything.
  if (!delivered) {
    if (!env.RESEND_API_KEY) {
      // True dev: no key configured. Surface the link so the flow is testable.
      return redirect(`/login?sent=1&dev=${encodeURIComponent(url)}`, 303);
    }
    await logEvent(db, {
      type: "magic_link_send_failed",
      payload: { email: parsed.data.email, error },
    });
    return redirect("/login?senderror=1", 303);
  }
  return redirect("/login?sent=1", 303);
};
