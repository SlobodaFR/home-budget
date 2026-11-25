#!/bin/sh
set -e

DEPLOY_DIR="${DEPLOY_DIR:-/opt/budget}"
IMAGE="${IMAGE:-ghcr.io/slobodafr/home-budget}"

cd "$DEPLOY_DIR/deploy"

export IMAGE
export IMAGE_TAG

COMPOSE_PROJECT="${COMPOSE_PROJECT:-budget}"

# Convention harnais image-retention : AVANT le pull, fait de la place (garde 1 image du service en plus de celle en cours).
sh "$DEPLOY_DIR/deploy/scripts/prune-service-images.sh" --phase pre \
  --service budget --image ghcr.io/slobodafr/home-budget --tag "$IMAGE_TAG" --project budget

docker compose pull

# L'image tourne en utilisateur `node` (uid 1000) : le volume de donnees doit lui appartenir. Un volume cree
# du temps ou l'image tournait en root reste a root ; on le rend a l'uid 1000, conteneur arrete pour qu'aucun
# fichier root n'y soit cree entre-temps. Idempotent : sans effet si le volume appartient deja a 1000.
# Les commandes passent par l'image qu'on vient de tirer (aucune dependance a Docker Hub) et le volume est
# retrouve par ses labels compose, comme compose lui-meme.
DATA_VOLUME=$(docker volume ls -q \
  --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" \
  --filter "label=com.docker.compose.volume=budget-data" | head -n 1)
if [ -z "$DATA_VOLUME" ] && [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT")" ]; then
  echo "Conteneur $COMPOSE_PROJECT present mais volume budget-data introuvable : deploiement interrompu." >&2
  exit 1
fi
CHOWN_FAILED=
if [ -n "$DATA_VOLUME" ]; then
  as_root() {
    entrypoint="$1"
    shift
    docker run --rm --user 0 --entrypoint "$entrypoint" -v "$DATA_VOLUME":/app/backend/data "$IMAGE:$IMAGE_TAG" "$@"
  }
  # Premier fichier n'appartenant pas a l'uid 1000 ; si la verification echoue, on corrige quand meme.
  NOT_OWNED=$(as_root find /app/backend/data ! -user 1000 -print -quit) || NOT_OWNED=unknown
  if [ -n "$NOT_OWNED" ]; then
    echo "Volume $DATA_VOLUME : passage a l'uid 1000"
    docker compose stop
    as_root chown -R 1000:1000 /app/backend/data || CHOWN_FAILED=1
  fi
fi

# Convention harnais deploy-wait-healthy : `docker compose up -d --wait` (repli : boucle docker inspect) ; un conteneur
# qui n'est pas sain après 180 s fait échouer le déploiement (logs, sauvegarde et restauration affichées), sans retour arrière automatique.
sh "$DEPLOY_DIR/deploy/scripts/compose-up-healthy.sh" --service budget \
  --restore-args "--project budget --volume budget-data --mount /app/backend/data --db-path ${DATABASE_PATH:-/app/backend/data/budget.sqlite}" \
  -- --remove-orphans
# Le service est relance dans tous les cas ; un echec du chown fait quand meme echouer le deploiement.
if [ -n "$CHOWN_FAILED" ]; then
  echo "Echec du passage du volume $DATA_VOLUME a l'uid 1000 : verifier les droits." >&2
  exit 1
fi

# Convention harnais image-retention : APRÈS un déploiement sain uniquement (set -e), garde la courante + la précédente.
sh "$DEPLOY_DIR/deploy/scripts/prune-service-images.sh" --phase post \
  --service budget --image ghcr.io/slobodafr/home-budget --tag "$IMAGE_TAG" --project budget

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
