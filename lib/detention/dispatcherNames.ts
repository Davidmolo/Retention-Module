/**
 * OpenRoad / roster sometimes stores short first names; Art’s sheet and TMS
 * often store full names. Collapse known aliases to one display name for
 * Summary, Compliance, and board filters.
 *
 * Canonical form = full name (Mantas / ops naming).
 */

/** Short / alternate → preferred full name (lookup keys are lowercased). */
const ALIAS_TO_CANONICAL: Record<string, string> = {
  andre: "Andre Colton",
  "andre colton": "Andre Colton",
  felix: "Felix Wagner",
  "felix wagner": "Felix Wagner",
  milan: "Milan Kulic",
  "milan kulic": "Milan Kulic",
  dylan: "Dylan Ristic",
  "dylan ristic": "Dylan Ristic",
  daisy: "Daisy Dordevic",
  "daisy dordevic": "Daisy Dordevic",
  eric: "Eric King",
  "eric king": "Eric King",
  "alex m": "Alex Mladenovski",
  "alex mladenovski": "Alex Mladenovski",
  chris: "Chris Nakev",
  "chris nakev": "Chris Nakev",
  nick: "Nikola Sukilovic",
  nikola: "Nikola Sukilovic",
  "nikola sukilovic": "Nikola Sukilovic",
};

function normKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.+$/, ""); // "Alex M." → "alex m"
}

/** Preferred display name for grouping / filters. */
export function canonicalDispatcherName(
  raw: string | null | undefined
): string {
  if (!raw?.trim()) return "Unassigned";
  const key = normKey(raw);
  return ALIAS_TO_CANONICAL[key] || raw.trim().replace(/\s+/g, " ");
}

/**
 * Lowercased name keys that all refer to the same dispatcher.
 * Use with: LOWER(TRIM(dispatcher)) IN (...)
 */
export function dispatcherMatchKeys(
  selected: string | null | undefined
): string[] {
  if (!selected?.trim()) return [];
  const canonical = canonicalDispatcherName(selected);
  const canonKey = normKey(canonical);
  const keys = new Set<string>([canonKey, normKey(selected)]);
  for (const [alias, full] of Object.entries(ALIAS_TO_CANONICAL)) {
    if (normKey(full) === canonKey || alias === canonKey) {
      keys.add(alias);
      keys.add(normKey(full));
    }
  }
  return [...keys];
}

/** Unique canonical names from a list of raw dispatcher values. */
export function uniqueCanonicalDispatchers(rawNames: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawNames) {
    const c = canonicalDispatcherName(raw);
    const k = normKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
