const path = require("path");

const root = __dirname;
const webPort = process.env.RETENTION_WEB_PORT || "3000";

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
      },
    },
  ],
};
