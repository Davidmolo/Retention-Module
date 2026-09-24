import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  CRON_JOBS,
  previousCompletedWeek,
  runCronJob,
  SYNC_ALL_ORDER,
  type CronJobId,
} from '@/lib/jobs/manualCrons';

export const maxDuration = 800;

// GET /api/configurations/jobs — list crontab jobs (for Manual run UI)
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const defaultWeek = previousCompletedWeek();
  return NextResponse.json({
    timezone: 'America/New_York',
    /** Scheduled crontab entries (excludes manual sync-all). */
    count: CRON_JOBS.filter((j) => j.id !== 'sync-all').length,
    defaultWeek,
    /** Pipeline order for “Run all” (client runs these one-by-one for progress). */
    syncAllOrder: SYNC_ALL_ORDER,
    jobs: CRON_JOBS,
  });
}

// POST /api/configurations/jobs — run one job
// Body: { id, year?, week? }
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { id?: unknown; year?: unknown; week?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = String(body.id ?? '') as CronJobId;
  const meta = CRON_JOBS.find((j) => j.id === id);
  if (!meta) {
    return NextResponse.json(
      { error: `Unknown job id. Valid: ${CRON_JOBS.map((j) => j.id).join(', ')}` },
      { status: 400 }
    );
  }

  const year = body.year == null || body.year === '' ? null : Number(body.year);
  const week = body.week == null || body.week === '' ? null : Number(body.week);
  if (year != null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }
  if (week != null && (!Number.isInteger(week) || week < 1 || week > 53)) {
    return NextResponse.json({ error: 'Invalid week' }, { status: 400 });
  }

  const result = await runCronJob(id, { year, week });
  return NextResponse.json({ job: meta, result }, { status: result.ok ? 200 : 500 });
}
