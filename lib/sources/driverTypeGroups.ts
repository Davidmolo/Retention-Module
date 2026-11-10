/** Gross-profit driver-type grouping rules. */

export const OWNER_OPERATOR_FILTER = 'owner_operator';

/** TMS types that count as owner operators. */
export const OWNER_OPERATOR_TYPES = ['owner_operator', 'leased_owner'] as const;

/**
 * Named exceptions: treated as owner operators even when labeled contract_driver
 * (or any other type).
 */
export const OWNER_OPERATOR_EXCEPTION_NAMES = [
  'Alvydas Peciulis',
  'Manpreet Singh',
  'Chevarres Smith',
] as const;

/**
 * Never show on Gross Profit (Mantas): not a company-driver GP card even if
 * TMS status is active.
 */
export const GP_EXCLUDE_DRIVER_NAMES = [
  'Liudas Jurevicius',
  'TEST',
] as const;

/**
 * Idle OO (0 miles, 0 linehaul) stay on the sheet at ~-$19 fixed cost —
 * except these specials (Wagner / D.Smith / Day): hide when zero activity.
 * Mantas Nov 2026.
 */
export const OO_HIDE_WHEN_ZERO_ACTIVITY_NAMES = [
  'Robert Wagner',
  'Donald Smith',
  'Cheryl Day',
] as const;

/** True when an OO with no miles and no gross should be dropped from GP. */
export function shouldHideZeroActivityOwnerOperator(driver: {
  name: string;
  driverType: string | null;
  mileage: number;
  grossIncome: number;
}): boolean {
  if (!isOwnerOperator(driver)) return false;
  if (driver.mileage > 0 || driver.grossIncome > 0) return false;
  return nameMatchesList(driver.name, OO_HIDE_WHEN_ZERO_ACTIVITY_NAMES);
}

export function normalizeDriverTypeKey(t: string | null | undefined): string {
  return (t ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

export function isOwnerOperatorType(t: string | null | undefined): boolean {
  const key = normalizeDriverTypeKey(t);
  return (OWNER_OPERATOR_TYPES as readonly string[]).includes(key);
}

/** Match "First Last" allowing an optional middle name token. */
export function isOwnerOperatorExceptionName(
  name: string | null | undefined
): boolean {
  const tokens = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (tokens.length < 2) return false;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  return OWNER_OPERATOR_EXCEPTION_NAMES.some((ex) => {
    const parts = ex.toLowerCase().split(/\s+/);
    return parts.length >= 2 && first === parts[0] && last === parts[parts.length - 1];
  });
}

export function isOwnerOperator(driver: {
  driverType: string | null;
  name: string;
}): boolean {
  return (
    isOwnerOperatorType(driver.driverType) ||
    isOwnerOperatorExceptionName(driver.name)
  );
}

/** True if this driver must never appear on the GP sheet. */
export function isGpExcludedDriverName(name: string | null | undefined): boolean {
  return nameMatchesList(name, GP_EXCLUDE_DRIVER_NAMES);
}

/** SQL AND fragment to drop GP-excluded names (uses `driver_name` by default). */
export function gpExcludeDriverNamesSql(
  nameColumn = 'driver_name'
): { sql: string; params: string[] } {
  if (!GP_EXCLUDE_DRIVER_NAMES.length) return { sql: '', params: [] };
  const parts = GP_EXCLUDE_DRIVER_NAMES.map(() => {
    return `(
      LOWER(TRIM(${nameColumn})) = ?
      OR LOWER(TRIM(${nameColumn})) LIKE ?
    )`;
  });
  const params = GP_EXCLUDE_DRIVER_NAMES.flatMap((ex) => {
    const tokens = ex.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 1) return [tokens[0], tokens[0]];
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    return [ex.toLowerCase(), `${first} % ${last}`];
  });
  return {
    sql: ` AND NOT (${parts.join(' OR ')})`,
    params,
  };
}

/** Match list entries: single-token exact, or "First Last" (optional middle). */
function nameMatchesList(
  name: string | null | undefined,
  list: readonly string[]
): boolean {
  const normalized = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) return false;
  return list.some((ex) => {
    const parts = ex.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return normalized === parts[0];
    if (tokens.length < 2) return false;
    return tokens[0] === parts[0] && tokens[tokens.length - 1] === parts[parts.length - 1];
  });
}

/**
 * OO Fuel rules (Mantas: settlement = source of truth):
 * - Most OO — diesel gallons × $0.12 (Relay settlement fee), including Day / D.Smith
 * - Robert Wagner — left = retail; right = paid + (diesel_gal × $0.20);
 *   $ = retail − right  (sheet: 2699.59 − 2594.59 = 105)
 * - Chevarres Smith — Fuel field always $0 (no gal fee / no Relay savings)
 * Do not invent retail−paid “savings” lines that are not on settlement.
 */
export type OoFuelMode = 'retail_paid' | 'wagner' | 'per_gallon_fee' | 'zero';

/** @deprecated Mantas Nov 2026: Day/D.Smith use per_gallon_fee (settlement). */
export const OO_FUEL_RETAIL_PAID_NAMES = [] as const;

export const OO_FUEL_WAGNER_NAMES = ['Robert Wagner'] as const;

/** OO drivers whose Fuel line is forced to $0. */
export const OO_FUEL_ZERO_NAMES = ['Chevarres Smith'] as const;

/** Diesel fee for OO drivers with a single Fuel field. */
export const OO_DIESEL_FEE_PER_GALLON = 0.12;

/** Wagner: $0.20/gal added on top of Relay driver total (paid). */
export const OO_WAGNER_PER_GALLON_ADDON = 0.2;

/** Named OO drivers whose R&M is $0.07/mi instead of the global OO R&M rate. */
export const OO_RM_007_NAMES = ['Donald Smith'] as const;

export function ooRmPerMileForDriver(
  name: string | null | undefined,
  defaultRm: number
): number {
  if (nameMatchesList(name, OO_RM_007_NAMES)) return 0.07;
  return defaultRm;
}

export function ooFuelMode(name: string | null | undefined): OoFuelMode {
  if (nameMatchesList(name, OO_FUEL_WAGNER_NAMES)) return 'wagner';
  if (nameMatchesList(name, OO_FUEL_ZERO_NAMES)) return 'zero';
  // Day / D.Smith / all other OO: settlement diesel fee = gal × $0.12
  return 'per_gallon_fee';
}

export function ooFuelUsesTwoFields(mode: OoFuelMode): boolean {
  return mode === 'retail_paid' || mode === 'wagner';
}

/**
 * Client OO sheet XXII Fee = company cut, not driver keep.
 * Prefer explicit xxiiFeePctOverride when set (Configurations).
 * Else TMS linehaul_pct is driver keep (80/85/86) → fee % = 100 − keep
 * (e.g. 80% keep → 20.00% fee; amount = gross × fee/100).
 */
export function ownerOperatorXxiiFee(
  linehaulPct: number | null | undefined,
  grossIncome: number,
  xxiiFeePctOverride?: number | null
): { feePct: number; feeAmount: number } | null {
  let feePct: number | null = null;
  if (
    xxiiFeePctOverride != null &&
    Number.isFinite(xxiiFeePctOverride) &&
    xxiiFeePctOverride > 0 &&
    xxiiFeePctOverride < 100
  ) {
    feePct = Math.round(xxiiFeePctOverride * 100) / 100;
  } else if (
    linehaulPct != null &&
    Number.isFinite(linehaulPct) &&
    linehaulPct > 0 &&
    linehaulPct < 100
  ) {
    feePct = Math.round((100 - linehaulPct) * 100) / 100;
  }
  if (feePct == null || feePct <= 0) return null;
  return {
    feePct,
    feeAmount: (grossIncome * feePct) / 100,
  };
}

/** Collapse OO TMS types into a single filter value for the dropdown. */
export function collapseDriverTypesForFilter(types: string[]): string[] {
  const out = new Set<string>();
  let hasOwnerOperator = false;
  let hasCompanyOrContract = false;
  for (const t of types) {
    if (isOwnerOperatorType(t)) {
      hasOwnerOperator = true;
      continue;
    }
    const key = normalizeDriverTypeKey(t);
    if (!key) continue;
    // Contract drivers share the company-driver filter + card layout.
    if (key === 'contract_driver' || key === 'company_driver') {
      hasCompanyOrContract = true;
      continue;
    }
    out.add(key);
  }
  if (hasCompanyOrContract) out.add('company_driver');
  if (hasOwnerOperator) out.add(OWNER_OPERATOR_FILTER);
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** OO card totals from visible lines only.
 * Fuel is always its own card line — never folded into Total Expenses.
 * Client GP for all OO: XXII Fee + Fuel − Total Exp
 * (Fuel is gal×$0.12, Relay savings, or $0 — still added, not subtracted.)
 * PD insurance included when present (0 = blank on card, no expense impact). */
export function ownerOperatorVisibleTotals(d: {
  fuel: number;
  rm: number;
  equipmentLease: number;
  liabilityInsurance: number;
  cargoInsurance: number;
  factoringFee: number;
  samsara: number;
  pdInsurance?: number;
  grossIncome: number;
  linehaulPct?: number | null;
  /** Configurations override for XXII fee % (company cut). */
  xxiiFeePct?: number | null;
  /** Driver name — selects OO fuel mode when fuelMode omitted. */
  name?: string | null;
  fuelMode?: OoFuelMode;
}): { totalExpenses: number; grossProfit: number } {
  const pd = Number(d.pdInsurance ?? 0);
  const totalExpenses =
    d.rm +
    d.equipmentLease +
    d.liabilityInsurance +
    d.cargoInsurance +
    d.factoringFee +
    d.samsara +
    (Number.isFinite(pd) && pd > 0 ? pd : 0);
  const xxii = ownerOperatorXxiiFee(
    d.linehaulPct ?? null,
    d.grossIncome,
    d.xxiiFeePct
  );
  const feeIncome = xxii?.feeAmount ?? 0;
  return {
    totalExpenses,
    grossProfit: feeIncome + d.fuel - totalExpenses,
  };
}

export function formatDriverTypeLabel(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * SQL fragment + params for the driver-type filter.
 * `owner_operator` expands to OO types + named exceptions.
 * Other types exclude those named exceptions so they only appear under OO.
 */
export function driverTypeFilterSql(
  driverType: string,
  nameColumn = 'driver_name',
  typeColumn = 'driver_type'
): { sql: string; params: string[] } {
  const key = normalizeDriverTypeKey(driverType);
  if (!key) return { sql: '', params: [] };

  const exceptionSql = OWNER_OPERATOR_EXCEPTION_NAMES.map(() => {
    return `(
      LOWER(TRIM(${nameColumn})) = ?
      OR LOWER(TRIM(${nameColumn})) LIKE ?
    )`;
  }).join(' OR ');

  const exceptionParams = OWNER_OPERATOR_EXCEPTION_NAMES.flatMap((ex) => {
    const parts = ex.toLowerCase().split(/\s+/);
    const first = parts[0];
    const last = parts[parts.length - 1];
    return [ex.toLowerCase(), `${first} % ${last}`];
  });

  if (key === OWNER_OPERATOR_FILTER) {
    const typePlaceholders = OWNER_OPERATOR_TYPES.map(() => '?').join(', ');
    return {
      sql: ` AND (
        LOWER(REPLACE(TRIM(COALESCE(${typeColumn}, '')), ' ', '_')) IN (${typePlaceholders})
        OR ${exceptionSql}
      )`,
      params: [...OWNER_OPERATOR_TYPES, ...exceptionParams],
    };
  }

  // Company filter also includes contract drivers (same card layout).
  if (key === 'company_driver') {
    return {
      sql: ` AND LOWER(REPLACE(TRIM(COALESCE(${typeColumn}, '')), ' ', '_')) IN (?, ?)
        AND NOT (${exceptionSql})`,
      params: ['company_driver', 'contract_driver', ...exceptionParams],
    };
  }

  // Exact type match, but keep named OO exceptions out of other buckets.
  return {
    sql: ` AND LOWER(REPLACE(TRIM(COALESCE(${typeColumn}, '')), ' ', '_')) = ?
      AND NOT (${exceptionSql})`,
    params: [key, ...exceptionParams],
  };
}
