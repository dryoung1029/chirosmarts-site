/**
 * Shared-secret check for the cron endpoints (no session; see middleware).
 * The secret is accepted ONLY in the `x-cron-key` header, never the query
 * string, where it would land in access logs, analytics, and referrers.
 * The scheduler (.github/workflows/cron.yml) already sends the header.
 */
export function isCronAuthorized(env: CloudflareEnv, request: Request): boolean {
  const expected = env.CRON_SECRET ?? "";
  const given = request.headers.get("x-cron-key") ?? "";
  if (!expected || given.length !== expected.length) return false;
  // Constant-time compare: don't leak how many leading characters matched.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
