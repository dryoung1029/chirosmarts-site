/**
 * Course-level downloadable resources (M-multicourse Phase 3). These are assets
 * the course PROVIDES — e.g. the blank Vitals practice-log PDF a student prints
 * and fills in — stored in R2 under `course-resources/`. Distinct from the
 * student's own uploaded evidence (`documents`).
 */
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";

export type CourseResource = typeof schema.courseResources.$inferSelect;

export async function listCourseResources(
  db: Db,
  courseId: string,
): Promise<CourseResource[]> {
  return db
    .select()
    .from(schema.courseResources)
    .where(eq(schema.courseResources.courseId, courseId))
    .orderBy(asc(schema.courseResources.createdAt))
    .all();
}

export async function getCourseResource(
  db: Db,
  id: string,
): Promise<CourseResource | null> {
  const row = await db
    .select()
    .from(schema.courseResources)
    .where(eq(schema.courseResources.id, id))
    .get();
  return row ?? null;
}

/** Store an uploaded file in R2 and record the resource row. Returns the id. */
export async function addCourseResource(
  env: CloudflareEnv,
  db: Db,
  opts: {
    courseId: string;
    type: "practice_log_template" | "handout" | "other";
    title: string;
    fileName: string;
    contentType: string;
    bytes: ArrayBuffer;
    visibility?: "enrolled" | "public";
  },
): Promise<string> {
  const id = newId("res");
  const r2Key = `course-resources/${id}`;
  await env.DOCS.put(r2Key, opts.bytes, {
    httpMetadata: { contentType: opts.contentType },
  });
  await db.insert(schema.courseResources).values({
    id,
    courseId: opts.courseId,
    type: opts.type,
    title: opts.title,
    fileName: opts.fileName,
    contentType: opts.contentType,
    r2Key,
    visibility: opts.visibility ?? "enrolled",
  });
  return id;
}

/** Delete the resource row and its R2 object. */
export async function deleteCourseResource(
  env: CloudflareEnv,
  db: Db,
  id: string,
): Promise<string | null> {
  const res = await getCourseResource(db, id);
  if (!res) return null;
  await env.DOCS.delete(res.r2Key);
  await db
    .delete(schema.courseResources)
    .where(eq(schema.courseResources.id, id));
  return res.courseId;
}

/** Fetch the stored bytes from R2. */
export async function getCourseResourceBytes(
  env: CloudflareEnv,
  r2Key: string,
): Promise<ArrayBuffer | null> {
  const obj = await env.DOCS.get(r2Key);
  return obj ? await obj.arrayBuffer() : null;
}
