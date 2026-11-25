#!/bin/sh
# docker-boot-check.sh : démarre l'image construite par la CI et vérifie qu'elle DÉMARRE vraiment.
# Convention du harnais `docker-boot-check` (home-harness, CONVENTIONS.md v1.9).
# COPIE VERBATIM depuis home-harness/scripts/docker-boot-check.sh : ne jamais modifier la copie d'un repo
# (l'audit compare les deux fichiers). Un changement se fait dans le harnais.
#
# Pourquoi : `docker-build-check` ne fait que CONSTRUIRE l'image. Un module absent de l'étage final (ex. `nestjs-pino` rangé sous
# `backend/node_modules/` alors que le Dockerfile ne copie que `/app/node_modules`) donne une image qui se construit et plante au
# démarrage (« Cannot find module ») : la CI est verte, le déploiement rouge.
#
# Usage (dans le job CI, APRÈS `docker/build-push-action` avec `load: true` et `tags: <svc>:ci`) :
#   sh .github/scripts/docker-boot-check.sh --service <svc> --image <svc>:ci [--env-file f] [--env K=V ...] [--secret NOM ...] \
#        [--rsa-keypair PRIV:PUB] [--path /healthz | --no-http] [--port 3000] [--volume /app/backend/data] \
#        [--expect /chemin=statut ...] [--forbid /chemin ... | --forbid-ts] [--sidecar image=alias ...] [--timeout 120] [--settle 10] [--log-lines 100] [--rm-image]
#
# Arguments (forme `--flag=valeur` acceptée) :
#   --service <svc>        nom du service (journal, noms des ressources temporaires).
#   --image <réf>          image DÉJÀ chargée dans le démon local (`load: true`).
#   --env-file <fichier>   fichier KEY=VALUE (généré par le workflow : valeurs factices) ajouté à l'environnement du conteneur.
#   --env K=V              variable factice supplémentaire (répétable). JAMAIS un vrai secret : la valeur figure dans la CI.
#   --secret NOM           NOM = 64 caractères hexadécimaux aléatoires jetables (openssl rand -hex 32), répétable.
#   --rsa-keypair P:Q      paire RSA 2048 jetable, PEM encodés en base64 sur une ligne, dans les variables P (privée) et Q (publique).
#   --path <chemin>        sonde HTTP de disponibilité : GET http://127.0.0.1:<port><chemin> DANS le conteneur (docker exec avec l'outil
#                          de l'image : fetch de Node, urllib de Python ou curl) jusqu'à un 2xx. Peut s'ajouter au HEALTHCHECK de l'image.
#   --no-http              service sans HTTP (worker, connecteur) : seul l'état du conteneur est surveillé pendant --settle.
#                          Obligatoire si l'image n'a ni HEALTHCHECK ni --path (sinon erreur d'arguments : jamais un « vert » vide).
#   --port <n>             port HTTP DANS le conteneur (défaut 3000). Rien n'est publié sur l'hôte : aucun conflit de port entre
#                          jobs concurrents, quel que soit l'exécuteur (runner dans un conteneur, socket Docker de la VM).
#   --volume <chemin>      volume de données jetable monté à ce chemin du conteneur (créé, puis supprimé).
#   --expect <chemin>=<s>  sonde supplémentaire après le démarrage : le statut HTTP de GET <chemin> doit valoir <s> (répétable ;
#                          ex. `/healthz=200`, `/api/inconnu=404`). Les redirections ne sont pas suivies.
#   --forbid <chemin>      chemin ABSOLU qui ne doit PAS exister dans l'image (répétable ; test dans le conteneur, après la fenêtre
#                          d'observation). `--forbid-ts` = raccourci des défauts pour un service Node : /app/node_modules/typescript et
#                          /app/node_modules/@typescript (un override de dépendance, ex. @nestjs/swagger 12 -> typescript ^7, les garde après
#                          `npm prune --omit=dev` : ~30 Mo de TypeScript et tsgo embarqués en production).
#   --sidecar <img>=<alias> dépendance lancée sur un réseau jetable commun, jointe sous le nom <alias> (ex. `nats:2-alpine=nats` avec
#                          `--env NATS_URL=nats://nats:4222`). Doit rester en vie ; répétable.
#   --timeout <s>          délai pour devenir sain (défaut : $BOOT_TIMEOUT, sinon 120).
#   --settle <s>           fenêtre d'observation après le premier verdict sain (défaut : $BOOT_SETTLE, sinon 10) : un conteneur qui
#                          sort, redémarre ou devient `unhealthy` pendant cette fenêtre fait échouer la vérification.
#   --log-lines <n>        lignes de journal affichées en cas d'échec (défaut 100).
#   --rm-image             supprime l'image <réf> à la fin (exécuteur auto-hébergé : évite d'accumuler les images `:ci`).
# Étiquette d'image : utiliser une étiquette UNIQUE par run (`<svc>:ci-${{ github.run_id }}-${{ github.run_attempt }}`), le démon est partagé.
# Variable réservée aux tests du harnais : BOOT_SETTLE_MIN (plancher de --settle avec --no-http, 5) ; l'audit refuse sa présence dans ci.yml.
# Variable : BOOT_POLL_INTERVAL (secondes, défaut 2, décimales acceptées) = pas d'échantillonnage.
#
# Déroulé : volume jetable -> `docker run -d --restart on-failure:5 --health-interval 2s` (une boucle de
# plantage devient un RestartCount > 0 ; bornée à 5 essais : pas d'orphelin infini si le job est tué) -> attente (HEALTHCHECK de l'image `healthy` et/ou --path en 2xx) -> fenêtre d'observation
# -> sondes --expect -> verdict. Échec : conteneur sorti (code), redémarré, `unhealthy`, délai dépassé, statut inattendu ; les
# dernières lignes du journal sont affichées. TOUJOURS nettoyé (conteneur, sidecars, réseau, volume, fichiers temporaires), même en
# cas d'échec, de CTRL-C ou de signal TERM. Les noms des ressources sont uniques par exécution (PID + horloge) : des jobs concurrents
# sur le même hôte ne se marchent pas dessus.
#
# Limites : une image sans node, python, python3 ni curl ne peut pas être sondée en HTTP : HEALTHCHECK de l'image ou --no-http ; un plantage APRÈS la fenêtre d'observation n'est pas vu ; l'environnement factice ne prouve pas que les secrets de
# production sont valides (c'est l'objet de la validation d'environnement et du déploiement).
#
# Sortie (jeton stable à chercher dans le journal) : `[docker-boot-check] <svc>: status=OK mode=<health|http|health+http|none>
# healthy_after=<s>s settle=<s>s probes=<n>` ou `[docker-boot-check] <svc>: status=FAIL reason="…"`. Codes : 0 vert, 1 échec,
# 2 erreur d'arguments. POSIX sh.
set -u

PREFIX='[docker-boot-check]'
SERVICE=''
IMAGE=''
ENVFILE=''
ENVS=''
SECRETS=''
RSAS=''
PROBE_PATH=''
NO_HTTP=0
PORT=3000
MOUNT=''
EXPECTS=''
FORBIDS=''
SIDECARS=''
TIMEOUT="${BOOT_TIMEOUT:-120}"
SETTLE="${BOOT_SETTLE:-10}"
LOG_LINES=100
RM_IMAGE=0
POLL="${BOOT_POLL_INTERVAL:-2}"
NL='
'

log() { printf '%s %s: %s\n' "$PREFIX" "${SERVICE:-?}" "$*"; }
usage() {
  printf 'Usage : sh docker-boot-check.sh --service <svc> --image <image> [--env-file f] [--env K=V] [--secret NOM] [--rsa-keypair PRIV:PUB] [--path /healthz | --no-http] [--port 3000] [--volume /chemin] [--expect /chemin=statut] [--forbid /chemin | --forbid-ts] [--sidecar image=alias] [--timeout 120] [--settle 10] [--log-lines 100] [--rm-image]\n' >&2
  exit 2
}
die() {
  printf '%s %s: erreur d arguments : %s\n' "$PREFIX" "${SERVICE:-?}" "$*" >&2
  exit 2
}
is_number() { case "$1" in '' | *[!0-9]*) return 1 ;; *) return 0 ;; esac; }
is_poll() { case "$1" in '' | *[!0-9.]* | *.*.* | . ) return 1 ;; *) return 0 ;; esac; }
is_name() { case "$1" in '' | -* | *[!A-Za-z0-9_.-]*) return 1 ;; *) return 0 ;; esac; }
is_var() { case "$1" in '' | [0-9]* | *[!A-Za-z0-9_]*) return 1 ;; *) return 0 ;; esac; }
is_image() { case "$1" in '' | -* | *[!A-Za-z0-9_./:@-]*) return 1 ;; *) return 0 ;; esac; }
is_path() { case "$1" in /*) ;; *) return 1 ;; esac; case "$1" in *[!A-Za-z0-9/_.~%?'&'=:@+,';'-]*) return 1 ;; *) return 0 ;; esac; }
is_mount() { case "$1" in /*) ;; *) return 1 ;; esac; case "$1" in *[!A-Za-z0-9/_.-]*) return 1 ;; *) return 0 ;; esac; }

while [ $# -gt 0 ]; do
  case "$1" in --*=*) a="$1"; shift; set -- "${a%%=*}" "${a#*=}" "$@" ;; esac
  case "$1" in
    --service) [ $# -ge 2 ] || usage; SERVICE="$2"; shift 2 ;;
    --image) [ $# -ge 2 ] || usage; IMAGE="$2"; shift 2 ;;
    --env-file) [ $# -ge 2 ] || usage; ENVFILE="$2"; shift 2 ;;
    --env) [ $# -ge 2 ] || usage; ENVS="$ENVS$2$NL"; shift 2 ;;
    --secret) [ $# -ge 2 ] || usage; SECRETS="$SECRETS$2$NL"; shift 2 ;;
    --rsa-keypair) [ $# -ge 2 ] || usage; RSAS="$RSAS$2$NL"; shift 2 ;;
    --path) [ $# -ge 2 ] || usage; PROBE_PATH="$2"; shift 2 ;;
    --no-http) NO_HTTP=1; shift ;;
    --port) [ $# -ge 2 ] || usage; PORT="$2"; shift 2 ;;
    --volume) [ $# -ge 2 ] || usage; MOUNT="$2"; shift 2 ;;
    --expect) [ $# -ge 2 ] || usage; EXPECTS="$EXPECTS$2$NL"; shift 2 ;;
    --forbid) [ $# -ge 2 ] || usage; FORBIDS="$FORBIDS$2$NL"; shift 2 ;;
    --forbid-ts) FORBIDS="$FORBIDS/app/node_modules/typescript$NL/app/node_modules/@typescript$NL"; shift ;;
    --sidecar) [ $# -ge 2 ] || usage; SIDECARS="$SIDECARS$2$NL"; shift 2 ;;
    --timeout) [ $# -ge 2 ] || usage; TIMEOUT="$2"; shift 2 ;;
    --settle) [ $# -ge 2 ] || usage; SETTLE="$2"; shift 2 ;;
    --log-lines) [ $# -ge 2 ] || usage; LOG_LINES="$2"; shift 2 ;;
    --rm-image) RM_IMAGE=1; shift ;;
    -h | --help) usage ;;
    *) usage ;;
  esac
done

is_name "$SERVICE" || die "--service manquant ou invalide"
is_image "$IMAGE" || die "--image manquant ou invalide (image déjà chargée : build-push-action avec load: true)"
[ -z "$ENVFILE" ] || [ -f "$ENVFILE" ] || die "--env-file introuvable : $ENVFILE"
[ -z "$ENVFILE" ] || ! grep -Evq '^([A-Za-z_][A-Za-z0-9_]*=.*|#.*|[[:space:]]*)$' "$ENVFILE" || die "--env-file : chaque ligne doit être NOM=VALEUR, un commentaire ou vide (un NOM seul importerait la variable de l'hôte)"
is_number "$PORT" && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "--port invalide"
is_number "$TIMEOUT" && [ "$TIMEOUT" -ge 1 ] || die "--timeout doit être un entier >= 1"
is_number "$SETTLE" || die "--settle doit être un entier >= 0"
is_number "${BOOT_SETTLE_MIN:-5}" || die "BOOT_SETTLE_MIN doit être un entier (réservé aux tests du harnais, ne jamais le régler en CI)"
[ "$NO_HTTP" = 0 ] || [ "$SETTLE" -ge "${BOOT_SETTLE_MIN:-5}" ] || die "--no-http n'observe que l'état du conteneur : --settle >= ${BOOT_SETTLE_MIN:-5} exigé (un vert sans attente serait vide)"
is_number "$LOG_LINES" || die "--log-lines doit être un entier"
is_poll "$POLL" || die "BOOT_POLL_INTERVAL invalide"
[ -z "$MOUNT" ] || is_mount "$MOUNT" || die "--volume doit être un chemin absolu simple"
[ -z "$PROBE_PATH" ] || is_path "$PROBE_PATH" || die "--path invalide (chemin absolu, caractères d'URL simples)"
[ -z "$PROBE_PATH" ] || [ "$NO_HTTP" = 0 ] || die "--path et --no-http s'excluent"
printf '%s' "$ENVS" | while IFS= read -r kv; do
  [ -n "$kv" ] || continue
  is_var "${kv%%=*}" && case "$kv" in *=*) true ;; *) false ;; esac || exit 1
done || die "--env attend NOM=VALEUR (NOM : lettres, chiffres, _)"
printf '%s' "$SECRETS" | while IFS= read -r n; do [ -z "$n" ] || is_var "$n" || exit 1; done || die "--secret attend un NOM de variable valide"
printf '%s' "$RSAS" | while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in *:*) is_var "${p%%:*}" && is_var "${p#*:}" || exit 1 ;; *) exit 1 ;; esac
done || die "--rsa-keypair attend PRIVEE:PUBLIQUE (deux noms de variables valides)"
printf '%s' "$EXPECTS" | while IFS= read -r e; do
  [ -n "$e" ] || continue
  case "$e" in *=*) ;; *) exit 1 ;; esac
  is_path "${e%=*}" && case "${e##*=}" in [1-5][0-9][0-9]) true ;; *) false ;; esac || exit 1
done || die "--expect attend <chemin>=<statut HTTP à 3 chiffres>"
printf '%s' "$FORBIDS" | while IFS= read -r f; do [ -z "$f" ] || { case "$f" in /*) ;; *) exit 1 ;; esac; case "$f" in *[!A-Za-z0-9/_.@-]*) exit 1 ;; esac; }; done || die "--forbid attend un chemin absolu simple (lettres, chiffres, / _ . @ -)"
printf '%s' "$SIDECARS" | while IFS= read -r s; do
  [ -n "$s" ] || continue
  case "$s" in *=*) is_image "${s%=*}" && is_name "${s##*=}" || exit 1 ;; *) exit 1 ;; esac
done || die "--sidecar attend <image>=<alias>"

command -v docker >/dev/null 2>&1 || {
  log "status=FAIL reason=\"docker introuvable\""
  exit 1
}

RUN_ID="$$-$(date +%s)"
C="dbc-$SERVICE-$RUN_ID"
V="dbc-$SERVICE-$RUN_ID"
NET="dbc-$SERVICE-$RUN_ID"
T=''
HAS_VOLUME=0
HAS_NET=0
STARTED_C=0
SIDE_NAMES=''
VERDICT=''

cleanup() {
  trap - EXIT INT TERM HUP
  [ "$STARTED_C" = 0 ] || docker rm -f -v "$C" >/dev/null 2>&1
  for sn in $SIDE_NAMES; do docker rm -f -v "$sn" >/dev/null 2>&1; done
  [ "$HAS_NET" = 0 ] || docker network rm "$NET" >/dev/null 2>&1
  [ "$HAS_VOLUME" = 0 ] || docker volume rm -f "$V" >/dev/null 2>&1
  [ "$RM_IMAGE" = 0 ] || docker image rm "$IMAGE" >/dev/null 2>&1
  [ -z "$T" ] || rm -rf "$T"
}
trap 'cleanup' EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM HUP

finish_fail() {
  reason=$(printf '%s' "$*" | tr -d '"\n' )
  log "le conteneur a échoué : $reason"
  if [ "$STARTED_C" = 1 ]; then
    printf '%s %s: --- les %s dernières lignes du journal de %s ---\n' "$PREFIX" "$SERVICE" "$LOG_LINES" "$C"
    docker logs --tail "$LOG_LINES" "$C" 2>&1
    printf '%s %s: --- fin du journal ---\n' "$PREFIX" "$SERVICE"
  fi
  for sn in $SIDE_NAMES; do
    docker inspect -f '{{.State.Status}}' "$sn" >/dev/null 2>&1 || continue
    printf '%s %s: --- journal de la dépendance %s ---\n' "$PREFIX" "$SERVICE" "$sn"
    docker logs --tail 20 "$sn" 2>&1
  done
  log "status=FAIL reason=\"$reason\""
  exit 1
}

now() { date +%s; }

# --- environnement du conteneur : un fichier temporaire 0600, jamais d'argument de ligne de commande ---
T=$(mktemp -d 2>/dev/null) || {
  log "status=FAIL reason=\"mktemp a échoué\""
  exit 1
}
chmod 700 "$T"
: >"$T/env"
chmod 600 "$T/env"
[ -z "$ENVFILE" ] || cat "$ENVFILE" >>"$T/env"
[ -z "$ENVFILE" ] || [ -z "$(tail -c1 "$ENVFILE")" ] || printf '\n' >>"$T/env"
printf '%s' "$ENVS" >>"$T/env"
random_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32; else od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; fi
}
printf '%s' "$SECRETS" | while IFS= read -r n; do
  [ -n "$n" ] || continue
  printf '%s=%s\n' "$n" "$(random_hex)" >>"$T/env"
done
if [ -n "$RSAS" ]; then
  command -v openssl >/dev/null 2>&1 || finish_fail "openssl introuvable : --rsa-keypair impossible"
  openssl genrsa -out "$T/rsa.pem" 2048 >/dev/null 2>&1 && openssl rsa -in "$T/rsa.pem" -pubout -out "$T/rsa.pub" >/dev/null 2>&1 \
    || finish_fail "génération de la paire RSA impossible"
  priv=$(base64 <"$T/rsa.pem" | tr -d '\n')
  pub=$(base64 <"$T/rsa.pub" | tr -d '\n')
  printf '%s' "$RSAS" | while IFS= read -r p; do
    [ -n "$p" ] || continue
    printf '%s=%s\n%s=%s\n' "${p%%:*}" "$priv" "${p#*:}" "$pub" >>"$T/env"
  done
fi

# --- ressources jetables ---
EXTRA=''
if [ -n "$SIDECARS" ]; then
  docker network create "$NET" >/dev/null 2>&1 || finish_fail "création du réseau jetable impossible"
  HAS_NET=1
  i=0
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    i=$((i + 1))
    sn="$C-side$i"
    SIDE_NAMES="$SIDE_NAMES $sn"
    docker run -d --name "$sn" --label com.slobodafr.docker-boot-check=1 --network "$NET" --network-alias "${s##*=}" "${s%=*}" >/dev/null 2>"$T/side.err" \
      || finish_fail "dépendance ${s%=*} non démarrée : $(head -n 1 "$T/side.err")"
  done <<EOF
$SIDECARS
EOF
  EXTRA="--network $NET"
fi
VOLARG=''
if [ -n "$MOUNT" ]; then
  docker volume create "$V" >/dev/null 2>&1 || finish_fail "création du volume jetable impossible"
  HAS_VOLUME=1
  VOLARG="-v $V:$MOUNT"
fi

HC=$(docker image inspect -f '{{if .Config.Healthcheck}}{{if .Config.Healthcheck.Test}}{{index .Config.Healthcheck.Test 0}}{{end}}{{end}}' "$IMAGE" 2>"$T/inspect.err") \
  || finish_fail "image $IMAGE introuvable dans le démon local ($(head -n 1 "$T/inspect.err")) : build-push-action avec load: true ?"
case "$HC" in '' | NONE) HAS_HC=0 ;; *) HAS_HC=1 ;; esac
if [ "$HAS_HC" = 0 ] && [ -z "$PROBE_PATH" ] && [ "$NO_HTTP" = 0 ]; then
  die "l'image n'a pas de HEALTHCHECK : donner --path <chemin> (sonde HTTP) ou --no-http (service sans HTTP) ; jamais de vérification vide"
fi
MODE=none
[ "$HAS_HC" = 0 ] || MODE=health
[ -z "$PROBE_PATH" ] || { if [ "$MODE" = health ]; then MODE=health+http; else MODE=http; fi; }

log "démarrage de $IMAGE mode=$MODE timeout=${TIMEOUT}s settle=${SETTLE}s"
# shellcheck disable=SC2086 # $EXTRA et $VOLARG : options sans espace dans leurs valeurs
if ! docker run -d --name "$C" --restart on-failure:5 --health-interval 2s --env-file "$T/env" \
  --label com.slobodafr.docker-boot-check=1 $EXTRA $VOLARG "$IMAGE" >"$T/run.out" 2>"$T/run.err"; then
  finish_fail "docker run a échoué : $(head -n 1 "$T/run.err")"
fi
STARTED_C=1

# Sonde HTTP exécutée DANS le conteneur (rien n'est publié). Le premier outil trouvé dans l'image : node (fetch), python3 / python
# (urllib), curl. Redirections non suivies : le statut est celui de la réponse elle-même.
PROBE_NODE='fetch(process.argv[1],{redirect:"manual",signal:AbortSignal.timeout(5000)}).then((r)=>{process.stdout.write(String(r.status))},()=>{process.stdout.write("ERR")})'
PROBE_PY='import sys, urllib.request, urllib.error
class N(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None
try:
    sys.stdout.write(str(urllib.request.build_opener(N).open(sys.argv[1], timeout=5).status))
except urllib.error.HTTPError as e:
    sys.stdout.write(str(e.code))
except Exception:
    sys.stdout.write("ERR")'
PROBER=''
HTTP_CODE=''
# Résultat dans $HTTP_CODE (jamais dans une substitution de commande : un échec fatal doit sortir du script, pas d'un sous-shell).
http_status() {
  if [ -z "$PROBER" ]; then
    PROBER=$(docker exec "$C" sh -c 'for b in node python3 python curl; do command -v "$b" >/dev/null 2>&1 && { echo "$b"; exit 0; }; done; echo none' 2>/dev/null) || PROBER=''
    if [ -z "$PROBER" ]; then
      # Image sans `sh` (distroless) : essai direct de chaque outil.
      for b in node python3 python; do
        if docker exec "$C" "$b" --version >/dev/null 2>&1; then PROBER=$b; break; fi
      done
    fi
    case "$PROBER" in
      node | python3 | python | curl) ;;
      none) finish_fail "aucun outil de sonde HTTP dans l'image (node, python3, python, curl) : HEALTHCHECK de l'image ou --no-http" ;;
      *) PROBER=''; HTTP_CODE=ERR; return ;;
    esac
  fi
  case "$PROBER" in
    node) out=$(docker exec "$C" node -e "$PROBE_NODE" "http://127.0.0.1:$PORT$1" 2>/dev/null) || out=ERR ;;
    curl)
      out=$(docker exec "$C" curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$PORT$1" 2>/dev/null) || out=ERR
      [ "$out" != 000 ] || out=ERR
      ;;
    *) out=$(docker exec "$C" "$PROBER" -c "$PROBE_PY" "http://127.0.0.1:$PORT$1" 2>/dev/null) || out=ERR ;;
  esac
  HTTP_CODE=${out:-ERR}
}

UNHEALTHY_FATAL=0
ST='' EXITC='' RESTARTS='' STARTED='' HEALTH='' PROBLEM='' FIRST_STARTED=''
refresh() {
  PROBLEM=''
  info=$(docker inspect -f '{{.State.Status}}|{{.State.ExitCode}}|{{.RestartCount}}|{{.State.StartedAt}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$C" 2>/dev/null) || {
    PROBLEM="conteneur introuvable (supprimé ou démon injoignable)"
    return
  }
  ST=${info%%|*}
  rest=${info#*|}
  EXITC=${rest%%|*}
  rest=${rest#*|}
  RESTARTS=${rest%%|*}
  rest=${rest#*|}
  STARTED=${rest%%|*}
  HEALTH=${rest#*|}
  [ -n "$FIRST_STARTED" ] || FIRST_STARTED="$STARTED"
  case "$ST" in
    exited | dead) PROBLEM="le conteneur s'est arrêté (état $ST, code de sortie $EXITC)"; return ;;
    restarting) PROBLEM="le conteneur redémarre en boucle (dernier code de sortie $EXITC)"; return ;;
  esac
  is_number "$RESTARTS" || RESTARTS=0
  if [ "$RESTARTS" != 0 ]; then
    PROBLEM="le conteneur a redémarré (RestartCount=$RESTARTS, dernier code de sortie $EXITC)"
    return
  fi
  if [ "$STARTED" != "$FIRST_STARTED" ]; then
    PROBLEM="le conteneur a redémarré (StartedAt a changé)"
    return
  fi
  if [ "$HEALTH" = unhealthy ] && [ "$UNHEALTHY_FATAL" = 1 ]; then
    PROBLEM="le HEALTHCHECK de l'image est unhealthy"
    return
  fi
  for sn in $SIDE_NAMES; do
    sst=$(docker inspect -f '{{.State.Status}}' "$sn" 2>/dev/null) || sst=absent
    [ "$sst" = running ] || { PROBLEM="la dépendance $sn n'est plus en vie (état $sst)"; return; }
  done
}

# --- attente du premier verdict sain ---
DEADLINE=$(($(now) + TIMEOUT))
BOOT_START=$(now)
HEALTHY_AFTER=0
if [ "$MODE" != none ]; then
  http_note=''
  while :; do
    refresh
    [ -z "$PROBLEM" ] || finish_fail "$PROBLEM"
    ok=1
    if [ "$HAS_HC" = 1 ] && [ "$HEALTH" != healthy ]; then ok=0; fi
    if [ "$ok" = 1 ] && [ -n "$PROBE_PATH" ]; then
      http_status "$PROBE_PATH"
      code=$HTTP_CODE
      http_note="GET $PROBE_PATH -> $code"
      case "$code" in 2[0-9][0-9]) ;; *) ok=0 ;; esac
    fi
    [ "$ok" = 0 ] || break
    if [ "$(now)" -ge "$DEADLINE" ]; then
      finish_fail "jamais sain après ${TIMEOUT}s (health=$HEALTH${http_note:+, $http_note})"
    fi
    sleep "$POLL"
  done
  HEALTHY_AFTER=$(($(now) - BOOT_START))
  log "sain après ${HEALTHY_AFTER}s (health=$HEALTH${http_note:+, $http_note})"
fi

UNHEALTHY_FATAL=1
# --- fenêtre d'observation : un conteneur qui plante juste après le premier verdict sain ne passe pas ---
SETTLE_END=$(($(now) + SETTLE))
while [ "$(now)" -lt "$SETTLE_END" ]; do
  sleep "$POLL"
  refresh
  [ -z "$PROBLEM" ] || finish_fail "$PROBLEM (pendant la fenêtre d'observation de ${SETTLE}s)"
done
refresh
[ -z "$PROBLEM" ] || finish_fail "$PROBLEM"
case "$ST" in running) ;; *) finish_fail "le conteneur n'est pas en cours d'exécution (état $ST)" ;; esac

# --- chemins interdits dans l'image (ex. typescript embarqué par un override de dépendance après `npm prune --omit=dev`) ---
FOUND=''
while IFS= read -r f; do
  [ -n "$f" ] || continue
  # Verdict sur la SORTIE (`docker exec` rend 1 aussi quand le conteneur est arrêté ou le démon injoignable : rc seul = faux « absent »).
  res=$(docker exec "$C" sh -c 'if test -e "$1"; then echo present; else echo absent; fi' sh "$f" 2>/dev/null)
  case $res in
    present) FOUND="$FOUND${FOUND:+, }$f" ;;
    absent) ;;
    *) finish_fail "impossible de vérifier --forbid $f dans le conteneur (docker exec ou sh indisponible)" ;;
  esac
done <<EOF
$FORBIDS
EOF
[ -z "$FOUND" ] || finish_fail "chemin(s) interdit(s) présent(s) dans l'image : $FOUND"

# --- sondes supplémentaires ---
PROBES=0
MISMATCH=''
while IFS= read -r e; do
  [ -n "$e" ] || continue
  p="${e%=*}"
  want="${e##*=}"
  http_status "$p"
  got=$HTTP_CODE
  PROBES=$((PROBES + 1))
  if [ "$got" = "$want" ]; then
    log "sonde GET $p -> $got (attendu $want)"
  else
    log "sonde GET $p -> $got (attendu $want) : ÉCART"
    MISMATCH="$MISMATCH${MISMATCH:+, }GET $p a répondu $got au lieu de $want"
  fi
done <<EOF
$EXPECTS
EOF
[ -z "$MISMATCH" ] || finish_fail "sonde(s) en écart : $MISMATCH"
refresh
[ -z "$PROBLEM" ] || finish_fail "$PROBLEM (après les sondes)"

log "status=OK mode=$MODE healthy_after=${HEALTHY_AFTER}s settle=${SETTLE}s probes=$PROBES"
exit 0
