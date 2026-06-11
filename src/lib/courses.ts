/**
 * Read helpers for the course catalog (player + overview pages).
 * Pure queries — no derived seat-time state is stored here; that is always
 * recomputed from `events` (see seat-time.ts / progress.ts).
 */
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";

export type Course = typeof schema.courses.$inferSelect;
export type Module = typeof schema.modules.$inferSelect;
export type Lesson = typeof schema.lessons.$inferSelect;

export async function getCourseBySlug(
  db: Db,
  slug: string,
): Promise<Course | null> {
  const row = await db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.slug, slug))
    .get();
  return row ?? null;
}

export interface ModuleWithLessons {
  module: Module;
  lessons: Lesson[];
}

/** Full ordered structure of a course: modules, each with its lessons. */
export async function getCourseStructure(
  db: Db,
  courseId: string,
): Promise<ModuleWithLessons[]> {
  const mods = await db
    .select()
    .from(schema.modules)
    .where(eq(schema.modules.courseId, courseId))
    .orderBy(asc(schema.modules.position))
    .all();

  const out: ModuleWithLessons[] = [];
  for (const module of mods) {
    const lessons = await db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.moduleId, module.id))
      .orderBy(asc(schema.lessons.position))
      .all();
    out.push({ module, lessons });
  }
  return out;
}

export interface LessonContext {
  course: Course;
  module: Module;
  lesson: Lesson;
}

/**
 * Resolve a lesson and verify it really belongs to the given module + course
 * (so URL tampering can't cross-load a lesson from another course).
 */
export async function getLessonContext(
  db: Db,
  courseSlug: string,
  moduleId: string,
  lessonId: string,
): Promise<LessonContext | null> {
  const course = await getCourseBySlug(db, courseSlug);
  if (!course) return null;

  const module = await db
    .select()
    .from(schema.modules)
    .where(
      and(
        eq(schema.modules.id, moduleId),
        eq(schema.modules.courseId, course.id),
      ),
    )
    .get();
  if (!module) return null;

  const lesson = await db
    .select()
    .from(schema.lessons)
    .where(
      and(
        eq(schema.lessons.id, lessonId),
        eq(schema.lessons.moduleId, module.id),
      ),
    )
    .get();
  if (!lesson) return null;

  return { course, module, lesson };
}

/** Look up a lesson with its module + course by lesson id alone (for the APIs). */
export async function getLessonById(
  db: Db,
  lessonId: string,
): Promise<LessonContext | null> {
  const lesson = await db
    .select()
    .from(schema.lessons)
    .where(eq(schema.lessons.id, lessonId))
    .get();
  if (!lesson) return null;

  const module = await db
    .select()
    .from(schema.modules)
    .where(eq(schema.modules.id, lesson.moduleId))
    .get();
  if (!module) return null;

  const course = await db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, module.courseId))
    .get();
  if (!course) return null;

  return { course, module, lesson };
}
