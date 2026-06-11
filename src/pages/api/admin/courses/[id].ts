/** Admin: update course metadata (access enforced in middleware). */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { nowIso } from "@/lib/time";
import { logEvent } from "@/lib/events";

const Body = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  creditHours: z.coerce.number().min(0).max(1000),
  // Admins enter whole/decimal dollars; the DB stores cents (single source of
  // truth for every price display). Never hard-code a price anywhere else.
  priceDollars: z.coerce.number().min(0).max(100000),
  instructorName: z.string().trim().min(1),
  passThreshold: z.coerce.number().min(0).max(1),
  maxPlaybackRate: z.coerce.number().min(1).max(4),
  status: z.enum(["draft", "published", "archived"]),
});

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const form = Object.fromEntries(await request.formData());
  const parsed = Body.safeParse(form);
  if (!parsed.success) {
    return redirect(`/admin/content/${id}?done=Invalid+input`, 303);
  }
  const d = parsed.data;
  const priceCents = Math.round(d.priceDollars * 100);

  // requiredSeatMinutes: blank → NULL (no explicit exam floor).
  const rsmRaw = String((form as Record<string, unknown>).requiredSeatMinutes ?? "").trim();
  const rsmNum = rsmRaw === "" ? NaN : Math.floor(Number(rsmRaw));
  const requiredSeatMinutes = Number.isFinite(rsmNum) && rsmNum >= 0 ? rsmNum : null;

  const existing = await db
    .select({ priceCents: schema.courses.priceCents })
    .from(schema.courses)
    .where(eq(schema.courses.id, id))
    .get();
  if (!existing) return redirect("/admin/content", 303);

  await db
    .update(schema.courses)
    .set({
      title: d.title,
      description: d.description || null,
      creditHours: d.creditHours,
      priceCents,
      requiredSeatMinutes,
      instructorName: d.instructorName,
      passThreshold: d.passThreshold,
      maxPlaybackRate: d.maxPlaybackRate,
      status: d.status,
      updatedAt: nowIso(),
    })
    .where(eq(schema.courses.id, id));

  // Audit price changes — historical purchases keep the price they paid.
  if (priceCents !== existing.priceCents) {
    await logEvent(db, {
      userId: locals.user!.id,
      type: "course_price_changed",
      courseId: id,
      payload: { oldPriceCents: existing.priceCents, newPriceCents: priceCents },
    });
  }
  return redirect(`/admin/content/${id}?done=Course+saved`, 303);
};
