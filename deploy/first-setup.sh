#!/usr/bin/env bash
# One-time EC2 setup for Retention Module.
# Does not modify fuel-staging, fueloptimiser, or trailhead configs.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/retention-module}"

echo "==> Retention Module first-time setup"
echo "    APP_DIR=$APP_DIR"

command -v node >/dev/null || { echo "Node.js required" >&2; exit 1; }
command -v npm >/dev/null || { echo "npm required" >&2; exit 1; }
command -v pm2 >/dev/null || { echo "pm2 required (npm i -g pm2)" >&2; exit 1; }
command -v nginx >/dev/null || { echo "nginx required" >&2; exit 1; }

sudo mkdir -p "$APP_DIR"
sudo chown ubuntu:ubuntu "$APP_DIR"

cd "$APP_DIR"

if [[ ! -f .env.production ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env.production
    echo "Created .env.production from .env.example — edit secrets before deploy."
  else
    echo "Place .env.production in $APP_DIR before deploying." >&2
  fi
fi

chmod +x deploy/remote-deploy.sh deploy/first-setup.sh 2>/dev/null || true

echo "==> Installing nginx site (HTTP only until DNS + certbot)"
if [[ -f deploy/nginx-retention.conf ]]; then
  sudo cp deploy/nginx-retention.conf /etc/nginx/sites-available/retention
  sudo ln -sf /etc/nginx/sites-available/retention /etc/nginx/sites-enabled/retention
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo
echo "Next:"
echo "  1. Edit $APP_DIR/.env.production (DATABASE_URL, JWT_SECRET, APIs)."
echo "  2. Point DNS: retention.goxxii.com → this server IP"
echo "  3. sudo certbot --nginx -d retention.goxxii.com"
echo "  4. Add GitHub secrets DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY"
echo "  5. Push to main (or run workflow_dispatch)"
echo
echo "Manual deploy:"
echo "  bash $APP_DIR/deploy/remote-deploy.sh"
