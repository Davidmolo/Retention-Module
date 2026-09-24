/**
 * TEMP Retention test driver — Shahmeer (+923012373463).
 * REMOVE LATER: pnpm retention:remove-test-driver
 *
 *   pnpm retention:upsert-test-driver
 */
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const TEST_ID = Number(process.env.RETENTION_TEST_DRIVER_ID || 900000001);
const PHONE = process.env.RETENTION_TEST_DRIVER_PHONE || '+13606679564';
const FIRST = process.env.RETENTION_TEST_DRIVER_FIRST || 'Shahmeer';
const LAST = process.env.RETENTION_TEST_DRIVER_LAST || 'RetentionTest';

const { getPool } = await import('../lib/db.ts');

const pool = getPool();
const now = new Date();
// Hire date 30 days ago so survey eligibility (≥7 days) passes
const hired = new Date(now);
hired.setUTCDate(hired.getUTCDate() - 30);
const hireIso = hired.toISOString().slice(0, 19).replace('T', ' ');
const hireDate = hired.toISOString().slice(0, 10);

await pool.query(
  `INSERT INTO drivers (
      id, first_name, last_name, middle_name, driver_nr, status, driver_type,
      tax_type, fleet_group, phone, email, date_added, source_created_at, source_updated_at
    ) VALUES (?, ?, ?, NULL, ?, 'active', 'company_driver',
      NULL, 'none', ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE
      first_name = VALUES(first_name),
      last_name = VALUES(last_name),
      driver_nr = VALUES(driver_nr),
      status = 'active',
      phone = VALUES(phone),
      email = VALUES(email),
      date_added = VALUES(date_added),
      source_created_at = VALUES(source_created_at),
      source_updated_at = VALUES(source_updated_at)`,
  [
    TEST_ID,
    FIRST,
    LAST,
    'RETENTION-TEST',
    PHONE,
    'shahmeer.retention.test@example.com',
    hireDate,
    hireIso,
    hireIso,
  ]
);

console.log(
  `Upserted TEMP test driver id=${TEST_ID} name=${FIRST} ${LAST} phone=${PHONE} status=active`
);
console.log('Open /retention/drivers/' + TEST_ID + ' and click Send Survey');
console.log('Remove later with: pnpm retention:remove-test-driver');
process.exit(0);
