/**
 * M6 tutor endpoint. Auth is enforced by middleware (signed-in users only).
 * Scopes retrieval to the modules the student is entitled to, runs the tutor,
 * and records an append-only `tutor_query` event for the audit trail.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getCourseBySlug, getCourseStructure } from "@/lib/courses";
import { canAccessModule } from "@/lib/entitlement";
import { askTutor } from "@/lib/tutor";
import { logEvent } from "@/lib/events";

const MAX_QUESTION_LEN = 1000;

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: "Not signed in." }, 401);

  const env = locals.runtime.env;
  const db = getDb(env);

  let body: { courseSlug?: unknown; question?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const courseSlug = typeof body.courseSlug === "string" ? body.courseSlug : "";
  const question = (typeof body.question === "string" ? body.question : "").trim();

  if (!courseSlug || !question) {
    return json({ error: "Ask a question to get started." }, 400);
  }
  if (question.length > MAX_QUESTION_LEN) {
    return json({ error: "Question is too long — please shorten it." }, 400);
  }

  const course = await getCourseBySlug(db, courseSlug);
  if (!course) return json({ error: "Course not found." }, 404);

  // Entitlement gate: only lessons in modules this user can access feed retrieval.
  const structure = await getCourseStructure(db, course.id);
  const allowedLessonIds: string[] = [];
  for (const { module, lessons } of structure) {
    if (await canAccessModule(db, user.id, module)) {
      for (const l of lessons) allowedLessonIds.push(l.id);
    }
  }
  if (allowedLessonIds.length === 0) {
    return json(
      { error: "Enroll in this course to use the tutor.", citations: [] },
      403,
    );
  }

  const result = await askTutor(env, db, {
    courseId: course.id,
    courseSlug,
    question,
    allowedLessonIds,
  });

  await logEvent(db, {
    userId: user.id,
    type: "tutor_query",
    courseId: course.id,
    payload: {
      question,
      citedLessons: result.citations.map((c) => c.lessonTitle),
    },
  });

  return json(result, 200);
};

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
