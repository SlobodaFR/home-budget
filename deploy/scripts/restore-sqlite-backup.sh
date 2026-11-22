#!/usr/bin/env bash
# restore-sqlite-backup.sh : restaure à la main un snapshot pris par pre-deploy-backup.sh (convention `pre-deploy-backup`).
# COPIE VERBATIM depuis home-harness/scripts/restore-sqlite-backup.sh (l'audit compare les fichiers) ; elle charge
# pre-deploy-backup.sh, qui doit être dans le même dossier.
#
# À lancer par le propriétaire, sur le VPS, quand une migration ou un déploiement a abîmé la base :
#   bash /opt/<svc>/deploy/scripts/restore-sqlite-backup.sh \
#        --service <svc> --project <projet compose> --volume <clé du volume> --mount <montage> --db-path <base> \
#        --backup latest            # ou le chemin d'un fichier $HOME/backups/<svc>/<svc>-<UTC>-<sha>.sqlite
#        [--yes] [--owner auto|<uid>:<gid>] [--no-start]
# (les valeurs exactes de --service … --db-path sont celles de l'appel à pre-deploy-backup.sh dans deploy-vps.yml).
#
# Étapes (tout s'arrête au premier problème, rien n'est supprimé sans copie) :
#   1. vérifie la sauvegarde : PRAGMA integrity_check doit répondre `ok` ;
#   2. prend le verrou d'hôte /tmp/home-deploy.lock (pas de restauration pendant un déploiement) ;
#   3. arrête les conteneurs du projet Compose ;
#   4. copie l'état actuel (base, -wal, -shm) dans $BACKUP_ROOT/<svc>/prerestore-<UTC>.tar ;
#   5. copie la sauvegarde dans le volume (propriétaire : celui de la base actuelle, sinon celui du dossier de
#      données ; --owner pour forcer, p. ex. 1000:1000 sous docker-nonroot, 0:0 avant), supprime -wal/-shm/-journal et
#      met de côté le dossier de métadonnées Litestream (<base>-litestream) : Litestream repart sur une nouvelle
#      génération, les anciennes restent dans MinIO ;
#   6. remet la base en mode WAL (un snapshot VACUUM INTO est en mode « delete »), puis redémarre les conteneurs
#      arrêtés et attend qu'ils soient sains (ou qu'ils tournent) ;
#   7. relit la base restaurée dans le volume : integrity_check doit répondre `ok`.
# ATTENTION : redémarrer l'image qui vient d'abîmer la base rejoue sa migration au démarrage (migrationsRun). Après une
# mauvaise release, utiliser --no-start (conteneurs laissés arrêtés, base restaurée et vérifiée), puis redéployer le
# tag d'image PRÉCÉDENT (relancer le workflow de déploiement de ce commit, ou `IMAGE_TAG=<ancien> docker compose up -d`).
# Confirmation : --yes, ou taper « RESTORE <svc> » dans un terminal.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=pre-deploy-backup.sh
. "$HERE/pre-deploy-backup.sh"

BACKUP_ARG=''
ASSUME_YES=0
NO_START=0
OWNER='auto'
SETTLE="${RESTORE_SETTLE_SECONDS:-5}"
LOCK_FILE="${HOME_DEPLOY_LOCK:-/tmp/home-deploy.lock}"

restore_main() {
  while [ $# -gt 0 ]; do
    take_common_opt "$@"
    if [ "$OPT_SHIFT" -gt 0 ]; then
      shift "$OPT_SHIFT"
      continue
    fi
    case "$1" in
      --backup)
        [ $# -ge 2 ] || fail "--backup attend une valeur"
        BACKUP_ARG=$2
        shift 2
        ;;
      --owner)
        [ $# -ge 2 ] || fail "--owner attend une valeur"
        OWNER=$2
        shift 2
        ;;
      --yes)
        ASSUME_YES=1
        shift
        ;;
      --no-start)
        NO_START=1
        shift
        ;;
      *) fail "option inconnue : $1" ;;
    esac
  done
  [ -n "$BACKUP_ARG" ] || fail "--backup <fichier|latest> obligatoire"
  [[ $OWNER == auto || $OWNER =~ ^[0-9]+:[0-9]+$ ]] || fail "--owner : auto ou <uid>:<gid>"
  [[ $SETTLE =~ ^[0-9]+$ ]] || fail "RESTORE_SETTLE_SECONDS doit être un entier"
  validate_params
  need_docker
  trap cleanup EXIT

  # 1. La sauvegarde.
  local file
  if [ "$BACKUP_ARG" = latest ]; then
    file=$(list_snapshots | tail -1)
    [ -n "$file" ] || fail "aucune sauvegarde dans $DIR"
    file="$DIR/$file"
  else
    file=$BACKUP_ARG
  fi
  [ -f "$file" ] && [ -r "$file" ] || fail "sauvegarde illisible : $file"
  resolve_volume
  [ -n "$VOL" ] || fail "volume $PROJECT/$VOLUME_KEY introuvable : rien à restaurer (le premier démarrage restaure depuis Litestream)"
  ensure_tools
  log "vérification de la sauvegarde $file"
  verify_file "$file"
  log "sauvegarde saine : integrity_check=ok sha256=$V_SHA tables=$V_TABLES"

  # État actuel du volume : propriétaire et mode à conserver.
  local probe state uid gid mode _size _wal du dg exists=0
  probe=$(probe_volume)
  state=$(printf '%s\n' "$probe" | head -1)
  case "$state" in
    EXISTS*)
      exists=1
      read -r _ uid gid _size _wal mode du dg <<<"$state"
      ;;
    MISSING*)
      read -r _ du dg <<<"$state"
      uid=$du
      gid=$dg
      mode=644
      ;;
    *) fail "réponse inattendue de l'inspection du volume : $state" ;;
  esac
  [ "$OWNER" = auto ] && OWNER="$uid:$gid"

  local ids
  ids=$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" | tr '\n' ' ')
  log "plan : restaurer $file dans $VOL ($REL), propriétaire $OWNER, mode $mode ; conteneurs à arrêter$([ "$NO_START" -eq 1 ] || printf ' puis redémarrer') : ${ids:-aucun}"
  if [ "$ASSUME_YES" -ne 1 ]; then
    [ -t 0 ] || fail "confirmation requise : relancer avec --yes (aucun terminal pour confirmer)"
    local answer
    read -r -p "Écraser la base de $SERVICE par cette sauvegarde ? Taper « RESTORE $SERVICE » : " answer
    [ "$answer" = "RESTORE $SERVICE" ] || fail "confirmation refusée, rien n'a été modifié"
  fi

  # 2. Verrou d'hôte (aucun déploiement en cours pendant qu'on remplace la base).
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK_FILE"
    flock -w 900 9 || fail "verrou $LOCK_FILE non obtenu en 15 min (un déploiement est-il en cours ?)"
  fi

  # 3. Arrêt (liste relue sous le verrou : un déploiement a pu changer les conteneurs entre-temps).
  ids=$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" | tr '\n' ' ')
  if [ -n "${ids// /}" ]; then
    log "arrêt des conteneurs : $ids"
    # shellcheck disable=SC2086
    docker stop $ids >/dev/null || fail "arrêt des conteneurs impossible : rien n'a été modifié"
  fi

  local ts
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  umask 077
  mkdir -p "$DIR" && chmod 700 "$DIR"
  # 4. Copie de sécurité de l'état actuel (le restaurer est toujours possible).
  if [ "$exists" -eq 1 ]; then
    local safety="$DIR/prerestore-$ts.tar"
    docker run --rm --pull never --network none --user 0:0 -e "REL=$REL" -v "$VOL:/data:ro" --entrypoint sh "$TOOLS_IMAGE" -c '
cd /data && tar -cf - $(ls -d "$REL" "$REL-wal" "$REL-shm" 2>/dev/null)' </dev/null >"$safety" || {
      rm -f "$safety"
      [ "$NO_START" -eq 1 ] || restart_containers "$ids"
      fail "copie de sécurité de l'état actuel impossible : rien n'a été modifié"
    }
    chmod 600 "$safety"
    log "état actuel conservé dans $safety"
  fi

  # 5. Remplacement : écrit à côté puis renomme (atomique) ; pas de -wal/-shm périmés.
  docker run --rm -i --pull never --network none --user 0:0 -e "REL=$REL" -e "OWNER=$OWNER" -e "MODE=$mode" -e "TS=$ts" -v "$VOL:/data" --entrypoint sh "$TOOLS_IMAGE" -c '
set -e
cat > "/data/$REL.restore-tmp"
chown "$OWNER" "/data/$REL.restore-tmp"
chmod "$MODE" "/data/$REL.restore-tmp"
rm -f "/data/$REL-wal" "/data/$REL-shm" "/data/$REL-journal"
if [ -d "/data/$REL-litestream" ]; then mv "/data/$REL-litestream" "/data/$REL-litestream.prerestore-$TS"; fi
mv "/data/$REL.restore-tmp" "/data/$REL"
sync' <"$file" || {
    [ "$NO_START" -eq 1 ] || restart_containers "$ids"
    fail "remplacement de la base impossible : l'ancien état est dans ${safety:-aucune copie (pas de base avant)}"
  }

  # 6. Mode WAL (propriétaire de la base, pour ne créer aucun -wal/-shm root), puis redémarrage.
  docker run --rm --pull never --network none --user "$OWNER" -e "REL=$REL" -v "$VOL:/data" --entrypoint sh "$TOOLS_IMAGE" -c 'sqlite3 "/data/$REL" "PRAGMA journal_mode=WAL;" >/dev/null' </dev/null \
    || log "avertissement : passage en mode WAL impossible (l'application ou Litestream le fera au démarrage)"
  if [ "$NO_START" -eq 1 ]; then
    log "--no-start : conteneurs laissés arrêtés (${ids:-aucun}). Redéployer le tag d'image PRÉCÉDENT, ou : docker start ${ids:-<conteneurs>}"
  else
    restart_containers "$ids"
    wait_settled "$ids"
  fi

  # 7. Relecture dans le volume.
  local after
  after=$(docker run --rm --pull never --network none --user "${OWNER}" -e "REL=$REL" -v "$VOL:/data" --entrypoint sh "$TOOLS_IMAGE" -c '
echo "INTEGRITY $(sqlite3 -readonly "/data/$REL" "PRAGMA integrity_check;" 2>&1 | head -3 | tr "\n" " ")"
echo "TABLES $(sqlite3 -readonly "/data/$REL" .tables 2>/dev/null | wc -w)"' </dev/null) || fail "relecture de la base restaurée impossible"
  [ "$(printf '%s\n' "$after" | sed -n 's/^INTEGRITY //p' | sed 's/ *$//')" = ok ] || fail "la base restaurée échoue à integrity_check : $after"
  log "status=RESTORE_OK integrity_check=ok from=$file owner=$OWNER tables=$(printf '%s\n' "$after" | sed -n 's/^TABLES //p') containers_started=$([ "$NO_START" -eq 1 ] && echo 0 || printf '%s' "$ids" | wc -w | tr -d ' ')"
}

restart_containers() {
  [ -n "${1// /}" ] || return 0
  # shellcheck disable=SC2086
  docker start $1 >/dev/null || fail "redémarrage des conteneurs impossible : les démarrer à la main (docker start $1)"
}

# Attend les conteneurs : « healthy » s'ils ont un HEALTHCHECK, sinon « running » après SETTLE secondes sans redémarrage.
wait_settled() {
  [ -n "${1// /}" ] || return 0
  local id deadline status
  for id in $1; do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id")
    if [ "$status" = none ]; then
      sleep "$SETTLE"
      [ "$(docker inspect -f '{{.State.Running}}' "$id")" = true ] || fail "le conteneur $id ne tourne plus après la restauration"
    else
      deadline=$((SECONDS + 120))
      while [ "$(docker inspect -f '{{.State.Health.Status}}' "$id")" != healthy ]; do
        [ "$SECONDS" -lt "$deadline" ] || fail "le conteneur $id n'est pas sain 120 s après la restauration (la base est restaurée ; voir docker logs $id)"
        sleep 2
      done
    fi
  done
}

restore_main "$@"
