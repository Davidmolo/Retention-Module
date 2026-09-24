import path from 'path';
import ExcelJS from 'exceljs';

// Exact-replica generator for "Example Gross Profit Sheet.xlsx".
//
// Strategy: the sample workbook is used as a TEMPLATE. All layout, styling and
// business logic already live in it as Excel formulas (RATE = income/mileage,
// R&M = mileage*0.19, FACTORING FEE = mileage*0.15, TOTAL EXPENSES = SUM(...),
// GROSS PROFIT = income - expenses, etc). We only overwrite the small set of
// INPUT cells and let Excel recompute the formula cells on open
// (`fullCalcOnLoad`). This guarantees the output matches the template exactly.
//
// See docs/file-formats.md for the grid layout and lib analysis for the cell map.

const TEMPLATE_PATH = path.join(
  process.cwd(),
  'data',
  'templates',
  'gross-profit-template.xlsx'
);

/** Drivers in the first grid block (rows 2–23). */
export interface Block1Driver {
  name: string;
  trips?: number | null;
  mileage?: number | null;
  grossIncome?: number | null;
  driversPay?: number | null;
  fuelMpg?: number | null; // Fuel col B (miles per gallon)
  fuelPpg?: number | null; // Fuel col C (price per gallon)
  prepass?: number | null;
  monitoringLogs?: number | null;
}

/** Drivers in the second grid block (rows 28–44), which uses the XXII-fee model. */
export interface Block2Driver {
  name: string;
  trips?: number | null;
  mileage?: number | null;
  grossIncome?: number | null;
  xxiiFeeRate?: number | null; // XXII Fee col B (rate; D = income * rate)
  fuelGross?: number | null; // Fuel col B
  fuelDeduction?: number | null; // Fuel col C (D = gross - deduction)
}

export interface WeeklyGrossProfit {
  year: number;
  week: number; // ISO week number
  block1: Block1Driver[]; // up to 5
  block2?: Block2Driver[]; // up to 5
}

const SLOTS = 5;

/** A worksheet cell as [row, col], both 1-based. */
type Cell = [number, number];

// Column offsets within a 5-column driver slot (1-based, as ExcelJS uses):
// label = 5k+1, input1 = 5k+2, input2 = 5k+3, result(formula) = 5k+4.
const label = (k: number) => 5 * k + 1;
const in1 = (k: number) => 5 * k + 2;
const in2 = (k: number) => 5 * k + 3;

export async function generateGrossProfitSheet(
  input: WeeklyGrossProfit
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const ws = wb.worksheets[0];
  ws.name = `W${input.week} (${input.year})`;

  const set = (row: number, col: number, value: unknown) => {
    if (value === undefined || value === null) return;
    ws.getRow(row).getCell(col).value = value as ExcelJS.CellValue;
  };
  const clear = (row: number, col: number) => {
    ws.getRow(row).getCell(col).value = null;
  };

  // Input cells for one slot k, as [row, col]. Every one is cleared before any
  // value is written, so a driver that omits a field (or an unused slot) leaves
  // a blank cell rather than the template's leftover sample data.
  const block1Cells = (k: number): Record<string, Cell> => ({
    name: [2, label(k)], trips: [2, in1(k)], mileage: [4, in1(k)],
    grossIncome: [5, in1(k)], driversPay: [8, in1(k)], fuelMpg: [9, in1(k)],
    fuelPpg: [9, in2(k)], prepass: [10, in1(k)], monitoringLogs: [11, in1(k)],
  });
  const block2Cells = (k: number): Record<string, Cell> => ({
    name: [28, label(k)], trips: [28, in1(k)], mileage: [30, in1(k)],
    grossIncome: [31, in1(k)], xxiiFeeRate: [32, in1(k)],
    fuelGross: [33, in1(k)], fuelDeduction: [33, in2(k)],
  });

  // ---- Block 1 (rows 2–23) --------------------------------------------------
  for (let k = 0; k < SLOTS; k++) {
    const cells = block1Cells(k);
    Object.values(cells).forEach(([r, c]) => clear(r, c));
    const d = input.block1[k];
    if (!d) continue;
    set(...cells.name, d.name);
    set(...cells.trips, d.trips);
    set(...cells.mileage, d.mileage);
    set(...cells.grossIncome, d.grossIncome);
    set(...cells.driversPay, d.driversPay);
    set(...cells.fuelMpg, d.fuelMpg);
    set(...cells.fuelPpg, d.fuelPpg);
    set(...cells.prepass, d.prepass);
    set(...cells.monitoringLogs, d.monitoringLogs);
  }

  // ---- Block 2 (rows 28–44) -------------------------------------------------
  const block2 = input.block2 ?? [];
  for (let k = 0; k < SLOTS; k++) {
    const cells = block2Cells(k);
    Object.values(cells).forEach(([r, c]) => clear(r, c));
    const d = block2[k];
    if (!d) continue;
    set(...cells.name, d.name);
    set(...cells.trips, d.trips);
    set(...cells.mileage, d.mileage);
    set(...cells.grossIncome, d.grossIncome);
    set(...cells.xxiiFeeRate, d.xxiiFeeRate);
    set(...cells.fuelGross, d.fuelGross);
    set(...cells.fuelDeduction, d.fuelDeduction);
  }

  // Force Excel/Sheets to recalculate every formula when the file is opened,
  // so the cached results reflect the new inputs.
  wb.calcProperties.fullCalcOnLoad = true;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
