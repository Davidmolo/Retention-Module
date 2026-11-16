import fs from 'fs';
import XLSX from 'xlsx';

const wb = XLSX.read(fs.readFileSync('tmp/W43.xlsx'), { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  raw: true,
  defval: null,
});

for (let r = 0; r < rows.length; r++) {
  const row = rows[r] || [];
  for (let c = 0; c < row.length; c++) {
    const v = row[c];
    if (typeof v === 'string' && /moreland/i.test(v)) {
      console.log('FOUND at', r, c, JSON.stringify(v), 'id', row[c + 1]);
      for (let k = 0; k <= 22; k++) {
        console.log(
          String(k).padStart(2),
          String(rows[r + k]?.[c] ?? '').padEnd(22),
          rows[r + k]?.[c + 1],
          '|',
          rows[r + k]?.[c + 2],
          '|',
          rows[r + k]?.[c + 3]
        );
      }
    }
  }
}
