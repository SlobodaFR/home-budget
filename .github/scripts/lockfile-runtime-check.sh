#!/bin/sh
# lockfile-runtime-check.sh : refuse un package-lock.json dont des paquets de PRODUCTION sont rangés sous le node_modules d'un workspace
# alors que l'étage final du Dockerfile ne copie que /app/node_modules. Garde-fou statique, sans Docker, de la convention du harnais
# `docker-boot-check` (home-harness, CONVENTIONS.md v1.9) ; le démarrage réel est vérifié par docker-boot-check.sh.
# COPIE VERBATIM depuis home-harness/scripts/lockfile-runtime-check.sh : ne jamais modifier la copie d'un repo
# (l'audit compare les deux fichiers). Un changement se fait dans le harnais.
#
# Cause : quand deux workspaces demandent des versions incompatibles d'un paquet (ex. une montée de Nest), npm laisse l'une à la
# racine et range l'autre sous `<workspace>/node_modules/<paquet>`. Un Dockerfile qui fait `npm prune --omit=dev` puis
# `COPY --from=… /app/node_modules` n'emporte PAS `/app/backend/node_modules` : le paquet manque dans l'image, qui se construit et
# plante au démarrage (« Cannot find module »). Le `docker-build-check` seul ne le voit pas.
#
# Usage (racine du dépôt, avant ou après le build) :
#   sh .github/scripts/lockfile-runtime-check.sh --service <svc> --dockerfile <Dockerfile> --workspace <dossier> [--workspace <dossier> ...] \
#        [--lockfile package-lock.json]
#
#   --service <svc>        nom du service (journal).
#   --dockerfile <chemin>  Dockerfile de l'image ; seul son DERNIER étage (`FROM`) compte : c'est ce que l'image contient.
#   --workspace <dossier>  workspace npm que l'image EXÉCUTE (ex. `backend`, `llm-app`), à répéter. Un workspace construit puis
#                          abandonné (le `frontend` compilé par Vite, copié en `dist`) n'en fait pas partie.
#   --lockfile <chemin>    défaut `package-lock.json` (lockfileVersion 2 ou 3, mis en forme par npm).
#
# Règle : pour chaque workspace donné, tout paquet du lock sous `<workspace>/node_modules/` qui n'est pas `dev: true` est un
# paquet d'exécution rangé hors de `/app/node_modules`. C'est un échec, SAUF si le dernier étage du Dockerfile
#   - copie ce dossier (`COPY … /app/<workspace>/node_modules …`, ou tout `/app/<workspace>` / `/app`), ou
#   - (un `npm install -g` ne compte pas),
#   - installe lui-même ses dépendances (`RUN npm ci|install` dans l'étage final).
# `devOptional` compte comme paquet d'exécution (il est installé avec `--omit=dev` quand l'optionnel est retenu).
#
# Corriger : aligner les versions demandées par les workspaces (le plus souvent la cause), puis
# `rm -rf node_modules */node_modules && npm install` (régénère le lock) et relire ; en dernier recours copier le dossier du
# workspace dans l'étage final.
#
# Limite : lecture du lock par motifs (indentation d'npm, 2 espaces) ; il ne prouve pas que le Dockerfile contient les bons paquets,
# seulement l'absence de ce piège. Sortie (jeton stable) : `[lockfile-runtime-check] <svc>: status=OK|FAIL workspaces=<liste>
# offenders=<n>`. Codes : 0 vert, 1 échec, 2 erreur d'arguments. POSIX sh (awk).
set -u

PREFIX='[lockfile-runtime-check]'
SERVICE=''
LOCK='package-lock.json'
DOCKERFILE=''
WORKSPACES=''
NL='
'

log() { printf '%s %s: %s\n' "$PREFIX" "${SERVICE:-?}" "$*"; }
usage() {
  printf 'Usage : sh lockfile-runtime-check.sh --service <svc> --dockerfile <Dockerfile> --workspace <dossier> [--workspace <dossier> ...] [--lockfile package-lock.json]\n' >&2
  exit 2
}
die() {
  printf '%s %s: erreur d arguments : %s\n' "$PREFIX" "${SERVICE:-?}" "$*" >&2
  exit 2
}
is_name() { case "$1" in '' | -* | *[!A-Za-z0-9_.-]*) return 1 ;; *) return 0 ;; esac; }
is_ws() { case "$1" in '' | -* | /* | . | .. | ../* | */.. | */../* | *//* | *[!A-Za-z0-9_./@-]*) return 1 ;; *) return 0 ;; esac; }

while [ $# -gt 0 ]; do
  case "$1" in --*=*) a="$1"; shift; set -- "${a%%=*}" "${a#*=}" "$@" ;; esac
  case "$1" in
    --service) [ $# -ge 2 ] || usage; SERVICE="$2"; shift 2 ;;
    --dockerfile) [ $# -ge 2 ] || usage; DOCKERFILE="$2"; shift 2 ;;
    --workspace) [ $# -ge 2 ] || usage; WORKSPACES="$WORKSPACES$2$NL"; shift 2 ;;
    --lockfile) [ $# -ge 2 ] || usage; LOCK="$2"; shift 2 ;;
    -h | --help) usage ;;
    *) usage ;;
  esac
done
is_name "$SERVICE" || die "--service manquant ou invalide"
[ -n "$DOCKERFILE" ] && [ -f "$DOCKERFILE" ] || die "--dockerfile manquant ou introuvable"
[ -f "$LOCK" ] || die "--lockfile introuvable : $LOCK"
[ -n "$WORKSPACES" ] || die "--workspace manquant (le ou les workspaces que l'image exécute, ex. backend)"
printf '%s' "$WORKSPACES" | while IFS= read -r w; do [ -z "$w" ] || is_ws "$w" || exit 1; done || die "--workspace invalide (dossier relatif simple)"
grep -Eq '^  "lockfileVersion": [23],?$' "$LOCK" || die "$LOCK : lockfileVersion 2 ou 3 attendu (mise en forme d'npm, 2 espaces)"
grep -q '^  "packages": {' "$LOCK" || die "$LOCK : section packages introuvable"

# Dernier étage du Dockerfile : lignes après le dernier FROM, continuations (\) jointes, commentaires retirés.
stage=$(awk '
  /^[[:space:]]*#/ { next }
  { acc = acc $0 }
  /\\[[:space:]]*$/ { sub(/\\[[:space:]]*$/, " ", acc); next }
  { sub(/[[:space:]]+$/, "", acc); lines[++n] = acc; acc = "" }
  END {
    last = 0
    for (i = 1; i <= n; i++) if (toupper(lines[i]) ~ /^[[:space:]]*FROM[[:space:]]/) last = i
    if (last == 0) exit 3
    for (i = last; i <= n; i++) print lines[i]
  }' "$DOCKERFILE") || die "$DOCKERFILE : aucun FROM"

installs_own_deps=0
# Installation globale (npm install -g outil) : elle n'installe pas les dépendances du projet.
# Seul le segment `npm install|ci` compte : `groupadd -g 1000 && npm ci` installe, `npm install -g x && …` seul non.
printf '%s\n' "$stage" | grep -E '^[[:space:]]*RUN[[:space:]]' | awk '{ gsub(/&&|;|\|/, "\n"); print }' | grep -Ev '(^|[[:space:]])(-g|--global)([[:space:]]|$)' | grep -Eq '(^|[^A-Za-z-])npm[[:space:]]+(ci|install|i)([[:space:]]|$)' && installs_own_deps=1

OFFENDERS=''
COUNT=0
LIST=''
while IFS= read -r w; do
  [ -n "$w" ] || continue
  w=${w%/}
  LIST="$LIST${LIST:+,}$w"
  found=$(awk -v prefix="$w/node_modules/" '
    /^  "packages": \{/ { inpk = 1; next }
    inpk && /^  \}/ { inpk = 0 }
    inpk && /^    "[^"]*": \{/ { key = $0; sub(/^    "/, "", key); sub(/": \{.*/, "", key); cur = key; dev = 0; ver = ""; next }
    inpk && /^      "dev": true,?$/ { dev = 1 }
    inpk && /^      "version": "/ { ver = $0; sub(/^      "version": "/, "", ver); sub(/".*/, "", ver) }
    inpk && /^    \},?$/ {
      if (cur != "" && index(cur, prefix) == 1 && !dev) print substr(cur, length(prefix) + 1) " " ver " (" cur ")"
      cur = ""
    }' "$LOCK")
  [ -n "$found" ] || continue
  copied=0
  printf '%s\n' "$stage" | grep -Eq "^[[:space:]]*COPY[[:space:]].*(^|[[:space:]/])$w/node_modules/?([[:space:]]|$)|^[[:space:]]*COPY[[:space:]].*[[:space:]]/app(/$w)?/?[[:space:]]" && copied=1
  if [ "$copied" = 1 ] || [ "$installs_own_deps" = 1 ]; then
    log "$w : $(printf '%s\n' "$found" | wc -l | tr -d ' ') paquet(s) sous $w/node_modules, mais l'étage final de $DOCKERFILE les embarque ($([ "$copied" = 1 ] && echo 'COPY du dossier' || echo 'npm install dans l étage final'))"
    continue
  fi
  n=$(printf '%s\n' "$found" | wc -l | tr -d ' ')
  COUNT=$((COUNT + n))
  OFFENDERS="$OFFENDERS$(printf '%s\n' "$found" | head -n 30 | sed "s/^/  - /")$NL"
done <<EOF
$WORKSPACES
EOF

if [ "$COUNT" -gt 0 ]; then
  printf '%s %s: %s paquet(s) d exécution sous un node_modules de workspace, absents d une image qui ne copie que /app/node_modules (%s) :\n' "$PREFIX" "$SERVICE" "$COUNT" "$DOCKERFILE"
  printf '%s' "$OFFENDERS"
  printf '%s %s: corriger : aligner les versions demandées par les workspaces, puis rm -rf node_modules */node_modules && npm install ; sinon copier ce dossier dans l étage final du Dockerfile.\n' "$PREFIX" "$SERVICE"
  log "status=FAIL workspaces=$LIST offenders=$COUNT"
  exit 1
fi
log "status=OK workspaces=$LIST offenders=0"
exit 0
