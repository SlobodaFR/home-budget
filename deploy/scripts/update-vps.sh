#!/bin/sh
set -e

DEPLOY_DIR="${DEPLOY_DIR:-/opt/budget}"
IMAGE="${IMAGE:-ghcr.io/slobodafr/home-budget}"

cd "$DEPLOY_DIR/deploy"

export IMAGE
export IMAGE_TAG

# Nombre de versions de l'image à garder après un déploiement :
# la version courante + les 2 précédentes (rollback possible).
KEEP_VERSIONS="${KEEP_VERSIONS:-3}"

# Supprime les anciennes versions de $IMAGE au-delà des $1 plus récentes.
# Ne touche jamais : à une image utilisée par un conteneur (même arrêté),
# au tag qui va être déployé, ni aux images des autres applications du VPS.
# Les volumes nommés (dont budget-data, la base SQLite) ne sont JAMAIS supprimés.
cleanup_old_images() {
  keep="$1"
  in_use=$(docker ps -a --format '{{.Image}}')
  # `docker image ls` liste les images de la plus récente à la plus ancienne.
  docker image ls "$IMAGE" --format '{{.Tag}}' \
    | grep -v '^<none>$' \
    | tail -n +"$((keep + 1))" \
    | while read -r tag; do
        [ "$tag" = "$IMAGE_TAG" ] && continue
        if printf '%s\n' "$in_use" | grep -qxF "$IMAGE:$tag"; then
          continue
        fi
        echo "Suppression de l'ancienne image $IMAGE:$tag"
        docker image rm "$IMAGE:$tag" || true
      done
}

cleanup_docker() {
  keep="$1"
  docker container prune -f
  cleanup_old_images "$keep"
  docker image prune -f
  docker builder prune -f || true
  # Volumes anonymes orphelins uniquement (nom = 64 caractères hexadécimaux).
  # Les volumes nommés comme budget-data sont volontairement ignorés.
  docker volume ls -q -f dangling=true \
    | grep -E '^[0-9a-f]{64}$' \
    | xargs -r docker volume rm || true
}

echo "Espace disque avant nettoyage :"
df -h / | tail -n 1

# Avant le pull : on libère de la place pour que le téléchargement passe
# (la nouvelle image s'ajoutera aux $((KEEP_VERSIONS - 1)) conservées).
cleanup_docker "$((KEEP_VERSIONS - 1))"

docker compose pull
docker compose up -d --remove-orphans

# Après le déploiement : on ne garde que la courante + les précédentes.
cleanup_docker "$KEEP_VERSIONS"

echo "Espace disque après déploiement :"
df -h / | tail -n 1

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
