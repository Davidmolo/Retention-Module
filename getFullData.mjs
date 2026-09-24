import { read, utils } from 'xlsx';
import fs from 'fs';

const workbook = read(fs.readFileSync('data/Example-Gross-Profit-Sheet-2ef5c5.xlsx'), { cellDates: true });
const sheet = workbook.Sheets['W27 (2026)'];

// Get the raw data by rows and columns
const range = utils.decode_range(sheet['!ref']);
console.log('Sheet dimensions:', range);

// Try to get data as array of arrays
const aoa = utils.sheet_to_json(sheet, { header: 1, defval: '' });
console.log('\nTotal rows:', aoa.length);
console.log('\nFirst 15 rows (as arrays):');
aoa.slice(0, 15).forEach((row, i) => {
  console.log(`Row ${i}:`, row);
});
