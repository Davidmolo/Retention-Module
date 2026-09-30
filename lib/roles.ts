export type UserRole = "super_admin" | "admin" | "retention";

export type AppModule =
  | "dashboard"
  | "gross-profit"
  | "retention"
  | "detention";

export const ALL_MODULES: AppModule[] = [
  "dashboard",
  "gross-profit",
  "retention",
  "detention",
];

export function normalizeUserRole(raw: unknown): UserRole {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "super_admin" || v === "superadmin" || v === "super-admin") {
    return "super_admin";
  }
  if (v === "retention" || v === "staff" || v === "retention_only") {
    return "retention";
  }
  return "admin";
}

export function isSuperAdminRole(
  role: UserRole | string | null | undefined
): boolean {
  return normalizeUserRole(role) === "super_admin";
}

/** Admin or Super Admin (full module set by default). */
export function isAdminRole(role: UserRole | string | null | undefined): boolean {
  const r = normalizeUserRole(role);
  return r === "admin" || r === "super_admin";
}

/** Default modules when modules_json is empty. */
export function defaultModulesForRole(role: UserRole): AppModule[] {
  if (role === "retention") return ["dashboard", "retention"];
  // admin + super_admin
  return ["dashboard", "gross-profit", "retention"];
}

export function parseModulesJson(
  raw: string | null | undefined,
  role: UserRole
): AppModule[] {
  if (!raw?.trim()) return defaultModulesForRole(role);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultModulesForRole(role);
    const allowed = new Set<string>(ALL_MODULES);
    const mods = parsed
      .map((m) => String(m))
      .filter((m): m is AppModule => allowed.has(m));
    // Everyone always keeps dashboard as landing.
    if (!mods.includes("dashboard")) mods.unshift("dashboard");
    return mods.length ? mods : defaultModulesForRole(role);
  } catch {
    return defaultModulesForRole(role);
  }
}

export function homePathForRole(
  _role?: UserRole | string | null
): string {
  // Landing page for everyone.
  return "/dashboard";
}

export function canAccessModule(
  modules: AppModule[],
  module: AppModule
): boolean {
  return modules.includes(module);
}

/**
 * Path allowed for this user's module set.
 * Auth/logout/me always allowed.
 */
export function pathAllowedForModules(
  path: string,
  modules: AppModule[]
): boolean {
  if (path.startsWith("/api/auth")) return true;
  if (path.startsWith("/invite") || path.startsWith("/api/invites")) return true;
  if (path === "/settings" || path.startsWith("/settings/")) return true;
  if (path.startsWith("/api/settings") || path.startsWith("/api/account")) {
    return true;
  }

  if (path === "/dashboard" || path.startsWith("/dashboard")) {
    return canAccessModule(modules, "dashboard");
  }
  if (
    path.startsWith("/gross-profit") ||
    path.startsWith("/admin") ||
    path.startsWith("/api/gross-profit") ||
    path.startsWith("/api/drivers") ||
    path.startsWith("/api/data") ||
    path.startsWith("/api/configurations") ||
    path.startsWith("/api/assignments") ||
    path.startsWith("/api/trips") ||
    path.startsWith("/api/trucks") ||
    path.startsWith("/api/tolls") ||
    path.startsWith("/api/sheets")
  ) {
    return canAccessModule(modules, "gross-profit");
  }
  if (path.startsWith("/retention") || path.startsWith("/api/retention")) {
    return canAccessModule(modules, "retention");
  }
  // Detention not built yet — block until module exists + granted.
  if (path.startsWith("/detention") || path.startsWith("/api/detention")) {
    return canAccessModule(modules, "detention");
  }
  return false;
}

/** @deprecated use pathAllowedForModules */
export function retentionOnlyAllowed(path: string): boolean {
  return pathAllowedForModules(path, ["dashboard", "retention"]);
}
