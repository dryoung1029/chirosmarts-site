/**
 * Send (or close) a support reply from the admin queue. Admin-guarded by
 * middleware. The body sent is whatever the owner has in the textarea — his
 * edits win over the draft every time.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { sendStudentReplyEmail } from "@/lib/email/support";
import { logEvent } from "@/lib/events";
import { nowIso } from "@/lib/time";

const schemaIn = z.object({
  id: z.string().min(1),
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  action: z.string().optional(),
});

const back = (msg: string) =>
  new Response(null, {
    status: 303,
    headers: { location: `/admin/support?msg=${encodeURIComponent(msg)}` },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const form = await request.formData();
  const parsed = schemaIn.safeParse({
    id: form.get("id"),
    subject: form.get("subject") ?? undefined,
    body: form.get("body") ?? undefined,
    action: form.get("action") ?? undefined,
  });
  if (!parsed.success) return back("Couldn't read that form.");
  const d = parsed.data;

  const row = await db
    .select()
    .from(schema.supportRequests)
    .where(eq(schema.supportRequests.id, d.id))
    .get();
  if (!row) return back("That request no longer exists.");

  if (d.action === "close") {
    await db
      .update(schema.supportRequests)
      .set({ status: "closed", updatedAt: nowIso() })
      .where(eq(schema.supportRequests.id, row.id));
    return back("Closed without replying.");
  }

  if (!d.subject || !d.body) return back("Add a subject and a reply first.");

  const out = await sendStudentReplyEmail(env, {
    to: row.email,
    subject: d.subject,
    body: d.body,
  });
  if (!out.delivered) return back(`Couldn't send: ${out.error ?? "unknown error"}`);

  await db
    .update(schema.supportRequests)
    .set({
      status: "sent",
      // Persist what was actually sent, not the original draft.
      draftSubject: d.subject,
      draftBody: d.body,
      sentAt: nowIso(),
      sentBy: locals.user?.email ?? "admin",
      updatedAt: nowIso(),
    })
    .where(eq(schema.supportRequests.id, row.id));

  await logEvent(db, {
    userId: row.userId,
    type: "support_reply_sent",
    payload: { requestId: row.id, category: row.category, approvedBy: locals.user?.email ?? "admin" },
  });

  return back(`Reply sent to ${row.email}.`);
};
