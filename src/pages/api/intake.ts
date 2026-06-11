import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { schema } from "@/db/client";
import { markIntakeComplete } from "@/lib/auth/users";
import { instantiatePath, type PathChoice } from "@/lib/roadmap";
import { logEvent } from "@/lib/events";
import { nowIso } from "@/lib/time";

const intakeSchema = z.object({
  legalName: z.string().trim().min(1, "Please enter your legal name."),
  displayName: z.string().trim().optional(),
  path: z.enum(["initial", "renewal", "clinic_owner"]),
  birthMonth: z.coerce.number().int().min(1).max(12),
  clinicName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  supervisingDcName: z.string().trim().optional(),
  supervisingDcLicense: z.string().trim().optional(),
  supervisingDcEmail: z.string().trim().optional(),
  marketingConsent: z.string().optional(), // "yes" when checked
});

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect("/login", 302);

  const env = locals.runtime.env;
  const db = getDb(env);
  const form = await request.formData();

  const parsed = intakeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Please check the form.";
    return redirect(`/intake?error=${encodeURIComponent(msg)}`, 303);
  }
  const d = parsed.data;
  const consented = d.marketingConsent === "yes";

  await db
    .update(schema.users)
    .set({
      legalName: d.legalName,
      displayName: d.displayName || null,
      birthMonth: d.birthMonth,
      clinicName: d.clinicName || null,
      phone: d.phone || null,
      supervisingDcName: d.supervisingDcName || null,
      supervisingDcLicense: d.supervisingDcLicense || null,
      supervisingDcEmail: d.supervisingDcEmail || null,
      marketingConsent: consented,
      marketingConsentAt: consented ? nowIso() : null,
      // Clinic owners are clinic_admins; everyone else stays a student.
      role: d.path === "clinic_owner" ? "clinic_admin" : "student",
      updatedAt: nowIso(),
    })
    .where(eq(schema.users.id, user.id));

  await markIntakeComplete(db, user.id);
  await instantiatePath(db, user.id, d.path as PathChoice);
  await logEvent(db, {
    userId: user.id,
    type: "intake_completed",
    payload: { path: d.path, marketingConsent: consented },
  });

  return redirect("/dashboard", 303);
};
