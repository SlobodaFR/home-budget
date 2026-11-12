#!/bin/sh
set -e

DEPLOY_DIR="${DEPLOY_DIR:-/opt/budget}"
IMAGE="${IMAGE:-ghcr.io/slobodafr/home-budget}"

cd "$DEPLOY_DIR/deploy"

export IMAGE
export IMAGE_TAG

# Nombre de versions de l'image à garder après un déploiement : la version courante + la précédente.
# Garder plus n'apporte presque rien : l'image de chaque version reste disponible sur GHCR, et revenir plus
# d'une version en arrière est de toute façon risqué (les migrations de base ne se défont pas toutes seules).
KEEP_VERSIONS="${KEEP_VERSIONS:-2}"

# Projet docker compose de cette application (cf. `name:` dans docker-compose.yml). Sert à ne nettoyer QUE ce
# projet : ce VPS héberge d'autres services dont on ne doit toucher ni les conteneurs, ni les images, ni les volumes.
COMPOSE_PROJECT="${COMPOSE_PROJECT:-budget}"

# Supprime les anciennes versions de $IMAGE au-delà des $1 plus récentes.
# Ne touche jamais : à une image utilisée par un conteneur (même arrêté), au tag qui va être déployé, ni aux
# images des autres applications du VPS.
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

# Nettoyage volontairement prudent, limité à cette application :
# - conteneurs arrêtés : seulement ceux du projet compose ci-dessus (jamais ceux des autres services) ;
# - images : anciennes versions de $IMAGE uniquement, plus les images orphelines (sans nom ni conteneur) de plus
#   de 24 h, qui ne servent à personne ;
# - cache de build : seulement s'il a plus de 7 jours ;
# - VOLUMES : jamais supprimés (ni nommés, ni anonymes) : la base SQLite (budget-data) et les données des autres
#   services ne doivent dépendre d'aucun nettoyage automatique.
cleanup_docker() {
  keep="$1"
  docker container prune -f --filter "label=com.docker.compose.project=$COMPOSE_PROJECT"
  cleanup_old_images "$keep"
  docker image prune -f --filter "until=24h"
  docker builder prune -f --filter "until=168h" || true
}

echo "Espace disque avant nettoyage :"
df -h / | tail -n 1

# Avant le pull : on libère de la place pour que le téléchargement passe
# (la nouvelle image s'ajoutera aux $((KEEP_VERSIONS - 1)) conservées).
cleanup_docker "$((KEEP_VERSIONS - 1))"

docker compose pull

# L'image tourne en utilisateur `node` (uid 1000) : le volume de donnees doit lui appartenir. Un volume cree
# du temps ou l'image tournait en root reste a root ; on le rend a l'uid 1000, conteneur arrete pour qu'aucun
# fichier root n'y soit cree entre-temps. Idempotent : sans effet si le volume appartient deja a 1000.
DATA_VOLUME="${COMPOSE_PROJECT}_budget-data"
if docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1; then
  # Premier fichier n'appartenant pas a l'uid 1000 ; si la verification echoue, on corrige quand meme.
  NOT_OWNED=$(docker run --rm -v "$DATA_VOLUME":/data alpine sh -c 'find /data ! -user 1000 | head -n 1') \
    || NOT_OWNED=unknown
  if [ -n "$NOT_OWNED" ]; then
    echo "Volume $DATA_VOLUME : passage a l'uid 1000"
    docker compose stop
    docker run --rm -v "$DATA_VOLUME":/data alpine chown -R 1000:1000 /data
  fi
fi

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
