#!/bin/sh
set -e

DEPLOY_DIR="${DEPLOY_DIR:-/opt/budget}"
IMAGE="${IMAGE:-ghcr.io/slobodafr/home-budget}"

cd "$DEPLOY_DIR/deploy"

export IMAGE
export IMAGE_TAG

docker compose pull
docker compose up -d --remove-orphans
docker image prune -f

if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -qq
  sudo apt-get install -y -qq caddy
fi

sudo mkdir -p /etc/caddy/sites
sudo cp "$DEPLOY_DIR/deploy/Caddyfile" /etc/caddy/sites/budget.Caddyfile

# Remove any legacy top-level budget.sloboda.fr block from the main Caddyfile
# (older deploy scripts used to overwrite /etc/caddy/Caddyfile directly,
# which would now duplicate the block moved into sites/budget.Caddyfile).
if [ -f /etc/caddy/Caddyfile ] && grep -q '^budget\.sloboda\.fr[[:space:]]*{' /etc/caddy/Caddyfile; then
  sudo awk '
    /^budget\.sloboda\.fr[[:space:]]*\{/ { skip=1; next }
    skip && /^}/ { skip=0; next }
    skip { next }
    { print }
  ' /etc/caddy/Caddyfile | sudo tee /etc/caddy/Caddyfile.tmp >/dev/null
  sudo mv /etc/caddy/Caddyfile.tmp /etc/caddy/Caddyfile
fi

if ! grep -q '^import sites/\*$' /etc/caddy/Caddyfile 2>/dev/null; then
  echo 'import sites/*' | sudo tee -a /etc/caddy/Caddyfile >/dev/null
fi

sudo caddy validate --config /etc/caddy/Caddyfile

sudo systemctl reload caddy
