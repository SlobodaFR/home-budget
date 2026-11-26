#!/bin/sh
# fix-volume-owner.sh : arrête le service puis donne le volume de données à l'utilisateur non root de l'image.
# Convention du harnais `docker-nonroot` (home-harness, CONVENTIONS.md v1.7).
# COPIE VERBATIM depuis home-harness/scripts/fix-volume-owner.sh : ne jamais modifier la copie d'un repo
# (l'audit compare les deux fichiers). Un changement se fait dans le harnais.
#
# Usage (depuis le dossier du docker-compose.yml, sous le verrou d'hôte, APRÈS `docker compose pull` et pre-deploy-backup,
# AVANT compose-up-healthy.sh) :
#   sh fix-volume-owner.sh --service <svc> --project <name: du compose> --volume <clé du volume> \
#        --stop <service compose> [--stop <autre service qui monte le volume> ...] [--uid 1000] [--gid 1000] [--timeout 30]
#
# Cause racine : un volume créé par l'ancienne image (root) reste à root. Un `chown` manuel avant le déploiement ne suffit
# pas : l'ancien conteneur (root) continue d'écrire (WAL, générations Litestream) entre le chown et le changement
# d'image, et recrée des fichiers à root que le nouveau conteneur (uid 1000) ne peut plus écrire (EACCES). Le chown doit
# donc se faire DANS le déploiement, quand plus aucun conteneur n'écrit :
#   1. retrouve le volume (étiquettes Compose projet + clé, y compris un volume déclaré avec `name:`) et s'assure que
#      l'image du chown est présente (pull si besoin) : AVANT tout arrêt, pour que rien ne puisse échouer pendant l'arrêt ;
#   2. `docker compose -p <projet> stop -t <timeout> <svc>…` (arrêt propre : Litestream a le temps de vider son WAL) ;
#   3. vérifie qu'aucun conteneur en cours d'exécution ne monte encore le volume (sinon échec : la course resterait ouverte) ;
#   4. `docker run --rm -v <volume>:/data alpine:3.21 chown -R <uid>:<gid> /data` puis relecture : plus rien à un autre
#      propriétaire, sinon échec (chown -R ne suit pas les liens symboliques : seul le lien change, jamais sa cible) ;
#   5. rend la main : `compose-up-healthy.sh` démarre ensuite la nouvelle image.
# Si une étape échoue APRÈS l'arrêt, le script redémarre les services arrêtés (ancienne image, volume resté lisible par
# root : état connu sain) avant de sortir en 1 : l'échec ne laisse jamais le service éteint. Idempotent : sur un volume
# déjà au bon propriétaire, `changed=0`. Aucun volume ET aucun conteneur du projet (premier déploiement) : `status=SKIP`,
# rien n'est arrêté ; des conteneurs du projet sans volume retrouvé = échec (projet ou clé erronés), jamais un SKIP.
# Contrepartie assumée : quelques secondes d'indisponibilité entre l'arrêt et le `up` (image déjà tirée), pour les seuls
# services qui utilisent ce script.
#
# `--project` sert à retrouver le volume ET à cibler `docker compose -p` (le dossier courant doit contenir le compose).
# Variables : FIX_OWNER_IMAGE (alpine:3.21, la même image que pre-deploy-backup : déjà présente sur le VPS ; doit fournir
# chown et find, busybox suffit). Échec fermé : toute erreur sort en 1 (le script de déploiement a `set -e` ; dans un
# script ssh sans `set -e`, ajouter `|| exit 1`).
#
# Sortie (jeton stable `status=` à chercher dans le journal) : `[fix-volume-owner] <svc>: status=OK volume=<nom>
# owner=<uid>:<gid> changed=<n> stopped=<services>` et `… status=SKIP …` sur stdout ; `… status=FAIL …` sur STDERR
# (le journal d'un déploiement ssh réunit les deux). POSIX sh. `--help` sort en 2, une valeur invalide en 1.
set -eu

PREFIX='[fix-volume-owner]'
SERVICE=''
PROJECT=''
VOLUME_KEY=''
STOPS=''
OWNER_UID=1000
OWNER_GID=''
IMAGE="${FIX_OWNER_IMAGE:-alpine:3.21}"
STOP_TIMEOUT=30
STOPPED=0

log() { printf '%s %s: %s\n' "$PREFIX" "${SERVICE:-?}" "$*"; }
fail() {
  printf '%s %s: status=FAIL %s\n' "$PREFIX" "${SERVICE:-?}" "$*" >&2
  exit 1
}
# Échec APRÈS l'arrêt : redémarre les services arrêtés (ancienne image, volume lisible par root) avant de sortir en 1.
fail_after_stop() {
  if [ "$STOPPED" = 1 ]; then
    # shellcheck disable=SC2086 # $STOPS est une liste de noms validés
    if docker compose -p "$PROJECT" start $STOPS >/dev/null 2>&1; then
      fail "$* ; services$STOPS redémarrés (ancienne image) : rien n'est changé, déploiement abandonné"
    fi
    fail "$* ; ATTENTION le redémarrage des services$STOPS a échoué aussi : ils sont arrêtés, à relancer à la main (docker compose -p $PROJECT start$STOPS)"
  fi
  fail "$*"
}
usage() {
  printf 'Usage : sh fix-volume-owner.sh --service <svc> --project <projet compose> --volume <clé du volume> --stop <service compose> [--stop …] [--uid 1000] [--gid 1000] [--timeout 30]\n' >&2
  exit 2
}
is_number() { case "$1" in '' | *[!0-9]*) return 1 ;; *) return 0 ;; esac; }
# Uniquement des caractères sûrs : aucune valeur ne finit dans une commande sans avoir passé ce filtre.
is_name() { case "$1" in '' | -* | *[!A-Za-z0-9_.-]*) return 1 ;; *) return 0 ;; esac; }

while [ $# -gt 0 ]; do
  case "$1" in
    --service) [ $# -ge 2 ] || usage; SERVICE="$2"; shift 2 ;;
    --project) [ $# -ge 2 ] || usage; PROJECT="$2"; shift 2 ;;
    --volume) [ $# -ge 2 ] || usage; VOLUME_KEY="$2"; shift 2 ;;
    --stop) [ $# -ge 2 ] || usage; STOPS="$STOPS $2"; shift 2 ;;
    --uid) [ $# -ge 2 ] || usage; OWNER_UID="$2"; shift 2 ;;
    --gid) [ $# -ge 2 ] || usage; OWNER_GID="$2"; shift 2 ;;
    --timeout) [ $# -ge 2 ] || usage; STOP_TIMEOUT="$2"; shift 2 ;;
    -h | --help) usage ;;
    *) usage ;;
  esac
done
[ -n "$OWNER_GID" ] || OWNER_GID=$OWNER_UID
is_name "$SERVICE" || fail "--service invalide"
is_name "$PROJECT" || fail "--project invalide"
is_name "$VOLUME_KEY" || fail "--volume invalide"
[ -n "$STOPS" ] || fail "--stop manquant : indiquer le(s) service(s) compose qui montent le volume"
for s in $STOPS; do is_name "$s" || fail "--stop invalide : $s"; done
is_number "$OWNER_UID" || fail "--uid doit être un entier"
is_number "$OWNER_GID" || fail "--gid doit être un entier"
is_number "$STOP_TIMEOUT" || fail "--timeout doit être un entier"
[ "$OWNER_UID" -ne 0 ] || fail "--uid 0 n'a pas de sens : la convention est un utilisateur non root"
command -v docker >/dev/null 2>&1 || fail "docker introuvable"

# Volume du service : étiquettes Compose projet + clé (un `name:` ou un autre préfixe n'y change rien), sinon nom
# <projet>_<clé>. Sans pipe : un `docker volume ls` en échec doit échouer, pas passer pour « aucun volume ».
VOL=$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.volume=$VOLUME_KEY") || fail "docker volume ls a échoué"
[ "$(printf '%s' "$VOL" | grep -c . || true)" -le 1 ] || fail "plusieurs volumes correspondent à $PROJECT/$VOLUME_KEY : $(printf '%s' "$VOL" | tr '\n' ' ')"
if [ -z "$VOL" ] && docker volume inspect "${PROJECT}_${VOLUME_KEY}" >/dev/null 2>&1; then VOL="${PROJECT}_${VOLUME_KEY}"; fi
if [ -z "$VOL" ]; then
  existing=$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT") || fail "docker ps a échoué"
  [ -z "$existing" ] || fail "le projet $PROJECT a des conteneurs mais aucun volume $VOLUME_KEY n'est retrouvé (--project ou --volume erroné ?) : le chown ne peut pas être fait, déploiement abandonné"
  log "status=SKIP aucun volume ni conteneur pour $PROJECT/$VOLUME_KEY (premier déploiement : Compose créera le volume avec le propriétaire de l'image)"
  exit 0
fi

# L'image du chown est tirée AVANT l'arrêt : un pull qui échoue (réseau, limite de Docker Hub) ne doit jamais arriver pendant l'arrêt.
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull -q "$IMAGE" >/dev/null || fail "image $IMAGE introuvable et non tirable : rien n'a été arrêté"

# shellcheck disable=SC2086 # $STOPS est une liste de noms validés
docker compose -p "$PROJECT" stop -t "$STOP_TIMEOUT" $STOPS || { STOPPED=1; fail_after_stop "docker compose stop a échoué"; }
STOPPED=1

running=$(docker ps -q --filter "volume=$VOL") || fail_after_stop "docker ps a échoué"
if [ -n "$running" ]; then
  names=$(docker inspect -f '{{.Name}}' $running 2>/dev/null | tr '\n' ' ') || names=$running
  fail_after_stop "un conteneur en cours d'exécution monte encore $VOL (${names}) : le chown courrait contre ses écritures ; l'ajouter à --stop"
fi

# `chown -R -c` n'imprime que les entrées modifiées ; la relecture (find) exige 0 entrée restante à un autre propriétaire.
out=$(docker run --rm --network none -v "$VOL:/data" "$IMAGE" sh -c '
  set -e
  chown -R -c "$1:$2" /data
  left=$(find /data \( ! -user "$1" -o ! -group "$2" \) | head -n 1)
  if [ -n "$left" ]; then echo "reste a un autre proprietaire : $left" >&2; exit 1; fi
' fix-owner "$OWNER_UID" "$OWNER_GID") || fail_after_stop "chown du volume $VOL en échec (image $IMAGE)"
changed=$(printf '%s\n' "$out" | grep -c . || true)
log "status=OK volume=$VOL owner=$OWNER_UID:$OWNER_GID changed=$changed stopped=$(printf '%s' "$STOPS" | sed 's/^ //; s/ /,/g')"
