import { describe, it, expect, vi } from "vitest";
import { makeTestDb } from "@/test/sqlite-db";
import { applyRosterFilter, buildRoster, parseRosterFilter } from "./roster";
import { getCourseSeatTime } from "@/lib/progress";

vi.spyOn(console, "warn").mockImplementation(() => {});
const NOW = new Date("2026-11-08T18:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();

function seed() {
  const t = makeTestDb();
  const { raw } = t;
  const run = (q: string, ...p: (string | number | null)[]) => raw.prepare(q).run(...p);
  // One course: two 600s lessons, 10-minute floor, a final exam.
  run("insert into courses(id,slug,title,required_seat_minutes) values ('c1','c1','Initial CA',10)");
  run("insert into modules(id,course_id,position,title) values ('m1','c1',1,'Module 1')");
  run("insert into lessons(id,module_id,position,title,duration_seconds) values ('l1','m1',1,'L1',600),('l2','m1',2,'L2',600)");
  run("insert into quizzes(id,course_id,module_id,kind,title) values ('fx','c1',null,'final_exam','Final')");

  const user = (id: string, name: string, intake: string | null, created = daysAgo(30)) =>
    run("insert into users(id,email,legal_name,intake_completed_at,created_at) values (?,?,?,?,?)", id, `${id}@x.test`, name, intake, created);
  const enroll = (u: string, status = "active", pay = "paid") =>
    run("insert into enrollments(id,user_id,course_id,status,payment_status) values (?,?,?,?,?)", `e_${u}`, u, "c1", status, pay);
  let hb = 0;
  const watch = (u: string, lesson: string, start: number, end: number, at: string) =>
    run(
      "insert into events(id,user_id,type,lesson_id,position_start_seconds,position_end_seconds,occurred_at) values (?,?,?,?,?,?,?)",
      `hb${++hb}`, u, "lesson_heartbeat", lesson, start, end, at,
    );
  const attempt = (u: string, n: number, passed: boolean) =>
    run(
      "insert into quiz_attempts(id,user_id,quiz_id,attempt_number,score,passed,answers) values (?,?,?,?,?,?,?)",
      `qa_${u}_${n}`, u, "fx", n, passed ? 0.9 : 0.5, passed ? 1 : 0, "[]",
    );

  user("fresh", "Fresh Start", daysAgo(1)); enroll("fresh");                       // never started
  user("half", "Half Way", daysAgo(20)); enroll("half"); watch("half", "l1", 0, 600, daysAgo(1)); // 50%, active
  user("stall", "Stalled Out", daysAgo(40)); enroll("stall"); watch("stall", "l1", 0, 300, daysAgo(20)); // stalled
  user("ready", "Exam Ready", daysAgo(10)); enroll("ready");
  watch("ready", "l1", 0, 560, daysAgo(2)); watch("ready", "l2", 0, 545, daysAgo(1));    // both ≥90%, 1105s ≥ 600s floor
  user("fail", "Two Fails", daysAgo(10)); enroll("fail");
  watch("fail", "l1", 0, 600, daysAgo(2)); watch("fail", "l2", 0, 600, daysAgo(2));
  attempt("fail", 1, false); attempt("fail", 2, false);
  user("passed", "Passed NoCert", daysAgo(10)); enroll("passed");
  watch("passed", "l1", 0, 600, daysAgo(2)); watch("passed", "l2", 0, 600, daysAgo(2)); attempt("passed", 1, true);
  user("nointake", "", null, daysAgo(5));                                              // intake incomplete
  user("noname", "", daysAgo(5)); enroll("noname");                                     // can't certify
  return t;
}

describe("buildRoster", () => {
  it("flags each situation correctly", async () => {
    const { db } = seed();
    const rows = await buildRoster(db, { now: NOW, withMailing: false });
    const flags = Object.fromEntries(rows.map((r) => [r.id, r.flags.sort()]));
    expect(flags).toEqual({
      fresh: ["never_started"],
      half: [],
      stall: ["stalled"],
      ready: ["exam_ready"],
      fail: ["exam_failed_twice", "exam_ready"],
      passed: ["passed_no_cert"],
      nointake: ["intake_incomplete"],
      noname: ["never_started", "no_legal_name"],
    });
  });

  it("progress and exam state match the real gate (getCourseSeatTime) exactly", async () => {
    const { db } = seed();
    const rows = await buildRoster(db, { now: NOW, withMailing: false });
    for (const r of rows) {
      for (const c of r.courses.filter((c) => c.status === "active")) {
        const real = await getCourseSeatTime(db, r.id, c.courseId);
        expect([r.id, c.progress, c.examUnlocked]).toEqual([r.id, real.watchedFraction, real.examUnlocked]);
      }
    }
    expect(rows.find((r) => r.id === "half")!.courses[0].progress).toBe(0.5);
  });

  it("views and sorting", async () => {
    const { db } = seed();
    const rows = await buildRoster(db, { now: NOW, withMailing: false });
    const ids = (q: string) => applyRosterFilter(rows, parseRosterFilter(new URLSearchParams(q)), NOW).map((r) => r.id);
    expect(ids("view=attention").sort()).toEqual(["fail", "nointake", "noname", "passed", "ready", "stall"]);
    expect(ids("view=exam_ready").sort()).toEqual(["fail", "ready"]);
    expect(ids("view=never_started").sort()).toEqual(["fresh", "noname"]);
    expect(ids("q=stalled")).toEqual(["stall"]);
    expect(ids("sort=progress").slice(0, 3).sort()).toEqual(["fail", "passed", "ready"]);
  });

  it("scopes to one user", async () => {
    const { db } = seed();
    const rows = await buildRoster(db, { userId: "ready", now: NOW, withMailing: false });
    expect(rows.map((r) => r.id)).toEqual(["ready"]);
    expect(rows[0].flags).toEqual(["exam_ready"]);
  });
});
