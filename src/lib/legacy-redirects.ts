/**
 * 301 redirects from the old WordPress site's indexed URLs to their new
 * equivalents — preserves SEO equity and keeps old links/bookmarks from 404ing
 * when the new platform takes over chirosmarts.com. Sourced from the old Yoast
 * sitemap (page / wpcw_course / course_unit).
 *
 * Only paths that DON'T already resolve on the new site are listed — `/`,
 * `/about`, `/verify`, `/courses`, `/dashboard` are the same on both and are
 * intentionally omitted so they just serve normally.
 */

const INITIAL_COURSE = "/courses/oregon-ca-initial";

// Exact old path → new path (keys are normalized: no trailing slash).
const EXACT: Record<string, string> = {
  "/my-account": "/dashboard",
  "/my-courses": "/dashboard",
  "/welcome": "/",
  "/test-video-page": "/",
  "/contact": "/help",
  "/chiropractic-assistant-ceus-by-the-hour": "/renewal",
  "/direct-course-sign-up": INITIAL_COURSE,
  "/student-registration": "/login",
  "/instructor-registration": "/",
  "/cart": "/courses",
  "/checkout": "/courses", // note: "/checkout/success" (new) is longer → not matched
};

/**
 * Resolve a legacy path to its 301 target, or null if none.
 * `pathname` is the raw request path (may have a trailing slash).
 */
export function legacyRedirect(pathname: string): string | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (EXACT[p]) return EXACT[p];
  // Old membership/registration flow → magic-link login.
  if (p === "/register" || p.startsWith("/register/")) return "/login";
  // Old WP Courseware course pages (singular /course/…) → the initial cert landing.
  if (p.startsWith("/course/")) return INITIAL_COURSE;
  // Old course unit/lesson pages (/module-1/…, /module-unassigned/…) → landing.
  if (/^\/module-[\w-]+\//.test(p)) return INITIAL_COURSE;
  return null;
}
