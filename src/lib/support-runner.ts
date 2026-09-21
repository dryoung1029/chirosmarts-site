/**
 * Support triage runner — the cron's unit of work.
 *
 * For each `new` support request: gather the student's account facts, ask the
 * model to classify + draft, then either
 *   (a) auto-send the reply (only when SUPPORT_AUTOSEND=on AND the category is
 *       on the narrow allow-list AND confidence is high AND nothing escalated), or
 *   (b) email Dr. Young the draft with a one-click approve link.
 * Either way the student's question never goes silently unanswered.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { nowIso } from "@/lib/time";
import { logEvent } from "@/lib/events";
import { adminEmails } from "@/lib/admin";
import { makeContactToken } from "@/lib/contact-token";
import { triageSupportRequest, mayAutoSend } from "@/lib/support-ai";
import { buildStudentContext } from "@/lib/support-context";
import { sendStudentReplyEmail, sendOwnerReviewEmail } from "@/lib/email/support";

export interface TriageRunResult {
  processed: number;
  autoSent: number;
  awaitingReview: number;
  escalated: number;
  errors: string[];
}

/** Where owner-review emails go. */
function ownerInbox(env: CloudflareEnv): string {
  return env.EMAIL_REPLY_TO || [...adminEmails(env)][0] || "";
}

export async function runSupportTriage(
  env: CloudflareEnv,
  db: Db,
  limit = 10,
): Promise<TriageRunResult> {
  const res: TriageRunResult = {
    processed: 0,
    autoSent: 0,
    awaitingReview: 0,
    escalated: 0,
    errors: [],
  };
  const site = getSiteUrl(env).replace(/\/$/, "");
  const owner = ownerInbox(env);

  const queue = await db
    .select()
    .from(schema.supportRequests)
    .where(eq(schema.supportRequests.status, "new"))
    .orderBy(asc(schema.supportRequests.createdAt))
    .limit(limit)
    .all();

  for (const row of queue) {
    try {
      const { userId, context } = await buildStudentContext(db, row.email);
      const t = await triageSupportRequest(env, {
        subject: row.subject,
        message: row.message,
        fromPage: row.fromPage,
        studentContext: context,
      });
      if (!t) {
        res.errors.push(`${row.id}: ANTHROPIC_API_KEY not set — cannot triage`);
        continue;
      }

      const auto = mayAutoSend(env, t);
      const status = t.escalate ? "escalated" : auto ? "sent" : "drafted";

      await db
        .update(schema.supportRequests)
        .set({
          userId: row.userId ?? userId,
          category: t.category,
          confidence: t.confidence,
          autoSendable: auto,
          escalationReason: t.escalationReason,
          draftSubject: t.draftSubject,
          draftBody: t.draftBody,
          helpArticles: t.helpArticles,
          model: t.model,
          status,
          sentAt: auto ? nowIso() : null,
          sentBy: auto ? "auto" : null,
          updatedAt: nowIso(),
        })
        .where(eq(schema.supportRequests.id, row.id));

      if (auto) {
        await sendStudentReplyEmail(env, {
          to: row.email,
          subject: t.draftSubject,
          body: t.draftBody,
        });
        await logEvent(db, {
          userId: userId ?? null,
          type: "support_auto_reply",
          payload: { requestId: row.id, category: t.category, confidence: t.confidence },
        });
        res.autoSent++;
      } else if (owner) {
        // One-click approval link, HMAC'd on the request id (no session needed
        // from a phone). Approving is the only action the link can take.
        const token = await makeContactToken(env, row.id);
        await sendOwnerReviewEmail(env, {
          to: owner,
          studentEmail: row.email,
          subject: row.subject,
          message: row.message,
          category: t.category,
          confidence: t.confidence,
          escalated: t.escalate,
          escalationReason: t.escalationReason,
          draftSubject: t.draftSubject,
          draftBody: t.draftBody,
          approveUrl: `${site}/admin/support/approve?id=${row.id}&t=${token}`,
          queueUrl: `${site}/admin/support`,
        });
        if (t.escalate) res.escalated++;
        else res.awaitingReview++;
      }
      res.processed++;
    } catch (e) {
      res.errors.push(`${row.id}: ${(e as Error).message}`);
    }
  }

  return res;
}
