# Phase 4 — Per-Course Clinic Seat Pools: Migration + DDL (for review)

Status: **proposed, not implemented.** This is the concrete schema + migration to
review before building Phase 4. Reflects the approved decisions: normalized
`seat_assignments`, `clinic_members` unchanged (one row per person, keeps invite/
claim machinery), assigning an already-active member needs no invite,
`payment_status='clinic_seat'`, the documented seat lifecycle, and refund handling.

## Design summary

- **`clinic_seat_pools(clinic_id, course_id, seats_purchased)`** — one pool per
  clinic per course. `seats_purchased` is the only stored figure.
- **`seat_assignments(member_id, course_id, status, enrollment_id, …)`** — one row
  per (person, course). `clinic_members` is the person-in-clinic identity and is
  **unchanged**. Re-granting a course next year = a new `seat_assignments` row for
  an existing member (no new roster row, no new invite if already active).
- **Consumed seats = recomputed**, never stored: `count(seat_assignments)` for the
  pool's `(clinic_id, course_id)` where `status IN ('invited','active')`.
  `available = seats_purchased − consumed`. `expired`/`revoked` free the seat.
- **`enrollments.payment_status` gains `'clinic_seat'`** — a drizzle text-enum
  value, **type-only**, so it needs **no DB migration** (SQLite has no CHECK here).
- **`clinics.seats_purchased` is kept (deprecated), not dropped.** Dropping it
  would force a `clinics` table rebuild, which **fails on D1** (the same
  `PRAGMA foreign_keys=OFF`-in-transaction limitation that broke the `courses`
  default change — `clinic_members` FKs to `clinics`). It is backfilled into a
  pool row and then ignored by all reads.

### Seat lifecycle (encoded in `seat_assignments.status`)
| status    | meaning                                  | counts as consumed? |
|-----------|------------------------------------------|---------------------|
| `invited` | seat held, awaiting claim                | yes                 |
| `active`  | claimed — **permanently consumed**       | yes                 |
| `expired` | invite lapsed after 30 days — seat freed | no                  |
| `revoked` | owner revoked an unclaimed invite        | no                  |

- Unclaimed `invited` → `expired` after `invite_expires_at` (30 days); frees the seat.
- `active` is terminal: a member leaving the clinic does **not** change it, and
  **never revokes the linked enrollment or any certificate**.
- Refund of a seat purchase: log an event for manual handling; **no automatic pool
  shrinking** and no enrollment/cert revocation.

---

## 1. Drizzle schema additions (`src/db/schema.ts`)

```ts
// One seat pool per clinic per course. `seatsPurchased` is the only stored count;
// consumed seats are recomputed from seat_assignments (compliance ethos).
export const clinicSeatPools = sqliteTable(
  "clinic_seat_pools",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull().references(() => clinics.id),
    courseId: text("course_id").notNull().references(() => courses.id),
    seatsPurchased: integer("seats_purchased").notNull().default(0),
    createdAt: text("created_at").notNull().default(nowUtc),
    updatedAt: text("updated_at").notNull().default(nowUtc),
  },
  (t) => [uniqueIndex("clinic_seat_pools_clinic_course_idx").on(t.clinicId, t.courseId)],
);

// One assignment per (person, course). clinic_members stays the person↔clinic
// identity (unchanged); this maps a member to a course seat. Re-granting a course
// each year adds a new row here, not a new roster row. Assigning an already-active
// member can create an `active` row directly (no invite token).
export const seatAssignments = sqliteTable(
  "seat_assignments",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull().references(() => clinics.id), // denormalized for pool recompute
    courseId: text("course_id").notNull().references(() => courses.id),
    memberId: text("member_id").notNull().references(() => clinicMembers.id),
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
```

And one enum value (type-only — no migration):

```ts
// enrollments.paymentStatus enum:
paymentStatus: text("payment_status", {
  enum: ["unpaid", "paid", "free", "comp", "clinic_seat"], // + clinic_seat
})
```

Plus a deprecation comment on `clinics.seatsPurchased` (kept for D1-safety; backfilled, then unused).

---

## 2. Generated DDL + hand-written backfill (one migration file)

`drizzle-kit generate` emits the `CREATE TABLE`/`CREATE INDEX` below. **Append the
backfill block by hand** (drizzle generates schema only, not data) with
`--> statement-breakpoint` separators.

```sql
CREATE TABLE `clinic_seat_pools` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`course_id` text NOT NULL,
	`seats_purchased` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`),
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clinic_seat_pools_clinic_course_idx` ON `clinic_seat_pools` (`clinic_id`,`course_id`);
--> statement-breakpoint
CREATE TABLE `seat_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`course_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`enrollment_id` text,
	`invite_token_hash` text,
	`invite_expires_at` text,
	`assigned_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`claimed_at` text,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`),
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`),
	FOREIGN KEY (`member_id`) REFERENCES `clinic_members`(`id`),
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seat_assignments_member_course_idx` ON `seat_assignments` (`member_id`,`course_id`);
--> statement-breakpoint
CREATE INDEX `seat_assignments_pool_idx` ON `seat_assignments` (`clinic_id`,`course_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `seat_assignments_token_idx` ON `seat_assignments` (`invite_token_hash`);
--> statement-breakpoint

-- ===== HAND-WRITTEN BACKFILL (append after the generated DDL) =====

-- (a) Existing single CA seat pool → a per-course pool row for the CA course.
INSERT INTO `clinic_seat_pools` (id, clinic_id, course_id, seats_purchased, created_at, updated_at)
SELECT 'csp_caini_' || c.id, c.id, 'crs_or_ca_initial', c.seats_purchased,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM `clinics` c
WHERE c.seats_purchased > 0;
--> statement-breakpoint

-- (b) Existing CA clinic_members → a CA seat_assignment each, mapping status and
--     linking to their CA enrollment when one exists. Owners (role='owner') don't
--     consume seats and are skipped. 'removed' members map to 'revoked' (seat freed);
--     'active'/'invited' carry over. Invite token/expiry copied so pending invites
--     keep working under the new model.
INSERT INTO `seat_assignments`
  (id, clinic_id, course_id, member_id, status, enrollment_id, invite_token_hash, invite_expires_at, assigned_at, claimed_at)
SELECT 'sa_caini_' || m.id, m.clinic_id, 'crs_or_ca_initial', m.id,
       CASE m.status WHEN 'active' THEN 'active'
                     WHEN 'invited' THEN 'invited'
                     ELSE 'revoked' END,
       (SELECT e.id FROM `enrollments` e
         WHERE e.user_id = m.user_id AND e.course_id = 'crs_or_ca_initial' LIMIT 1),
       m.invite_token_hash, m.invite_expires_at, m.invited_at, m.claimed_at
FROM `clinic_members` m
WHERE m.role = 'ca';
```

> The `crs_or_ca_initial` literal is the one course clinic seats applied to
> pre-Phase-4 (matches `SEAT_COURSE_ID` in `src/pages/api/clinic/seats.ts`).

### D1 safety checklist
- ✅ Only `CREATE TABLE` / `CREATE INDEX` / `INSERT … SELECT` — all run inside the
  D1 migration transaction.
- ✅ **No table rebuild** (no `DROP`/recreate of `clinics`, `clinic_members`, or
  `enrollments`) — avoids the `PRAGMA foreign_keys=OFF`-in-transaction failure that
  broke the `courses` rebuild earlier this cycle.
- ✅ `clinics.seats_purchased` retained (deprecated) — no destructive column drop.
- ✅ `payment_status='clinic_seat'` is a drizzle-type change only; not in this SQL.

---

## 3. Application changes that ride on this migration (for the build, not this review)

1. `src/lib/clinic.ts`: `getSeatSummary`/`grantSeats` become per-pool
   (`(clinicId, courseId)`); consumed recomputed from `seat_assignments`.
2. `src/pages/api/clinic/seats.ts`: take `{ courseId, count }`; price from that
   course; Stripe metadata `kind=seats` carries `courseId`; webhook grants to the
   right pool.
3. Invite/assign: `POST /api/clinic/assign` `{ courseId, email }` →
   - existing **active** member → create `active` seat_assignment + `activateEnrollment(.., 'clinic_seat')`, **no invite**;
   - new/inactive → `invited` seat_assignment + emailed invite; claim activates the enrollment.
4. Claim flow (`/clinic/join`): on claim, set assignment `active`, set `claimedAt`,
   and `activateEnrollment(userId, courseId, 'clinic_seat')`; store `enrollmentId`.
5. Expiry: lazily mark `invited` → `expired` when past `invite_expires_at` (or a
   scheduled sweep); excluded from consumed.
6. Refund webhook: log `clinic_seat_refund_manual_review`; no pool/enrollment change.
7. Clinic dashboard: one panel per course pool (bought / assigned / available +
   per-course roster + assign form).
8. Audit events: `clinic_pool_seats_granted`, `clinic_seat_assigned`,
   `clinic_seat_claimed`, `clinic_seat_expired`, `clinic_seat_refund_manual_review`.
