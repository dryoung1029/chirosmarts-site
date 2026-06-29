/**
 * Admin: reorder a collateral item within its course by swapping sort_order
 * with its neighbour. Form POST with `dir` = "up" | "down".
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { and, asc, eq, gt, lt, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const back = "/admin/collateral";

  const row = await db
    .select()
    .from(schema.courseCollateral)
    .where(eq(schema.courseCollateral.id, id))
    .get();
  if (!row) return redirect(back, 303);

  const form = await request.formData();
  const dir = String(form.get("dir") ?? "");

  // Find the adjacent item in the same course by sort_order.
  const C = schema.courseCollateral;
  const neighbour =
    dir === "up"
      ? await db
          .select()
          .from(C)
          .where(and(eq(C.courseId, row.courseId), lt(C.sortOrder, row.sortOrder)))
          .orderBy(desc(C.sortOrder))
          .get()
      : dir === "down"
        ? await db
            .select()
            .from(C)
            .where(and(eq(C.courseId, row.courseId), gt(C.sortOrder, row.sortOrder)))
            .orderBy(asc(C.sortOrder))
            .get()
        : null;

  if (neighbour) {
    // Swap the two sort_order values.
    await db
      .update(C)
      .set({ sortOrder: neighbour.sortOrder })
      .where(eq(C.id, row.id));
    await db
      .update(C)
      .set({ sortOrder: row.sortOrder })
      .where(eq(C.id, neighbour.id));
  }

  return redirect(back, 303);
};
