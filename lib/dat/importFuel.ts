import fs from 'fs';
import path from 'path';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db';
import { linkFuelDrivers } from './linkFuelDrivers';
import { parseFuelFile, parseFuelFileName } from './parseFuelDat';

export interface ImportResult {
  file: string;
  inserted: number;
  skipped: boolean; // already imported (and not forced)
  linked?: { nameLinked: number; unitLinked: number };
}

const INSERT_COLS =
  '(batch_id, record_type, account_number, transaction_date, transaction_seq, ' +
  'transaction_code, merchant_name, merchant_city, merchant_state, store_number, ' +
  'gallons, price_per_gallon, amount, amount_retail, driver_name, card_number, driver_unit_id, ' +
  'reference_number, product_code, raw_record)';

const CHUNK = 500;

/** Import one .dat file into fuel_batches + fuel_transactions. Idempotent by file name. */
export async function importFuelFile(
  filePath: string,
  { force = false }: { force?: boolean } = {}
): Promise<ImportResult> {
  const pool = getPool();
  const fileName = path.basename(filePath);
  const { date, sequence } = parseFuelFileName(fileName);

  const [existing] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM fuel_batches WHERE file_name = ?',
    [fileName]
  );
  if (existing.length) {
    if (!force) return { file: fileName, inserted: 0, skipped: true };
    await pool.query('DELETE FROM fuel_batches WHERE id = ?', [existing[0].id]); // cascade
  }

  const records = parseFuelFile(fs.readFileSync(filePath, 'utf8'));

  const [batch] = await pool.query<ResultSetHeader>(
    'INSERT INTO fuel_batches (file_name, file_date, file_sequence, record_count) VALUES (?, ?, ?, ?)',
    [fileName, date, sequence, records.length]
  );
  const batchId = batch.insertId;

  const rows = records.map((r) => [
    batchId, r.recordType, r.accountNumber, r.transactionDate, r.transactionSeq,
    r.transactionCode, r.merchantName, r.merchantCity, r.merchantState, r.storeNumber,
    r.gallons, r.pricePerGallon, r.amount, r.amountRetail, r.driverName, r.cardNumber,
    r.driverUnitId, r.referenceNumber, r.productCode, r.raw,
  ]);

  for (let i = 0; i < rows.length; i += CHUNK) {
    await pool.query(`INSERT INTO fuel_transactions ${INSERT_COLS} VALUES ?`, [
      rows.slice(i, i + CHUNK),
    ]);
  }

  // PPG on the GP report needs driver_id (company + owner-operator alike).
  const linked = await linkFuelDrivers();

  return {
    file: fileName,
    inserted: records.length,
    skipped: false,
    linked,
  };
}

/** Set of file names already present in fuel_batches (for skip-before-download). */
export async function getImportedFileNames(): Promise<Set<string>> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT file_name FROM fuel_batches'
  );
  return new Set(rows.map((r) => r.file_name as string));
}

/** Import every *.dat file in a directory (sorted). */
export async function importFuelDir(
  dir: string,
  opts: { force?: boolean } = {}
): Promise<ImportResult[]> {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.dat'))
    .sort();
  const results: ImportResult[] = [];
  for (const f of files) {
    results.push(await importFuelFile(path.join(dir, f), opts));
  }
  return results;
}
