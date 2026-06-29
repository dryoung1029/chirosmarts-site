/**
 * Admin: publish, unpublish, schedule, or unschedule a blog post. Form POST with
 * `action` = "publish" | "unpublish" | "schedule" | "unschedule". Scheduled
 * posts auto-publish at their time via promoteDuePosts() on public blog routes.
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const back = `/admin/blog/${id}`;

  const row = await db
    .select()
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.id, id))
    .get();
  if (!row) return redirect("/admin/blog", 303);

  const form = await request.formData();
  const action = String(form.get("action") ?? "");

  if (action === "publish") {
    if (!row.bodyMarkdown.trim() || !row.title.trim()) {
      return redirect(`${back}?msg=Add+a+title+and+body+before+publishing`, 303);
    }
    await db
      .update(schema.blogPosts)
      .set({
        status: "published",
        publishedAt: row.publishedAt ?? nowIso(),
        updatedAt: nowIso(),
      })
      .where(eq(schema.blogPosts.id, id));
    return redirect(`${back}?msg=Published`, 303);
  }

  if (action === "unpublish" || action === "unschedule") {
    await db
      .update(schema.blogPosts)
      .set({ status: "draft", scheduledAt: null, updatedAt: nowIso() })
      .where(eq(schema.blogPosts.id, id));
    const m = action === "unschedule" ? "Schedule+cancelled" : "Moved+back+to+draft";
    return redirect(`${back}?msg=${m}#publish`, 303);
  }

  if (action === "schedule") {
    if (!row.bodyMarkdown.trim() || !row.title.trim()) {
      return redirect(`${back}?msg=Add+a+title+and+body+before+scheduling#publish`, 303);
    }
    // Primary: ISO UTC computed client-side from the browser's timezone.
    // Fallback (no JS): treat the datetime-local value as America/Los_Angeles.
    const iso = String(form.get("scheduledAt") ?? "").trim();
    const local = String(form.get("scheduledLocal") ?? "").trim();
    const when = iso || (local ? pacificWallTimeToUtc(local) : "");
    const ts = when ? Date.parse(when) : NaN;
    if (Number.isNaN(ts)) {
      return redirect(`${back}?msg=Pick+a+valid+date+and+time#publish`, 303);
    }
    if (ts <= Date.now()) {
      // Past/now → just publish immediately.
      await db
        .update(schema.blogPosts)
        .set({ status: "published", publishedAt: nowIso(), scheduledAt: null, updatedAt: nowIso() })
        .where(eq(schema.blogPosts.id, id));
      return redirect(`${back}?msg=That+time+had+passed+so+it%27s+published+now#publish`, 303);
    }
    await db
      .update(schema.blogPosts)
      .set({
        status: "scheduled",
        scheduledAt: new Date(ts).toISOString(),
        publishedAt: null,
        updatedAt: nowIso(),
      })
      .where(eq(schema.blogPosts.id, id));
    return redirect(`${back}?msg=Scheduled#publish`, 303);
  }

  return redirect(back, 303);
};

/**
 * Interpret a `datetime-local` wall-clock string ("YYYY-MM-DDTHH:mm") as Pacific
 * time and return its UTC ISO. Used only when the client JS didn't run; DST is
 * resolved from the actual America/Los_Angeles offset at that instant.
 */
function pacificWallTimeToUtc(local: string): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return "";
  const [, Y, Mo, D, H, Mi] = m.map(Number);
  // Candidate instant if the wall time were UTC, then subtract LA's offset.
  const candidate = Date.UTC(Y, Mo - 1, D, H, Mi);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  // What wall time does `candidate` show in LA? Difference = the offset.
  const parts = fmt.formatToParts(new Date(candidate));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  const offset = shown - candidate; // ms LA is ahead of UTC (negative)
  return new Date(candidate - offset).toISOString();
}
