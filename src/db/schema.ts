/**
 * ChiroSmarts D1 schema (Drizzle / SQLite).
 *
 * Design rules (see CLAUDE.md / PLAN.md):
 *  - `events` and `quiz_attempts` are APPEND-ONLY. Never UPDATE derived totals;
 *    recompute seat time, completion, and certified status from `events`.
 *  - Deferred features (subscriptions, library content, live-attendance credit,
 *    additional states/paths) have columns/enums now so they need no migration.
 *  - Certificates snapshot their values at issuance.
 *  - All timestamps are UTC ISO-8601 strings; display converts to America/Los_Angeles.
 */
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Helper: UTC ISO-8601 timestamp columns default to current time.
const nowUtc = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  legalName: text("legal_name").notNull().default(""), // printed on certificates; empty until intake
  displayName: text("display_name"),
  phone: text("phone"),
  birthMonth: integer("birth_month"), // 1-12; renewal keying
  clinicName: text("clinic_name"),
  supervisingDcName: text("supervising_dc_name"),
  supervisingDcLicense: text("supervising_dc_license"),
  supervisingDcEmail: text("supervising_dc_email"),
  role: text("role", { enum: ["student", "clinic_admin", "site_admin"] })
    .notNull()
    .default("student"),
  marketingConsent: integer("marketing_consent", { mode: "boolean" })
    .notNull()
    .default(false),
  marketingConsentAt: text("marketing_consent_at"),
  intakeCompletedAt: text("intake_completed_at"), // null until the intake form is submitted
  createdAt: text("created_at").notNull().default(nowUtc),
  updatedAt: text("updated_at").notNull().default(nowUtc),
});

export const magicLinks = sqliteTable(
  "magic_links",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(), // store hash; raw token is emailed
    intent: text("intent", { enum: ["login", "signup"] })
      .notNull()
      .default("login"),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [
    index("magic_links_email_idx").on(t.email),
    uniqueIndex("magic_links_token_hash_idx").on(t.tokenHash),
  ],
);

// Server-side sessions. Concurrent logins are allowed; sessions are not revoked
// to enforce single-playback (that is handled by `playbackLeases`).
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // opaque random token (also the cookie value)
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(nowUtc),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(nowUtc),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// Single active playback DEVICE per user (compliance req 1). Short TTL, renewed
// by heartbeats; a stale (expired) lease may be stolen by another device.
export const playbackLeases = sqliteTable(
  "playback_leases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id),
    deviceId: text("device_id").notNull(),
    acquiredAt: text("acquired_at").notNull().default(nowUtc),
    lastRenewedAt: text("last_renewed_at").notNull().default(nowUtc),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [uniqueIndex("playback_leases_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Clinics (clinic-owner path: bulk seat pool + invite-by-email staff CAs)
// ---------------------------------------------------------------------------
// A clinic owner buys a POOL of training seats and invites their CAs by email;
// each CA self-claims their own account (the invite link proves email ownership,
// same security model as a magic link). Seats consumed = CA members that are
// still invited or active — RECOMPUTED from `clinicMembers`, never stored as a
// counter (compliance ethos). `seatsPurchased` is the only stored figure and is
// set by the seat-purchase flow (comped in test mode now; Stripe in M3).
export const clinics = sqliteTable(
  "clinics",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    // DEPRECATED (Phase 4): the single bulk seat count is superseded by per-course
    // `clinicSeatPools`. Kept (not dropped) because dropping a column forces a
    // table rebuild, which fails on D1 (PRAGMA foreign_keys=OFF is a no-op inside
    // a migration txn and `clinicMembers` FKs to `clinics`). Backfilled into a
    // pool row for the CA-initial course, then ignored by all reads.
    seatsPurchased: integer("seats_purchased").notNull().default(0),
    createdAt: text("created_at").notNull().default(nowUtc),
    updatedAt: text("updated_at").notNull().default(nowUtc),
  },
  (t) => [index("clinics_owner_idx").on(t.ownerUserId)],
);

// ---------------------------------------------------------------------------
// Phase 4 — per-course clinic seat pools
// ---------------------------------------------------------------------------
// One seat pool per (clinic, course). `seatsPurchased` is the ONLY stored count;
// consumed seats are RECOMPUTED from `seatAssignments` (compliance ethos), never
// stored as a counter.
export const clinicSeatPools = sqliteTable(
  "clinic_seat_pools",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    seatsPurchased: integer("seats_purchased").notNull().default(0),
    createdAt: text("created_at").notNull().default(nowUtc),
    updatedAt: text("updated_at").notNull().default(nowUtc),
  },
  (t) => [
    uniqueIndex("clinic_seat_pools_clinic_course_idx").on(t.clinicId, t.courseId),
  ],
);

// One assignment per (person, course). `clinicMembers` stays the person↔clinic
// identity (unchanged); this maps a member to a course seat. Re-granting a course
// each year adds a new row here, not a new roster row. Assigning an
// already-active member creates an `active` row directly (no invite token);
// otherwise an `invited` row holds the seat until the CA claims it.
// Consumed seats = assignments in (invited|active); expired/revoked free the seat.
export const seatAssignments = sqliteTable(
  "seat_assignments",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id") // denormalized so a pool's consumed seats recompute cheaply
      .notNull()
      .references(() => clinics.id),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    memberId: text("member_id")
      .notNull()
      .references(() => clinicMembers.id),
    status: text("status", {
      enum: ["invited", "active", "expired", "revoked"],
    })
      .notNull()
      .default("invited"),
    enrollmentId: text("enrollment_id").references(() => enrollments.id), // set when access is granted
    inviteTokenHash: text("invite_token_hash"), // null for direct (already-active member) assignments
    inviteExpiresAt: text("invite_expires_at"),
    assignedAt: text("assigned_at").notNull().default(nowUtc),
    claimedAt: text("claimed_at"),
  },
  (t) => [
    uniqueIndex("seat_assignments_member_course_idx").on(t.memberId, t.courseId),
    index("seat_assignments_pool_idx").on(t.clinicId, t.courseId),
    uniqueIndex("seat_assignments_token_idx").on(t.inviteTokenHash),
  ],
);

// Membership rows tie a person to a clinic. The owner gets a `role=owner` row;
// each invited CA gets a `role=ca` row that starts `invited` (with an invite
// token hash) and becomes `active` once they claim it. `userId` is null until
// the invite is claimed. Seats are consumed by CA rows in (invited|active).
export const clinicMembers = sqliteTable(
  "clinic_members",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id),
    userId: text("user_id").references(() => users.id), // null until claimed
    email: text("email").notNull(), // normalized; the invited address
    role: text("role", { enum: ["owner", "ca"] }).notNull(),
    status: text("status", { enum: ["invited", "active", "removed"] })
      .notNull()
      .default("invited"),
    inviteTokenHash: text("invite_token_hash"), // null for owner / claimed rows
    inviteExpiresAt: text("invite_expires_at"),
    invitedAt: text("invited_at").notNull().default(nowUtc),
    claimedAt: text("claimed_at"),
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [
    index("clinic_members_clinic_idx").on(t.clinicId),
    index("clinic_members_user_idx").on(t.userId),
    index("clinic_members_email_idx").on(t.email),
    uniqueIndex("clinic_members_invite_token_idx").on(t.inviteTokenHash),
  ],
);

// ---------------------------------------------------------------------------
// Course catalog
// ---------------------------------------------------------------------------
export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  creditHours: real("credit_hours").notNull().default(0),
  // Exam-unlock floor in CONTENT minutes (union-coverage credited time). NULL =
  // no explicit floor; the gate then relies on per-lesson coverage only. Kept
  // separate from creditHours (the certificate figure) so a course can grant
  // more credit than its video runtime — e.g. Vitals, where credit includes
  // off-video practice logged on paper. Never let this exceed runtime (the gate
  // clamps it) or the exam would be unreachable.
  requiredSeatMinutes: integer("required_seat_minutes"),
  topicCategory: text("topic_category", {
    enum: ["general", "vitals", "cultural_competency", "hipaa"],
  })
    .notNull()
    .default("general"),
  state: text("state").notNull().default("oregon"),
  audience: text("audience", { enum: ["ca", "dc"] })
    .notNull()
    .default("ca"),
  // Deferred-feature enums land now (no behavior yet):
  contentType: text("content_type", { enum: ["ce_course", "library_episode"] })
    .notNull()
    .default("ce_course"),
  accessModel: text("access_model", {
    enum: ["one_time_purchase", "subscription", "free"],
  })
    .notNull()
    .default("one_time_purchase"),
  // Per-course price in cents — the single source of truth for every display
  // surface. No price is ever hard-coded in app code (catalog/checkout/seats all
  // read this). Default 0 so a row without an explicit price is obviously unset.
  priceCents: integer("price_cents").notNull().default(0),
  stripePriceId: text("stripe_price_id"),
  status: text("status", { enum: ["draft", "published", "archived"] })
    .notNull()
    .default("draft"),
  passThreshold: real("pass_threshold").notNull().default(0.8),
  maxPlaybackRate: real("max_playback_rate").notNull().default(1.5),
  instructorName: text("instructor_name").notNull().default("Jason Young, DC"),
  certifyingBodyLine: text("certifying_body_line"),
  createdAt: text("created_at").notNull().default(nowUtc),
  updatedAt: text("updated_at").notNull().default(nowUtc),
});

export const modules = sqliteTable(
  "modules",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    isFreePreview: integer("is_free_preview", { mode: "boolean" })
      .notNull()
      .default(false), // Module 1 = true; paywall begins at Module 2
  },
  (t) => [index("modules_course_idx").on(t.courseId, t.position)],
);

export const lessons = sqliteTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    moduleId: text("module_id")
      .notNull()
      .references(() => modules.id),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    streamVideoUid: text("stream_video_uid"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    // Public free preview: when true, anyone (no login) can watch the first
    // `previewSeconds` of this lesson on the course landing page. Marketing only —
    // previews never accrue compliance seat time.
    isPreview: integer("is_preview", { mode: "boolean" }).notNull().default(false),
    previewSeconds: integer("preview_seconds").notNull().default(300),
    // Future live events credit by attendance instead of playback:
    evidenceType: text("evidence_type", {
      enum: ["playback_heartbeat", "live_attendance"],
    })
      .notNull()
      .default("playback_heartbeat"),
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [index("lessons_module_idx").on(t.moduleId, t.position)],
);

// Timestamped transcript chunks (ingested in M2 from Riverside exports).
// Serves captions/accessibility now and powers the M6 AI tutor's retrieval.
export const lessonTranscripts = sqliteTable(
  "lesson_transcripts",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id),
    chunkIndex: integer("chunk_index").notNull(),
    startSeconds: real("start_seconds").notNull(),
    endSeconds: real("end_seconds").notNull(),
    text: text("text").notNull(),
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [index("lesson_transcripts_lesson_idx").on(t.lessonId, t.chunkIndex)],
);

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------
export const quizzes = sqliteTable(
  "quizzes",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    moduleId: text("module_id").references(() => modules.id), // null = course-level (final exam)
    kind: text("kind", { enum: ["knowledge_check", "final_exam"] }).notNull(),
    title: text("title").notNull(),
    passThreshold: real("pass_threshold"), // null = use course default
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [index("quizzes_course_idx").on(t.courseId)],
);

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    position: integer("position").notNull(),
    prompt: text("prompt").notNull(),
    type: text("type", {
      enum: ["single_choice", "multi_choice", "true_false"],
    }).notNull(),
    explanation: text("explanation"),
    // Optional deep-link to where the answer is taught: a lesson + start second.
    // Surfaced as a "jump to the answer" link when a student misses the question.
    sourceLessonId: text("source_lesson_id").references(() => lessons.id),
    sourceStartSeconds: integer("source_start_seconds"),
  },
  (t) => [index("questions_quiz_idx").on(t.quizId, t.position)],
);

export const answerOptions = sqliteTable(
  "answer_options",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    isCorrect: integer("is_correct", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [index("answer_options_question_idx").on(t.questionId, t.position)],
);

// APPEND-ONLY and the SOLE system of record for quiz data. Failed attempts are
// retained, never overwritten. `events` may only hold a thin pointer here.
export const quizAttempts = sqliteTable(
  "quiz_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    attemptNumber: integer("attempt_number").notNull(),
    score: real("score").notNull(), // 0..1
    passed: integer("passed", { mode: "boolean" }).notNull(),
    answers: text("answers", { mode: "json" }).notNull(), // snapshot of submitted answers
    startedAt: text("started_at").notNull().default(nowUtc),
    submittedAt: text("submitted_at").notNull().default(nowUtc),
  },
  (t) => [index("quiz_attempts_user_quiz_idx").on(t.userId, t.quizId)],
);

// ---------------------------------------------------------------------------
// Roadmap (path templates are DATA, not code)
// ---------------------------------------------------------------------------
export const pathTemplates = sqliteTable("path_templates", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  state: text("state").notNull().default("oregon"),
  audience: text("audience", { enum: ["ca", "dc"] })
    .notNull()
    .default("ca"),
  status: text("status", { enum: ["draft", "published"] })
    .notNull()
    .default("draft"),
});

export const pathTemplateSteps = sqliteTable(
  "path_template_steps",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => pathTemplates.id),
    position: integer("position").notNull(),
    key: text("key").notNull(), // stable id, e.g. "hands_on_log"
    title: text("title").notNull(),
    description: text("description"),
    stepType: text("step_type", {
      enum: [
        "account",
        "course",
        "upload_log",
        "external_action",
        "exam",
        "bls",
        "custom",
      ],
    }).notNull(),
    courseId: text("course_id").references(() => courses.id),
    gatingRule: text("gating_rule", { mode: "json" }), // e.g. {requires_step_key, requires_certificate}
    evidenceRequired: integer("evidence_required", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [index("path_template_steps_template_idx").on(t.templateId, t.position)],
);

export const userPaths = sqliteTable(
  "user_paths",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    templateId: text("template_id")
      .notNull()
      .references(() => pathTemplates.id),
    status: text("status", { enum: ["active", "complete"] })
      .notNull()
      .default("active"),
    startedAt: text("started_at").notNull().default(nowUtc),
    completedAt: text("completed_at"),
  },
  (t) => [index("user_paths_user_idx").on(t.userId)],
);

export const userSteps = sqliteTable(
  "user_steps",
  {
    id: text("id").primaryKey(),
    userPathId: text("user_path_id")
      .notNull()
      .references(() => userPaths.id),
    templateStepId: text("template_step_id")
      .notNull()
      .references(() => pathTemplateSteps.id),
    position: integer("position").notNull(), // snapshot
    title: text("title").notNull(), // snapshot
    status: text("status", {
      enum: ["locked", "available", "in_progress", "complete", "waived"],
    })
      .notNull()
      .default("locked"),
    evidenceRef: text("evidence_ref"),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull().default(nowUtc),
  },
  (t) => [index("user_steps_path_idx").on(t.userPathId, t.position)],
);

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------
export const enrollments = sqliteTable(
  "enrollments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    status: text("status", {
      enum: ["pending", "active", "completed", "refunded"],
    })
      .notNull()
      .default("pending"),
    paymentStatus: text("payment_status", {
      // `clinic_seat` (Phase 4): access granted by a clinic owner's seat pool,
      // not a student-level payment. Type-only enum change — SQLite has no CHECK
      // here, so it needs no DB migration.
      enum: ["unpaid", "paid", "free", "comp", "clinic_seat"],
    })
      .notNull()
      .default("unpaid"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    amountCents: integer("amount_cents"),
    enrolledAt: text("enrolled_at").notNull().default(nowUtc),
    activatedAt: text("activated_at"),
    completedAt: text("completed_at"),
  },
  (t) => [uniqueIndex("enrollments_user_course_idx").on(t.userId, t.courseId)],
);

// ---------------------------------------------------------------------------
// Events — APPEND-ONLY audit trail (the state-board record)
// ---------------------------------------------------------------------------
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    type: text("type").notNull(), // login | lesson_heartbeat | quiz_attempt (pointer) | certificate_issued | ...
    courseId: text("course_id").references(() => courses.id),
    lessonId: text("lesson_id").references(() => lessons.id),
    quizId: text("quiz_id").references(() => quizzes.id),
    occurredAt: text("occurred_at").notNull().default(nowUtc),
    // Heartbeat-specific typed columns (nullable) for clean seat-time recompute:
    positionStartSeconds: real("position_start_seconds"),
    positionEndSeconds: real("position_end_seconds"),
    wallSeconds: real("wall_seconds"),
    playbackRate: real("playback_rate"),
    payload: text("payload", { mode: "json" }), // everything else (incl. quiz_attempt pointer id)
  },
  (t) => [
    index("events_user_idx").on(t.userId, t.occurredAt),
    index("events_lesson_idx").on(t.lessonId, t.type),
  ],
);

// ---------------------------------------------------------------------------
// Certificates (snapshot values at issuance) & document vault
// ---------------------------------------------------------------------------
export const certificates = sqliteTable(
  "certificates",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    verificationCode: text("verification_code").notNull().unique(), // public lookup (random, unguessable)
    certNumber: text("cert_number").unique(), // human-readable serial, e.g. CS-2026-0001
    legalNameSnapshot: text("legal_name_snapshot").notNull(),
    courseTitleSnapshot: text("course_title_snapshot").notNull(),
    creditHoursSnapshot: real("credit_hours_snapshot").notNull(),
    instructorSnapshot: text("instructor_snapshot").notNull(),
    issuedAt: text("issued_at").notNull(), // completion date
    r2Key: text("r2_key"), // PDF location in R2
    status: text("status", { enum: ["issued", "revoked", "reissued"] })
      .notNull()
      .default("issued"),
    supersedesId: text("supersedes_id"),
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [index("certificates_user_idx").on(t.userId)],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", { enum: ["hands_on_log", "other"] })
      .notNull()
      .default("other"),
    title: text("title").notNull(),
    r2Key: text("r2_key").notNull(),
    verifiedBy: text("verified_by"),
    notes: text("notes"),
    uploadedAt: text("uploaded_at").notNull().default(nowUtc),
  },
  (t) => [index("documents_user_idx").on(t.userId)],
);

// Course-level downloadable assets the course PROVIDES to students — e.g. the
// blank Vitals practice-log PDF the student prints and fills in. Distinct from
// `documents` (the student's own uploaded, completed evidence). Stored in R2.
export const courseResources = sqliteTable(
  "course_resources",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    type: text("type", {
      enum: ["practice_log_template", "handout", "other"],
    })
      .notNull()
      .default("other"),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull().default("application/pdf"),
    r2Key: text("r2_key").notNull(),
    // `enrolled` = entitled students only; `public` = anyone (e.g. a syllabus).
    visibility: text("visibility", { enum: ["enrolled", "public"] })
      .notNull()
      .default("enrolled"),
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [index("course_resources_course_idx").on(t.courseId)],
);

// Collateral Studio (docs/collateral-studio-design.md): the editable,
// owner-approved SOURCE OF TRUTH for generated course collateral (study guides,
// checklists, cheat-sheets). The PUBLISHED PDF is a derived artifact in R2 +
// surfaced via `course_resources`; this row stays editable and versioned.
// Generated from `lesson_transcripts` via Claude, in the owner's voice. Additive
// table (no rebuild) — safe on D1.
export const courseCollateral = sqliteTable(
  "course_collateral",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    // Scope of the source material this collateral was generated from.
    scope: text("scope", { enum: ["course", "module", "lesson"] })
      .notNull()
      .default("course"),
    scopeRefId: text("scope_ref_id"), // module/lesson id when scoped; null for whole course
    type: text("type", {
      enum: [
        "study_guide",
        "checklist",
        "cheat_sheet",
        "glossary",
        "practice_questions",
        "handout",
      ],
    }).notNull(),
    title: text("title").notNull(),
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    bodyMarkdown: text("body_markdown").notNull().default(""),
    model: text("model"), // generation model id (provenance); null if hand-written
    sourceMeta: text("source_meta"), // JSON: lesson ids + transcript snapshot used
    r2Key: text("r2_key"), // published PDF object key; null until published
    resourceId: text("resource_id").references(() => courseResources.id), // student-facing row
    version: integer("version").notNull().default(0), // bumps on each publish
    sortOrder: integer("sort_order").notNull().default(0), // ordering within a course (manage view + manual compile)
    inManual: integer("in_manual", { mode: "boolean" }).notNull().default(true), // include in the compiled course manual
    createdAt: text("created_at").notNull().default(nowUtc),
    updatedAt: text("updated_at").notNull().default(nowUtc),
    publishedAt: text("published_at"),
  },
  (t) => [
    index("course_collateral_course_idx").on(t.courseId),
    index("course_collateral_status_idx").on(t.status),
  ],
);

// Blog (CA content marketing). DB-backed so posts can be AI-drafted, edited, and
// published from the admin without a redeploy; rendered SSR for SEO. Additive
// table (no rebuild) — safe on D1.
export const blogPosts = sqliteTable(
  "blog_posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    bodyMarkdown: text("body_markdown").notNull().default(""),
    author: text("author").notNull().default("Jason Young, DC"),
    authorCredentials: text("author_credentials"),
    tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
    status: text("status", { enum: ["draft", "scheduled", "published"] })
      .notNull()
      .default("draft"),
    heroImage: text("hero_image"),
    heroPrompt: text("hero_prompt"), // editable image-gen prompt (two-step hero flow)
    heroAlt: text("hero_alt"), // descriptive alt text for the hero (accessibility + SEO)
    seoDescription: text("seo_description"),
    model: text("model"), // AI generation provenance; null if hand-written
    scheduledAt: text("scheduled_at"), // UTC; status=scheduled auto-publishes at/after this
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull().default(nowUtc),
    updatedAt: text("updated_at").notNull().default(nowUtc),
  },
  (t) => [
    uniqueIndex("blog_posts_slug_idx").on(t.slug),
    index("blog_posts_status_idx").on(t.status, t.publishedAt),
  ],
);

// AEO citation-presence audit snapshots (@jeldon/aeo-audit). The engine operates
// on the whole rolling SnapshotStoreData object, so we persist it as one JSON
// blob (single row, id='default') — the D1 analogue of its FsSnapshotStore.
export const aeoAuditStore = sqliteTable("aeo_audit_store", {
  id: text("id").primaryKey(),
  data: text("data").notNull(), // JSON.stringify(SnapshotStoreData)
  updatedAt: text("updated_at").notNull().default(nowUtc),
});

// Generated amplification kit (social channels + newsletter) per blog post,
// produced by @jeldon/amplify. One row per post; stored for review (not sent).
export const amplifyKits = sqliteTable("amplify_kits", {
  postId: text("post_id").primaryKey(),
  kit: text("kit").notNull(), // JSON: per-channel copy { facebook, linkedin, ... }
  newsletter: text("newsletter"), // JSON: { subject, body }
  model: text("model"),
  updatedAt: text("updated_at").notNull().default(nowUtc),
});

// A bundle is a single saleable `courses` row (one price, one purchase) whose
// fulfilment activates enrollments in its CONSTITUENT courses. `bundle_items`
// maps a bundle course to its children; checkout/webhook fulfilment expands the
// purchased course id into this list. No per-hour or hours-bank concept — a
// bundle is just "buy this SKU → get these courses".
export const bundleItems = sqliteTable(
  "bundle_items",
  {
    id: text("id").primaryKey(),
    bundleCourseId: text("bundle_course_id")
      .notNull()
      .references(() => courses.id),
    childCourseId: text("child_course_id")
      .notNull()
      .references(() => courses.id),
  },
  (t) => [
    uniqueIndex("bundle_items_pair_idx").on(t.bundleCourseId, t.childCourseId),
    index("bundle_items_bundle_idx").on(t.bundleCourseId),
  ],
);

// Marketing leads captured from the funnel (renewal checker, lead-magnet PDF).
// DOUBLE-OPT-IN: a lead is `pending` until it confirms via the emailed link, then
// `confirmed` — only confirmed leads are eligible for Brevo sync. Kept separate
// from `users` (an account) and from compliance data. `consentAt` records the
// single opt-in submission; `confirmedAt` the double opt-in.
export const marketingLeads = sqliteTable(
  "marketing_leads",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(), // normalized lowercase
    source: text("source", {
      enum: ["renewal_checker", "checklist_pdf", "newsletter", "other"],
    })
      .notNull()
      .default("other"),
    birthMonth: integer("birth_month"),
    status: text("status", {
      enum: ["pending", "confirmed", "unsubscribed"],
    })
      .notNull()
      .default("pending"),
    confirmTokenHash: text("confirm_token_hash"),
    consentAt: text("consent_at").notNull().default(nowUtc),
    confirmedAt: text("confirmed_at"),
    syncedToBrevoAt: text("synced_to_brevo_at"),
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [
    uniqueIndex("marketing_leads_email_source_idx").on(t.email, t.source),
    index("marketing_leads_status_idx").on(t.status),
  ],
);

// Semantic-search vectors for transcript chunks (M6 tutor). Each row holds one
// chunk's normalized embedding (Float32 bytes) for a given model, so the tutor
// can rank by cosine similarity instead of keyword overlap. Decoupled from
// `lesson_transcripts` so models can be swapped/re-embedded without touching the
// transcript of record. Cosine is computed in-JS over the course's vectors
// (no Vectorize needed at this scale).
export const transcriptEmbeddings = sqliteTable(
  "transcript_embeddings",
  {
    id: text("id").primaryKey(),
    lessonTranscriptId: text("lesson_transcript_id")
      .notNull()
      .references(() => lessonTranscripts.id),
    lessonId: text("lesson_id").notNull(), // denormalized for fast entitlement filtering
    model: text("model").notNull(),
    dim: integer("dim").notNull(),
    vector: blob("vector", { mode: "buffer" }).notNull(), // normalized Float32 little-endian
    createdAt: text("created_at").notNull().default(nowUtc),
  },
  (t) => [
    uniqueIndex("transcript_emb_chunk_model_idx").on(t.lessonTranscriptId, t.model),
    index("transcript_emb_lesson_idx").on(t.lessonId, t.model),
  ],
);
