#!/bin/sh
# prune-service-images.sh : rétention des images Docker d'un service sur le VPS (garde les N plus récentes, supprime le reste).
# Convention du harnais `image-retention` (home-harness, CONVENTIONS.md v1.8).
# COPIE VERBATIM depuis home-harness/scripts/prune-service-images.sh : ne jamais modifier la copie d'un repo
# (l'audit compare les deux fichiers). Un changement se fait dans le harnais.
#
# Usage (depuis update-vps.sh, sous le verrou d'hôte) :
#   AVANT `docker compose pull`  : sh prune-service-images.sh --phase pre  --service <svc> --image <repo> [--image <repo2> ...] --tag "$IMAGE_TAG" --project <name: du compose>
#   APRÈS compose-up-healthy.sh  : sh prune-service-images.sh --phase post --service <svc> --image <repo> [--image <repo2> ...] --tag "$IMAGE_TAG" --project <name: du compose>
#
# Arguments (l'environnement fournit des valeurs par défaut) :
#   --service <svc>     nom du service (journal).
#   --image <repo>      dépôt d'images du service, SANS tag ni digest ni port de registre (ex. ghcr.io/slobodafr/home-x) ; à répéter pour un service qui
#                       publie plusieurs images. Seuls ces dépôts sont touchés : les images des autres services jamais.
#   --tag <tag>         tag en cours de déploiement (défaut : $IMAGE_TAG). Son image n'est jamais supprimée.
#   --keep <n>          nombre d'images à garder par dépôt (défaut : $KEEP_VERSIONS, sinon 2 = la courante + la précédente,
#                       pour un retour arrière).
#   --phase pre|post    `post` (défaut) garde <keep> images ; `pre` en garde <keep>-1 (au moins 1) pour faire de la place AVANT
#                       le pull de la nouvelle image, qui sera la <keep>-ième.
#   --project <name>    projet Compose : les conteneurs ARRÊTÉS de ce projet sont purgés (ils retiennent leurs images).
#                       Optionnel ; sans lui, aucun conteneur n'est purgé.
# Variable : IMAGE_RETENTION_GLOBAL_PRUNE=0 saute les purges globales (images pendantes créées il y a plus de 24 h, cache de build de
# plus de 7 jours).
#
# Déroulé :
#   1. espace disque avant ; `docker container prune` limité à l'étiquette Compose du projet ;
#   2. pour chaque dépôt : les images (identifiants distincts, y compris les lignes `<dépôt> <none>` : image retirée de ses tags
#      mais encore référencée par digest) sont classées par date de CRÉATION décroissante (pas par date de déploiement : après un
#      retour arrière manuel, la « précédente » gardée est la plus récemment CRÉÉE ; l'image en cours d'utilisation reste protégée) ;
#      les <keep> premières sont gardées. Limite : un tag flottant (`latest`) repris par un nouveau pull laisse l'ancienne image
#      pendante (`<none> <none>`, sans dépôt) : elle ne compte pas dans <keep> (aucun retour arrière sur disque) et, si elle a été
#      CRÉÉE il y a plus de 24 h (`--filter until=24h` porte sur la date de création, pas sur le moment du détagage), elle est
#      supprimée dès la phase post par la purge d'images pendantes de l'étape 4, sans délai de grâce ;
#   3. parmi les autres, ne sont JAMAIS supprimées : l'image du tag déployé, toute image utilisée par un conteneur
#      (`docker ps -a`, arrêtés compris), toute image qui porte aussi le tag d'un dépôt non géré ici. Jamais de `rmi -f`,
#      jamais de volume touché ;
#   4. `docker image prune -f --filter until=24h` et `docker builder prune -f --filter until=168h` ; espace disque après.
#
# Sûr par construction : le nettoyage ne fait JAMAIS échouer le déploiement. Un `docker rmi` en échec, un docker qui ne répond
# pas, un conteneur introuvable : ligne de journal, `status=WARN`, sortie 0 (et si l'état des conteneurs est inconnu, aucune
# image DU DÉPÔT n'est supprimée ; les purges globales de l'étape 4 restent exécutées). Seule une erreur d'arguments sort en 2 (faute de configuration, visible au premier déploiement et
# avant que le pull ait eu lieu).
#
# Sortie (jeton stable à chercher dans le journal) :
#   `[image-retention] <svc>: status=OK|WARN|SKIP phase=<pre|post> keep=<n> retain=<n> kept=<n> removed=<n> failed=<n> freed=<taille>`
#   (keep = --keep configuré ; retain = nombre d'images récentes réellement gardées dans cette phase : keep en post, keep-1 en pre)
# POSIX sh.
set -u

PREFIX='[image-retention]'
SERVICE=''
IMAGES=''
KEEP="${KEEP_VERSIONS:-2}"
TAG="${IMAGE_TAG:-}"
PROJECT=''
PHASE='post'

log() { printf '%s %s: %s\n' "$PREFIX" "${SERVICE:-?}" "$*"; }
usage() {
  printf 'Usage : sh prune-service-images.sh --service <svc> --image <repo> [--image <repo> ...] --tag <tag> [--keep 2] [--phase pre|post] [--project <projet compose>]\n' >&2
  exit 2
}
die() {
  printf '%s %s: erreur d arguments : %s\n' "$PREFIX" "${SERVICE:-?}" "$*" >&2
  exit 2
}
is_number() { case "$1" in '' | *[!0-9]*) return 1 ;; *) return 0 ;; esac; }
is_name() { case "$1" in '' | -* | *[!A-Za-z0-9_.-]*) return 1 ;; *) return 0 ;; esac; }
# Dépôt sans tag ni digest : lettres, chiffres, _ . - et / uniquement.
is_repo() { case "$1" in '' | -* | /* | */ | *//* | *[!A-Za-z0-9_./-]*) return 1 ;; *) return 0 ;; esac; }

while [ $# -gt 0 ]; do
  # Forme `--flag=valeur` : scindée en `--flag valeur` (valeur vide acceptée, validée plus bas).
  case "$1" in --*=*) a="$1"; shift; set -- "${a%%=*}" "${a#*=}" "$@" ;; esac
  case "$1" in
    --service) [ $# -ge 2 ] || usage; SERVICE="$2"; shift 2 ;;
    --image) [ $# -ge 2 ] || usage; IMAGES="$IMAGES$2
"; shift 2 ;;
    --tag) [ $# -ge 2 ] || usage; TAG="$2"; shift 2 ;;
    --keep) [ $# -ge 2 ] || usage; KEEP="$2"; shift 2 ;;
    --phase) [ $# -ge 2 ] || usage; PHASE="$2"; shift 2 ;;
    --project) [ $# -ge 2 ] || usage; PROJECT="$2"; shift 2 ;;
    -h | --help) usage ;;
    *) usage ;;
  esac
done
is_name "$SERVICE" || die "--service invalide"
[ -n "$IMAGES" ] || die "--image manquant (dépôt d'images du service, sans tag)"
printf '%s' "$IMAGES" | while IFS= read -r r; do is_repo "$r" || exit 1; done || die "--image invalide (dépôt sans tag ni digest : lettres, chiffres, _ . - /)"
is_name "$TAG" || die "--tag manquant ou invalide (le tag en cours de déploiement)"
is_number "$KEEP" && [ "$KEEP" -ge 1 ] || die "--keep doit être un entier >= 1"
case "$PHASE" in pre | post) ;; *) die "--phase doit valoir pre ou post" ;; esac
[ -z "$PROJECT" ] || is_name "$PROJECT" || die "--project invalide"

EFF=$KEEP
if [ "$PHASE" = pre ]; then
  EFF=$((KEEP - 1))
  [ "$EFF" -ge 1 ] || EFF=1
fi

human() {
  awk -v b="$1" 'BEGIN { split("B KB MB GB TB", u, " "); i = 1; while (b >= 1024 && i < 5) { b /= 1024; i++ } f = (i == 1) ? "%d%s" : "%.1f%s"; printf f, b, u[i] }'
}

STATUS=OK
KEPT=0
REMOVED=0
FAILED=0
FREED=0
finish() {
  log "status=$STATUS phase=$PHASE keep=$KEEP retain=$EFF kept=$KEPT removed=$REMOVED failed=$FAILED freed=$(human "$FREED")"
  exit 0
}

if ! command -v docker >/dev/null 2>&1; then
  STATUS=SKIP
  log "docker introuvable : rien à nettoyer"
  finish
fi
T=$(mktemp -d 2>/dev/null) || {
  STATUS=SKIP
  log "mktemp a échoué : nettoyage ignoré"
  finish
}
trap 'rm -rf "$T"' EXIT
printf '%s' "$IMAGES" >"$T/repos"

DISK_PATH=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null) || DISK_PATH=''
[ -n "$DISK_PATH" ] && [ -d "$DISK_PATH" ] || DISK_PATH=/
disk() {
  out=$(df -Pk "$DISK_PATH" 2>/dev/null | awk 'NR == 2 { printf "%s utilisé, %.1f Go libres (%s)", $5, $4 / 1048576, $6 }')
  printf '%s' "${out:-indisponible}"
}
warn() {
  STATUS=WARN
  log "$*"
}

log "phase=$PHASE keep=$KEEP retain=$EFF tag=$TAG images=$(printf '%s' "$IMAGES" | tr '\n' ',' | sed 's/,$//')"
log "disque avant : $(disk)"

# 1. Conteneurs arrêtés du projet : ils retiennent leurs images.
if [ -n "$PROJECT" ]; then
  docker container prune -f --filter "label=com.docker.compose.project=$PROJECT" >/dev/null 2>&1 || warn "docker container prune a échoué (ignoré)"
fi

# 2. État des images et des conteneurs. Sans la liste des images utilisées, on ne supprime rien.
if ! docker image ls --no-trunc --format '{{.ID}} {{.Repository}} {{.Tag}}' >"$T/ls" 2>/dev/null; then
  warn "docker image ls a échoué : aucune image supprimée"
  : >"$T/ls"
  SKIP_RETENTION=1
else
  SKIP_RETENTION=0
fi
: >"$T/used"
if [ "$SKIP_RETENTION" = 0 ]; then
  if ! cids=$(docker ps -aq --no-trunc 2>/dev/null); then
    warn "docker ps a échoué : images utilisées inconnues, aucune image supprimée"
    SKIP_RETENTION=1
  elif [ -n "$cids" ]; then
    # shellcheck disable=SC2086 # identifiants de conteneurs
    if ! docker inspect -f '{{.Image}}' $cids >"$T/used" 2>/dev/null; then
      warn "docker inspect des conteneurs a échoué : images utilisées inconnues, aucune image supprimée"
      : >"$T/used"
      SKIP_RETENTION=1
    fi
  fi
fi

short_id() { printf '%s' "$1" | sed 's/^sha256://' | cut -c1-12; }

# Retire les références du dépôt $1 de l'image $2 (jamais celles d'un autre dépôt), puis l'identifiant seulement s'il ne reste
# aucune autre référence. Jamais fatal, jamais forcé. Code 0 = image supprimée, 1 = échec, 2 = déliée de ce dépôt mais gardée
# (elle porte encore une référence d'un autre dépôt géré).
remove_image() {
  rm_repo="$1"
  rm_id="$2"
  rm_size="$3"
  awk -v id="$rm_id" -v r="$rm_repo" '$1 == id && $2 == r { print $2 " " $3 }' "$T/ls" >"$T/refs"
  rm_failed=0
  while read -r rrepo rtag; do
    [ "$rtag" = '<none>' ] && continue
    if ! rout=$(docker image rm "$rrepo:$rtag" 2>&1); then
      rm_failed=1
      FAILED=$((FAILED + 1))
      warn "échec de la suppression de $rrepo:$rtag : $(printf '%s' "$rout" | head -n 1)"
    fi
  done <"$T/refs"
  # Une référence n'a pas pu être retirée : ne pas retenter par identifiant (l'image reste, telle quelle).
  [ "$rm_failed" = 0 ] || return 1
  docker image inspect "$rm_id" >/dev/null 2>&1 || {
    REMOVED=$((REMOVED + 1))
    FREED=$((FREED + rm_size))
    return 0
  }
  if awk -v id="$rm_id" -v r="$rm_repo" '$1 == id && $2 != r { f = 1 } END { exit !f }' "$T/ls"; then
    return 2
  fi
  if ! rout=$(docker image rm "$rm_id" 2>&1); then
    FAILED=$((FAILED + 1))
    warn "échec de la suppression de $rm_id : $(printf '%s' "$rout" | head -n 1)"
    return 1
  fi
  REMOVED=$((REMOVED + 1))
  FREED=$((FREED + rm_size))
  return 0
}

# 3. Rétention par dépôt, classement par date de création (jamais l'ordre d'affichage de `docker image ls`).
# Passe 1 : classement de chaque dépôt et ensemble des images PROTÉGÉES tous dépôts confondus (tag déployé, <keep> plus récentes,
# date inconnue) : une même image portée par deux dépôts gérés n'est supprimée que si aucun des deux ne la protège.
if [ "$SKIP_RETENTION" = 0 ]; then
  : >"$T/protected"
  ri=0
  while IFS= read -r repo; do
    [ -n "$repo" ] || continue
    ri=$((ri + 1))
    awk -v r="$repo" '$2 == r && !seen[$1]++ { print $1 }' "$T/ls" >"$T/ids"
    docker image inspect -f '{{.Id}}' "$repo:$TAG" 2>/dev/null >"$T/dep.$ri" || : >"$T/dep.$ri"
    cat "$T/dep.$ri" >>"$T/protected"
    : >"$T/rank"
    n=0
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      n=$((n + 1))
      info=$(docker image inspect -f '{{.Created}} {{.Size}}' "$id" 2>/dev/null) || continue
      created=$(printf '%s' "$info" | awk '{ print substr($1, 1, 19) }')
      # Date absente (champ omis : le champ suivant serait pris pour la date) ou valeur zéro : image gardée, jamais supprimée.
      case "$created" in 0001-* | 1970-*) created='' ;; esac
      case "$created" in [0-9][0-9][0-9][0-9]-*) ;; *) printf '%s\n' "$id" >>"$T/protected"; log "garde $repo ($(short_id "$id")) : date de création inconnue"; continue ;; esac
      size=$(printf '%s' "$info" | awk '{ print $2 }')
      is_number "$size" || size=0
      printf '%s %s %s %s\n' "$created" "$n" "$id" "$size" >>"$T/rank"
    done <"$T/ids"
    LC_ALL=C sort -k1,1r -k2,2n "$T/rank" >"$T/sorted.$ri"
    head -n "$EFF" "$T/sorted.$ri" | awk '{ print $3 }' >>"$T/protected"
  done <"$T/repos"

  # Passe 2 : décision et suppression.
  ri=0
  while IFS= read -r repo; do
    [ -n "$repo" ] || continue
    ri=$((ri + 1))
    deploy_id=$(cat "$T/dep.$ri")
    pos=0
    while read -r created _ id size; do
      pos=$((pos + 1))
      reason=''
      if [ "$pos" -le "$EFF" ]; then
        reason="récente ($pos/$EFF)"
      elif [ -n "$deploy_id" ] && [ "$id" = "$deploy_id" ]; then
        reason="tag déployé $TAG"
      elif grep -qxF "$id" "$T/protected"; then
        reason='protégée par un autre dépôt géré (tag déployé ou récente)'
      elif grep -qxF "$id" "$T/used"; then
        reason='utilisée par un conteneur'
      elif awk -v id="$id" 'NR == FNR { m[$0] = 1; next } $1 == id && !($2 in m) { f = 1 } END { exit !f }' "$T/repos" "$T/ls"; then
        reason="partagée avec un dépôt non géré"
      fi
      short=$(short_id "$id")
      if [ -n "$reason" ]; then
        KEPT=$((KEPT + 1))
        log "garde $repo ($short, créée $created) : $reason"
        continue
      fi
      remove_image "$repo" "$id" "$size"
      case $? in
        0) log "supprime $repo ($short, créée $created, $(human "$size"))" ;;
        2) log "délie $repo ($short, créée $created) : l'image garde la référence d'un autre dépôt géré" ;;
        *)
          log "conserve $repo ($short, créée $created) : suppression impossible"
          KEPT=$((KEPT + 1))
          ;;
      esac
    done <"$T/sorted.$ri"
  done <"$T/repos"
fi

# 4. Purges globales : images pendantes créées il y a plus de 24 h, cache de build de plus de 7 jours. Jamais de volume.
if [ "${IMAGE_RETENTION_GLOBAL_PRUNE:-1}" != 0 ]; then
  docker image prune -f --filter until=24h >/dev/null 2>&1 || warn "docker image prune a échoué (ignoré)"
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
fi

log "disque après : $(disk)"
finish
