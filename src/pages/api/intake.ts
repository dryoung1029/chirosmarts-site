import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { schema } from "@/db/client";
import { markIntakeComplete } from "@/lib/auth/users";
import { instantiatePath, type PathChoice } from "@/lib/roadmap";
import { createClinicForOwner } from "@/lib/clinic";
import { logEvent } from "@/lib/events";
import { nowIso } from "@/lib/time";
import { LEGAL } from "@/config/legal";
import { syncUserToBrevo } from "@/lib/brevo";

const intakeSchema = z
  .object({
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
  })
  .refine((d) => d.path !== "clinic_owner" || !!d.clinicName, {
    path: ["clinicName"],
    message: "Clinic name is required for clinic-owner accounts.",
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

  // Clinic owners get a clinic (with the owner as the first member) so they can
  // buy seats and invite their CAs from the dashboard.
  if (d.path === "clinic_owner" && d.clinicName) {
    const clinic = await createClinicForOwner(
      db,
      user.id,
      user.email,
      d.clinicName,
    );
    await logEvent(db, {
      userId: user.id,
      type: "clinic_created",
      payload: { clinicId: clinic.id, name: clinic.name },
    });
  }

  await logEvent(db, {
    userId: user.id,
    type: "intake_completed",
    payload: { path: d.path, marketingConsent: consented },
  });

  // Real-time marketing-list opt-in: push opted-in users straight to Brevo so
  // they're on the list immediately (the admin batch sync is now a backstop).
  // Best-effort — never block account creation on the marketing provider.
  if (consented) {
    try {
      await syncUserToBrevo(env, {
        email: user.email,
        role: d.path === "clinic_owner" ? "clinic_admin" : "student",
        birthMonth: d.birthMonth,
        clinicName: d.clinicName || null,
      });
    } catch {
      /* admin batch sync will pick it up */
    }
  }

  // Record agreement to the Terms + Privacy at account creation (PLAN.md Item 2).
  await logEvent(db, {
    userId: user.id,
    type: "terms_accepted",
    payload: {
      context: "signup",
      termsVersion: LEGAL.termsVersion,
      privacyVersion: LEGAL.privacyVersion,
    },
  });

  return redirect("/dashboard", 303);
};
