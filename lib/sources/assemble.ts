import type {
  WeeklyGrossProfit,
  Block1Driver,
  Block2Driver,
} from '../grossProfitSheet';
import { getFuelByDriver } from './fuel';
import { getTmsSource } from './tms';
import { weekRange } from '../week';

// Assembles a week's WeeklyGrossProfit from all sources:
//   - TMS   → trips, mileage, gross income, driver pay, fee rates, block split
//   - fuel  → gallons & spend per driver (from imported .dat transactions)
// Fuel MPG is derived (mileage / gallons) and PPG (amount / gallons) so the
// template's Fuel formula (mileage / MPG * PPG) reproduces the actual spend.

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export async function assembleWeek(
  year: number,
  week: number
): Promise<WeeklyGrossProfit> {
  const { start, end } = weekRange(year, week); // Tuesday→Monday

  const [tms, fuel] = await Promise.all([
    getTmsSource().getWeek(year, week),
    getFuelByDriver(start, end),
  ]);

  const fuelByName = new Map(fuel.map((f) => [norm(f.driverName), f]));

  const block1: Block1Driver[] = [];
  const block2: Block2Driver[] = [];

  for (const d of tms.drivers) {
    const f = fuelByName.get(norm(d.name));
    if (d.block === 2) {
      block2.push({
        name: d.name,
        trips: d.trips,
        mileage: d.mileage,
        grossIncome: d.grossIncome,
        xxiiFeeRate: d.xxiiFeeRate,
        fuelGross: f?.amount ?? null,
        fuelDeduction: null,
      });
    } else {
      const mpg =
        d.mileage && f && f.gallons > 0 ? d.mileage / f.gallons : null;
      block1.push({
        name: d.name,
        trips: d.trips,
        mileage: d.mileage,
        grossIncome: d.grossIncome,
        driversPay: d.driversPay,
        fuelMpg: mpg,
        fuelPpg: f?.pricePerGallon ?? null,
        prepass: d.prepass,
        monitoringLogs: d.monitoringLogs,
      });
    }
  }

  return { year, week, block1, block2 };
}
