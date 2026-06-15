/**
 * Certificate issuance + rendering (M4).
 *
 * Compliance rules (CLAUDE.md §4): the printed values — legal name, course
 * title, credit hours, completion date, instructor — are SNAPSHOTTED into the
 * `certificates` row at issuance and never recomputed, so a later edit to the
 * course or the student's name can't change an already-issued certificate.
 *
 * Each certificate carries TWO identifiers:
 *   - certNumber       human-readable serial, e.g. "CS-2026-0001" (sequential)
 *   - verificationCode random, unguessable; the public /verify lookup key
 *
 * The PDF (pdf-lib) is stored in R2 (DOCS bucket) and is publicly downloadable
 * by its verification code. Issuance is idempotent: a student who already holds
 * a live certificate for a course gets the same one back.
 */
import { and, eq, like, sql } from "drizzle-orm";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import QRCode from "qrcode";
import { schema, type Db } from "@/db/client";
import { unpassedQuizzes } from "@/lib/quiz";
import { newId, readableCode } from "@/lib/crypto";
import { getSiteUrl } from "@/lib/env";
import { formatPacific, nowIso } from "@/lib/time";
import { logEvent } from "@/lib/events";
import { sendCertificateEmail } from "@/lib/email/certificate";
import { LOGO_DARK_PNG_BASE64 } from "@/lib/logo-data";

/** Decode a base64 string to bytes (Workers + Node). */
function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface IssueResult {
  certificate: typeof schema.certificates.$inferSelect;
  created: boolean; // false if an existing live certificate was returned
}

/** The most recent non-revoked certificate for this user+course, if any. */
export async function getActiveCertificate(
  db: Db,
  userId: string,
  courseId: string,
) {
  return db
    .select()
    .from(schema.certificates)
    .where(
      and(
        eq(schema.certificates.userId, userId),
        eq(schema.certificates.courseId, courseId),
      ),
    )
    .all()
    .then((rows) => rows.find((r) => r.status === "issued"));
}

/** All certificates for a user+course, newest first (admin history view). */
export async function listCertificates(
  db: Db,
  userId: string,
  courseId: string,
) {
  const rows = await db
    .select()
    .from(schema.certificates)
    .where(
      and(
        eq(schema.certificates.userId, userId),
        eq(schema.certificates.courseId, courseId),
      ),
    )
    .all();
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Revoke a certificate. The PDF is retained in R2 (compliance never deletes). */
export async function revokeCertificate(
  db: Db,
  certId: string,
  adminUserId: string,
): Promise<void> {
  const cert = await db
    .select()
    .from(schema.certificates)
    .where(eq(schema.certificates.id, certId))
    .get();
  if (!cert) return;
  await db
    .update(schema.certificates)
    .set({ status: "revoked" })
    .where(eq(schema.certificates.id, certId));
  await logEvent(db, {
    userId: cert.userId,
    type: "certificate_revoked",
    courseId: cert.courseId,
    payload: { certificateId: certId, by: adminUserId },
  });
}

/**
 * Reissue a certificate: supersede the current one and mint a fresh certificate
 * with current snapshot values (e.g. after a legal-name correction). The old row
 * is marked `reissued` (invalid for verification); the new row points back via
 * supersedesId. Emails the new PDF.
 */
export async function reissueCertificate(
  env: CloudflareEnv,
  db: Db,
  certId: string,
  adminUserId: string,
): Promise<IssueResult | null> {
  const old = await db
    .select()
    .from(schema.certificates)
    .where(eq(schema.certificates.id, certId))
    .get();
  if (!old) return null;

  // Mark the old one superseded so getActiveCertificate won't return it.
  await db
    .update(schema.certificates)
    .set({ status: "reissued" })
    .where(eq(schema.certificates.id, certId));

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, old.userId))
    .get();
  const issued = await issueCertificate(env, db, {
    userId: old.userId,
    courseId: old.courseId,
    bypassQuizRequirement: true, // reissuing an already-earned certificate
  });
  if (!issued?.created) return issued;

  await db
    .update(schema.certificates)
    .set({ supersedesId: old.id })
    .where(eq(schema.certificates.id, issued.certificate.id));
  await logEvent(db, {
    userId: old.userId,
    type: "certificate_reissued",
    courseId: old.courseId,
    payload: { certificateId: issued.certificate.id, supersedes: old.id, by: adminUserId },
  });

  if (user && issued.certificate.r2Key) {
    try {
      const pdf = await getCertificatePdf(env, issued.certificate.r2Key);
      if (pdf) {
        await sendCertificateEmail(env, {
          to: user.email,
          legalName: issued.certificate.legalNameSnapshot,
          courseTitle: issued.certificate.courseTitleSnapshot,
          certNumber: issued.certificate.certNumber!,
          verificationCode: issued.certificate.verificationCode,
          pdf: new Uint8Array(pdf),
        });
      }
    } catch (e) {
      console.error("[certificate] reissue email failed", e);
    }
  }
  return issued;
}

/** Look up a certificate by its public verification code. */
export async function getCertificateByCode(db: Db, code: string) {
  return db
    .select()
    .from(schema.certificates)
    .where(eq(schema.certificates.verificationCode, code))
    .get();
}

/** Next sequential certificate number for the given year: CS-YYYY-NNNN. */
async function nextCertNumber(db: Db, year: number): Promise<string> {
  const prefix = `CS-${year}-`;
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.certificates)
    .where(like(schema.certificates.certNumber, `${prefix}%`))
    .get();
  const seq = (row?.n ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/**
 * Issue (or return the existing) certificate for a completed course. Returns
 * `null` if the student has no legal name on file — we cannot print a legal
 * certificate without it (the caller should prompt them to complete intake).
 */
export async function issueCertificate(
  env: CloudflareEnv,
  db: Db,
  args: { userId: string; courseId: string; issuedAt?: string; bypassQuizRequirement?: boolean },
): Promise<IssueResult | null> {
  const existing = await getActiveCertificate(db, args.userId, args.courseId);
  if (existing) return { certificate: existing, created: false };

  // If the course has quizzes, they must all be passed before we certify —
  // unless an admin explicitly overrides (e.g. credit for off-platform work).
  if (!args.bypassQuizRequirement) {
    const unpassed = await unpassedQuizzes(db, args.userId, args.courseId);
    if (unpassed.length > 0) return null;
  }

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, args.userId))
    .get();
  const course = await db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, args.courseId))
    .get();
  if (!user || !course) return null;
  const legalName = user.legalName.trim();
  if (!legalName) return null; // can't certify without a legal name

  const issuedAt = args.issuedAt ?? nowIso();
  const id = newId("cert");
  const verificationCode = readableCode(10);
  const certNumber = await nextCertNumber(db, new Date(issuedAt).getFullYear());

  const pdfBytes = await renderCertificatePdf({
    legalName,
    courseTitle: course.title,
    creditHours: course.creditHours,
    instructor: course.instructorName,
    issuedAt,
    certNumber,
    verificationCode,
    verifyUrl: `${getSiteUrl(env)}/verify/${verificationCode}`,
  });

  const r2Key = `certificates/${id}.pdf`;
  await env.DOCS.put(r2Key, pdfBytes, {
    httpMetadata: { contentType: "application/pdf" },
  });

  const row: typeof schema.certificates.$inferInsert = {
    id,
    userId: user.id,
    courseId: course.id,
    verificationCode,
    certNumber,
    legalNameSnapshot: legalName,
    courseTitleSnapshot: course.title,
    creditHoursSnapshot: course.creditHours,
    instructorSnapshot: course.instructorName,
    issuedAt,
    r2Key,
    status: "issued",
  };
  await db.insert(schema.certificates).values(row);

  await logEvent(db, {
    userId: user.id,
    type: "certificate_issued",
    courseId: course.id,
    payload: { certificateId: id, certNumber, verificationCode },
  });

  return {
    certificate: { ...row, supersedesId: null, createdAt: issuedAt } as typeof schema.certificates.$inferSelect,
    created: true,
  };
}

/**
 * Issue the certificate (if needed) AND email it on first creation. Email/PDF
 * are best-effort — a delivery failure never throws, so callers can use this in
 * both the exam-submit path and a lazy self-heal on the course page. Returns the
 * issue result (or null if it couldn't be issued, e.g. missing legal name).
 */
export async function issueAndEmailCertificate(
  env: CloudflareEnv,
  db: Db,
  args: { userId: string; courseId: string; email: string; issuedAt?: string; bypassQuizRequirement?: boolean },
): Promise<IssueResult | null> {
  const issued = await issueCertificate(env, db, args);
  if (issued?.created && issued.certificate.r2Key) {
    try {
      const pdf = await getCertificatePdf(env, issued.certificate.r2Key);
      if (pdf) {
        await sendCertificateEmail(env, {
          to: args.email,
          legalName: issued.certificate.legalNameSnapshot,
          courseTitle: issued.certificate.courseTitleSnapshot,
          certNumber: issued.certificate.certNumber!,
          verificationCode: issued.certificate.verificationCode,
          pdf: new Uint8Array(pdf),
        });
      }
    } catch (e) {
      console.error("[certificate] email failed", e);
    }
  }
  return issued;
}

/** Fetch the stored PDF bytes for a certificate from R2. */
export async function getCertificatePdf(
  env: CloudflareEnv,
  r2Key: string,
): Promise<ArrayBuffer | null> {
  const obj = await env.DOCS.get(r2Key);
  return obj ? await obj.arrayBuffer() : null;
}

// ---------------------------------------------------------------------------
// PDF rendering
// ---------------------------------------------------------------------------

// Certificate palette: ink + brand teal + a gold accent (matches design tokens;
// uses --brand/--gold, never --action).
const ACCENT = rgb(0.043, 0.42, 0.388); // --brand #0B6B63
const GOLD = rgb(0.722, 0.525, 0.043); // --gold #B8860B
const INK = rgb(0.075, 0.153, 0.169); // --ink #13272B
const MUTED = rgb(0.318, 0.392, 0.416); // --muted #51646A
const WATERMARK = rgb(0.93, 0.95, 0.94);

interface RenderArgs {
  legalName: string;
  courseTitle: string;
  creditHours: number;
  instructor: string;
  issuedAt: string;
  certNumber: string;
  verificationCode: string;
  verifyUrl: string;
}

export async function renderCertificatePdf(
  args: RenderArgs,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([792, 612]); // US Letter, landscape
  const { width, height } = page.getSize();

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const times = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);

  const centerText = (
    text: string,
    y: number,
    size: number,
    font: PDFFont,
    color = INK,
  ) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };

  // --- Anti-duplication watermark: faint tiled diagonal wordmark ---
  drawWatermark(page, helvBold, args.certNumber, width, height);

  // --- Outer + inner border ---
  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: ACCENT,
    borderWidth: 3,
  });
  page.drawRectangle({
    x: 32,
    y: 32,
    width: width - 64,
    height: height - 64,
    borderColor: GOLD,
    borderWidth: 1,
  });

  // --- Logo (embedded brand artwork), top-center ---
  const logoPng = await doc.embedPng(decodeBase64(LOGO_DARK_PNG_BASE64));
  const logoW = 168;
  const logoH = (logoPng.height / logoPng.width) * logoW;
  page.drawImage(logoPng, {
    x: (width - logoW) / 2,
    y: height - 60 - logoH,
    width: logoW,
    height: logoH,
  });

  // --- Heading ---
  centerText("Certificate of Completion", height - 165, 30, helvBold, INK);
  centerText(
    "This certifies that",
    height - 205,
    13,
    helv,
    MUTED,
  );

  // --- Recipient name ---
  centerText(args.legalName, height - 252, 38, times, INK);
  page.drawLine({
    start: { x: width / 2 - 200, y: height - 268 },
    end: { x: width / 2 + 200, y: height - 268 },
    thickness: 1,
    color: rgb(0.8, 0.85, 0.9),
  });

  // --- Body ---
  centerText(
    "has successfully completed the continuing-education course",
    height - 300,
    13,
    helv,
    MUTED,
  );
  centerText(args.courseTitle, height - 332, 20, helvBold, ACCENT);
  centerText(
    `${formatCredits(args.creditHours)} of continuing education`,
    height - 360,
    13,
    helv,
    MUTED,
  );

  // --- Signature / meta row ---
  const completed = formatPacific(args.issuedAt, { dateStyle: "long" });
  const colY = 150;
  // Instructor (left)
  page.drawText(args.instructor, {
    x: 110,
    y: colY,
    size: 13,
    font: helvBold,
    color: INK,
  });
  page.drawLine({
    start: { x: 110, y: colY - 6 },
    end: { x: 300, y: colY - 6 },
    thickness: 1,
    color: rgb(0.8, 0.85, 0.9),
  });
  page.drawText("Instructor", {
    x: 110,
    y: colY - 20,
    size: 10,
    font: helv,
    color: MUTED,
  });
  // Completion date (right)
  page.drawText(completed, {
    x: 492,
    y: colY,
    size: 13,
    font: helvBold,
    color: INK,
  });
  page.drawLine({
    start: { x: 492, y: colY - 6 },
    end: { x: 682, y: colY - 6 },
    thickness: 1,
    color: rgb(0.8, 0.85, 0.9),
  });
  page.drawText("Date completed", {
    x: 492,
    y: colY - 20,
    size: 10,
    font: helv,
    color: MUTED,
  });

  // --- Verification footer (left) + QR (right) ---
  page.drawText(`Certificate No.  ${args.certNumber}`, {
    x: 60,
    y: 78,
    size: 11,
    font: helvBold,
    color: INK,
  });
  page.drawText(`Verification code:  ${args.verificationCode}`, {
    x: 60,
    y: 62,
    size: 10,
    font: helv,
    color: MUTED,
  });
  page.drawText(`Verify at  ${args.verifyUrl}`, {
    x: 60,
    y: 48,
    size: 9,
    font: helv,
    color: MUTED,
  });

  drawQr(page, args.verifyUrl, width - 132, 44, 76);

  return doc.save();
}

function formatCredits(hours: number): string {
  const h = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${h} ${hours === 1 ? "hour" : "hours"}`;
}

/** Tiled, rotated, faint repeating wordmark across the whole page. */
function drawWatermark(
  page: PDFPage,
  font: PDFFont,
  certNumber: string,
  width: number,
  height: number,
): void {
  const text = `CHIROSMARTS  •  VERIFIED  •  ${certNumber}`;
  const size = 11;
  const stepX = 250;
  const stepY = 70;
  for (let row = -1; row * stepY < height + stepY; row++) {
    for (let col = -1; col * stepX < width + stepX; col++) {
      page.drawText(text, {
        x: col * stepX - 40,
        y: row * stepY,
        size,
        font,
        color: WATERMARK,
        rotate: degrees(30),
        opacity: 0.6,
      });
    }
  }
}

/** Render a QR (verify URL) as filled modules, bottom-up from (x, y). */
function drawQr(
  page: PDFPage,
  data: string,
  x: number,
  y: number,
  boxSize: number,
): void {
  const qr = QRCode.create(data, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const matrix = qr.modules.data; // row-major, 1 = dark
  const quiet = 4; // QR spec quiet zone (modules) — keeps it scannable
  const cell = boxSize / (size + quiet * 2);

  // white background (so the QR stays scannable over the watermark)
  page.drawRectangle({
    x,
    y,
    width: boxSize,
    height: boxSize,
    color: rgb(1, 1, 1),
  });
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!matrix[r * size + c]) continue;
      page.drawRectangle({
        x: x + (c + quiet) * cell,
        // QR rows are top-down; PDF y is bottom-up → flip
        y: y + (size - 1 - r + quiet) * cell,
        width: cell,
        height: cell,
        color: INK,
      });
    }
  }
}
