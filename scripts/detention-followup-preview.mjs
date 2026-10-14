/**
 * Write Art follow-up email HTML previews and open them in the browser.
 *   pnpm detention:followup-preview
 */
import nextEnv from "@next/env";
import fs from "fs";
import path from "path";
import { exec } from "child_process";

nextEnv.loadEnvConfig(process.cwd());

const { buildFollowUpEmailPreviews } = await import(
  "../lib/detention/followUpDigests.ts"
);

const outDir = path.join(process.cwd(), "tmp", "detention-followup-preview");
fs.mkdirSync(outDir, { recursive: true });

const preview = buildFollowUpEmailPreviews();
const dispatcherPath = path.join(outDir, "01-dispatcher-felix.html");
const arPath = path.join(outDir, "02-accounts-receivable.html");
const indexPath = path.join(outDir, "index.html");

fs.writeFileSync(dispatcherPath, preview.dispatcherHtml, "utf8");
fs.writeFileSync(arPath, preview.arHtml, "utf8");
fs.writeFileSync(
  indexPath,
  `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Detention follow-up email previews</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; background: #f1f5f9; color: #0f172a; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { color: #64748b; }
    a { display: inline-block; margin: 8px 12px 8px 0; padding: 10px 14px; background: #0b3a6e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700; }
    code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Art follow-up email previews</h1>
  <p>Local mock data — not sent. Subjects shown below.</p>
  <p><strong>Dispatcher:</strong> ${preview.dispatcherSubject}</p>
  <p><strong>AR:</strong> ${preview.arSubject}</p>
  <p>
    <a href="01-dispatcher-felix.html">Open dispatcher email</a>
    <a href="02-accounts-receivable.html">Open AR email</a>
  </p>
  <p>Files in <code>tmp/detention-followup-preview/</code></p>
</body>
</html>`,
  "utf8"
);

console.log("Wrote", dispatcherPath);
console.log("Wrote", arPath);
console.log("Wrote", indexPath);

const openTarget = indexPath;
if (process.platform === "win32") {
  exec(`start "" "${openTarget}"`);
} else if (process.platform === "darwin") {
  exec(`open "${openTarget}"`);
} else {
  exec(`xdg-open "${openTarget}"`);
}
