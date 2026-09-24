import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  generateGrossProfitSheet,
  type WeeklyGrossProfit,
} from '@/lib/grossProfitSheet';
import { assembleWeek } from '@/lib/sources/assemble';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function fileResponse(buffer: Buffer, week: number, year: number) {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="Gross-Profit-Sheet-W${week}-${year}.xlsx"`,
    },
  });
}

// GET /api/sheets?year=2026&week=27
// Assembles the week from all sources (TMS + fuel) and returns the .xlsx.
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year'));
  const week = Number(searchParams.get('week'));
  if (!year || !week) {
    return NextResponse.json(
      { error: 'year and week query params are required' },
      { status: 400 }
    );
  }
  try {
    const data = await assembleWeek(year, week);
    const buffer = await generateGrossProfitSheet(data);
    return fileResponse(buffer, week, year);
  } catch (error) {
    console.error('[sheets] GET generate error:', error);
    // TMS not configured yet surfaces here — 503 with the guidance message.
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to generate sheet' },
      { status: 503 }
    );
  }
}

// POST /api/sheets  body: WeeklyGrossProfit
// Generates directly from an explicit payload (works before TMS is wired).
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const data = (await request.json()) as WeeklyGrossProfit;
    if (!data?.year || !data?.week || !Array.isArray(data?.block1)) {
      return NextResponse.json(
        { error: 'Body must include year, week and block1[]' },
        { status: 400 }
      );
    }
    const buffer = await generateGrossProfitSheet(data);
    return fileResponse(buffer, data.week, data.year);
  } catch (error) {
    console.error('[sheets] POST generate error:', error);
    return NextResponse.json(
      { error: 'Failed to generate sheet' },
      { status: 500 }
    );
  }
}
