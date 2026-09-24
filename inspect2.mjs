import { read, utils } from 'xlsx';
import fs from 'fs';

const workbook = read(fs.readFileSync('data/Example-Gross-Profit-Sheet-2ef5c5.xlsx'), { defval: '' });
const sheet = workbook.Sheets['W27 (2026)'];

// Get all cell references to understand structure
const cellRefs = Object.keys(sheet).filter(key => key !== '!ref' && key !== '!margins');
console.log('Total cells:', cellRefs.length);

// Get raw values for first 20 rows and 15 columns
console.log('\nRaw cell data (first 20 rows):');
for (let row = 1; row <= 20; row++) {
  const rowData = [];
  for (let col = 0; col < 15; col++) {
    const colLetter = String.fromCharCode(65 + col); // A, B, C, ...
    const cellRef = `${colLetter}${row}`;
    const cell = sheet[cellRef];
    rowData.push(cell ? cell.v : '');
  }
  console.log(`Row ${row}:`, rowData);
}
