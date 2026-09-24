import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getStoredWeeklySummary } from '@/lib/sources/weeklySummary';
import { buildSummaryWorkbook } from '@/lib/sources/exportSummary';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// GET /api/gross-profit/export?year=2026&week=27&driverType=
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sp = new URL(request.url).searchParams;
  const year = Number(sp.get('year'));
  const week = Number(sp.get('week'));
  const driverType = sp.get('driverType') ?? '';
  if (!year || !week) {
    return NextResponse.json({ error: 'year and week are required' }, { status: 400 });
  }
  try {
    const summary = await getStoredWeeklySummary(year, week, {
      status: 'active',
      driverType,
    });
    const buffer = await buildSummaryWorkbook(summary);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="Gross-Profit-W${week}-${year}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('[gross-profit] export failed:', error);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}
