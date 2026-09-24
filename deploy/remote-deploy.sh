#!/usr/bin/env bash
# Build + reload Retention Module on the EC2 host (PM2).
# Safe alongside fuel-optimizer / fuel-staging / trailhead.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "==> Deploying Retention Module from $APP_DIR"

if [[ ! -f .env.production && ! -f .env ]]; then
  echo "Missing .env.production (or .env) on the server. Copy from .env.example and fill production values." >&2
  exit 1
fi

# Next.js + migrate scripts load .env.production / .env themselves — do not bash-source secrets.
if [[ -f .env.production && ! -f .env ]]; then
  ln -sfn .env.production .env
fi

export NODE_ENV=production

echo "==> Enabling pnpm via corepack"
if ! command -v pnpm >/dev/null 2>&1; then
  if sudo -n true 2>/dev/null; then
    sudo corepack enable
  else
    corepack enable 2>/dev/null || true
  fi
  corepack prepare pnpm@10.24.0 --activate
fi
pnpm -v

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Running migrations"
if [[ "${SKIP_MIGRATE:-}" == "1" ]]; then
  echo "SKIP_MIGRATE=1 — skipping db:migrate"
elif ! grep -qE '^DATABASE_URL=.+' .env.production 2>/dev/null && ! grep -qE '^DATABASE_URL=.+' .env 2>/dev/null; then
  echo "WARNING: DATABASE_URL not set in .env.production — skipping migrate (app will start anyway)"
else
  pnpm run db:migrate
fi

echo "==> Building Next.js app"
pnpm run build

echo "==> Reloading PM2 (retention-module-web only)"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

if sudo -n true 2>/dev/null; then
  echo "==> Refreshing nginx site retention (leaves other sites untouched)"
  sudo cp "$APP_DIR/deploy/nginx-retention.conf" /etc/nginx/sites-available/retention
  sudo ln -sf /etc/nginx/sites-available/retention /etc/nginx/sites-enabled/retention
  sudo nginx -t
  sudo systemctl reload nginx
else
  echo "Skipping nginx refresh (no passwordless sudo). Run deploy/first-setup.sh once if needed."
fi

wait_http() {
  local url="$1"
  local name="$2"
  local attempts="${3:-45}"
  local i=1

  while (( i <= attempts )); do
    if curl -fsS --max-time 5 "$url" >/tmp/retention-health.out; then
      echo "$name is up"
      head -c 200 /tmp/retention-health.out || true
      echo
      return 0
    fi
    echo "Waiting for $name ($i/$attempts)..."
    sleep 2
    i=$((i + 1))
  done

  echo "$name did not become ready at $url" >&2
  pm2 list >&2 || true
  pm2 logs retention-module-web --lines 80 --nostream >&2 || true
  return 1
}

echo "==> Health check"
wait_http "http://127.0.0.1:3000/login" "retention-module-web" 45

echo "==> Deploy complete"
pm2 list | grep -E 'retention-module|name' || pm2 list
