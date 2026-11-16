import fs from 'fs';
import path from 'path';

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

const fmsRoot = 'D:/azfs/david-fuel-distribution-v2/admin-dashboard-backend';
const env = {
  ...readEnv(path.join(fmsRoot, '.env')),
  ...readEnv(path.join(fmsRoot, '.env.local')),
  ...readEnv(path.join(fmsRoot, '.env.production')),
};

const mongoKeys = Object.keys(env).filter((k) =>
  /mongo|database|uri/i.test(k)
);
console.log(
  'FMS mongo-related env:',
  mongoKeys.map((k) => [k, env[k] ? `set len=${env[k].length}` : 'empty'])
);

const uri =
  env.MONGODB_URI ||
  env.MONGO_URI ||
  env.DATABASE_URL ||
  env.MONGO_URL ||
  '';
if (!uri) {
  console.log('No Mongo URI in FMS env — cannot read company relayPaymentId');
  process.exit(0);
}

// Dynamic import mongodb if available from FMS node_modules
const mongoPath = path.join(fmsRoot, 'node_modules/mongodb');
let MongoClient;
try {
  ({ MongoClient } = await import(pathToFileUrl(mongoPath + '/lib/admin.js').href));
} catch {
  try {
    ({ MongoClient } = await import(
      path.join(fmsRoot, 'node_modules/mongodb/lib/mongo_client.js')
    ));
  } catch (e) {
    // try mongoose model approach via require from FMS
    console.log('Trying mongoose from FMS…');
  }
}

function pathToFileUrl(p) {
  const { pathToFileURL } = await import('url');
  return pathToFileURL(p);
}
