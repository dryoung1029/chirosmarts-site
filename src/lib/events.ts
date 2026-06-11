/**
 * Append-only audit trail writer. This is the state-board record: we INSERT
 * only — never UPDATE or DELETE — and all derived state (seat time, completion,
 * certified status) is recomputed from these rows elsewhere.
 */
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";

export interface EventInput {
  userId?: string | null;
  type: string;
  courseId?: string | null;
  lessonId?: string | null;
  quizId?: string | null;
  // heartbeat-specific (M2)
  positionStartSeconds?: number | null;
  positionEndSeconds?: number | null;
  wallSeconds?: number | null;
  playbackRate?: number | null;
  payload?: unknown;
}

export async function logEvent(db: Db, e: EventInput): Promise<void> {
  await db.insert(schema.events).values({
    id: newId("evt"),
    userId: e.userId ?? null,
    type: e.type,
    courseId: e.courseId ?? null,
    lessonId: e.lessonId ?? null,
    quizId: e.quizId ?? null,
    positionStartSeconds: e.positionStartSeconds ?? null,
    positionEndSeconds: e.positionEndSeconds ?? null,
    wallSeconds: e.wallSeconds ?? null,
    playbackRate: e.playbackRate ?? null,
    payload: e.payload ?? null,
  });
}
