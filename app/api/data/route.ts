import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getStoredWeeklySummary } from '@/lib/sources/weeklySummary';
import { weekOf } from '@/lib/week';
import type { GrossProfitData, Driver } from '@/lib/excelParser';

// Real weekly gross-profit data from the DB.
// GET /api/data?year=&week= — defaults to the previous completed week.
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const sp = new URL(request.url).searchParams;
    let year = Number(sp.get('year'));
    let week = Number(sp.get('week'));
    if (!year || !week) {
      const prev = new Date();
      prev.setUTCDate(prev.getUTCDate() - 7); // previous week
      ({ year, week } = weekOf(prev));
    }
    const summary = await getStoredWeeklySummary(year, week);

    const drivers: Driver[] = summary.drivers.map((d) => ({
      id: d.driverId,
      name: d.name,
      driverType: d.driverType,
      trips: [],
      tripCount: d.trips,
      rate: d.rate,
      mileage: d.mileage,
      totalGrossIncome: d.grossIncome,
      driversPay: d.driversPay,
      fuel: d.fuel,
      prepass: d.prepass,
      monitoringLogs: d.monitoringLogs,
      rm: d.rm,
      equipmentLease: d.equipmentLease + d.equipmentLease2,
      liabilityInsurance: d.liabilityInsurance,
      totalExpenses: d.totalExpenses,
      netProfit: d.grossProfit,
    }));

    const sum = (pick: (x: Driver) => number) =>
      drivers.reduce((acc, x) => acc + pick(x), 0);

    const data: GrossProfitData = {
      drivers,
      totalMileage: sum((x) => x.mileage),
      totalGrossIncome: sum((x) => x.totalGrossIncome),
      totalExpenses: sum((x) => x.totalExpenses),
      totalNetProfit: sum((x) => x.netProfit),
    };
    return NextResponse.json(data);
  } catch (error) {
    console.error('[data] failed to build weekly data:', error);
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
}
