import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db';
import {
  OWNER_OPERATOR_EXCEPTION_NAMES,
  OWNER_OPERATOR_TYPES,
} from './driverTypeGroups';

/** Fallback defaults — match previous weeklySummary hardcoded constants. */
export const GP_RATE_DEFAULTS = {
  companyRmPerMile: 0.19,
  ooRmPerMile: 0.04,
  companyLiabilityPerMile: 0.15,
  ooLiabilityPerMile: 0.15,
  ooLiabilityFlat: 16,
  factoringRate: 0.012,
  /** OO equipment lease when no per-driver override. */
  ooEquipmentLeaseDefault: -35,
} as const;

export type GpExpenseRates = {
  companyRmPerMile: number;
  ooRmPerMile: number;
  companyLiabilityPerMile: number;
  ooLiabilityPerMile: number;
  ooLiabilityFlat: number;
  factoringRate: number;
  ooEquipmentLeaseDefault: number;
};

const KEY_MAP = {
  company_rm_per_mile: 'companyRmPerMile',
  oo_rm_per_mile: 'ooRmPerMile',
  company_liability_per_mile: 'companyLiabilityPerMile',
  oo_liability_per_mile: 'ooLiabilityPerMile',
  oo_liability_flat: 'ooLiabilityFlat',
  factoring_rate: 'factoringRate',
  oo_equipment_lease_default: 'ooEquipmentLeaseDefault',
} as const;

type ConfigKey = keyof typeof KEY_MAP;

const REVERSE_KEY: Record<keyof GpExpenseRates, ConfigKey> = {
  companyRmPerMile: 'company_rm_per_mile',
  ooRmPerMile: 'oo_rm_per_mile',
  companyLiabilityPerMile: 'company_liability_per_mile',
  ooLiabilityPerMile: 'oo_liability_per_mile',
  ooLiabilityFlat: 'oo_liability_flat',
  factoringRate: 'factoring_rate',
  ooEquipmentLeaseDefault: 'oo_equipment_lease_default',
};

export interface OoDriverOverride {
  driverId: number;
  driverName: string;
  equipmentLease: number | null;
  pdInsurance: number | null;
  liabilityCredit: number | null;
  xxiiFeePct: number | null;
}

function nameKey(name: string): string {
  const tokens = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (tokens.length < 2) return name.trim().toLowerCase();
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

/** Load global expense rates from gp_config (fallback to defaults). */
export async function getGpExpenseRates(): Promise<GpExpenseRates> {
  const rates: GpExpenseRates = {
    ...GP_RATE_DEFAULTS,
  };
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT config_key, config_value FROM gp_config`
    );
    for (const r of rows) {
      const key = String(r.config_key) as ConfigKey;
      const field = KEY_MAP[key];
      if (!field) continue;
      const n = Number(r.config_value);
      if (Number.isFinite(n)) rates[field] = n;
    }
  } catch (err) {
    console.warn('[gpConfig] getGpExpenseRates fallback to defaults:', err);
  }
  return rates;
}

export type GpExpenseRatesUpdate = Partial<GpExpenseRates>;

/** Upsert global rates. Only provided keys are written. */
export async function updateGpExpenseRates(
  partial: GpExpenseRatesUpdate
): Promise<GpExpenseRates> {
  const entries: [ConfigKey, number][] = [];
  for (const [field, dbKey] of Object.entries(REVERSE_KEY) as [
    keyof GpExpenseRates,
    ConfigKey,
  ][]) {
    const v = partial[field];
    if (v == null || !Number.isFinite(v)) continue;
    entries.push([dbKey, v]);
  }
  if (entries.length) {
    await getPool().query(
      `INSERT INTO gp_config (config_key, config_value) VALUES ?
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
      [entries.map(([k, v]) => [k, v])]
    );
  }
  return getGpExpenseRates();
}

function mapOverrideRow(r: RowDataPacket): OoDriverOverride {
  return {
    driverId: Number(r.driver_id),
    driverName: String(r.driver_name ?? ''),
    equipmentLease:
      r.equipment_lease == null ? null : Number(r.equipment_lease),
    pdInsurance: r.pd_insurance == null ? null : Number(r.pd_insurance),
    liabilityCredit:
      r.liability_credit == null ? null : Number(r.liability_credit),
    xxiiFeePct: r.xxii_fee_pct == null ? null : Number(r.xxii_fee_pct),
  };
}

export async function listOoOverrides(): Promise<OoDriverOverride[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT driver_id, driver_name, equipment_lease, pd_insurance,
            liability_credit, xxii_fee_pct
       FROM gp_oo_driver_overrides
      ORDER BY driver_name`
  );
  return rows.map(mapOverrideRow);
}

/** All overrides keyed by nameKey(first last) for fast weekly lookup. */
export async function getOoOverridesByNameKey(): Promise<
  Map<string, OoDriverOverride>
> {
  const list = await listOoOverrides();
  const map = new Map<string, OoDriverOverride>();
  for (const o of list) {
    map.set(nameKey(o.driverName), o);
  }
  return map;
}

export function lookupOoOverride(
  name: string,
  map: Map<string, OoDriverOverride>
): OoDriverOverride | null {
  return map.get(nameKey(name)) ?? null;
}

export async function upsertOoOverride(input: {
  driverId: number;
  equipmentLease?: number | null;
  pdInsurance?: number | null;
  liabilityCredit?: number | null;
  xxiiFeePct?: number | null;
}): Promise<OoDriverOverride> {
  const pool = getPool();
  const [drvRows] = await pool.query<RowDataPacket[]>(
    `SELECT id,
            TRIM(CONCAT_WS(' ', first_name, middle_name, last_name)) AS name
       FROM drivers WHERE id = ?`,
    [input.driverId]
  );
  if (!drvRows.length) {
    throw new Error(`Driver ${input.driverId} not found`);
  }
  const driverName = String(drvRows[0].name ?? '');

  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT equipment_lease, pd_insurance, liability_credit, xxii_fee_pct
       FROM gp_oo_driver_overrides WHERE driver_id = ?`,
    [input.driverId]
  );
  const prev = existing[0];

  const equipmentLease =
    input.equipmentLease !== undefined
      ? input.equipmentLease
      : prev
        ? prev.equipment_lease == null
          ? null
          : Number(prev.equipment_lease)
        : null;
  const pdInsurance =
    input.pdInsurance !== undefined
      ? input.pdInsurance
      : prev
        ? prev.pd_insurance == null
          ? null
          : Number(prev.pd_insurance)
        : null;
  const liabilityCredit =
    input.liabilityCredit !== undefined
      ? input.liabilityCredit
      : prev
        ? prev.liability_credit == null
          ? null
          : Number(prev.liability_credit)
        : null;
  const xxiiFeePct =
    input.xxiiFeePct !== undefined
      ? input.xxiiFeePct
      : prev
        ? prev.xxii_fee_pct == null
          ? null
          : Number(prev.xxii_fee_pct)
        : null;

  await pool.query<ResultSetHeader>(
    `INSERT INTO gp_oo_driver_overrides
       (driver_id, driver_name, equipment_lease, pd_insurance,
        liability_credit, xxii_fee_pct)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       driver_name = VALUES(driver_name),
       equipment_lease = VALUES(equipment_lease),
       pd_insurance = VALUES(pd_insurance),
       liability_credit = VALUES(liability_credit),
       xxii_fee_pct = VALUES(xxii_fee_pct)`,
    [
      input.driverId,
      driverName,
      equipmentLease,
      pdInsurance,
      liabilityCredit,
      xxiiFeePct,
    ]
  );

  return {
    driverId: input.driverId,
    driverName,
    equipmentLease,
    pdInsurance,
    liabilityCredit,
    xxiiFeePct,
  };
}

export async function deleteOoOverride(driverId: number): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `DELETE FROM gp_oo_driver_overrides WHERE driver_id = ?`,
    [driverId]
  );
  return res.affectedRows > 0;
}

/** Active OO roster row with override fields + effective lease / XXII fee. */
export interface OoDriverConfigRow {
  driverId: number;
  driverName: string;
  driverType: string | null;
  equipmentLease: number | null;
  pdInsurance: number | null;
  liabilityCredit: number | null;
  xxiiFeePct: number | null;
  /** TMS compensations.linehaul_percentage (driver keep %). */
  linehaulPct: number | null;
  /** Lease actually used on reports: override if set, else global default. */
  effectiveEquipmentLease: number;
  equipmentLeaseSource: 'override' | 'default';
  /**
   * XXII fee % used on reports: override if set, else 100 − TMS linehaul keep.
   * Null when neither override nor usable linehaul exists.
   */
  effectiveXxiiFeePct: number | null;
  xxiiFeeSource: 'override' | 'tms' | 'none';
  hasOverrideRow: boolean;
}

function effectiveXxiiFee(
  overridePct: number | null | undefined,
  linehaulPct: number | null | undefined
): { effectiveXxiiFeePct: number | null; xxiiFeeSource: 'override' | 'tms' | 'none' } {
  if (
    overridePct != null &&
    Number.isFinite(overridePct) &&
    overridePct > 0 &&
    overridePct < 100
  ) {
    return {
      effectiveXxiiFeePct: Math.round(overridePct * 100) / 100,
      xxiiFeeSource: 'override',
    };
  }
  if (
    linehaulPct != null &&
    Number.isFinite(linehaulPct) &&
    linehaulPct > 0 &&
    linehaulPct < 100
  ) {
    return {
      effectiveXxiiFeePct: Math.round((100 - linehaulPct) * 100) / 100,
      xxiiFeeSource: 'tms',
    };
  }
  return { effectiveXxiiFeePct: null, xxiiFeeSource: 'none' };
}

/** All active owner-operators (+ exceptions), with effective config visible. */
export async function listOoDriverConfigs(): Promise<OoDriverConfigRow[]> {
  const rates = await getGpExpenseRates();
  const defaultLease = rates.ooEquipmentLeaseDefault;
  const overrides = await listOoOverrides();
  const byId = new Map(overrides.map((o) => [o.driverId, o]));

  const typePlaceholders = OWNER_OPERATOR_TYPES.map(() => '?').join(', ');
  const exceptionSql = OWNER_OPERATOR_EXCEPTION_NAMES.map(
    () => `(
      LOWER(TRIM(d.first_name)) = ?
      AND LOWER(TRIM(d.last_name)) = ?
    )`
  ).join(' OR ');
  const exceptionParams = OWNER_OPERATOR_EXCEPTION_NAMES.flatMap((ex) => {
    const parts = ex.toLowerCase().split(/\s+/);
    return [parts[0], parts[parts.length - 1]];
  });

  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT d.id,
            TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)) AS name,
            d.driver_type,
            c.linehaul_percentage AS linehaulPct
       FROM drivers d
       LEFT JOIN compensations c ON c.id = d.compensation_id
      WHERE d.status = 'active'
        AND (
          LOWER(REPLACE(TRIM(COALESCE(d.driver_type, '')), ' ', '_'))
            IN (${typePlaceholders})
          OR ${exceptionSql}
        )
        AND LOWER(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)))
          NOT IN ('test')
        AND LOWER(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)))
          NOT LIKE '%example%'
        AND LOWER(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)))
          NOT LIKE 'accounting%'
      ORDER BY name`,
    [...OWNER_OPERATOR_TYPES, ...exceptionParams]
  );

  return rows.map((r) => {
    const driverId = Number(r.id);
    const driverName = String(r.name ?? '');
    const o = byId.get(driverId) ?? null;
    const equipmentLease = o?.equipmentLease ?? null;
    const hasLeaseOverride =
      equipmentLease != null && Number.isFinite(equipmentLease);
    const linehaulPct =
      r.linehaulPct == null || r.linehaulPct === ''
        ? null
        : Number(r.linehaulPct);
    const xxii = effectiveXxiiFee(o?.xxiiFeePct ?? null, linehaulPct);
    return {
      driverId,
      driverName,
      driverType: r.driver_type == null ? null : String(r.driver_type),
      equipmentLease,
      pdInsurance: o?.pdInsurance ?? null,
      liabilityCredit: o?.liabilityCredit ?? null,
      xxiiFeePct: o?.xxiiFeePct ?? null,
      linehaulPct:
        linehaulPct != null && Number.isFinite(linehaulPct) ? linehaulPct : null,
      effectiveEquipmentLease: hasLeaseOverride
        ? (equipmentLease as number)
        : defaultLease,
      equipmentLeaseSource: hasLeaseOverride
        ? ('override' as const)
        : ('default' as const),
      effectiveXxiiFeePct: xxii.effectiveXxiiFeePct,
      xxiiFeeSource: xxii.xxiiFeeSource,
      hasOverrideRow: o != null,
    };
  });
}
