#!/usr/bin/env bun
// Sync OpenRoad /fuel_card_transactions diesel totals for one Tue→Mon week.
// Usage: bun scripts/sync-openroad-fuel.mjs [year] [week]
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
import { weekOf } from '../lib/week.ts';
import { syncOpenRoadFuelForWeek } from '../lib/openroad/fuelCardTransactions.ts';

const now = new Date();
now.setUTCDate(now.getUTCDate() - 7);
const fallback = weekOf(now);
const year = Number(process.argv[2] || fallback.year);
const week = Number(process.argv[3] || fallback.week);

const r = await syncOpenRoadFuelForWeek(year, week);
console.log(JSON.stringify(r, null, 2));
