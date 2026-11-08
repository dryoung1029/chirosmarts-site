import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/db/client";
import { createAndSendMagicLink } from "@/lib/auth/magic-link";
import { logEvent } from "@/lib/events";
import { and, eq, gt, sql } from "drizzle-orm";
import { schema as tables } from "@/db/client";
import { allowRequest } from "@/lib/rate-limit";
import { isoInSeconds } from "@/lib/time";

/** Per-address cap: sign-in emails to one inbox per hour. */
const LINKS_PER_EMAIL_PER_HOUR = 5;

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

  // Throttle before sending: per network (spraying many inboxes) and per
  // address (bombing one). The magic_links rows we already write are the
  // per-address counter. Same message either way, and it says nothing about
  // whether the address has an account.
  const email = parsed.data.email.trim().toLowerCase();
  const recent = await db
    .select({ n: sql<number>`count(*)` })
    .from(tables.magicLinks)
    .where(and(eq(tables.magicLinks.email, email), gt(tables.magicLinks.createdAt, isoInSeconds(-3600))))
    .get();
  if (
    (recent?.n ?? 0) >= LINKS_PER_EMAIL_PER_HOUR ||
    !(await allowRequest(db, request, "magic_link"))
  ) {
    return redirect("/login?throttled=1", 303);
  }

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
