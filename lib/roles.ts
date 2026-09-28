export type UserRole = "admin" | "retention";

export function normalizeUserRole(raw: unknown): UserRole {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "retention" || v === "staff" || v === "retention_only") {
    return "retention";
  }
  return "admin";
}

export function isAdminRole(role: UserRole | string | null | undefined): boolean {
  return normalizeUserRole(role) === "admin";
}

/** Where to send the user after login. */
export function homePathForRole(role: UserRole | string | null | undefined): string {
  return isAdminRole(role) ? "/dashboard" : "/retention";
}

/**
 * Paths a retention-only user may access.
 * Everything else under the authenticated app should be blocked.
 */
export function retentionOnlyAllowed(path: string): boolean {
  if (path === "/retention" || path.startsWith("/retention/")) return true;
  if (path.startsWith("/api/retention")) return true;
  if (path.startsWith("/api/auth")) return true;
  return false;
}
