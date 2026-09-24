// Parser for the fixed-width fuel-card extracts (sftp-files/*.dat).
// Offsets and scaling are documented in docs/file-formats.md.

export interface FuelRecord {
  recordType: string;
  accountNumber: string | null;
  transactionDate: string | null; // 'YYYY-MM-DD'
  transactionSeq: string | null;
  transactionCode: string | null;
  merchantName: string | null;
  merchantCity: string | null;
  merchantState: string | null;
  storeNumber: string | null;
  gallons: number | null;
  pricePerGallon: number | null;
  amount: number | null;
  /** Pre-discount / retail total from .dat (amount + driver discount). */
  amountRetail: number | null;
  driverName: string | null;
  cardNumber: string | null;
  driverUnitId: string | null;
  referenceNumber: string | null;
  productCode: string | null;
  raw: string;
}

const RECORD_LENGTH = 378;

const str = (line: string, a: number, b: number): string | null => {
  const t = line.slice(a, b).trim();
  return t === '' ? null : t;
};

/** Parse a zero-padded integer field, applying an implied-decimal divisor. */
const dec = (line: string, a: number, b: number, divisor: number): number | null => {
  const t = line.slice(a, b).trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  if (n === 0) return null;
  return n / divisor;
};

const txt = (line: string, a: number, b: number): string => {
  return line.slice(a, b).trim();
};

const FIELD_MAP = {
  // New transaction metrics
  rawGallons:  { start: 94,  end: 103 }, // e.g., "S0010069"
  rawPriceG:   { start: 103, end: 109 }, // e.g., "050600"
  rawAmount:   { start: 109, end: 116 }  // e.g., "0509460"
};
const parseTransactionLine = (line: string) => {
  return {
    txnPrefix:      txt(line, 20, 25),
    unitId:         txt(line, 25, 37), // Handles variable lengths safely
    storeName:      txt(line, 37, 52),
    city:           txt(line, 52, 64), // Safely extracts "South Hutchi"
    state:          txt(line, 64, 66), // Safely extracts "KS"
    gallons:        dec(line, 96, 103, 100),
    pricePerGallon: dec(line, 103, 110, 100000)
  };
};



/** Parse a single 378-char '01' detail line, or null if it isn't one. */
export function parseFuelRecord(line: string): FuelRecord | null {
  if (line.length !== RECORD_LENGTH) return null;
  if (line.slice(0, 2) !== '01') return null;
  // Date: YYMMDD -> 20YY-MM-DD
  let transactionDate: string | null = null;
  const d = line.slice(11, 17);
  // console.log(d, 'date');

  if (/^\d{6}$/.test(d)) {
    transactionDate = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
  }

  // console.log(line);
  const dat = parseTransactionLine(line);
  // console.log(dat);
  const gallons = dec(line, 96, 103, 100);
  const pricePerGallon = dec(line, 103, 110, 100000);
  let amount = dec(line, 110, 117, 10000);

  // Unit: classic "txn65   214", or compact "txnDv271076" / "txngD271076".
  // Stop at whitespace so adjacent fields are never absorbed into the unit.
  const unit =
    line.match(/txn\d+\s+(\d{1,8})(?=\s)/i)?.[1] ??
    line.match(/txn[A-Za-z]+(\d{3,8})(?=\s)/i)?.[1] ??
    (/^\d{1,8}$/.test(dat.unitId) ? dat.unitId : null);
  if (!unit) return null;

  const match = line.match(/([A-Za-z][A-Za-z\s.'-]*?)\s+U(\d{16})/);
  if (!match) return null;
  const name = match[1].trim();
  const card = match[2];

  // Amount field maxes near $999.9999; recompute from gallons×ppg on overflow.
  if (gallons != null && pricePerGallon != null) {
    const product = gallons * pricePerGallon;
    if (product >= 1000) amount = Math.round(product * 100) / 100;
  }

  // Retail / without-discount total: fixed field [83:90], 2 implied decimals.
  // Falls back to paid amount when the field is zero/unreadable.
  let amountRetail = dec(line, 83, 90, 100);
  if (amountRetail == null && amount != null) amountRetail = amount;
  if (
    amountRetail != null &&
    amount != null &&
    amountRetail < amount
  ) {
    amountRetail = amount;
  }

  return {
    recordType: line.slice(0, 2),
    accountNumber: str(line, 2, 11),
    transactionDate,
    transactionSeq: str(line, 17, 20),
    transactionCode: str(line, 23, 25),
    merchantName: dat.storeName,
    merchantCity: dat.city,
    merchantState: dat.state,
    storeNumber: str(line, 66, 74),
    gallons,
    pricePerGallon,
    amount,
    amountRetail,
    driverName: name,
    cardNumber: card,
    driverUnitId: unit,
    referenceNumber: str(line, 280, 285),
    productCode: str(line, 287, 290),
    raw: line,
  };
}

/** Parse a whole .dat file's contents into detail records (ignores the trailer). */
export function parseFuelFile(content: string): FuelRecord[] {
  const records: FuelRecord[] = [];
  for (let line of content.split(/\r?\n/)) {
    // Some files append the '01End' trailer to the last record with no newline.
    if (line.endsWith('01End')) line = line.slice(0, -5);
    const rec = parseFuelRecord(line);
    if (rec) records.push(rec);
  }
  return records;
}

/** Extract the date and sequence token from an `EXT<seq>_YYYY-MM-DD.dat` name. */
export function parseFuelFileName(fileName: string): {
  date: string;
  sequence: string | null;
} {
  const m = fileName.match(/^(.*)_(\d{4}-\d{2}-\d{2})\.dat$/i);
  if (!m) {
    throw new Error(`Unrecognized fuel file name: ${fileName}`);
  }
  return { sequence: m[1] || null, date: m[2] };
}
