import fs from 'fs';

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const fo = {
  ...readEnv('D:/azfs/fuel-optimizer/backend/.env'),
  ...readEnv('D:/azfs/fuel-optimizer/backend/.env.local'),
  ...readEnv('D:/azfs/fuel-optimizer/backend/.env.prod'),
};
const key = fo.RELAY_API_KEY_BLUE_STALLION?.trim();
if (!key) {
  console.error('missing RELAY_API_KEY_BLUE_STALLION');
  process.exit(1);
}

const target = 'D:/azfs/grossProfit/.env.local';
let text = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
const line = `RELAY_API_KEY="${key}"`;
if (/^RELAY_API_KEY=/m.test(text)) {
  text = text.replace(/^RELAY_API_KEY=.*$/m, line);
} else {
  text =
    text.replace(/\s*$/, '') +
    `\n\n# XXII fleet Relay (FMS/FO key labeled BLUE_STALLION)\n${line}\n`;
}
if (!/^RELAY_API_URL=/m.test(text)) {
  text += `RELAY_API_URL="https://app.relaypayments.com/api"\n`;
}
fs.writeFileSync(target, text);
console.log('Updated .env.local RELAY_API_KEY (len', key.length + ')');
