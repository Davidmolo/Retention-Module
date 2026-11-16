import fs from "fs";
import XLSX from "xlsx";

const files = [
  "D:/azfs/grossProfit/tmp/W42.xlsx",
  "D:/azfs/grossProfit/tmp/W43.xlsx",
];

for (const file of files) {
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  console.log("\n====", file, "sheets:", wb.SheetNames.join(" | "));
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"];
    console.log("--", name, "ref", ref);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    console.log("rowCount", rows.length);
    const preview = rows.slice(0, 25).map((r, i) => {
      const cells = (r || []).slice(0, 18).map((c) => {
        if (c instanceof Date) return c.toISOString().slice(0, 10);
        const s = String(c ?? "").replace(/\s+/g, " ").trim();
        return s.length > 40 ? s.slice(0, 40) + "…" : s;
      });
      return String(i).padStart(3, " ") + " | " + cells.join(" || ");
    });
    console.log(preview.join("\n"));
  }
}
