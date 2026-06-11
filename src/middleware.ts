/**
 * Request middleware: resolves the session, attaches `locals.user`, and guards
 * routes.
 *
 *  - Public routes are always allowed.
 *  - Protected routes require a session (else → /login).
 *  - A signed-in user who hasn't finished intake is funneled to /intake
 *    (except for the intake routes and logout themselves).
 */
import { defineMiddleware } from "astro:middleware";
import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/admin";

// Routes reachable without a session.
const PUBLIC_PATHS = new Set<string>([
  "/",
  "/health",
  "/login",
  "/api/auth/request-link",
  "/auth/callback",
  "/clinic/join", // clinic invite claim (token authenticates the CA)
  "/api/stripe/webhook", // server-to-server; trust comes from the signature
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Public course catalog + landing pages (Q6 — only content is gated).
  if (pathname === "/courses" || pathname.startsWith("/courses/")) return true;
  // public verification route (M4) and static assets
  if (pathname.startsWith("/verify/")) return true;
  if (pathname.startsWith("/_")) return true; // _astro, _image, _server-islands
  if (pathname.startsWith("/favicon")) return true;
  return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { locals, cookies, url, redirect } = context;
  locals.user = null;
  locals.sessionId = null;

  const env = locals.runtime?.env;
  if (env?.DB) {
    const db = getDb(env);
    const resolved = await getSessionUser(db, cookies);
    if (resolved) {
      locals.user = resolved.user;
      locals.sessionId = resolved.sessionId;
    }
  }

  const path = url.pathname;

  // Not signed in + private route → login.
  if (!locals.user && !isPublic(path)) {
    return redirect(`/login?next=${encodeURIComponent(path)}`, 302);
  }

  // Signed in but intake incomplete → force intake (allow intake + logout).
  if (
    locals.user &&
    !locals.user.intakeCompletedAt &&
    path !== "/intake" &&
    path !== "/api/intake" &&
    path !== "/api/auth/logout" &&
    !isPublic(path)
  ) {
    return redirect("/intake", 302);
  }

  // Already signed in and fully onboarded? Skip the login page.
  if (locals.user && locals.user.intakeCompletedAt && path === "/login") {
    return redirect("/dashboard", 302);
  }

  // Admin area requires the site_admin role (or an ADMIN_EMAILS match).
  if (
    (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/")) &&
    !isAdmin(env, locals.user)
  ) {
    return redirect("/dashboard", 302);
  }

  return next();
});
