const fs = require("fs");
const path = require("path");

const root = __dirname;
const webPort = process.env.RETENTION_WEB_PORT || "3000";

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\n/)) {
    const line = raw.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// Load production secrets into the PM2 process env so SMS providers
// (GHL / Twilio) work even if Next env loading is incomplete.
const fileEnv = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.production")),
};

// Keep names distinct from existing PM2 apps on this host:
// fuel-backend-*, fuel-optimizer-*, trailhead-*
module.exports = {
  apps: [
    {
      name: "retention-module-web",
      cwd: root,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${webPort}`,
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: webPort,
        ...fileEnv,
      },
    },
  ],
};
