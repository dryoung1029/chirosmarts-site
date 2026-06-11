import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/db/client";
import { createAndSendMagicLink } from "@/lib/auth/magic-link";

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
  const { url, delivered } = await createAndSendMagicLink(
    db,
    env,
    parsed.data.email,
  );

  // Always report "sent" — never reveal whether the email has an account.
  // In true dev (no Resend key configured), surface the link so it's testable.
  if (!delivered && !env.RESEND_API_KEY) {
    return redirect(`/login?sent=1&dev=${encodeURIComponent(url)}`, 303);
  }
  return redirect("/login?sent=1", 303);
};
