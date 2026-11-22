#!/usr/bin/env bash
# pre-deploy-backup.sh : snapshot SQLite cohérent et vérifié, pris juste avant le déploiement d'une nouvelle image.
# Convention du harnais `pre-deploy-backup` (home-harness, CONVENTIONS.md v1.3).
# COPIE VERBATIM depuis home-harness/scripts/pre-deploy-backup.sh : ne jamais modifier la copie d'un repo
# (l'audit compare les deux fichiers). Un changement se fait dans le harnais.
#
# Usage (sous le verrou d'hôte, AVANT `docker compose pull` / `up`) :
#   bash pre-deploy-backup.sh --service <svc> --project <projet compose> --volume <clé du volume compose> \
#        --mount <point de montage dans le conteneur> --db-path <chemin de la base dans le conteneur> \
#        [--workdir /app/backend] [--tag <tag d'image>]
#
# Principe :
#   1. retrouve le volume nommé du service (étiquettes Compose) ;
#   2. `VACUUM INTO` via un conteneur jetable (alpine + sqlite3, construit une fois) qui monte le volume :
#      une seule transaction de lecture, donc une coupe cohérente même si l'ancien conteneur écrit encore
#      (mode WAL : les écrivains ne sont pas bloqués). Jamais de `cp` d'une base WAL ;
#   3. `PRAGMA integrity_check` sur le fichier tel que stocké : il doit répondre exactement `ok` ;
#   4. stocke dans $BACKUP_ROOT/<svc>/<svc>-<UTC>-<tag>.sqlite (fichier 600, dossier 700) et garde les
#      $BACKUP_KEEP derniers (30).
# Échec fermé : toute erreur (sauf « premier déploiement », sans volume ni base) sort en 1 ; l'appelant doit
# alors arrêter le déploiement. Rien n'est supprimé tant que la nouvelle sauvegarde n'est pas vérifiée.
#
# Variables : BACKUP_ROOT ($HOME/backups), BACKUP_KEEP (30), BACKUP_MIN_FREE_KB (0, plancher d'espace libre),
# SQLITE_TOOLS_IMAGE (home-sqlite-tools:1, image fournissant sqlite3 et sha256sum ; construite sous ce nom si absente),
# SNAPSHOT_TIMEOUT (300 s), PDB_ALLOW_FIRST_DEPLOY (0).
#
# Sortie (jeton stable `status=` à chercher dans le journal) : `[pre-deploy-backup] <svc>: status=OK integrity_check=ok
# path=… size=… bytes …` en cas de succès, `… status=SKIP …` pour un premier déploiement, `… status=FAIL ÉCHEC …` (stderr)
# sinon. Un SKIP est refusé (échec) si le service a déjà des sauvegardes. PDB_ALLOW_FIRST_DEPLOY=1 lève ce refus.
#
# Compatible bash 3.2+ (Linux et macOS). Ce fichier est aussi chargé (`source`) par restore-sqlite-backup.sh.
set -euo pipefail

PDB_PREFIX='[pre-deploy-backup]'
SERVICE=''
PROJECT=''
VOLUME_KEY=''
MOUNT=''
DB_PATH=''
WORKDIR='/app/backend'
TAG='manual'
TOOLS_IMAGE="${SQLITE_TOOLS_IMAGE:-home-sqlite-tools:1}"
BACKUP_ROOT="${BACKUP_ROOT:-${HOME:-}/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-30}"
BACKUP_MIN_FREE_KB="${BACKUP_MIN_FREE_KB:-0}"
SNAPSHOT_TIMEOUT="${SNAPSHOT_TIMEOUT:-300}"
VOL=''
REL=''
DIR=''
CONTAINER_NAME=''
PARTIAL=''

log() { printf '%s %s: %s\n' "$PDB_PREFIX" "${SERVICE:-?}" "$*"; }
fail() {
  printf '%s %s: status=FAIL ÉCHEC %s\n' "$PDB_PREFIX" "${SERVICE:-?}" "$*" >&2
  exit 1
}
# Un SKIP n'est légitime qu'au tout premier déploiement. Si ce service a déjà été sauvegardé (des snapshots existent),
# « rien à sauvegarder » est invraisemblable (faute de frappe sur --project, volume renommé…) : échec fermé.
skip() {
  if [ -n "$(list_snapshots)" ] && [ "${PDB_ALLOW_FIRST_DEPLOY:-0}" != 1 ]; then
    fail "$* : mais ce service a déjà des sauvegardes dans $DIR, donc une base devrait exister (projet, volume ou chemin erroné ? PDB_ALLOW_FIRST_DEPLOY=1 pour forcer)"
  fi
  log "status=SKIP $*"
}

cleanup() {
  [ -z "$PARTIAL" ] || rm -f "$PARTIAL"
  [ -z "$CONTAINER_NAME" ] || docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

# Consomme une option commune à backup et restore : positionne OPT_SHIFT (2 si consommée, 0 sinon).
OPT_SHIFT=0
take_common_opt() {
  OPT_SHIFT=0
  case "${1:-}" in
    --service | --project | --volume | --mount | --db-path | --workdir | --tag)
      [ $# -ge 2 ] || fail "$1 attend une valeur"
      case "$1" in
        --service) SERVICE=$2 ;;
        --project) PROJECT=$2 ;;
        --volume) VOLUME_KEY=$2 ;;
        --mount) MOUNT=$2 ;;
        --db-path) DB_PATH=$2 ;;
        --workdir) WORKDIR=$2 ;;
        --tag) TAG=$2 ;;
      esac
      OPT_SHIFT=2
      ;;
  esac
}

# Valide les paramètres (aucune valeur ne finit dans une commande shell sans avoir passé ces motifs).
validate_params() {
  local re_name='^[a-z0-9][a-z0-9-]*$' re_proj='^[a-z0-9][a-z0-9_-]*$' re_vol='^[A-Za-z0-9][A-Za-z0-9_.-]*$' re_path='^[A-Za-z0-9._/-]+$' re_tag='^[A-Za-z0-9._-]{1,64}$'
  [[ $SERVICE =~ $re_name ]] || fail "--service invalide (minuscules, chiffres, tirets)"
  [[ $PROJECT =~ $re_proj ]] || fail "--project invalide"
  [[ $VOLUME_KEY =~ $re_vol ]] || fail "--volume invalide"
  [[ $MOUNT =~ $re_path && $MOUNT == /* ]] || fail "--mount doit être un chemin absolu simple"
  [[ $WORKDIR =~ $re_path && $WORKDIR == /* ]] || fail "--workdir doit être un chemin absolu simple"
  [[ $DB_PATH =~ $re_path ]] || fail "--db-path invalide"
  [[ $MOUNT != *..* && $WORKDIR != *..* && $DB_PATH != *..* ]] || fail "'..' interdit dans les chemins"
  [[ $TAG =~ $re_tag ]] || TAG=$(printf '%s' "$TAG" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-64)
  TAG=${TAG#sha-}
  [ -n "$TAG" ] || TAG=manual
  [[ $BACKUP_KEEP =~ ^[0-9]+$ && $BACKUP_KEEP -ge 1 ]] || fail "BACKUP_KEEP doit être un entier >= 1"
  [[ $BACKUP_MIN_FREE_KB =~ ^[0-9]+$ ]] || fail "BACKUP_MIN_FREE_KB doit être un entier"
  [ -n "$BACKUP_ROOT" ] && [[ $BACKUP_ROOT == /* ]] || fail "BACKUP_ROOT doit être un chemin absolu (HOME absent ?)"
  # Chemin de la base : absolu ou relatif au répertoire de travail du conteneur, normalisé, sous le montage.
  case "$DB_PATH" in /*) ;; *) DB_PATH="$WORKDIR/$DB_PATH" ;; esac
  DB_PATH=$(printf '%s' "$DB_PATH" | sed -e 's#/\./#/#g' -e 's#//*#/#g')
  MOUNT=$(printf '%s' "$MOUNT" | sed -e 's#//*#/#g' -e 's#/$##')
  case "$DB_PATH" in "$MOUNT"/?*) ;; *) fail "la base n'est pas sous le volume monté sur $MOUNT : sa sauvegarde est impossible" ;; esac
  REL=${DB_PATH#"$MOUNT"/}
  DIR="$BACKUP_ROOT/$SERVICE"
}

need_docker() { command -v docker >/dev/null 2>&1 || fail "docker introuvable"; }

with_timeout() {
  local secs=$1
  shift
  if command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"; else "$@"; fi
}

# Volume du service (étiquettes Compose). Positionne VOL ; VOL vide = premier déploiement (ni volume ni conteneur).
resolve_volume() {
  local list n exact containers
  VOL=''
  list=$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" | awk -v k="$VOLUME_KEY" '$0 == k || (length($0) > length(k) && substr($0, length($0) - length(k)) == "_" k)') || fail "docker volume ls a échoué"
  n=$(printf '%s' "$list" | grep -c . || true)
  if [ "$n" -gt 1 ]; then fail "plusieurs volumes correspondent à $PROJECT/$VOLUME_KEY : $(printf '%s' "$list" | tr '\n' ' ')"; fi
  if [ "$n" -eq 1 ]; then
    VOL=$list
    return 0
  fi
  exact="${PROJECT}_${VOLUME_KEY}"
  if docker volume inspect "$exact" >/dev/null 2>&1; then
    VOL=$exact
    return 0
  fi
  containers=$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" | grep -c . || true)
  # Des conteneurs sans leur volume de données : la base est ailleurs (bind mount ?) et resterait sans sauvegarde.
  if [ "$containers" -gt 0 ]; then fail "$containers conteneur(s) du projet $PROJECT mais volume de données $VOLUME_KEY introuvable : sauvegarde impossible"; fi
  return 0
}

ensure_tools() {
  docker image inspect "$TOOLS_IMAGE" >/dev/null 2>&1 && return 0
  log "construction de l'image d'outils $TOOLS_IMAGE (alpine + sqlite, une seule fois)"
  printf 'FROM alpine:3.21\nRUN apk add --no-cache sqlite\n' | docker build -q -t "$TOOLS_IMAGE" - >/dev/null || fail "construction de l'image $TOOLS_IMAGE impossible"
}

# Inspecte le volume (lecture seule, en root) : EXISTS <uid> <gid> <taille> <taille wal> <mode> <uid dossier> <gid dossier> | MISSING + OTHER <fichiers>.
probe_volume() {
  docker run --rm --pull never --network none --user 0:0 -e "REL=$REL" -v "$VOL:/data:ro" --entrypoint sh "$TOOLS_IMAGE" -c '
f="/data/$REL"
if [ -f "$f" ]; then
  w=0; [ -f "$f-wal" ] && w=$(stat -c %s "$f-wal")
  echo "EXISTS $(stat -c "%u %g %s" "$f") $w $(stat -c %a "$f") $(stat -c "%u %g" /data)"
else
  echo "MISSING $(stat -c "%u %g" /data)"
  # Traces d une base à cet emplacement (WAL, SHM, journal, métadonnées Litestream) ou autre fichier SQLite, reconnu à son en-tête.
  for x in "$f-wal" "$f-shm" "$f-journal" "$f-litestream"; do [ -e "$x" ] && echo "OTHER ${x#/data/}"; done
  find /data -type f -size +0c 2>/dev/null | while read -r x; do
    [ "$(head -c 15 "$x" 2>/dev/null)" = "SQLite format 3" ] && echo "OTHER ${x#/data/}"
  done
fi
exit 0' </dev/null || fail "inspection du volume $VOL impossible"
}

# Vérifie un fichier SQLite de l'hôte dans un conteneur sans réseau : integrity_check doit répondre exactement « ok ».
# Positionne V_SHA et V_TABLES. Le fichier est vérifié tel que stocké (lu sur stdin).
V_SHA=''
V_TABLES=''
verify_file() {
  local file=$1 out integ
  out=$(docker run --rm -i --pull never --network none --entrypoint sh "$TOOLS_IMAGE" -c '
cat > /tmp/c.sqlite
echo "SHA $(sha256sum /tmp/c.sqlite | cut -d" " -f1)"
echo INTEGRITY_BEGIN
sqlite3 -readonly /tmp/c.sqlite "PRAGMA integrity_check;" 2>&1
echo INTEGRITY_END
echo "TABLES $(sqlite3 -readonly /tmp/c.sqlite .tables 2>/dev/null | wc -w)"' <"$file") || fail "vérification de $file impossible"
  integ=$(printf '%s\n' "$out" | sed -n '/^INTEGRITY_BEGIN$/,/^INTEGRITY_END$/p' | sed '1d;$d')
  [ "$integ" = ok ] || fail "integrity_check de $file : $(printf '%s' "$integ" | head -3 | tr '\n' ' ')(attendu : ok)"
  V_SHA=$(printf '%s\n' "$out" | sed -n 's/^SHA //p')
  V_TABLES=$(printf '%s\n' "$out" | sed -n 's/^TABLES //p')
}

list_snapshots() {
  { ls -1 "$DIR" 2>/dev/null | grep -E "^${SERVICE}-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9._-]+\.sqlite\$" | sort; } || true
}

pdb_main() {
  while [ $# -gt 0 ]; do
    take_common_opt "$@"
    [ "$OPT_SHIFT" -gt 0 ] || fail "option inconnue : $1"
    shift "$OPT_SHIFT"
  done
  validate_params
  need_docker
  trap cleanup EXIT

  resolve_volume
  if [ -z "$VOL" ]; then
    skip "premier déploiement : ni volume $PROJECT/$VOLUME_KEY ni conteneur, rien à sauvegarder"
    return 0
  fi
  ensure_tools

  local probe state uid gid size wal mode _du _dg others
  probe=$(probe_volume)
  state=$(printf '%s\n' "$probe" | head -1)
  case "$state" in
    MISSING*)
      others=$(printf '%s\n' "$probe" | sed -n 's/^OTHER //p' | tr '\n' ' ')
      [ -z "$others" ] || fail "la base configurée ($REL) est absente du volume $VOL mais il contient des traces de base ou d'autres bases : ${others}(chemin de base erroné ?)"
      skip "aucune base dans le volume $VOL (premier démarrage), rien à sauvegarder"
      return 0
      ;;
    EXISTS*) read -r _ uid gid size wal mode _du _dg <<<"$state" ;;
    *) fail "réponse inattendue de l'inspection du volume : $state" ;;
  esac
  if [ "$size" -eq 0 ] && [ "$wal" -eq 0 ]; then
    skip "base vide dans le volume $VOL, rien à sauvegarder"
    return 0
  fi

  umask 077
  if [ ! -d "$BACKUP_ROOT" ]; then mkdir -p "$BACKUP_ROOT" && chmod 700 "$BACKUP_ROOT"; fi
  mkdir -p "$DIR" && chmod 700 "$DIR" || fail "dossier $DIR inutilisable"
  [ -w "$DIR" ] || fail "dossier $DIR non inscriptible"
  find "$DIR" -maxdepth 1 -name '.*.partial' -mmin +120 -exec rm -f {} + 2>/dev/null || true

  # Espace libre : le snapshot (au plus base + WAL) doit tenir deux fois, plus une marge.
  local avail_kb need_kb
  avail_kb=$(df -Pk "$DIR" | awk 'NR == 2 { print $4 }')
  need_kb=$(((size + wal) * 2 / 1024 + 16384))
  [ "$need_kb" -ge "$BACKUP_MIN_FREE_KB" ] || need_kb=$BACKUP_MIN_FREE_KB
  [[ $avail_kb =~ ^[0-9]+$ ]] && [ "$avail_kb" -ge "$need_kb" ] || fail "espace disque insuffisant dans $DIR : ${avail_kb:-?} Ko libres, $need_kb Ko requis"

  local ts dest
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  dest="$DIR/$SERVICE-$ts-$TAG.sqlite"
  [ ! -e "$dest" ] || fail "$dest existe déjà"
  PARTIAL="$DIR/.$SERVICE-$ts-$TAG.sqlite.partial"
  CONTAINER_NAME="pre-deploy-backup-$SERVICE-$$"

  # Snapshot : lu par l'utilisateur propriétaire de la base (pas de -shm/-wal créé par root dans le volume),
  # écrit dans le conteneur puis diffusé sur stdout, donc créé par l'utilisateur de l'hôte (umask 077).
  log "snapshot de $VOL (base $size octets, WAL $wal octets) vers $dest"
  with_timeout "$SNAPSHOT_TIMEOUT" docker run --rm --name "$CONTAINER_NAME" --pull never --network none --user "$uid:$gid" \
    --cap-drop ALL --security-opt no-new-privileges -e "REL=$REL" -v "$VOL:/data" --entrypoint sh "$TOOLS_IMAGE" -c '
set -e
rm -f /tmp/snap.sqlite
sqlite3 -bail -readonly -cmd ".timeout 30000" "/data/$REL" "VACUUM INTO '"'"'/tmp/snap.sqlite'"'"';" >&2
cat /tmp/snap.sqlite' </dev/null >"$PARTIAL" || fail "snapshot impossible (voir l'erreur sqlite juste au-dessus : droits du dossier de données, base corrompue, ou délai de ${SNAPSHOT_TIMEOUT}s dépassé)"
  CONTAINER_NAME=''
  [ -s "$PARTIAL" ] || fail "snapshot vide"
  [ "$(head -c 15 "$PARTIAL")" = "SQLite format 3" ] || fail "snapshot sans en-tête SQLite"

  verify_file "$PARTIAL"
  chmod 600 "$PARTIAL"
  mv "$PARTIAL" "$dest"
  PARTIAL=''
  sync 2>/dev/null || true # le snapshot doit être sur disque avant que le déploiement continue
  local bytes
  bytes=$(wc -c <"$dest" | tr -d ' ')
  log "status=OK integrity_check=ok path=$dest size=$bytes bytes sha256=$V_SHA tables=$V_TABLES"

  # Rétention : seulement après une sauvegarde vérifiée ; jamais le fichier qui vient d'être écrit.
  local all total pruned=0 f
  all=$(list_snapshots)
  total=$(printf '%s\n' "$all" | grep -c . || true)
  if [ "$total" -gt "$BACKUP_KEEP" ]; then
    while IFS= read -r f; do
      [ -n "$f" ] && [ "$DIR/$f" != "$dest" ] || continue
      rm -f "$DIR/$f"
      pruned=$((pruned + 1))
    done <<<"$(printf '%s\n' "$all" | head -n "$((total - BACKUP_KEEP))")"
  fi
  log "retention: kept=$((total - pruned)) pruned=$pruned (max $BACKUP_KEEP) dir=$DIR usage=$(du -sk "$DIR" | cut -f1) Ko"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then pdb_main "$@"; fi
