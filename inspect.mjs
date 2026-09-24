import { read, utils } from 'xlsx';
import fs from 'fs';

const workbook = read(fs.readFileSync('data/Example-Gross-Profit-Sheet-2ef5c5.xlsx'));
console.log('Sheet names:', workbook.SheetNames);

for (const sheetName of workbook.SheetNames) {
  console.log(`\n===== Sheet: ${sheetName} =====`);
  const sheet = workbook.Sheets[sheetName];
  const json = utils.sheet_to_json(sheet);
  console.log('Columns:', Object.keys(json[0] || {}));
  console.log('Sample rows (first 5):');
  console.log(JSON.stringify(json.slice(0, 5), null, 2));
}
