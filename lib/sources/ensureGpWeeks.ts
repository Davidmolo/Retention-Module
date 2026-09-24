/**
 * Ensure the last N completed business weeks exist in gross_profit_reports.
 * If Retention (or GP) needs a period, the DB should already have that period.
 * Missing weeks are generated from data already synced into MySQL (loads, fuel, etc.).
 */
import { getPool } from '@/lib/db'
import { weekOf } from '@/lib/week'
import { storeWeeklySummary } from '@/lib/sources/weeklySummary'
import { syncLoadFinancialsForWeek } from '@/lib/openroad/loadFinancials'
import { syncSamsaraMpg } from '@/lib/samsara/mpg'
import { linkFuelDrivers } from '@/lib/dat/linkFuelDrivers'
import { CACHE_KEYS, cacheDel } from '@/lib/cache'

export type YearWeek = { year: number; week: number }

/** Last `count` fully completed Tue–Mon weeks (excludes the current in-progress week). */
export function lastCompletedWeeks(count = 6): YearWeek[] {
  const out: YearWeek[] = []
  // Start from "a week ago" so we only target completed weeks
  const cursor = new Date()
  cursor.setUTCDate(cursor.getUTCDate() - 7)
  for (let i = 0; i < count; i++) {
    out.push(weekOf(cursor))
    cursor.setUTCDate(cursor.getUTCDate() - 7)
  }
  return out
}

async function weeksPresentInDb(weeks: YearWeek[]): Promise<Set<string>> {
  if (!weeks.length) return new Set()
  const pool = getPool()
  const placeholders = weeks.map(() => '(?, ?)').join(', ')
  const params = weeks.flatMap((w) => [w.year, w.week])
  const [rows] = await pool.query(
    `SELECT DISTINCT year, week
       FROM gross_profit_reports
      WHERE (year, week) IN (${placeholders})`,
    params
  )
  const set = new Set<string>()
  for (const r of rows as { year: number; week: number }[]) {
    set.add(`${r.year}-${r.week}`)
  }
  return set
}

async function generateOneWeek(year: number, week: number) {
  console.log(`[ensure-gp] generating missing W${week} ${year}…`)
  try {
    await syncLoadFinancialsForWeek(year, week)
  } catch (e) {
    console.warn(`[ensure-gp] load_financials W${week}:`, (e as Error).message)
  }
  try {
    await linkFuelDrivers()
  } catch (e) {
    console.warn(`[ensure-gp] fuel link:`, (e as Error).message)
  }
  try {
    await syncSamsaraMpg(year, week)
  } catch (e) {
    console.warn(`[ensure-gp] samsara W${week}:`, (e as Error).message)
  }
  const r = await storeWeeklySummary(year, week)
  console.log(`[ensure-gp] stored W${r.week} ${r.year}: ${r.drivers} drivers`)
  return r
}

let inflight: Promise<{ generated: YearWeek[] }> | null = null

/**
 * If any of the last N completed weeks are missing from gross_profit_reports,
 * generate them now so downstream reads (Retention 6-week avg, GP sheet) can succeed.
 */
export async function ensureRecentGpReportWeeks(
  count = 6
): Promise<{ needed: YearWeek[]; generated: YearWeek[]; present: YearWeek[] }> {
  const needed = lastCompletedWeeks(count)
  const presentSet = await weeksPresentInDb(needed)
  const present = needed.filter((w) => presentSet.has(`${w.year}-${w.week}`))
  const missing = needed.filter((w) => !presentSet.has(`${w.year}-${w.week}`))

  if (!missing.length) {
    return { needed, generated: [], present }
  }

  if (!inflight) {
    inflight = (async () => {
      const generated: YearWeek[] = []
      // Oldest first so dependencies feel chronological
      for (const w of [...missing].reverse()) {
        await generateOneWeek(w.year, w.week)
        generated.push(w)
      }
      await cacheDel([CACHE_KEYS.retentionOverview])
      return { generated }
    })().finally(() => {
      inflight = null
    })
  }

  const { generated } = await inflight
  return { needed, generated, present }
}
