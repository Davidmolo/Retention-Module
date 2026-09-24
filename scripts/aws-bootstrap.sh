#!/usr/bin/env bash
# One-time AWS EC2 bootstrap for Retention Module.
# Run on a fresh Amazon Linux 2023 / Ubuntu EC2 instance as a sudo-capable user.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/retention-module}"
REPO_COMPOSE_URL="${REPO_COMPOSE_URL:-}"

echo "==> Installing Docker"
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y docker
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -SL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  sudo systemctl enable --now docker
else
  echo "Unsupported OS. Install Docker Engine + Compose plugin manually." >&2
  exit 1
fi

sudo usermod -aG docker "$USER" || true

echo "==> Creating $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"
cd "$APP_DIR"

if [ ! -f docker-compose.yml ]; then
  if [ -n "$REPO_COMPOSE_URL" ]; then
    curl -fsSL "$REPO_COMPOSE_URL" -o docker-compose.yml
  else
    cat > docker-compose.yml <<'YAML'
services:
  migrate:
    image: ghcr.io/davidmolo/retention-module:migrator-latest
    env_file:
      - .env
    command: ["bun", "run", "db:migrate"]
    restart: "no"

  app:
    image: ghcr.io/davidmolo/retention-module:latest
    env_file:
      - .env
    restart: unless-stopped
    ports:
      - "3000:3000"
    depends_on:
      migrate:
        condition: service_completed_successfully

  cron:
    image: ghcr.io/davidmolo/retention-module:migrator-latest
    env_file:
      - .env
    restart: unless-stopped
    depends_on:
      migrate:
        condition: service_completed_successfully
    command: ["/usr/local/bin/supercronic", "/app/crontab"]
    environment:
      TZ: America/New_York
    volumes:
      - cron-logs:/app/logs

volumes:
  cron-logs:
YAML
  fi
fi

if [ ! -f .env ]; then
  echo "==> Creating empty .env — fill with production secrets before first deploy"
  cat > .env <<'ENV'
APP_NAME=Retention Module
DATABASE_URL=mysql://USER:PASSWORD@YOUR_RDS_HOST:3306/YOUR_DB
JWT_SECRET=change-me
GP_ADAPTER=live
NEXT_PUBLIC_GP_ADAPTER=live
NEXT_PUBLIC_SURVEY_BASE_URL=https://YOUR_DOMAIN/s
ENV
  echo "Edit $APP_DIR/.env then re-run: docker compose pull && docker compose up -d"
fi

echo "==> Done. Next:"
echo "  1. Edit $APP_DIR/.env with RDS + API secrets"
echo "  2. Open security group: inbound TCP 22 (your IP), TCP 80/443 (or 3000)"
echo "  3. Add GitHub Environment 'production' vars/secrets (SERVER_IP, SERVER_USER, SERVER_SSH_KEY)"
echo "  4. Push to main — Actions will pull images and restart containers"
