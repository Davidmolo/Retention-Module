import { read, utils } from 'xlsx';
import fs from 'fs';

const workbook = read(fs.readFileSync('data/Example-Gross-Profit-Sheet-2ef5c5.xlsx'), { cellDates: true });
console.log('Sheet names:', workbook.SheetNames);

// Parse the main sheet (W27 (2026))
const sheet = workbook.Sheets['W27 (2026)'];
const json = utils.sheet_to_json(sheet, { defval: '' });

console.log('\n=== Data Summary ===');
console.log('Total rows:', json.length);
if (json.length > 0) {
  console.log('\nFirst row keys:', Object.keys(json[0]));
  console.log('\nFirst 3 rows:');
  json.slice(0, 3).forEach((row, i) => {
    console.log(`\nRow ${i}:`, row);
  });
}
