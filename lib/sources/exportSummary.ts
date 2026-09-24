import ExcelJS from 'exceljs';
import {
  isOwnerOperator,
  ooFuelMode,
  ooFuelUsesTwoFields,
  ownerOperatorVisibleTotals,
  ownerOperatorXxiiFee,
} from './driverTypeGroups';
import type { WeeklySummary, SummaryDriver } from './weeklySummary';

// Builds an .xlsx that matches the on-screen /gross-profit DriverCard layout:
// 5 cards per row, each card 3 columns (label | green input | result).

const CARDS_PER_ROW = 5;
const COLS_PER_CARD = 3;
const GAP_COLS = 1;
const STRIDE = COLS_PER_CARD + GAP_COLS;

const GREEN_FILL = 'FFC6EFCE';
const GREEN_BORDER = 'FFA9D08E';
const HEADER_FILL = 'FFF5F5F5';
const EXPENSES_FILL = 'FFE5E5E5';
const TOTAL_FILL = 'FFFAFAFA';
const CARD_BORDER = 'FFA3A3A3';
const GREEN_GP = 'FF15803D';
const RED_GP = 'FFDC2626';

const thin = (color: string): ExcelJS.Border => ({
  style: 'thin',
  color: { argb: color },
});
const cardBorder = thin(CARD_BORDER);
const greenBorder = thin(GREEN_BORDER);

function cardStartCol(indexInBlock: number): number {
  return 1 + indexInBlock * STRIDE;
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function moneyParen(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${abs})` : `$${abs}`;
}

function num1(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function rateText(d: SummaryDriver): string {
  return d.mileage > 0 ? d.rate.toFixed(2) : '—';
}

function mpgPpgText(d: SummaryDriver): string {
  const mpg = d.fuelMpg == null ? '—' : d.fuelMpg.toFixed(2);
  const ppg = d.fuelPpg == null ? '—' : d.fuelPpg.toFixed(2);
  return `${mpg} / ${ppg}`;
}

function styleCardCell(
  cell: ExcelJS.Cell,
  opts?: { bold?: boolean; fill?: string; align?: ExcelJS.Alignment['horizontal'] }
) {
  cell.border = {
    top: cardBorder,
    left: cardBorder,
    bottom: cardBorder,
    right: cardBorder,
  };
  cell.font = { name: 'Calibri', size: 9, bold: opts?.bold, color: { argb: 'FF000000' } };
  cell.alignment = {
    vertical: 'middle',
    horizontal: opts?.align ?? 'left',
    wrapText: true,
  };
  if (opts?.fill) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: opts.fill },
    };
  }
}

function styleGreen(cell: ExcelJS.Cell, align: ExcelJS.Alignment['horizontal'] = 'right') {
  cell.border = {
    top: greenBorder,
    left: greenBorder,
    bottom: greenBorder,
    right: greenBorder,
  };
  cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF000000' } };
  cell.alignment = { vertical: 'middle', horizontal: align };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: GREEN_FILL },
  };
}

function writeHeader(ws: ExcelJS.Worksheet, row: number, col: number, d: SummaryDriver) {
  const nameCell = ws.getCell(row, col);
  nameCell.value = d.name;
  styleCardCell(nameCell, { bold: true, fill: HEADER_FILL });

  const unitCell = ws.getCell(row, col + 1);
  unitCell.value = d.unit ?? '—';
  styleCardCell(unitCell, { bold: true, fill: HEADER_FILL, align: 'right' });
  styleCardCell(ws.getCell(row, col + 2), { bold: true, fill: HEADER_FILL });
  ws.mergeCells(row, col + 1, row, col + 2);
}

function writeTriple(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  label: string,
  green: string,
  result: string,
  opts?: { labelBold?: boolean; resultBold?: boolean; resultColor?: string }
) {
  const labelCell = ws.getCell(row, col);
  labelCell.value = label;
  styleCardCell(labelCell, { bold: opts?.labelBold });

  const greenCell = ws.getCell(row, col + 1);
  greenCell.value = green;
  styleGreen(greenCell);

  const resultCell = ws.getCell(row, col + 2);
  resultCell.value = result;
  styleCardCell(resultCell, { bold: opts?.resultBold, align: 'right' });
  if (opts?.resultColor) {
    resultCell.font = {
      name: 'Calibri',
      size: 9,
      bold: opts.resultBold,
      color: { argb: opts.resultColor },
    };
  }
}

function writeExpenseLine(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  label: string,
  value: string,
  opts?: { bold?: boolean; fill?: string; resultColor?: string }
) {
  const labelCell = ws.getCell(row, col);
  labelCell.value = label;
  styleCardCell(labelCell, { bold: opts?.bold, fill: opts?.fill });

  const mid = ws.getCell(row, col + 1);
  mid.value = '';
  styleCardCell(mid, { fill: opts?.fill });

  const resultCell = ws.getCell(row, col + 2);
  resultCell.value = value;
  styleCardCell(resultCell, { bold: opts?.bold, fill: opts?.fill, align: 'right' });
  if (opts?.resultColor) {
    resultCell.font = {
      name: 'Calibri',
      size: 9,
      bold: opts?.bold,
      color: { argb: opts.resultColor },
    };
  }
}

function writeCard(
  ws: ExcelJS.Worksheet,
  startRow: number,
  col: number,
  d: SummaryDriver
): number {
  let r = startRow;
  const rate = rateText(d);
  const miles = num1(d.mileage);
  const income = money(d.grossIncome);

  writeHeader(ws, r, col, d);
  r += 1;

  writeTriple(ws, r, col, 'RATE $', rate, rate);
  r += 1;
  writeTriple(ws, r, col, 'MILEAGE', miles, miles);
  r += 1;
  writeTriple(ws, r, col, 'TOTAL GROSS IN', income, income, {
    resultBold: true,
  });
  r += 1;

  const oo = isOwnerOperator(d);
  const fuelMode = oo ? ooFuelMode(d.name) : null;

  if (oo) {
    const xxii = ownerOperatorXxiiFee(
      d.linehaulPct,
      d.grossIncome,
      d.xxiiFeePct
    );
    const feeLabel = xxii
      ? `${xxii.feePct.toFixed(2)}%`
      : d.compensationName?.trim() || '—';
    writeTriple(
      ws,
      r,
      col,
      'XXI Fee',
      feeLabel,
      xxii ? money(xxii.feeAmount) : '—'
    );
    const green = ws.getCell(r, col + 1);
    styleGreen(green, 'left');
    r += 1;

    if (fuelMode && ooFuelUsesTwoFields(fuelMode)) {
      // Two green values in the middle aren't native to writeTriple —
      // put left in green col, right shown via result isn't ideal.
      // Match UI: mid shows both as "left / right", result = fuel $.
      writeTriple(
        ws,
        r,
        col,
        'Fuel',
        `${money(d.fuelGross ?? 0)} / ${money(d.fuelDiscounted ?? 0)}`,
        money(d.fuel)
      );
    } else {
      writeTriple(ws, r, col, 'Fuel', money(d.fuel), money(d.fuel));
    }
    r += 1;
  }

  const expLabel = ws.getCell(r, col);
  expLabel.value = 'EXPENSES';
  styleCardCell(expLabel, { bold: true, fill: EXPENSES_FILL });
  styleCardCell(ws.getCell(r, col + 1), { fill: EXPENSES_FILL });
  styleCardCell(ws.getCell(r, col + 2), { fill: EXPENSES_FILL });
  ws.mergeCells(r, col, r, col + 2);
  r += 1;

  if (!oo) {
    writeTriple(ws, r, col, "Driver's pay", money(d.driversPay), money(d.driversPay));
    r += 1;
    writeTriple(ws, r, col, 'Fuel', mpgPpgText(d), money(d.fuel));
    r += 1;
    writeTriple(ws, r, col, 'PREPASS', money(d.prepass), moneyParen(d.prepass));
    r += 1;
  }

  const rest: [string, number | null][] = oo
    ? [
        ['R & M', d.rm],
        ['Equipment Lease', d.equipmentLease],
        ['Liability and cargo insurance', d.liabilityInsurance + d.cargoInsurance],
        ['Factoring fee', d.factoringFee],
        ['Samsara', d.samsara],
        ['PD insurance', d.pdInsurance > 0 ? d.pdInsurance : null],
      ]
    : [
        ['Monitoring Logs', d.monitoringLogs],
        ['R & M', d.rm],
        ['Equipment Lease', d.equipmentLease],
        ['Equipment Lease', d.equipmentLease2],
        ['Liability insurance', d.liabilityInsurance],
        ['SCALE', d.scale],
        ['Factoring fee', d.factoringFee],
        ['Samsara', d.samsara],
        ['Cargo insurance', d.cargoInsurance],
        ['PD insurance', d.pdInsurance],
      ];
  for (const [label, val] of rest) {
    writeExpenseLine(
      ws,
      r,
      col,
      label,
      val == null ? '' : moneyParen(val)
    );
    r += 1;
  }

  const { totalExpenses, grossProfit } = oo
    ? ownerOperatorVisibleTotals(d)
    : { totalExpenses: d.totalExpenses, grossProfit: d.grossProfit };

  writeExpenseLine(ws, r, col, 'TOTAL EXPENSES', money(totalExpenses), {
    bold: true,
    fill: TOTAL_FILL,
  });
  r += 1;
  writeExpenseLine(ws, r, col, 'GROSS PROFIT', money(grossProfit), {
    bold: true,
    resultColor: grossProfit >= 0 ? GREEN_GP : RED_GP,
  });
  r += 1;

  return r;
}

export async function buildSummaryWorkbook(summary: WeeklySummary): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`W${summary.week} (${summary.year})`);

  const totalCols = CARDS_PER_ROW * STRIDE - GAP_COLS;
  for (let c = 1; c <= totalCols; c++) {
    const pos = (c - 1) % STRIDE;
    if (pos === COLS_PER_CARD) {
      ws.getColumn(c).width = 2;
    } else if (pos === 0) {
      ws.getColumn(c).width = 18;
    } else {
      ws.getColumn(c).width = 14;
    }
  }

  let r = 1;
  ws.getCell(r, 1).value = `Gross Profit Sheet — W${summary.week} (${summary.year})`;
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: 'FF000000' } };
  r += 1;
  ws.getCell(r, 1).value =
    `${summary.start} → ${summary.end} · ${summary.drivers.length} drivers`;
  ws.getCell(r, 1).font = { italic: true, size: 10, color: { argb: 'FF888888' } };
  r += 2;

  for (let i = 0; i < summary.drivers.length; i += CARDS_PER_ROW) {
    const block = summary.drivers.slice(i, i + CARDS_PER_ROW);
    let maxRow = r;
    block.forEach((d, idx) => {
      const endRow = writeCard(ws, r, cardStartCol(idx), d);
      if (endRow > maxRow) maxRow = endRow;
    });
    r = maxRow + 1;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
