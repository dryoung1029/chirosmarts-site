import { describe, it, expect } from "vitest";
import { isAdmin } from "./admin";
import type { SessionUser } from "./auth/session";

const env = (ADMIN_EMAILS?: string) => ({ ADMIN_EMAILS }) as unknown as CloudflareEnv;
const user = (email: string, role: SessionUser["role"]) => ({ email, role }) as SessionUser;

describe("isAdmin", () => {
  it("grants allowlisted addresses regardless of stored role", () => {
    expect(isAdmin(env("Boss@Example.com"), user("boss@example.com", "student"))).toBe(true);
  });
  it("revokes a stored site_admin role that is no longer allowlisted", () => {
    expect(isAdmin(env("boss@example.com"), user("former@example.com", "site_admin"))).toBe(false);
  });
  it("falls back to the stored role only when the allowlist is empty", () => {
    expect(isAdmin(env(""), user("boss@example.com", "site_admin"))).toBe(true);
    expect(isAdmin(env(undefined), user("x@example.com", "student"))).toBe(false);
  });
  it("rejects anonymous", () => {
    expect(isAdmin(env("boss@example.com"), null)).toBe(false);
  });
});
