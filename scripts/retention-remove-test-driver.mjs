/**
 * Remove TEMP Retention test driver (Shahmeer).
 *   pnpm retention:remove-test-driver
 */
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const TEST_ID = Number(process.env.RETENTION_TEST_DRIVER_ID || 900000001);
const { getPool } = await import('../lib/db.ts');
const pool = getPool();

await pool.query(`DELETE FROM retention_survey_responses WHERE driver_id = ?`, [
  TEST_ID,
]);
await pool.query(`DELETE FROM retention_survey_occurrences WHERE driver_id = ?`, [
  TEST_ID,
]);
await pool.query(`DELETE FROM retention_internal_notes WHERE driver_id = ?`, [
  TEST_ID,
]);
await pool.query(`DELETE FROM retention_cases WHERE driver_id = ?`, [TEST_ID]);
await pool.query(`DELETE FROM retention_notification_logs WHERE driver_id = ?`, [
  TEST_ID,
]);
await pool.query(`DELETE FROM retention_occasion_sends WHERE driver_id = ?`, [
  TEST_ID,
]);
const [res] = await pool.query(`DELETE FROM drivers WHERE id = ? AND driver_nr = 'RETENTION-TEST'`, [
  TEST_ID,
]);

console.log(
  `Removed TEMP test driver id=${TEST_ID} (affected=${res.affectedRows ?? res})`
);
process.exit(0);
