import type { DetentionPartyRow } from "@/lib/detention/types";

const EXTRA = new Set([
  "logistics",
  "freight",
  "transport",
  "transportation",
  "solutions",
  "services",
  "group",
  "companies",
  "company",
  "global",
  "multimodal",
]);

/** Lowercase name with Inc/LLC and punctuation removed. */
export function customerKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(
      /\b(l\.?l\.?c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|ltd\.?|limited)\b/g,
      " "
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameCustomer(a: string, b: string): boolean {
  if (a === b) return true;
  const at = a.split(" ").filter(Boolean);
  const bt = b.split(" ").filter(Boolean);
  const [short, long] = at.length <= bt.length ? [at, bt] : [bt, at];
  if (!short.length || (short.length === 1 && short[0].length < 3)) return false;
  let i = 0;
  const extras: string[] = [];
  for (const word of long) {
    if (i < short.length && word === short[i]) i += 1;
    else extras.push(word);
  }
  return i === short.length && extras.every((word) => EXTRA.has(word));
}

type RawCustomer = {
  name: string;
  detentions: number;
  hours: number;
  billed: number;
  received: number;
};

/** Combine the same customer when the saved name only differs by Inc, LLC, or Logistics. */
export function mergeCustomerBilled(rows: RawCustomer[]): DetentionPartyRow[] {
  const groups: { key: string; keys: string[]; rows: RawCustomer[] }[] = [];
  for (const row of rows) {
    const key = customerKey(row.name) || "unknown";
    const found = groups.find((g) =>
      g.keys.some((existing) => sameCustomer(existing, key))
    );
    if (found) {
      found.rows.push(row);
      found.keys.push(key);
    } else groups.push({ key, keys: [key], rows: [row] });
  }

  const merged = groups.map((g) => {
    const name = [...g.rows].sort(
      (a, b) => b.detentions - a.detentions || b.name.length - a.name.length
    )[0].name;
    const detentions = g.rows.reduce((n, r) => n + r.detentions, 0);
    const hours = Math.round(g.rows.reduce((n, r) => n + r.hours, 0) * 10) / 10;
    const billed = Math.round(g.rows.reduce((n, r) => n + r.billed, 0) * 100) / 100;
    const received =
      Math.round(g.rows.reduce((n, r) => n + r.received, 0) * 100) / 100;
    return {
      name,
      detentions,
      hours,
      billed,
      received,
      rate: billed > 0 ? Math.round((received / billed) * 1000) / 10 : 0,
    };
  });

  const attention = [...merged]
    .map((row) => ({ name: row.name, gap: row.billed - row.received }))
    .filter((row) => row.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map((row) => row.name);

  return merged
    .map((row) => ({
      ...row,
      needsAttention: attention.includes(row.name),
    }))
    .sort((a, b) => b.billed - a.billed || a.name.localeCompare(b.name));
}
