import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db';
import { weekRange } from '../week';
import {
  collapseDriverTypesForFilter,
  driverTypeFilterSql,
  isOwnerOperator,
  isOwnerOperatorExceptionName,
  ooFuelMode,
  ownerOperatorVisibleTotals,
  OO_DIESEL_FEE_PER_GALLON,
  OO_WAGNER_PER_GALLON_ADDON,
  OWNER_OPERATOR_EXCEPTION_NAMES,
  OWNER_OPERATOR_FILTER,
  OWNER_OPERATOR_TYPES,
} from './driverTypeGroups';
import {
  getGpExpenseRates,
  getOoOverridesByNameKey,
  lookupOoOverride,
  type GpExpenseRates,
  type OoDriverOverride,
} from './gpConfig';

// Computes a weekly Gross Profit summary entirely from the database:
//   - trips/miles/gross — solo vs share (never full load on multi-driver):
//       solo (< 2 distinct drivers on driver_routes): full load, week = delivery_at
//       orphan/canceled (load.driver_id NULL, sole route driver): same by delivery_at
//       multi helper (route.driver ≠ load.driver): route share, week = route date
//       multi owner (route.driver = load.driver): route share, week = delivery_at
//   - gross = load linehaul_rate (fallback revenue/total); matches client GP sheet
//   - Driver's pay = compensation (mi×rate / % / flat)
//       + OpenRoad driver_accessorials for this settlement (payroll) week
//   - Per Mile pay: loaded×loaded_mile_rate + empty×empty_mile_rate
//   - fuel: card spend, or (miles/MPG)×PPG when Samsara MPG + card PPG exist
//   - prepass: toll_charge on assigned trucks by Exit Date (Tue→Mon week)
// The remaining lines mirror the Excel template's formulas/constants.
// R&M / liability / factoring (+ OO overrides, XXII fee) come from gp_config
// and gp_oo_driver_overrides (Configurations); hardcoded values are fallbacks.

// Shared fixed lines (same for company / contract / OO).
const FIXED = {
  monitoringLogs: 41,
  scale: 30,
  samsara: 38,
  pdInsurance: 162,
};

/** Company + contract fixed lease/cargo (not yet in Configurations). */
const COMPANY_FIXED = {
  equipmentLease: 1054.94,
  equipmentLease2: 287,
  cargoInsurance: 17.5,
};

type DriverExpenseRates = {
  rm: number;
  liability: number;
  liabilityFlat: number;
  equipmentLease: number;
  equipmentLease2: number;
  cargoInsurance: number;
};

function expenseRatesForDriver(
  driver: { driverType: string | null; name: string },
  globals: GpExpenseRates,
  ooOverride: OoDriverOverride | null
): DriverExpenseRates {
  if (!isOwnerOperator(driver)) {
    return {
      rm: globals.companyRmPerMile,
      liability: globals.companyLiabilityPerMile,
      liabilityFlat: 0,
      equipmentLease: COMPANY_FIXED.equipmentLease,
      equipmentLease2: COMPANY_FIXED.equipmentLease2,
      cargoInsurance: COMPANY_FIXED.cargoInsurance,
    };
  }
  return {
    rm: globals.ooRmPerMile,
    liability: globals.ooLiabilityPerMile,
    liabilityFlat: globals.ooLiabilityFlat,
    equipmentLease:
      ooOverride?.equipmentLease != null &&
      Number.isFinite(ooOverride.equipmentLease)
        ? ooOverride.equipmentLease
        : globals.ooEquipmentLeaseDefault,
    equipmentLease2: 0,
    cargoInsurance: 0,
  };
}

function mileageExpenses(
  mileage: number,
  rates: DriverExpenseRates,
  opts?: { liabilityCredit?: number; ownerOperator?: boolean }
): { rm: number; liabilityInsurance: number } {
  let liabilityInsurance = mileage * rates.liability + rates.liabilityFlat;
  if (opts?.ownerOperator) {
    const credit = Number(opts.liabilityCredit ?? 0);
    if (Number.isFinite(credit) && credit > 0) {
      liabilityInsurance = Math.max(0, liabilityInsurance - credit);
    }
  }
  return {
    rm: mileage * rates.rm,
    liabilityInsurance,
  };
}

function ooPdFromOverride(ooOverride: OoDriverOverride | null): number {
  if (
    ooOverride?.pdInsurance != null &&
    Number.isFinite(ooOverride.pdInsurance) &&
    ooOverride.pdInsurance > 0
  ) {
    return ooOverride.pdInsurance;
  }
  return 0;
}

async function ooVisibleTotalsForRow(
  row: {
    driver_type: string | null;
    driver_name: string | null;
    fuel: string | number;
    rm: string | number;
    equipment_lease: string | number;
    liability_insurance: string | number;
    cargo_insurance: string | number;
    factoring_fee: string | number;
    samsara: string | number;
    pd_insurance: string | number;
    gross_income: string | number;
    linehaul_pct: string | number | null;
  },
  opts?: { factoringFee?: number; grossIncome?: number }
): Promise<{ totalExpenses: number; grossProfit: number }> {
  const driverName = row.driver_name ?? '';
  const ooByName = await getOoOverridesByNameKey();
  const ooOverride = lookupOoOverride(driverName, ooByName);
  const xxiiFeePct =
    ooOverride?.xxiiFeePct != null && Number.isFinite(ooOverride.xxiiFeePct)
      ? ooOverride.xxiiFeePct
      : null;
  const grossIncome = opts?.grossIncome ?? Number(row.gross_income);
  const factoringFee = opts?.factoringFee ?? Number(row.factoring_fee);
  const pdStored = Number(row.pd_insurance);
  return ownerOperatorVisibleTotals({
    fuel: Number(row.fuel),
    rm: Number(row.rm),
    equipmentLease: Number(row.equipment_lease),
    liabilityInsurance: Number(row.liability_insurance),
    cargoInsurance: Number(row.cargo_insurance),
    factoringFee,
    samsara: Number(row.samsara),
    pdInsurance: pdStored > 0 ? pdStored : ooPdFromOverride(ooOverride),
    grossIncome,
    name: driverName,
    linehaulPct:
      row.linehaul_pct == null ? null : Number(row.linehaul_pct),
    xxiiFeePct,
  });
}

export interface SummaryDriver {
  driverId: number;
  name: string;
  driverStatus: string | null;
  driverType: string | null;
  /** Assigned truck unit number (from trucks.unit) for the week. */
  unit: string | null;
  /** compensations.name */
  compensationName: string | null;
  /** compensations.linehaul_percentage */
  linehaulPct: number | null;
  /** Configurations OO XXII fee % override (null = derive from linehaul). */
  xxiiFeePct: number | null;
  trips: number;
  rate: number;
  mileage: number;
  grossIncome: number;
  driversPay: number;
  fuel: number;
  /** OO: fuel total without driver discount (card retail). */
  fuelGross: number | null;
  /** OO: fuel total with driver discount (card paid). */
  fuelDiscounted: number | null;
  fuelMpg: number | null;
  fuelPpg: number | null;
  prepass: number;
  monitoringLogs: number;
  rm: number;
  equipmentLease: number;
  equipmentLease2: number;
  liabilityInsurance: number;
  scale: number;
  factoringFee: number;
  samsara: number;
  cargoInsurance: number;
  pdInsurance: number;
  totalExpenses: number;
  grossProfit: number;
}

export interface WeeklySummary {
  year: number;
  week: number;
  start: string;
  end: string;
  drivers: SummaryDriver[];
  totals: {
    trips: number;
    mileage: number;
    grossIncome: number;
    totalExpenses: number;
    grossProfit: number;
  };
  /** Distinct driver_type values for this week (active roster), for UI filters. */
  driverTypes: string[];
}

interface AggRow extends RowDataPacket {
  id: number;
  name: string;
  driverStatus: string | null;
  driverType: string | null;
  /** Assigned trucks.unit for the week (written into gross_profit_reports.unit). */
  unit: string | null;
  compensationName: string | null;
  linehaulPct: string | number | null;
  compStatus: string | null;
  loadedMileRate: string | number | null;
  emptyMileRate: string | number | null;
  flatRate: string | number | null;
  gallons: string | number;
  amount: string | number;
  amountRetail: string | number;
  /** Relay API OO totals for this week (0 when none). */
  relayRetail: string | number;
  relayPaid: string | number;
  relayGallons: string | number;
  relayTxnCount: string | number;
  samsaraMpg: string | number | null;
  trips: string | number;
  miles: string | number;
  loadedMiles: string | number;
  revenue: string | number;
  /** OpenRoad load accessorial = total − linehaul (added to Driver's pay). */
  accessorial: string | number;
  prepass: string | number;
}

export async function getWeeklySummary(
  year: number,
  week: number
): Promise<WeeklySummary> {
  const { start, end } = weekRange(year, week); // Tuesday→Monday
  console.log(`Storing weekly summary: W${week} ${year} (${start} → ${end})`);
  const pool = getPool();
  const [globals, ooByName] = await Promise.all([
    getGpExpenseRates(),
    getOoOverridesByNameKey(),
  ]);

  const [rows] = await pool.query<AggRow[]>(
    `SELECT d.id,
            TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)) AS name,
            d.status                AS driverStatus,
            d.driver_type           AS driverType,
            CAST(u.unit AS CHAR) AS unit,
            c.name                  AS compensationName,
            c.status                AS compStatus,
            c.loaded_mile_rate      AS loadedMileRate,
            c.empty_mile_rate       AS emptyMileRate,
            c.linehaul_percentage   AS linehaulPct,
            c.flat_rate             AS flatRate,
            COALESCE(f.gallons, 0) AS gallons,
            COALESCE(f.amount, 0)  AS amount,
            COALESCE(f.amountRetail, 0) AS amountRetail,
            COALESCE(rf.amount_retail, 0) AS relayRetail,
            COALESCE(rf.amount_paid, 0) AS relayPaid,
            COALESCE(rf.gallons, 0) AS relayGallons,
            COALESCE(rf.txn_count, 0) AS relayTxnCount,
            -- MPG: driver_id → last-name match on samsara_driver_mpg → vehicle unit
            COALESCE(
              (SELECT sm.efficiency_mpge
                 FROM samsara_driver_mpg sm
                WHERE sm.year = ? AND sm.week = ?
                  AND sm.driver_id = d.id
                LIMIT 1),
              (SELECT sm.efficiency_mpge
                 FROM samsara_driver_mpg sm
                WHERE sm.year = ? AND sm.week = ?
                  AND d.last_name IS NOT NULL
                  AND TRIM(d.last_name) <> ''
                  AND sm.driver_name LIKE CONCAT('%', TRIM(d.last_name), '%')
                  AND (
                    d.first_name IS NULL
                    OR TRIM(d.first_name) = ''
                    OR sm.driver_name LIKE CONCAT(TRIM(d.first_name), '%')
                  )
                ORDER BY sm.id
                LIMIT 1),
              (SELECT vm.efficiency_mpge
                 FROM samsara_vehicle_mpg vm
                WHERE vm.year = ? AND vm.week = ?
                  AND u.unit IS NOT NULL
                  AND TRIM(CAST(u.unit AS CHAR)) <> ''
                  AND vm.vehicle_name COLLATE utf8mb4_unicode_ci
                      = CAST(u.unit AS CHAR) COLLATE utf8mb4_unicode_ci
                LIMIT 1)
            ) AS samsaraMpg,
            COALESCE(t.trips, 0)   AS trips,
            COALESCE(t.miles, 0)   AS miles,
            COALESCE(t.loadedMiles, 0) AS loadedMiles,
            COALESCE(t.revenue, 0) AS revenue,
            COALESCE(acc.accessorial, 0) AS accessorial,
            COALESCE(p.prepass, 0) AS prepass
       FROM drivers d
       LEFT JOIN compensations c ON c.id = d.compensation_id
       -- Assigned truck's trucks.unit for this week → stored in report.unit
       LEFT JOIN (
         SELECT a.driver_id,
                SUBSTRING_INDEX(
                  GROUP_CONCAT(tr.unit ORDER BY a.start_date DESC, a.id DESC),
                  ',', 1
                ) AS unit
           FROM assignments a
           JOIN trucks tr ON tr.id = a.truck_id
          WHERE a.truck_id IS NOT NULL
            AND tr.unit IS NOT NULL
            AND TRIM(tr.unit) <> ''
            AND DATE(a.start_date) <= ?
            AND (a.end_date IS NULL OR DATE(a.end_date) >= ?)
          GROUP BY a.driver_id
       ) u ON u.driver_id = d.id
       LEFT JOIN (
         SELECT driver_id,
                SUM(gallons) gallons,
                SUM(amount) amount,
                SUM(COALESCE(amount_retail, amount)) amountRetail
           FROM fuel_transactions
          WHERE transaction_date BETWEEN ? AND ?
          GROUP BY driver_id
       ) f ON f.driver_id = d.id
       LEFT JOIN relay_fuel_week_totals rf
         ON rf.driver_id = d.id AND rf.year = ? AND rf.week = ?
       LEFT JOIN (
         -- Solo = full load (delivery week).
         -- Orphan/canceled (no load.driver): sole route driver, delivery week.
         -- Multi = route share only: helpers by route week, owners by delivery week.
         SELECT driver_id,
                SUM(trips) trips,
                SUM(miles) miles,
                SUM(loadedMiles) loadedMiles,
                SUM(revenue) revenue
           FROM (
             SELECT l.driver_id,
                    COUNT(*) trips,
                    SUM(COALESCE(l.miles, 0) + COALESCE(l.empty_miles, 0)) miles,
                    SUM(COALESCE(l.miles, 0)) loadedMiles,
                    -- Client GP sheet uses linehaul (not load.total / accessorials).
                    SUM(COALESCE(l.linehaul_rate, l.revenue, 0)) revenue
               FROM loads l
              WHERE l.driver_id IS NOT NULL
                AND DATE(l.delivery_at) BETWEEN ? AND ?
                AND (
                      SELECT COUNT(DISTINCT dr.driver_id)
                        FROM driver_routes dr
                       WHERE dr.load_id = l.id
                         AND dr.driver_id IS NOT NULL
                    ) < 2
              GROUP BY l.driver_id
             UNION ALL
             -- Canceled / unassigned load: only route driver gets linehaul (+ miles).
             -- Matches Diallo W37 sheet including 2609-00080 ($150).
             SELECT dr.driver_id,
                    COUNT(DISTINCT dr.load_id) trips,
                    SUM(
                      CASE
                        WHEN COALESCE(dr.loaded_miles, 0) + COALESCE(dr.empty_miles, 0) > 0
                          THEN COALESCE(dr.loaded_miles, 0) + COALESCE(dr.empty_miles, 0)
                        WHEN COALESCE(l.miles, 0) > 0
                          THEN COALESCE(l.miles, 0) + COALESCE(l.empty_miles, 0)
                        ELSE 0
                      END
                    ) miles,
                    SUM(
                      CASE
                        WHEN COALESCE(dr.loaded_miles, 0) > 0 THEN COALESCE(dr.loaded_miles, 0)
                        ELSE COALESCE(l.miles, 0)
                      END
                    ) loadedMiles,
                    SUM(COALESCE(NULLIF(dr.revenue, 0), l.linehaul_rate, l.revenue, 0)) revenue
               FROM driver_routes dr
               JOIN loads l ON l.id = dr.load_id
              WHERE dr.driver_id IS NOT NULL
                AND l.driver_id IS NULL
                AND DATE(l.delivery_at) BETWEEN ? AND ?
                AND (
                      SELECT COUNT(DISTINCT o.driver_id)
                        FROM driver_routes o
                       WHERE o.load_id = dr.load_id
                         AND o.driver_id IS NOT NULL
                    ) = 1
              GROUP BY dr.driver_id
             UNION ALL
             SELECT dr.driver_id,
                    COUNT(DISTINCT dr.load_id) trips,
                    SUM(COALESCE(dr.loaded_miles, 0) + COALESCE(dr.empty_miles, 0)) miles,
                    SUM(COALESCE(dr.loaded_miles, 0)) loadedMiles,
                    -- Helper: use allocated route revenue (from driver_routes split),
                    -- not the full load linehaul — OpenRoad DriverRoute is per-leg.
                    -- Week by route created_at (leg planned/started), not updated_at —
                    -- updated_at often jumps when a later driver is added to the load.
                    SUM(COALESCE(dr.revenue, l.linehaul_rate, l.revenue, 0)) revenue
               FROM driver_routes dr
               JOIN loads l ON l.id = dr.load_id
              WHERE dr.driver_id IS NOT NULL
                AND l.driver_id IS NOT NULL
                AND l.driver_id <> dr.driver_id
                AND DATE(COALESCE(dr.source_created_at, dr.source_updated_at))
                    BETWEEN ? AND ?
                AND (
                      SELECT COUNT(DISTINCT o.driver_id)
                        FROM driver_routes o
                       WHERE o.load_id = dr.load_id
                         AND o.driver_id IS NOT NULL
                    ) >= 2
              GROUP BY dr.driver_id
             UNION ALL
             SELECT dr.driver_id,
                    COUNT(DISTINCT dr.load_id) trips,
                    SUM(COALESCE(dr.loaded_miles, 0) + COALESCE(dr.empty_miles, 0)) miles,
                    SUM(COALESCE(dr.loaded_miles, 0)) loadedMiles,
                    SUM(COALESCE(dr.revenue, 0)) revenue
               FROM driver_routes dr
               JOIN loads l ON l.id = dr.load_id
              WHERE dr.driver_id IS NOT NULL
                AND l.driver_id = dr.driver_id
                AND DATE(l.delivery_at) BETWEEN ? AND ?
                AND (
                      SELECT COUNT(DISTINCT o.driver_id)
                        FROM driver_routes o
                       WHERE o.load_id = dr.load_id
                         AND o.driver_id IS NOT NULL
                    ) >= 2
              GROUP BY dr.driver_id
           ) trip_parts
          GROUP BY driver_id
       ) t ON t.driver_id = d.id
       LEFT JOIN (
         -- OpenRoad driver_accessorials paid in this payroll (settlement) week.
         SELECT driver_id, SUM(amount) accessorial
           FROM driver_accessorials
          WHERE driver_id IS NOT NULL
            AND settlement_week_start = ?
            AND settlement_week_end = ?
          GROUP BY driver_id
       ) acc ON acc.driver_id = d.id
       LEFT JOIN (
         -- PREPASS: toll_charge only (no extras). Week + assignment by Exit Date
         -- (fallback post_date). Multi-truck weeks sum each truck's days.
         SELECT a.driver_id, SUM(tt.toll_charge) prepass
           FROM toll_transactions tt
           JOIN assignments a
             ON a.truck_id = tt.truck_id
            AND COALESCE(tt.exit_date, tt.post_date) >= a.start_date
            AND (a.end_date IS NULL
                 OR COALESCE(tt.exit_date, tt.post_date) <= a.end_date)
          WHERE tt.truck_id IS NOT NULL
            AND DATE(COALESCE(tt.exit_date, tt.post_date)) BETWEEN ? AND ?
          GROUP BY a.driver_id
       ) p ON p.driver_id = d.id
      WHERE d.status = 'active'
        AND (
          f.driver_id IS NOT NULL
          OR t.driver_id IS NOT NULL
          OR p.driver_id IS NOT NULL
          OR acc.driver_id IS NOT NULL
          OR (
            LOWER(REPLACE(TRIM(COALESCE(d.driver_type, '')), ' ', '_'))
              IN (${OWNER_OPERATOR_TYPES.map(() => '?').join(', ')})
            AND u.unit IS NOT NULL
            AND TRIM(CAST(u.unit AS CHAR)) <> ''
            AND LOWER(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)))
              NOT IN ('test')
            AND LOWER(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)))
              NOT LIKE '%example%'
            AND LOWER(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name)))
              NOT LIKE 'accounting%'
          )
          OR ${OWNER_OPERATOR_EXCEPTION_NAMES.map(
            () => `(
              LOWER(TRIM(CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name))) = ?
              OR (
                LOWER(TRIM(d.first_name)) = ?
                AND LOWER(TRIM(d.last_name)) = ?
              )
            )`
          ).join(' OR ')}
        )
      ORDER BY name`,
    [
      year,
      week,
      year,
      week,
      year,
      week,
      end,
      start,
      start,
      end,
      year,
      week,
      start,
      end,
      start,
      end,
      start,
      end,
      start,
      end,
      start,
      end,
      start,
      end,
      ...OWNER_OPERATOR_TYPES,
      ...OWNER_OPERATOR_EXCEPTION_NAMES.flatMap((ex) => {
        const parts = ex.toLowerCase().split(/\s+/);
        return [ex.toLowerCase(), parts[0], parts[parts.length - 1]];
      }),
    ]
  );

  const drivers: SummaryDriver[] = rows.map((r) => {
    const gallons = Number(r.gallons);
    const cardFuel = Number(r.amount);
    const mileage = Number(r.miles);
    const loadedMiles = Number(r.loadedMiles);
    const emptyMiles = Math.max(0, mileage - loadedMiles);
    const grossIncome = Number(r.revenue);
    const trips = Number(r.trips);

    const name = String(r.name ?? '');
    const driverType =
      r.driverType == null || r.driverType === ''
        ? null
        : String(r.driverType);
    const oo = isOwnerOperator({ driverType, name });
    const ooOverride = oo ? lookupOoOverride(name, ooByName) : null;
    const rates = expenseRatesForDriver(
      { driverType, name },
      globals,
      ooOverride
    );
    const { rm, liabilityInsurance: liabRaw } = mileageExpenses(mileage, rates, {
      ownerOperator: oo,
      liabilityCredit: ooOverride?.liabilityCredit ?? 0,
    });
    const liabilityInsurance = Math.round(liabRaw * 100) / 100;
    const equipmentLease = rates.equipmentLease;
    const equipmentLease2 = rates.equipmentLease2;
    const cargoInsurance = rates.cargoInsurance;
    const factoringFee = grossIncome * globals.factoringRate;
    const xxiiFeePct =
      ooOverride?.xxiiFeePct != null && Number.isFinite(ooOverride.xxiiFeePct)
        ? ooOverride.xxiiFeePct
        : null;

    // Driver's pay ≈ OpenRoad total earnings:
    //   Per Mile   → loaded×loaded_mile_rate + empty×empty_mile_rate
    //   Percentage → linehaul_percentage% × gross income
    //   Flat       → flat_rate (period amount; not day/hour-scaled)
    //   + driver_accessorials for this settlement week (load_financials API)
    const accessorial = Math.max(0, Number(r.accessorial ?? 0));
    let driversPay = 0;
    if (r.compStatus === 'Per Mile') {
      const loadedRate = Number(r.loadedMileRate ?? 0);
      const emptyRate = Number(r.emptyMileRate ?? r.loadedMileRate ?? 0);
      driversPay = loadedMiles * loadedRate + emptyMiles * emptyRate;
    } else if (r.compStatus === 'Percentage') {
      driversPay = (grossIncome * Number(r.linehaulPct ?? 0)) / 100;
    } else if (r.compStatus === 'Flat') {
      driversPay = Number(r.flatRate ?? 0);
    }
    driversPay = Math.round((driversPay + accessorial) * 100) / 100;
    const prepass = Number(r.prepass); // tolls on assigned trucks, this week

    // Fuel:
    //   Company — PPG from .dat (amount÷gallons), else Relay paid÷diesel-gal;
    //     MPG from Samsara (fallback miles÷gallons from .dat or Relay)
    //     → fuel $ = (miles / MPG) × PPG (fallback: card spend).
    //   Owner-operator (client rules):
    //     Cheryl Day / Donald Smith — left=txn retail (no discount), right=paid;
    //       $ = retail − paid
    //     Robert Wagner — left=retail, right=paid+(diesel_gal×$0.20);
    //       $ = retail − right
    //     Chevarres Smith — Fuel = $0
    //     Other OO — single field: diesel gallons × $0.12 (fee expense)
    //     Prefer Relay week totals when synced (retail/paid = full txn).
    const relayTxns = Number(r.relayTxnCount ?? 0);
    const relayPaidAmt = Number(r.relayPaid);
    const relayGalAmt = Number(r.relayGallons);
    const cardPpg = gallons > 0 ? cardFuel / gallons : null;
    const relayPpg =
      relayGalAmt > 0 && relayPaidAmt > 0
        ? relayPaidAmt / relayGalAmt
        : null;
    const fuelPpg =
      cardPpg != null && Number.isFinite(cardPpg) && cardPpg >= 0
        ? cardPpg
        : relayPpg != null && Number.isFinite(relayPpg) && relayPpg >= 0
          ? relayPpg
          : null;
    const samsaraMpg =
      r.samsaraMpg == null || r.samsaraMpg === ''
        ? null
        : Number(r.samsaraMpg);
    const galForMpg =
      gallons > 0 ? gallons : relayGalAmt > 0 ? relayGalAmt : 0;
    const fuelMpg =
      samsaraMpg != null && Number.isFinite(samsaraMpg) && samsaraMpg > 0
        ? samsaraMpg
        : galForMpg > 0 && mileage > 0
          ? mileage / galForMpg
          : null;

    const fuelMode = ooFuelMode(name);
    const useRelay = oo && relayTxns > 0;
    const retailRaw = useRelay
      ? Number(r.relayRetail)
      : Number(r.amountRetail);
    const paidRaw = useRelay ? relayPaidAmt : cardFuel;
    const galRaw = useRelay ? relayGalAmt : gallons;

    let fuelGross: number | null = null;
    let fuelDiscounted: number | null = null;
    let fuel: number;
    let fuelMpgOut: number | null = fuelMpg;
    let fuelPpgOut: number | null = fuelPpg;

    if (oo) {
      fuelMpgOut = null;
      fuelPpgOut = null;
      if (fuelMode === 'zero') {
        fuel = 0;
      } else if (fuelMode === 'per_gallon_fee') {
        fuel =
          galRaw > 0
            ? Math.round(galRaw * OO_DIESEL_FEE_PER_GALLON * 100) / 100
            : 0;
      } else if (fuelMode === 'wagner') {
        // Client screenshot: left=retail, right=paid+(diesel_gal×$0.20)
        const retail =
          retailRaw > 0
            ? Math.round(Math.max(retailRaw, paidRaw) * 100) / 100
            : 0;
        const paid = Math.round(Math.max(0, paidRaw) * 100) / 100;
        const galAddon =
          Math.round(
            Math.max(0, galRaw) * OO_WAGNER_PER_GALLON_ADDON * 100
          ) / 100;
        const right = Math.round((paid + galAddon) * 100) / 100;
        fuelGross = retail > 0 ? retail : null;
        fuelDiscounted = retail > 0 || paid > 0 || galAddon > 0 ? right : null;
        fuel =
          fuelGross != null && fuelDiscounted != null
            ? Math.round(Math.max(0, fuelGross - fuelDiscounted) * 100) / 100
            : 0;
      } else {
        // Cheryl Day / Donald Smith
        const retail =
          retailRaw > 0
            ? Math.round(Math.max(retailRaw, paidRaw) * 100) / 100
            : 0;
        const paid = Math.round(Math.max(0, paidRaw) * 100) / 100;
        fuelGross = retail > 0 ? retail : null;
        fuelDiscounted =
          paid > 0 || retail > 0 ? paid : null;
        fuel =
          fuelGross != null && fuelDiscounted != null
            ? Math.round(Math.max(0, fuelGross - fuelDiscounted) * 100) / 100
            : 0;
      }
    } else {
      const computedFuel = computeFuelCost(mileage, fuelMpg, fuelPpg);
      fuel =
        computedFuel == null
          ? cardFuel
          : Math.round(computedFuel * 100) / 100;
    }

    const pdInsurance = oo ? ooPdFromOverride(ooOverride) : FIXED.pdInsurance;

    const expenseParts = {
      driversPay,
      fuel,
      prepass,
      monitoringLogs: FIXED.monitoringLogs,
      rm,
      equipmentLease,
      equipmentLease2,
      liabilityInsurance,
      scale: FIXED.scale,
      factoringFee,
      samsara: FIXED.samsara,
      cargoInsurance,
      pdInsurance,
    };

    const linehaulPct =
      r.linehaulPct == null || r.linehaulPct === ''
        ? null
        : Number(r.linehaulPct);

    let totalExpenses: number;
    let grossProfit: number;
    if (oo) {
      const vis = ownerOperatorVisibleTotals({
        fuel,
        rm,
        equipmentLease,
        liabilityInsurance,
        cargoInsurance,
        factoringFee,
        samsara: FIXED.samsara,
        pdInsurance,
        grossIncome,
        name,
        linehaulPct:
          linehaulPct != null && Number.isFinite(linehaulPct)
            ? linehaulPct
            : null,
        xxiiFeePct,
      });
      totalExpenses = Math.round(vis.totalExpenses * 100) / 100;
      grossProfit = Math.round(vis.grossProfit * 100) / 100;
    } else {
      totalExpenses = Math.round(sumExpenses(expenseParts) * 100) / 100;
      grossProfit = Math.round((grossIncome - totalExpenses) * 100) / 100;
    }

    return {
      driverId: r.id,
      name,
      driverStatus: r.driverStatus,
      driverType,
      unit: r.unit,
      compensationName: r.compensationName,
      linehaulPct:
        linehaulPct != null && Number.isFinite(linehaulPct) ? linehaulPct : null,
      xxiiFeePct,
      trips,
      rate: mileage > 0 ? grossIncome / mileage : 0,
      mileage,
      grossIncome,
      driversPay,
      fuel,
      fuelGross,
      fuelDiscounted,
      fuelMpg: fuelMpgOut,
      fuelPpg: fuelPpgOut,
      prepass,
      monitoringLogs: FIXED.monitoringLogs,
      rm,
      equipmentLease,
      equipmentLease2,
      liabilityInsurance,
      scale: FIXED.scale,
      factoringFee,
      samsara: FIXED.samsara,
      cargoInsurance,
      pdInsurance,
      totalExpenses,
      grossProfit,
    };
  });

  const totals = drivers.reduce(
    (acc, d) => ({
      trips: acc.trips + d.trips,
      mileage: acc.mileage + d.mileage,
      grossIncome: acc.grossIncome + d.grossIncome,
      totalExpenses: acc.totalExpenses + d.totalExpenses,
      grossProfit: acc.grossProfit + d.grossProfit,
    }),
    { trips: 0, mileage: 0, grossIncome: 0, totalExpenses: 0, grossProfit: 0 }
  );

  return { year, week, start, end, drivers, totals, driverTypes: [] };
}

/** Fuel MPG is stored as DECIMAL(8,2) — reject anything that can't round-trip. */
export function isValidFuelMpg(v: number): boolean {
  return Number.isFinite(v) && v > 0 && v < 1000;
}

/** Net P/G ($/gal) — same column precision as fuel_ppg DECIMAL(8,4)-friendly. */
export function isValidFuelPpg(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v < 100;
}

/** Weekly mileage — DECIMAL(12,2)-friendly. */
export function isValidMileage(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v < 1_000_000;
}

/**
 * Excel Block-1 Fuel formula: (mileage / MPG) × Net P/G.
 * Returns null when either input is missing/invalid (caller keeps card-spend fuel).
 */
export function computeFuelCost(
  mileage: number,
  mpg: number | null,
  ppg: number | null
): number | null {
  if (
    mpg == null ||
    ppg == null ||
    !Number.isFinite(mileage) ||
    mileage < 0 ||
    mpg <= 0 ||
    ppg < 0
  ) {
    return null;
  }
  return (mileage / mpg) * ppg;
}

function sumExpenses(parts: {
  driversPay: number;
  fuel: number;
  prepass: number;
  monitoringLogs: number;
  rm: number;
  equipmentLease: number;
  equipmentLease2: number;
  liabilityInsurance: number;
  scale: number;
  factoringFee: number;
  samsara: number;
  cargoInsurance: number;
  pdInsurance: number;
}): number {
  return (
    parts.driversPay +
    parts.fuel +
    parts.prepass +
    parts.monitoringLogs +
    parts.rm +
    parts.equipmentLease +
    parts.equipmentLease2 +
    parts.liabilityInsurance +
    parts.scale +
    parts.factoringFee +
    parts.samsara +
    parts.cargoInsurance +
    parts.pdInsurance
  );
}

// ---- Persisted report (gross_profit_reports) ------------------------------

const REPORT_COLS = [
  'year', 'week', 'driver_id', 'driver_name', 'driver_status', 'driver_type',
  'unit', 'compensation_name', 'linehaul_pct', 'trips', 'rate', 'mileage',
  'gross_income', 'drivers_pay', 'fuel', 'fuel_gross', 'fuel_discounted',
  'fuel_mpg', 'fuel_ppg', 'prepass',
  'monitoring_logs', 'rm', 'equipment_lease', 'equipment_lease2',
  'liability_insurance', 'scale', 'factoring_fee', 'samsara', 'cargo_insurance',
  'pd_insurance', 'total_expenses', 'gross_profit',
];

/** Compute a week and persist it to gross_profit_reports (clean replace). */
export async function storeWeeklySummary(
  year: number,
  week: number
): Promise<{ year: number; week: number; drivers: number }> {
  const summary = await getWeeklySummary(year, week);
  const rows = summary.drivers.map((d) => [
    year, week, d.driverId, d.name, d.driverStatus, d.driverType, d.unit,
    d.compensationName, d.linehaulPct, d.trips, d.rate, d.mileage, d.grossIncome,
    d.driversPay, d.fuel, d.fuelGross, d.fuelDiscounted, d.fuelMpg, d.fuelPpg,
    d.prepass, d.monitoringLogs,
    d.rm, d.equipmentLease, d.equipmentLease2, d.liabilityInsurance, d.scale,
    d.factoringFee, d.samsara, d.cargoInsurance, d.pdInsurance, d.totalExpenses,
    d.grossProfit,
  ]);

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM gross_profit_reports WHERE year = ? AND week = ?', [year, week]);
    if (rows.length) {
      await conn.query(
        `INSERT INTO gross_profit_reports (${REPORT_COLS.join(', ')}) VALUES ?`,
        [rows]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { year, week, drivers: rows.length };
}

interface ReportRow extends RowDataPacket {
  driver_id: number;
  driver_name: string | null;
  driver_status: string | null;
  driver_type: string | null;
  unit: string | null;
  compensation_name: string | null;
  linehaul_pct: string | number | null;
  trips: number;
  rate: string | number;
  mileage: string | number;
  gross_income: string | number;
  drivers_pay: string | number;
  fuel: string | number;
  fuel_gross: string | number | null;
  fuel_discounted: string | number | null;
  fuel_mpg: string | number | null;
  fuel_ppg: string | number | null;
  prepass: string | number;
  monitoring_logs: string | number;
  rm: string | number;
  equipment_lease: string | number;
  equipment_lease2: string | number;
  liability_insurance: string | number;
  scale: string | number;
  factoring_fee: string | number;
  samsara: string | number;
  cargo_insurance: string | number;
  pd_insurance: string | number;
  total_expenses: string | number;
  gross_profit: string | number;
}

/** Read the persisted weekly report (no runtime compute). */
export async function getStoredWeeklySummary(
  year: number,
  week: number,
  opts: { status?: string; driverType?: string } = {}
): Promise<WeeklySummary> {
  const { start, end } = weekRange(year, week);
  const status = (opts.status ?? 'active').trim() || 'active';
  const driverType = opts.driverType?.trim() || '';

  const typeFilter = driverTypeFilterSql(driverType);
  const params: (string | number)[] = [year, week, status, ...typeFilter.params];

  const [rows] = await getPool().query<ReportRow[]>(
    `SELECT *
       FROM gross_profit_reports
      WHERE year = ? AND week = ?
        AND LOWER(COALESCE(driver_status, '')) = LOWER(?)
        ${typeFilter.sql}
      ORDER BY driver_name`,
    params
  );

  const [typeRows] = await getPool().query<RowDataPacket[]>(
    `SELECT DISTINCT driver_type AS driverType
       FROM gross_profit_reports
      WHERE year = ? AND week = ?
        AND LOWER(COALESCE(driver_status, '')) = LOWER(?)
        AND driver_type IS NOT NULL
        AND TRIM(driver_type) <> ''
      ORDER BY driver_type`,
    [year, week, status]
  );
  // Names for OO exceptions (may still be labeled contract_driver).
  const [nameRows] = await getPool().query<RowDataPacket[]>(
    `SELECT DISTINCT driver_name AS driverName
       FROM gross_profit_reports
      WHERE year = ? AND week = ?
        AND LOWER(COALESCE(driver_status, '')) = LOWER(?)
        AND driver_name IS NOT NULL`,
    [year, week, status]
  );
  let driverTypes = collapseDriverTypesForFilter(
    typeRows.map((r) => String(r.driverType)).filter(Boolean)
  );
  const hasOoException = nameRows.some((r) =>
    isOwnerOperatorExceptionName(String(r.driverName ?? ''))
  );
  if (hasOoException && !driverTypes.includes(OWNER_OPERATOR_FILTER)) {
    driverTypes = [...driverTypes, OWNER_OPERATOR_FILTER].sort((a, b) =>
      a.localeCompare(b)
    );
  }

  const [ooByName, globals] = await Promise.all([
    getOoOverridesByNameKey(),
    getGpExpenseRates(),
  ]);

  const n = (v: string | number | null) => (v == null ? null : Number(v));
  const drivers: SummaryDriver[] = rows.map((r) => {
    const mileage = Number(r.mileage);
    const grossIncome = Number(r.gross_income);
    const fuelMpg = n(r.fuel_mpg);
    const fuelPpg = n(r.fuel_ppg);
    const fuelGross = n(r.fuel_gross);
    const fuelDiscounted = n(r.fuel_discounted);
    const storedFuel = Number(r.fuel);
    const driverName = r.driver_name ?? '';
    const oo = isOwnerOperator({
      driverType: r.driver_type,
      name: driverName,
    });
    const ooOverride = oo ? lookupOoOverride(driverName, ooByName) : null;
    const xxiiFeePct =
      ooOverride?.xxiiFeePct != null && Number.isFinite(ooOverride.xxiiFeePct)
        ? ooOverride.xxiiFeePct
        : null;
    // Company: may recompute from MPG×PPG. OO: fuel column is discount savings.
    let fuel: number;
    if (oo) {
      fuel = storedFuel;
    } else {
      const computed = computeFuelCost(mileage, fuelMpg, fuelPpg);
      fuel =
        computed == null ? storedFuel : Math.round(computed * 100) / 100;
    }
    const driversPay = Number(r.drivers_pay);
    const prepass = Number(r.prepass);
    const monitoringLogs = Number(r.monitoring_logs);
    let rm = Number(r.rm);
    let equipmentLease = Number(r.equipment_lease);
    let equipmentLease2 = Number(r.equipment_lease2);
    let liabilityInsurance = Number(r.liability_insurance);
    const scale = Number(r.scale);
    let factoringFee = Number(r.factoring_fee);
    const samsara = Number(r.samsara);
    let cargoInsurance = Number(r.cargo_insurance);
    let pdInsurance = Number(r.pd_insurance);
    const linehaulPct = n(r.linehaul_pct);
    // OO: apply live Configurations (lease / R&M / liability / PD / factoring / XXII)
    // so Gross Profit page reflects saves without regenerating the week.
    if (oo) {
      const rates = expenseRatesForDriver(
        { driverType: r.driver_type, name: driverName },
        globals,
        ooOverride
      );
      const { rm: liveRm, liabilityInsurance: liabRaw } = mileageExpenses(
        mileage,
        rates,
        {
          ownerOperator: true,
          liabilityCredit: ooOverride?.liabilityCredit ?? 0,
        }
      );
      rm = Math.round(liveRm * 100) / 100;
      liabilityInsurance = Math.round(liabRaw * 100) / 100;
      equipmentLease = rates.equipmentLease;
      equipmentLease2 = rates.equipmentLease2;
      cargoInsurance = rates.cargoInsurance;
      factoringFee =
        Math.round(grossIncome * globals.factoringRate * 100) / 100;
      pdInsurance = ooPdFromOverride(ooOverride);
    }
    let totalExpenses: number;
    let grossProfit: number;
    if (oo) {
      const vis = ownerOperatorVisibleTotals({
        fuel,
        rm,
        equipmentLease,
        liabilityInsurance,
        cargoInsurance,
        factoringFee,
        samsara,
        pdInsurance,
        grossIncome,
        name: driverName,
        linehaulPct,
        xxiiFeePct,
      });
      totalExpenses = Math.round(vis.totalExpenses * 100) / 100;
      grossProfit = Math.round(vis.grossProfit * 100) / 100;
    } else {
      totalExpenses =
        Math.round(
          sumExpenses({
            driversPay,
            fuel,
            prepass,
            monitoringLogs,
            rm,
            equipmentLease,
            equipmentLease2,
            liabilityInsurance,
            scale,
            factoringFee,
            samsara,
            cargoInsurance,
            pdInsurance,
          }) * 100
        ) / 100;
      grossProfit = Math.round((grossIncome - totalExpenses) * 100) / 100;
    }
    return {
      driverId: r.driver_id,
      name: r.driver_name ?? '',
      driverStatus: r.driver_status,
      driverType: r.driver_type,
      unit: r.unit,
      compensationName: r.compensation_name,
      linehaulPct,
      xxiiFeePct,
      trips: Number(r.trips),
      rate: Number(r.rate),
      mileage,
      grossIncome,
      driversPay,
      fuel,
      fuelGross: oo ? fuelGross : null,
      fuelDiscounted: oo ? fuelDiscounted : null,
      fuelMpg: oo ? null : fuelMpg,
      fuelPpg: oo ? null : fuelPpg,
      prepass,
      monitoringLogs,
      rm,
      equipmentLease,
      equipmentLease2,
      liabilityInsurance,
      scale,
      factoringFee,
      samsara,
      cargoInsurance,
      pdInsurance,
      totalExpenses,
      grossProfit,
    };
  });
  const totals = drivers.reduce(
    (acc, d) => ({
      trips: acc.trips + d.trips,
      mileage: acc.mileage + d.mileage,
      grossIncome: acc.grossIncome + d.grossIncome,
      totalExpenses: acc.totalExpenses + d.totalExpenses,
      grossProfit: acc.grossProfit + d.grossProfit,
    }),
    { trips: 0, mileage: 0, grossIncome: 0, totalExpenses: 0, grossProfit: 0 }
  );
  return { year, week, start, end, drivers, totals, driverTypes };
}

export interface StoredFuelInputsResult {
  fuelMpg: number | null;
  fuelPpg: number | null;
  fuel: number;
  totalExpenses: number;
  grossProfit: number;
}

export interface StoredMileageResult {
  mileage: number;
  rate: number;
  rm: number;
  liabilityInsurance: number;
  equipmentLease: number;
  equipmentLease2: number;
  cargoInsurance: number;
  factoringFee: number;
  fuel: number;
  driversPay: number;
  totalExpenses: number;
  grossProfit: number;
}

export interface StoredGrossIncomeResult {
  grossIncome: number;
  rate: number;
  driversPay: number;
  factoringFee: number;
  totalExpenses: number;
  grossProfit: number;
}

export interface StoredDriversPayResult {
  driversPay: number;
  totalExpenses: number;
  grossProfit: number;
}

export interface StoredPrepassResult {
  prepass: number;
  totalExpenses: number;
  grossProfit: number;
}

/** Gross income ($) — DECIMAL(12,2)-friendly. */
export function isValidGrossIncome(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v < 100_000_000;
}

/** Driver's pay ($) — DECIMAL(12,2)-friendly. */
export function isValidDriversPay(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v < 100_000_000;
}

/** PREPASS ($) — DECIMAL(12,2)-friendly. */
export function isValidPrepass(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v < 100_000_000;
}

/**
 * Hand-edit Fuel MPG and/or Net P/G on a stored weekly report row.
 *
 * When both MPG and Net P/G are set, Fuel $ = (mileage / MPG) × Net P/G,
 * then Total Expenses and Gross Profit are recomputed. If either input is
 * cleared/missing, Fuel stays the existing stored value (card spend fallback).
 *
 * Re-running `pnpm generate:report` for the same week recomputes derived columns
 * and therefore discards manual edits.
 *
 * Returns null when the week/driver has no stored row.
 */
export async function setStoredFuelInputs(
  year: number,
  week: number,
  driverId: number,
  inputs: { fuelMpg: number | null; fuelPpg: number | null }
): Promise<StoredFuelInputsResult | null> {
  const pool = getPool();
  const [rows] = await pool.query<ReportRow[]>(
    `SELECT * FROM gross_profit_reports
      WHERE year = ? AND week = ? AND driver_id = ?
      LIMIT 1`,
    [year, week, driverId]
  );
  const row = rows[0];
  if (!row) return null;

  const oo = isOwnerOperator({
    driverType: row.driver_type,
    name: row.driver_name ?? '',
  });
  // Owner-operator fuel is retail vs discounted card totals — not MPG/PPG.
  if (oo) {
    return {
      fuelMpg: null,
      fuelPpg: null,
      fuel: Number(row.fuel),
      totalExpenses: Number(row.total_expenses),
      grossProfit: Number(row.gross_profit),
    };
  }

  const fuelMpg = inputs.fuelMpg;
  const fuelPpg = inputs.fuelPpg;
  const mileage = Number(row.mileage);
  const grossIncome = Number(row.gross_income);
  const cardFuel = Number(row.fuel);
  const computed = computeFuelCost(mileage, fuelMpg, fuelPpg);
  const fuel =
    computed == null ? cardFuel : Math.round(computed * 100) / 100;

  let totalExpenses: number;
  let grossProfit: number;
  {
    totalExpenses =
      Math.round(
        sumExpenses({
          driversPay: Number(row.drivers_pay),
          fuel,
          prepass: Number(row.prepass),
          monitoringLogs: Number(row.monitoring_logs),
          rm: Number(row.rm),
          equipmentLease: Number(row.equipment_lease),
          equipmentLease2: Number(row.equipment_lease2),
          liabilityInsurance: Number(row.liability_insurance),
          scale: Number(row.scale),
          factoringFee: Number(row.factoring_fee),
          samsara: Number(row.samsara),
          cargoInsurance: Number(row.cargo_insurance),
          pdInsurance: Number(row.pd_insurance),
        }) * 100
      ) / 100;
    grossProfit = Math.round((grossIncome - totalExpenses) * 100) / 100;
  }

  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE gross_profit_reports
        SET fuel_mpg = ?,
            fuel_ppg = ?,
            fuel = ?,
            total_expenses = ?,
            gross_profit = ?
      WHERE year = ? AND week = ? AND driver_id = ?`,
    [fuelMpg, fuelPpg, fuel, totalExpenses, grossProfit, year, week, driverId]
  );
  if (res.affectedRows === 0) return null;

  return { fuelMpg, fuelPpg, fuel, totalExpenses, grossProfit };
}

/**
 * Hand-edit mileage on a stored weekly report row.
 * Recomputes RATE $, R&M, Liability, equipment leases (by driver type),
 * Factoring (from gross), Fuel $ (when MPG+P/G set), Total Expenses and Gross Profit.
 * Driver's pay stays as stored (percentage pay depends on gross; per-mile rate is not on the row).
 */
export async function setStoredMileage(
  year: number,
  week: number,
  driverId: number,
  mileage: number
): Promise<StoredMileageResult | null> {
  const pool = getPool();
  const [rows] = await pool.query<ReportRow[]>(
    `SELECT * FROM gross_profit_reports
      WHERE year = ? AND week = ? AND driver_id = ?
      LIMIT 1`,
    [year, week, driverId]
  );
  const row = rows[0];
  if (!row) return null;

  const miles = Math.round(mileage * 100) / 100;
  const grossIncome = Number(row.gross_income);
  const rate = miles > 0 ? Math.round((grossIncome / miles) * 10000) / 10000 : 0;
  const driverName = row.driver_name ?? '';
  const oo = isOwnerOperator({
    driverType: row.driver_type,
    name: driverName,
  });
  const [globals, ooByName] = await Promise.all([
    getGpExpenseRates(),
    getOoOverridesByNameKey(),
  ]);
  const ooOverride = oo ? lookupOoOverride(driverName, ooByName) : null;
  const xxiiFeePct =
    ooOverride?.xxiiFeePct != null && Number.isFinite(ooOverride.xxiiFeePct)
      ? ooOverride.xxiiFeePct
      : null;
  const rates = expenseRatesForDriver(
    { driverType: row.driver_type, name: driverName },
    globals,
    ooOverride
  );
  const raw = mileageExpenses(miles, rates, {
    ownerOperator: oo,
    liabilityCredit: ooOverride?.liabilityCredit ?? 0,
  });
  const rm = Math.round(raw.rm * 100) / 100;
  const liabilityInsurance = Math.round(raw.liabilityInsurance * 100) / 100;
  const equipmentLease = rates.equipmentLease;
  const equipmentLease2 = rates.equipmentLease2;
  const cargoInsurance = rates.cargoInsurance;
  const factoringFee = Math.round(grossIncome * globals.factoringRate * 100) / 100;
  const driversPay = Number(row.drivers_pay);

  const fuelMpg = row.fuel_mpg == null ? null : Number(row.fuel_mpg);
  const fuelPpg = row.fuel_ppg == null ? null : Number(row.fuel_ppg);
  const cardFuel = Number(row.fuel);
  // OO fuel is discount savings (not MPG×PPG).
  const fuel = oo
    ? cardFuel
    : (() => {
        const computed = computeFuelCost(miles, fuelMpg, fuelPpg);
        return computed == null ? cardFuel : Math.round(computed * 100) / 100;
      })();

  let totalExpenses: number;
  let grossProfit: number;
  if (oo) {
    const vis = ownerOperatorVisibleTotals({
      fuel,
      rm,
      equipmentLease,
      liabilityInsurance,
      cargoInsurance,
      factoringFee,
      samsara: Number(row.samsara),
      pdInsurance: ooPdFromOverride(ooOverride),
      grossIncome,
      name: driverName,
      linehaulPct:
        row.linehaul_pct == null ? null : Number(row.linehaul_pct),
      xxiiFeePct,
    });
    totalExpenses = Math.round(vis.totalExpenses * 100) / 100;
    grossProfit = Math.round(vis.grossProfit * 100) / 100;
  } else {
    totalExpenses =
      Math.round(
        sumExpenses({
          driversPay,
          fuel,
          prepass: Number(row.prepass),
          monitoringLogs: Number(row.monitoring_logs),
          rm,
          equipmentLease,
          equipmentLease2,
          liabilityInsurance,
          scale: Number(row.scale),
          factoringFee,
          samsara: Number(row.samsara),
          cargoInsurance,
          pdInsurance: Number(row.pd_insurance),
        }) * 100
      ) / 100;
    grossProfit = Math.round((grossIncome - totalExpenses) * 100) / 100;
  }

  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE gross_profit_reports
        SET mileage = ?,
            rate = ?,
            rm = ?,
            liability_insurance = ?,
            equipment_lease = ?,
            equipment_lease2 = ?,
            cargo_insurance = ?,
            factoring_fee = ?,
            fuel = ?,
            total_expenses = ?,
            gross_profit = ?
      WHERE year = ? AND week = ? AND driver_id = ?`,
    [
      miles,
      rate,
      rm,
      liabilityInsurance,
      equipmentLease,
      equipmentLease2,
      cargoInsurance,
      factoringFee,
      fuel,
      totalExpenses,
      grossProfit,
      year,
      week,
      driverId,
    ]
  );
  if (res.affectedRows === 0) return null;

  return {
    mileage: miles,
    rate,
    rm,
    liabilityInsurance,
    equipmentLease,
    equipmentLease2,
    cargoInsurance,
    factoringFee,
    fuel,
    driversPay,
    totalExpenses,
    grossProfit,
  };
}

/**
 * Hand-edit TOTAL GROSS IN on a stored weekly report row.
 * Recomputes RATE $, Factoring fee, Driver's pay (when linehaul_pct set),
 * Total Expenses and Gross Profit.
 */
export async function setStoredGrossIncome(
  year: number,
  week: number,
  driverId: number,
  grossIncome: number
): Promise<StoredGrossIncomeResult | null> {
  const pool = getPool();
  const [rows] = await pool.query<ReportRow[]>(
    `SELECT * FROM gross_profit_reports
      WHERE year = ? AND week = ? AND driver_id = ?
      LIMIT 1`,
    [year, week, driverId]
  );
  const row = rows[0];
  if (!row) return null;

  const income = Math.round(grossIncome * 100) / 100;
  const mileage = Number(row.mileage);
  const rate =
    mileage > 0 ? Math.round((income / mileage) * 10000) / 10000 : 0;
  const globals = await getGpExpenseRates();
  const factoringFee = Math.round(income * globals.factoringRate * 100) / 100;

  // Percentage pay: drivers_pay = gross × linehaul_pct / 100 when pct is stored.
  const linehaulPct =
    row.linehaul_pct == null ? null : Number(row.linehaul_pct);
  let driversPay = Number(row.drivers_pay);
  if (linehaulPct != null && Number.isFinite(linehaulPct) && linehaulPct > 0) {
    driversPay = Math.round(((income * linehaulPct) / 100) * 100) / 100;
  }

  const driverName = row.driver_name ?? '';
  const oo = isOwnerOperator({
    driverType: row.driver_type,
    name: driverName,
  });
  const ooByName = await getOoOverridesByNameKey();
  const ooOverride = oo ? lookupOoOverride(driverName, ooByName) : null;
  const xxiiFeePct =
    ooOverride?.xxiiFeePct != null && Number.isFinite(ooOverride.xxiiFeePct)
      ? ooOverride.xxiiFeePct
      : null;
  let totalExpenses: number;
  let grossProfit: number;
  if (oo) {
    const vis = ownerOperatorVisibleTotals({
      fuel: Number(row.fuel),
      rm: Number(row.rm),
      equipmentLease: Number(row.equipment_lease),
      liabilityInsurance: Number(row.liability_insurance),
      cargoInsurance: Number(row.cargo_insurance),
      factoringFee,
      samsara: Number(row.samsara),
      pdInsurance:
        Number(row.pd_insurance) || ooPdFromOverride(ooOverride),
      grossIncome: income,
      name: driverName,
      linehaulPct,
      xxiiFeePct,
    });
    totalExpenses = Math.round(vis.totalExpenses * 100) / 100;
    grossProfit = Math.round(vis.grossProfit * 100) / 100;
  } else {
    totalExpenses =
      Math.round(
        sumExpenses({
          driversPay,
          fuel: Number(row.fuel),
          prepass: Number(row.prepass),
          monitoringLogs: Number(row.monitoring_logs),
          rm: Number(row.rm),
          equipmentLease: Number(row.equipment_lease),
          equipmentLease2: Number(row.equipment_lease2),
          liabilityInsurance: Number(row.liability_insurance),
          scale: Number(row.scale),
          factoringFee,
          samsara: Number(row.samsara),
          cargoInsurance: Number(row.cargo_insurance),
          pdInsurance: Number(row.pd_insurance),
        }) * 100
      ) / 100;
    grossProfit = Math.round((income - totalExpenses) * 100) / 100;
  }

  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE gross_profit_reports
        SET gross_income = ?,
            rate = ?,
            drivers_pay = ?,
            factoring_fee = ?,
            total_expenses = ?,
            gross_profit = ?
      WHERE year = ? AND week = ? AND driver_id = ?`,
    [
      income,
      rate,
      driversPay,
      factoringFee,
      totalExpenses,
      grossProfit,
      year,
      week,
      driverId,
    ]
  );
  if (res.affectedRows === 0) return null;

  return {
    grossIncome: income,
    rate,
    driversPay,
    factoringFee,
    totalExpenses,
    grossProfit,
  };
}

/**
 * Hand-edit Driver's pay on a stored weekly report row.
 * Recomputes Total Expenses and Gross Profit.
 */
export async function setStoredDriversPay(
  year: number,
  week: number,
  driverId: number,
  driversPay: number
): Promise<StoredDriversPayResult | null> {
  const pool = getPool();
  const [rows] = await pool.query<ReportRow[]>(
    `SELECT * FROM gross_profit_reports
      WHERE year = ? AND week = ? AND driver_id = ?
      LIMIT 1`,
    [year, week, driverId]
  );
  const row = rows[0];
  if (!row) return null;

  const pay = Math.round(driversPay * 100) / 100;
  const grossIncome = Number(row.gross_income);
  const oo = isOwnerOperator({
    driverType: row.driver_type,
    name: row.driver_name ?? '',
  });
  let totalExpenses: number;
  let grossProfit: number;
  if (oo) {
    const vis = await ooVisibleTotalsForRow(row);
    totalExpenses = Math.round(vis.totalExpenses * 100) / 100;
    grossProfit = Math.round(vis.grossProfit * 100) / 100;
  } else {
    totalExpenses =
      Math.round(
        sumExpenses({
          driversPay: pay,
          fuel: Number(row.fuel),
          prepass: Number(row.prepass),
          monitoringLogs: Number(row.monitoring_logs),
          rm: Number(row.rm),
          equipmentLease: Number(row.equipment_lease),
          equipmentLease2: Number(row.equipment_lease2),
          liabilityInsurance: Number(row.liability_insurance),
          scale: Number(row.scale),
          factoringFee: Number(row.factoring_fee),
          samsara: Number(row.samsara),
          cargoInsurance: Number(row.cargo_insurance),
          pdInsurance: Number(row.pd_insurance),
        }) * 100
      ) / 100;
    grossProfit = Math.round((grossIncome - totalExpenses) * 100) / 100;
  }

  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE gross_profit_reports
        SET drivers_pay = ?,
            total_expenses = ?,
            gross_profit = ?
      WHERE year = ? AND week = ? AND driver_id = ?`,
    [pay, totalExpenses, grossProfit, year, week, driverId]
  );
  if (res.affectedRows === 0) return null;

  return { driversPay: pay, totalExpenses, grossProfit };
}

/**
 * Hand-edit PREPASS on a stored weekly report row.
 * Recomputes Total Expenses and Gross Profit.
 */
export async function setStoredPrepass(
  year: number,
  week: number,
  driverId: number,
  prepass: number
): Promise<StoredPrepassResult | null> {
  const pool = getPool();
  const [rows] = await pool.query<ReportRow[]>(
    `SELECT * FROM gross_profit_reports
      WHERE year = ? AND week = ? AND driver_id = ?
      LIMIT 1`,
    [year, week, driverId]
  );
  const row = rows[0];
  if (!row) return null;

  const amount = Math.round(prepass * 100) / 100;
  const grossIncome = Number(row.gross_income);
  const oo = isOwnerOperator({
    driverType: row.driver_type,
    name: row.driver_name ?? '',
  });
  let totalExpenses: number;
  let grossProfit: number;
  if (oo) {
    const vis = await ooVisibleTotalsForRow(row);
    totalExpenses = Math.round(vis.totalExpenses * 100) / 100;
    grossProfit = Math.round(vis.grossProfit * 100) / 100;
  } else {
    totalExpenses =
      Math.round(
        sumExpenses({
          driversPay: Number(row.drivers_pay),
          fuel: Number(row.fuel),
          prepass: amount,
          monitoringLogs: Number(row.monitoring_logs),
          rm: Number(row.rm),
          equipmentLease: Number(row.equipment_lease),
          equipmentLease2: Number(row.equipment_lease2),
          liabilityInsurance: Number(row.liability_insurance),
          scale: Number(row.scale),
          factoringFee: Number(row.factoring_fee),
          samsara: Number(row.samsara),
          cargoInsurance: Number(row.cargo_insurance),
          pdInsurance: Number(row.pd_insurance),
        }) * 100
      ) / 100;
    grossProfit = Math.round((grossIncome - totalExpenses) * 100) / 100;
  }

  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE gross_profit_reports
        SET prepass = ?,
            total_expenses = ?,
            gross_profit = ?
      WHERE year = ? AND week = ? AND driver_id = ?`,
    [amount, totalExpenses, grossProfit, year, week, driverId]
  );
  if (res.affectedRows === 0) return null;

  return { prepass: amount, totalExpenses, grossProfit };
}

/** @deprecated Prefer setStoredFuelInputs — kept for any old call sites. */
export async function setStoredFuelMpg(
  year: number,
  week: number,
  driverId: number,
  fuelMpg: number | null
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<ReportRow[]>(
    `SELECT fuel_ppg FROM gross_profit_reports
      WHERE year = ? AND week = ? AND driver_id = ? LIMIT 1`,
    [year, week, driverId]
  );
  if (!rows[0]) return false;
  const fuelPpg =
    rows[0].fuel_ppg == null ? null : Number(rows[0].fuel_ppg);
  const updated = await setStoredFuelInputs(year, week, driverId, {
    fuelMpg,
    fuelPpg,
  });
  return updated != null;
}
