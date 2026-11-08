/**
 * The admin student roster: one row per account with everything the Students
 * tab filters, sorts and flags on, built from a FIXED handful of queries
 * however many students there are. (The old page loaded every row of three
 * tables and searched in code; the per-student seat-time call it would have
 * needed for progress is one query per lesson.)
 *
 * Progress and "exam-ready" come from the SAME pure functions the real exam
 * gate uses (creditedSeconds + courseGate in @/lib/seat-time), fed by one
 * batched heartbeat read for in-progress students only. They're display
 * values: nothing here writes, and seat time is never stored. It's
 * recomputed from `events` every time (compliance req 1).
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { coverageFromHeartbeats, courseGate, creditedSeconds, type Coverage } from "@/lib/seat-time";
import { getAudience, type MailStatus } from "@/lib/audience";

const HEARTBEAT = "lesson_heartbeat";
const DAY = 86400000;
/** No activity for this long while mid-course = stalled. */
export const STALLED_DAYS = 14;
/** Intake still unfinished this long after sign-up needs a nudge. */
const INTAKE_GRACE_DAYS = 2;

export type Flag =
  | "intake_incomplete"
  | "never_started"
  | "stalled"
  | "exam_ready"
  | "exam_failed_twice"
  | "passed_no_cert"
  | "no_legal_name";

/** Flags that mean "someone should do something". */
export const ATTENTION: Flag[] = [
  "intake_incomplete",
  "stalled",
  "exam_ready",
  "exam_failed_twice",
  "passed_no_cert",
  "no_legal_name",
];

export const FLAG_LABEL: Record<Flag, string> = {
  intake_incomplete: "Intake not finished",
  never_started: "Never started",
  stalled: "Stalled",
  exam_ready: "Exam-ready",
  exam_failed_twice: "Failed exam 2+",
  passed_no_cert: "Passed, no certificate",
  no_legal_name: "No legal name",
};

export const FLAG_HELP: Record<Flag, string> = {
  intake_incomplete: `Signed up ${INTAKE_GRACE_DAYS}+ days ago but never finished intake.`,
  never_started: "Enrolled but hasn't watched any video yet.",
  stalled: `Mid-course with no activity for ${STALLED_DAYS}+ days.`,
  exam_ready: "Watched enough to unlock the final exam but hasn't passed it.",
  exam_failed_twice: "Two or more failed final-exam attempts and no pass yet.",
  passed_no_cert: "Passed the final exam but has no issued certificate for that course.",
  no_legal_name: "Enrolled, but no legal name on file, so a certificate can't be issued.",
};

export interface RosterCourse {
  courseId: string;
  title: string;
  status: "pending" | "active" | "completed" | "refunded";
  paymentStatus: string;
  /** 0..1 credited content, or null when there's no video yet. */
  progress: number | null;
  examUnlocked: boolean;
  finalPassed: boolean;
  finalFails: number;
  hasCert: boolean;
}

export interface RosterRow {
  id: string;
  email: string;
  name: string;
  role: "student" | "clinic_admin" | "site_admin";
  intakeDone: boolean;
  createdAt: string;
  lastActivityAt: string | null;
  lastLoginAt: string | null;
  courses: RosterCourse[];
  certs: number;
  /** Most recent issued certificate. */
  lastCertAt: string | null;
  clinicName: string | null; // clinic they're an active CA at
  mailing: MailStatus | null;
  flags: Flag[];
}

/** Courses worth showing first: in progress, then completed, then the rest. */
export function primaryCourse(r: RosterRow): RosterCourse | null {
  const rank = (c: RosterCourse) =>
    c.status === "active" ? 0 : c.status === "completed" ? 1 : c.status === "pending" ? 2 : 3;
  return [...r.courses].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

const chunk = <T,>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function buildRoster(
  db: Db,
  opts: { userId?: string; now?: Date; withMailing?: boolean } = {},
): Promise<RosterRow[]> {
  const now = opts.now ?? new Date();
  const only = opts.userId;

  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      legalName: schema.users.legalName,
      displayName: schema.users.displayName,
      role: schema.users.role,
      intakeCompletedAt: schema.users.intakeCompletedAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(only ? eq(schema.users.id, only) : undefined)
    .all();

  // Last activity, last sign-in and "has watched anything", in ONE aggregate
  // over events (uses the (user_id, occurred_at) index).
  const activity = await db
    .select({
      userId: schema.events.userId,
      last: sql<string>`max(${schema.events.occurredAt})`,
      lastLogin: sql<string | null>`max(case when ${schema.events.type} = 'login' then ${schema.events.occurredAt} end)`,
      heartbeats: sql<number>`sum(case when ${schema.events.type} = ${HEARTBEAT} then 1 else 0 end)`,
    })
    .from(schema.events)
    .where(only ? eq(schema.events.userId, only) : isNotNull(schema.events.userId))
    .groupBy(schema.events.userId)
    .all();
  const actBy = new Map(activity.map((a) => [a.userId!, a]));

  const enrolls = await db
    .select({
      userId: schema.enrollments.userId,
      courseId: schema.enrollments.courseId,
      status: schema.enrollments.status,
      paymentStatus: schema.enrollments.paymentStatus,
      title: schema.courses.title,
      requiredSeatMinutes: schema.courses.requiredSeatMinutes,
    })
    .from(schema.enrollments)
    .innerJoin(schema.courses, eq(schema.enrollments.courseId, schema.courses.id))
    .where(only ? eq(schema.enrollments.userId, only) : undefined)
    .all();

  const certs = await db
    .select({ userId: schema.certificates.userId, courseId: schema.certificates.courseId, issuedAt: schema.certificates.issuedAt })
    .from(schema.certificates)
    .where(and(eq(schema.certificates.status, "issued"), only ? eq(schema.certificates.userId, only) : undefined))
    .all();

  const finals = await db
    .select({ userId: schema.quizAttempts.userId, courseId: schema.quizzes.courseId, passed: schema.quizAttempts.passed })
    .from(schema.quizAttempts)
    .innerJoin(schema.quizzes, eq(schema.quizAttempts.quizId, schema.quizzes.id))
    .where(and(eq(schema.quizzes.kind, "final_exam"), only ? eq(schema.quizAttempts.userId, only) : undefined))
    .all();

  const memberships = await db
    .select({ userId: schema.clinicMembers.userId, clinic: schema.clinics.name })
    .from(schema.clinicMembers)
    .innerJoin(schema.clinics, eq(schema.clinicMembers.clinicId, schema.clinics.id))
    .where(
      and(
        eq(schema.clinicMembers.role, "ca"),
        eq(schema.clinicMembers.status, "active"),
        only ? eq(schema.clinicMembers.userId, only) : undefined,
      ),
    )
    .all();
  const clinicBy = new Map(memberships.filter((m) => m.userId).map((m) => [m.userId!, m.clinic]));

  // --- Progress for in-progress enrollments only --------------------------
  const inProgress = enrolls.filter((e) => e.status === "active");
  const courseIds = [...new Set(inProgress.map((e) => e.courseId))];
  const lessonsByCourse = new Map<string, { id: string; durationSeconds: number }[]>();
  if (courseIds.length) {
    const lessons = await db
      .select({
        id: schema.lessons.id,
        durationSeconds: schema.lessons.durationSeconds,
        courseId: schema.modules.courseId,
        modulePos: schema.modules.position,
        pos: schema.lessons.position,
      })
      .from(schema.lessons)
      .innerJoin(schema.modules, eq(schema.lessons.moduleId, schema.modules.id))
      .where(inArray(schema.modules.courseId, courseIds))
      .all();
    lessons.sort((a, b) => a.modulePos - b.modulePos || a.pos - b.pos);
    for (const l of lessons) {
      const list = lessonsByCourse.get(l.courseId) ?? [];
      list.push({ id: l.id, durationSeconds: l.durationSeconds });
      lessonsByCourse.set(l.courseId, list);
    }
  }
  // user → lesson → coverage. Only students who've actually watched something;
  // chunked to stay under D1's 100-bound-parameter limit.
  const watchers = [...new Set(inProgress.map((e) => e.userId))].filter((u) => (actBy.get(u)?.heartbeats ?? 0) > 0);
  const coverage = new Map<string, Map<string, Coverage[]>>();
  for (const ids of chunk(watchers, 90)) {
    const rows = await db
      .select({
        userId: schema.events.userId,
        lessonId: schema.events.lessonId,
        positionStartSeconds: schema.events.positionStartSeconds,
        positionEndSeconds: schema.events.positionEndSeconds,
      })
      .from(schema.events)
      .where(and(eq(schema.events.type, HEARTBEAT), inArray(schema.events.userId, ids)))
      .all();
    for (const r of rows) {
      if (!r.userId || !r.lessonId) continue;
      const byLesson = coverage.get(r.userId) ?? new Map<string, Coverage[]>();
      const list = byLesson.get(r.lessonId) ?? [];
      list.push(...coverageFromHeartbeats([r]));
      byLesson.set(r.lessonId, list);
      coverage.set(r.userId, byLesson);
    }
  }

  const mailing = opts.withMailing === false ? null : new Map((await getAudience(db)).map((a) => [a.email, a.status]));

  // --- Assemble -------------------------------------------------------------
  return users.map((u) => {
    const act = actBy.get(u.id);
    const myCerts = certs.filter((c) => c.userId === u.id);
    const courses: RosterCourse[] = enrolls
      .filter((e) => e.userId === u.id)
      .map((e) => {
        const fin = finals.filter((f) => f.userId === u.id && f.courseId === e.courseId);
        let progress: number | null = e.status === "completed" ? 1 : null;
        let examUnlocked = e.status === "completed";
        if (e.status === "active") {
          const lessons = lessonsByCourse.get(e.courseId) ?? [];
          const mine = coverage.get(u.id);
          const gate = courseGate(
            lessons.map((l) => ({
              durationSeconds: l.durationSeconds,
              creditedSeconds: creditedSeconds(mine?.get(l.id) ?? [], l.durationSeconds),
            })),
            e.requiredSeatMinutes,
          );
          progress = gate.totalContentSeconds > 0 ? gate.creditedSeconds / gate.totalContentSeconds : null;
          examUnlocked = gate.examUnlocked;
        }
        return {
          courseId: e.courseId,
          title: e.title,
          status: e.status,
          paymentStatus: e.paymentStatus,
          progress,
          examUnlocked,
          finalPassed: fin.some((f) => f.passed),
          finalFails: fin.filter((f) => !f.passed).length,
          hasCert: myCerts.some((c) => c.courseId === e.courseId),
        };
      });

    const flags: Flag[] = [];
    const active = courses.filter((c) => c.status === "active");
    const ageDays = (now.getTime() - new Date(u.createdAt).getTime()) / DAY;
    if (!u.intakeCompletedAt && ageDays >= INTAKE_GRACE_DAYS) flags.push("intake_incomplete");
    if (active.length && !(act?.heartbeats ?? 0)) flags.push("never_started");
    if (
      active.length &&
      (act?.heartbeats ?? 0) > 0 &&
      act?.last &&
      now.getTime() - new Date(act.last).getTime() >= STALLED_DAYS * DAY
    )
      flags.push("stalled");
    if (active.some((c) => c.examUnlocked && !c.finalPassed)) flags.push("exam_ready");
    if (courses.some((c) => c.finalFails >= 2 && !c.finalPassed)) flags.push("exam_failed_twice");
    if (courses.some((c) => c.finalPassed && !c.hasCert)) flags.push("passed_no_cert");
    if (u.intakeCompletedAt && !u.legalName?.trim() && courses.some((c) => c.status !== "refunded"))
      flags.push("no_legal_name");

    return {
      id: u.id,
      email: u.email,
      name: u.legalName?.trim() || u.displayName || "",
      role: u.role,
      intakeDone: !!u.intakeCompletedAt,
      createdAt: u.createdAt,
      lastActivityAt: act?.last ?? null,
      lastLoginAt: act?.lastLogin ?? null,
      courses,
      certs: myCerts.length,
      lastCertAt: myCerts.reduce<string | null>((m, c) => (!m || c.issuedAt > m ? c.issuedAt : m), null),
      clinicName: clinicBy.get(u.id) ?? null,
      mailing: mailing?.get(u.email.toLowerCase()) ?? null,
      flags,
    };
  });
}

// ---------------------------------------------------------------------------
// Views, filters, sorting: shared by the page and the CSV export.
// ---------------------------------------------------------------------------
export const VIEWS = {
  all: "All",
  attention: "Needs attention",
  exam_ready: "Exam-ready",
  stalled: "Stalled",
  never_started: "Never started",
  certified_month: "Certified this month",
  intake: "Intake not finished",
} as const;
export type View = keyof typeof VIEWS;

export const SORTS = {
  activity: "Last active",
  joined: "Newest",
  name: "Name",
  progress: "Progress",
} as const;
export type Sort = keyof typeof SORTS;

export interface RosterFilter {
  q: string;
  view: View;
  course: string;
  paid: string; // enrollments.payment_status
  mailing: MailStatus | "";
  role: "" | "student" | "clinic_admin" | "site_admin";
  sort: Sort;
}

export function parseRosterFilter(p: URLSearchParams): RosterFilter {
  const one = <T extends string>(k: string, ok: readonly string[], dflt: T): T => {
    const v = p.get(k) ?? "";
    return (ok.includes(v) ? v : dflt) as T;
  };
  return {
    q: (p.get("q") ?? "").trim().toLowerCase().slice(0, 100),
    view: one<View>("view", Object.keys(VIEWS), "all"),
    course: (p.get("course") ?? "").slice(0, 80),
    paid: one("paid", ["paid", "free", "comp", "clinic_seat", "unpaid"], ""),
    mailing: one<MailStatus | "">("mailing", ["subscribed", "pending", "unsubscribed", "legacy", "not_opted_in"], ""),
    role: one("role", ["student", "clinic_admin", "site_admin"], ""),
    sort: one<Sort>("sort", Object.keys(SORTS), "activity"),
  };
}

/** Same calendar month in Pacific time (how dates are displayed). */
function samePacificMonth(iso: string, now: Date): boolean {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" });
  return f.format(new Date(iso)) === f.format(now);
}

export function inView(r: RosterRow, view: View, now = new Date()): boolean {
  switch (view) {
    case "all": return true;
    case "attention": return r.flags.some((f) => ATTENTION.includes(f));
    case "exam_ready": return r.flags.includes("exam_ready");
    case "stalled": return r.flags.includes("stalled");
    case "never_started": return r.flags.includes("never_started");
    case "certified_month": return !!r.lastCertAt && samePacificMonth(r.lastCertAt, now);
    case "intake": return !r.intakeDone;
  }
}

export function applyRosterFilter(rows: RosterRow[], f: RosterFilter, now = new Date()): RosterRow[] {
  const out = rows.filter(
    (r) =>
      inView(r, f.view, now) &&
      (!f.q ||
        r.email.toLowerCase().includes(f.q) ||
        r.name.toLowerCase().includes(f.q) ||
        (r.clinicName ?? "").toLowerCase().includes(f.q)) &&
      (!f.course || r.courses.some((c) => c.courseId === f.course)) &&
      (!f.paid || r.courses.some((c) => c.paymentStatus === f.paid)) &&
      (!f.mailing || r.mailing === f.mailing) &&
      (!f.role || r.role === f.role),
  );
  const prog = (r: RosterRow) => primaryCourse(r)?.progress ?? -1;
  const by: Record<Sort, (a: RosterRow, b: RosterRow) => number> = {
    activity: (a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
    joined: (a, b) => b.createdAt.localeCompare(a.createdAt),
    name: (a, b) => (a.name || a.email).localeCompare(b.name || b.email),
    progress: (a, b) => prog(b) - prog(a),
  };
  return out.sort(by[f.sort]);
}

export function rosterQuery(f: RosterFilter, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  const merged: Record<string, string> = { ...f, ...extra };
  for (const [k, v] of Object.entries(merged)) {
    if (!v || (k === "view" && v === "all") || (k === "sort" && v === "activity")) continue;
    p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** "3 days ago" style, for scanning a list. */
export function ago(iso: string | null, now = new Date()): string {
  if (!iso) return "never";
  const d = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)} yr ago`;
}
