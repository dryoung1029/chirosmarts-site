/**
 * Support-desk emails: the AI reply that goes to a student, and the review
 * request that goes to Dr. Young.
 *
 * The student-facing reply carries NO marketing footer and no unsubscribe — it
 * is a direct answer to a question they asked, sent with reply-to set to the
 * support inbox so a follow-up lands in a human's hands.
 */
import { getSiteUrl } from "@/lib/env";
import { sendEmail, type SendEmailResult } from "@/lib/email/resend";

const esc = (s: string) =>
  s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);

/** Plain-text body → simple HTML paragraphs, links preserved. */
function paragraphs(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 1rem">${esc(p).replace(/\n/g, "<br>").replace(
          /(https?:\/\/[^\s<]+)/g,
          '<a href="$1" style="color:#0B6B63">$1</a>',
        )}</p>`,
    )
    .join("");
}

const shell = (inner: string) =>
  `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#13272B;line-height:1.55">${inner}</div>`;

export async function sendStudentReplyEmail(
  env: CloudflareEnv,
  args: { to: string; subject: string; body: string },
): Promise<SendEmailResult> {
  const site = getSiteUrl(env).replace(/\/$/, "");
  return sendEmail(env, {
    to: args.to,
    subject: args.subject,
    replyTo: env.EMAIL_REPLY_TO || undefined,
    text: `${args.body.trim()}\n\n—\nChiroSmarts · ${site}`,
    html: shell(
      paragraphs(args.body) +
        `<p style="color:#51646A;font-size:0.85rem;border-top:1px solid #E3E8E9;padding-top:0.75rem;margin-top:1.5rem">ChiroSmarts · <a href="${site}" style="color:#0B6B63">${site.replace(/^https?:\/\//, "")}</a><br>Just reply to this email if you need anything else.</p>`,
    ),
  });
}

export async function sendOwnerReviewEmail(
  env: CloudflareEnv,
  args: {
    to: string;
    studentEmail: string;
    subject: string;
    message: string;
    category: string;
    confidence: number;
    escalated: boolean;
    escalationReason: string | null;
    draftSubject: string;
    draftBody: string;
    approveUrl: string;
    queueUrl: string;
  },
): Promise<SendEmailResult> {
  const flag = args.escalated
    ? `<p style="background:#FDF6EC;color:#633806;padding:0.7rem 0.9rem;border-radius:8px;margin:0 0 1rem"><strong>Needs you.</strong> ${esc(args.escalationReason ?? "Judgement call.")} The draft below is a starting point, not a ready reply.</p>`
    : `<p style="background:#EAF5F3;color:#0B6B63;padding:0.7rem 0.9rem;border-radius:8px;margin:0 0 1rem"><strong>Ready to send.</strong> ${esc(args.category)} · confidence ${(args.confidence * 100).toFixed(0)}%</p>`;

  const text =
    `${args.escalated ? `NEEDS YOU: ${args.escalationReason ?? "judgement call"}` : `READY TO SEND (${args.category}, ${(args.confidence * 100).toFixed(0)}% confidence)`}\n\n` +
    `FROM: ${args.studentEmail}\nSUBJECT: ${args.subject}\n\n${args.message}\n\n` +
    `--- DRAFT REPLY ---\nSubject: ${args.draftSubject}\n\n${args.draftBody}\n\n` +
    `${args.escalated ? "" : `Approve & send: ${args.approveUrl}\n`}` +
    `Open the queue: ${args.queueUrl}\n`;

  return sendEmail(env, {
    to: args.to,
    subject: `${args.escalated ? "[Needs you]" : "[Draft ready]"} ${args.subject}`,
    replyTo: args.studentEmail,
    text,
    html: shell(
      flag +
        `<p style="margin:0 0 0.25rem;color:#51646A;font-size:0.9rem">From <strong>${esc(args.studentEmail)}</strong></p>` +
        `<p style="margin:0 0 1rem;color:#51646A;font-size:0.9rem">Subject: ${esc(args.subject)}</p>` +
        `<blockquote style="margin:0 0 1.5rem;padding:0.75rem 1rem;background:#F6F8F8;border-left:3px solid #CBD5D6;white-space:pre-wrap">${esc(args.message)}</blockquote>` +
        `<h3 style="color:#0B6B63;font-size:1rem;margin:0 0 0.5rem">Draft reply</h3>` +
        `<p style="margin:0 0 0.75rem;color:#51646A;font-size:0.85rem">Subject: ${esc(args.draftSubject)}</p>` +
        `<div style="border:1px solid #E3E8E9;border-radius:8px;padding:1rem">${paragraphs(args.draftBody)}</div>` +
        (args.escalated
          ? `<p style="margin:1.5rem 0"><a href="${args.queueUrl}" style="background:#0B6B63;color:#fff;text-decoration:none;padding:0.7rem 1.3rem;border-radius:8px;font-weight:600;display:inline-block">Open the queue to edit &amp; send</a></p>`
          : `<p style="margin:1.5rem 0"><a href="${args.approveUrl}" style="background:#0B6B63;color:#fff;text-decoration:none;padding:0.7rem 1.3rem;border-radius:8px;font-weight:600;display:inline-block">Approve &amp; send as-is</a> &nbsp; <a href="${args.queueUrl}" style="color:#0B6B63">Edit first</a></p>`) +
        `<p style="color:#51646A;font-size:0.85rem">Replying to this email goes straight to the student.</p>`,
    ),
  });
}
