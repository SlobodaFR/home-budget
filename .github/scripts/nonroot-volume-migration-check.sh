#!/bin/sh
# nonroot-volume-migration-check.sh : prouve que l'image NON ROOT reprend un volume de données cree par l'ancienne
# image root, une fois le volume rendu a l'uid 1000 (ce que fait deploy/scripts/fix-volume-owner.sh au deploiement).
# Le boot check du harnais part d'un volume vide (Docker y copie le proprietaire de l'image) : il ne voit pas ce cas.
#
# Usage : sh .github/scripts/nonroot-volume-migration-check.sh --image <image deja chargee> [--timeout 90]
#   1. volume 1 : base SQLite en WAL (-wal/-shm laisses par un arret brutal) + metadonnees Litestream imbriquees, en root ;
#      chown -R 1000:1000 (hors reseau, comme le script du harnais) ; demarrage de l'image avec MINIO_* (chemin Litestream) :
#      /healthz repond 200, aucune restauration MinIO n'a eu lieu, la ligne deja presente est relue, rien ne reste a root ;
#   2. volume 2 : meme contenu, laisse a root : l'image doit ECHOUER bruyamment (sortie du conteneur), jamais demarrer
#      sur une base en lecture seule ni restaurer par-dessus.
# Jetons : `[nonroot-volume-migration] status=OK|FAIL ...`. Tout est nettoye (conteneurs, volumes, fichier d'environnement).
set -eu

IMAGE=''
TIMEOUT=90
while [ $# -gt 0 ]; do
  case "$1" in
    --image) IMAGE="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "usage: --image <image> [--timeout s]" >&2; exit 2 ;;
  esac
done
[ -n "$IMAGE" ] || { echo "--image manquant" >&2; exit 2; }

P='[nonroot-volume-migration]'
ID="nrvm-$$"
V1="$ID-ok"
V2="$ID-root"
C1="$ID-ok"
C2="$ID-root"
ENVF=$(mktemp)
DATA=/app/backend/data

cleanup() {
  docker rm -f "$C1" "$C2" >/dev/null 2>&1 || true
  docker volume rm -f "$V1" "$V2" >/dev/null 2>&1 || true
  rm -f "$ENVF"
}
trap cleanup EXIT
fail() {
  echo "$P status=FAIL $*" >&2
  for c in "$C1" "$C2"; do docker logs --tail 40 "$c" >&2 2>&1 || true; done
  exit 1
}

hex() { openssl rand -hex 32; }
cat >"$ENVF" <<EOT
NODE_ENV=production
AUTH_SERVICE_URL=https://auth.example.test
FRONTEND_URL=https://budget.example.test
AUTH_CLIENT_ID=budget-ci
AUTH_CLIENT_SECRET=ci-dummy-client-secret
AUTH_WEBHOOK_SECRET=ci-dummy-webhook-secret
DATABASE_PATH=$DATA/budget.sqlite
MINIO_ENDPOINT=http://127.0.0.1:9
MINIO_BUCKET=ci-dummy
MINIO_REPLICA_PATH=ci
MINIO_REGION=us-east-1
MINIO_ACCESS_KEY_ID=ci-dummy
MINIO_SECRET_ACCESS_KEY=ci-dummy-secret
PERSONAL_DATA_KEY=$(hex)
PSEUDONYM_SECRET=$(hex)
EOT

# Base en WAL d'un ancien conteneur root : arret brutal (SIGKILL ; node n'est pas le PID 1, qui ignorerait le signal) => -wal et -shm restent ; metadonnees Litestream imbriquees.
SEED="
const Database = require('better-sqlite3');
const fs = require('fs');
const db = new Database('$DATA/budget.sqlite');
db.pragma('journal_mode = WAL');
db.pragma('wal_autocheckpoint = 0');
db.exec(\"CREATE TABLE ci_marker (v TEXT); INSERT INTO ci_marker VALUES ('pre-existing')\");
fs.mkdirSync('$DATA/budget.sqlite-litestream/generations/g1/wal', { recursive: true });
fs.writeFileSync('$DATA/budget.sqlite-litestream/generations/g1/wal/000.wal', 'x');
process.kill(process.pid, 'SIGKILL');
"
seed() {
  docker volume create "$1" >/dev/null
  docker run --rm --user 0 --network none -w /app/backend --entrypoint sh -v "$1:$DATA" "$IMAGE" -c 'node -e "$1"' seed "$SEED" >/dev/null 2>&1 || true
  left=$(docker run --rm --user 0 --network none --entrypoint sh -v "$1:$DATA:ro" "$IMAGE" -c "ls $DATA/budget.sqlite-wal $DATA/budget.sqlite-shm $DATA/budget.sqlite-litestream/generations/g1/wal/000.wal" 2>&1) \
    || fail "graine du volume $1 incomplete : $left"
  # Un volume neuf herite du proprietaire de l'image (node) : on le remet a root, comme le volume de production.
  docker run --rm --user 0 --network none --entrypoint chown -v "$1:$DATA" "$IMAGE" -R 0:0 "$DATA" || fail "chown root impossible"
  # Tout est a root : c'est l'etat du volume de production avant le deploiement.
  [ -z "$(docker run --rm --user 0 --network none --entrypoint find -v "$1:$DATA:ro" "$IMAGE" $DATA ! -user 0 -print -quit)" ] || fail "la graine n'est pas a root"
}
healthz() { docker exec "$1" node -e "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" >/dev/null 2>&1; }

# --- 1. volume root, rendu a 1000:1000 : doit demarrer et garder ses donnees ---
seed "$V1"
docker run --rm --user 0 --network none --entrypoint chown -v "$V1:$DATA" "$IMAGE" -R 1000:1000 "$DATA" || fail "chown impossible"
docker run -d --name "$C1" --env-file "$ENVF" -v "$V1:$DATA" "$IMAGE" >/dev/null || fail "demarrage impossible"
t=0
until healthz "$C1"; do
  t=$((t + 2))
  [ "$(docker inspect -f '{{.State.Running}}' "$C1")" = true ] || fail "le conteneur s'est arrete sur le volume migre (exit $(docker inspect -f '{{.State.ExitCode}}' "$C1"))"
  [ "$t" -lt "$TIMEOUT" ] || fail "/healthz ne repond pas en ${TIMEOUT}s sur le volume migre"
  sleep 2
done
docker logs "$C1" 2>&1 | grep -q 'Restoring database from MinIO' && fail "restauration MinIO declenchee alors que la base existait"
row=$(docker exec -w /app/backend "$C1" node -e "const D=require('better-sqlite3');const d=new D('$DATA/budget.sqlite',{readonly:true});console.log(d.prepare('SELECT v FROM ci_marker').get().v)" 2>&1) \
  || fail "relecture de la base impossible : $row"
[ "$row" = pre-existing ] || fail "la ligne preexistante est absente de la base : $row"
[ "$(docker exec "$C1" id -u)" = 1000 ] || fail "le processus ne tourne pas en uid 1000"
docker exec "$C1" sh -c "find $DATA ! -user 1000 -print -quit" | grep -q . && fail "des fichiers du volume appartiennent a un autre uid que 1000"
echo "$P migrated-volume: healthz=200 existing-row=pre-existing restore=none uid=1000"
docker rm -f "$C1" >/dev/null

# --- 2. meme volume reste a root : echec bruyant attendu ---
seed "$V2"
docker run -d --name "$C2" --env-file "$ENVF" -v "$V2:$DATA" "$IMAGE" >/dev/null || fail "demarrage impossible"
t=0
while [ "$(docker inspect -f '{{.State.Running}}' "$C2")" = true ]; do
  if healthz "$C2"; then fail "l'image a demarre sur un volume reste a root (base en lecture seule ?)"; fi
  t=$((t + 2))
  [ "$t" -lt "$TIMEOUT" ] || fail "ni sortie ni sante en ${TIMEOUT}s sur le volume reste a root"
  sleep 2
done
code=$(docker inspect -f '{{.State.ExitCode}}' "$C2")
[ "$code" != 0 ] || fail "sortie 0 sur un volume reste a root"
docker logs "$C2" 2>&1 | grep -q 'Restoring database from MinIO' && fail "restauration MinIO sur un volume reste a root"
echo "$P root-owned-volume: container exited code=$code (loud failure, no restore)"
echo "$P status=OK"
