import { fetchOpenRoadJson, fetchPage } from './client';
import { weekRange } from '../week';

// OpenRoad /driver_pay_statements. One row per driver and pay period.
// Docs: https://app.openroadtms.com/api-docs/ext/v1/index.html#/
// total_paid_miles is the settlement mileage. linehaul on this record is the
// driver's load pay (per mile, percent, or flat), not the customer linehaul.
// earnings is that pay plus accessorials, detention, adjustments, and bonus.
// The endpoint returns 403 until the API application is granted it.

const STATEMENTS_URL =
  process.env.OPENROAD_DRIVER_PAY_STATEMENTS_URL ||
  'https://app.openroadtms.com/api/ext/v1/driver_pay_statements';

export interface DriverPayLineItem {
  name?: string;
  amount?: string;
  description?: string | null;
  load_id?: number | null;
  category?: string | null;
}

export interface DriverPayStatement {
  id: string;
  driver_id: number;
  driver_type?: string | null;
  driver_status?: string | null;
  pay_type?: string | null;
  period_start?: string;
  period_end?: string;
  settlement_date?: string | null;
  locked?: boolean;
  total_paid_miles?: string | null;
  linehaul?: string;
  fuel_surcharge?: string;
  earnings?: string;
  adjustments?: string;
  gross?: string;
  settlement?: string;
  line_items?: DriverPayLineItem[];
}

export async function listDriverPayStatements(
  periodStart: string
): Promise<DriverPayStatement[]> {
  const base = `${STATEMENTS_URL}?period_start=${encodeURIComponent(periodStart)}&sort=period_start`;
  const rows: DriverPayStatement[] = [];
  let page = 1;
  let lastPage: number | null = null;
  while (lastPage == null || page <= lastPage) {
    const { items, lastPage: lp } = await fetchPage(base, page, 100);
    lastPage = lp;
    rows.push(...(items as DriverPayStatement[]));
    if (items.length < 100) break;
    page += 1;
  }
  return rows;
}

export async function getDriverPayStatement(id: string): Promise<DriverPayStatement> {
  const json = (await fetchOpenRoadJson(
    `${STATEMENTS_URL}/${encodeURIComponent(id)}`
  )) as { data?: DriverPayStatement };
  if (!json?.data) throw new Error(`No driver pay statement ${id}`);
  return json.data;
}

/** Statements whose period starts on the Tuesday of this gross-profit week. */
export async function listDriverPayStatementsForWeek(
  year: number,
  week: number
): Promise<DriverPayStatement[]> {
  const { start } = weekRange(year, week);
  return listDriverPayStatements(start);
}
