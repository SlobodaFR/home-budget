#!/usr/bin/env node
// Convention harnais `release-versioning` (v1.11) : version sémantique d'un service, calculée à partir des commits conventionnels.
// Copié VERBATIM dans `.github/scripts/release-version.mjs` de chaque service (l'audit compare octet pour octet) et importé tel quel
// par `scripts/backfill-versions.mjs` du harnais : l'historique rétroactif et les versions futures ne peuvent pas diverger.
// Sans dépendance : node + git (+ gh pour `publish`).
//
//   node release-version.mjs next            version suivante (stdout ; GITHUB_OUTPUT : version, tag, previous, reused)
//   node release-version.mjs publish <X.Y.Z> tag annoté vX.Y.Z sur HEAD, poussé, + release GitHub (sauter si elle existe)
//   node release-version.mjs notes <de> <à>  notes de release : commits first-parent de (de, à]
//   node release-version.mjs backfill-releases  releases GitHub des tags posés par le backfill (minor/major + dernier), via GITHUB_TOKEN (workflow backfill-releases.yml)
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;
/** Préfixe du message des tags annotés posés par le backfill (ceux des releases du workflow commencent par `release `). */
export const BACKFILL_MARK = 'backfill:';
const RANK = { patch: 0, minor: 1, major: 2 };

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();

/** Bump d'un message de commit : sujet `type(scope)!:` (préfixe `[n/m] ` des PR empilées ignoré) ou pied `BREAKING CHANGE:` en début de ligne. */
export function bumpOfMessage(message) {
  const lines = message.split('\n');
  const subject = (lines[0] ?? '').replace(/^\[\d+\/\d+\]\s+/, '');
  const m = /^([A-Za-z]+)(?:\([^)]*\))?(!)?:\s/.exec(subject);
  if (m?.[2] || lines.slice(1).some((l) => /^(?:\*\s+)?BREAKING[ -]CHANGE:/.test(l))) return 'major';
  return m?.[1].toLowerCase() === 'feat' ? 'minor' : 'patch';
}

export const maxBump = (kinds) => kinds.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'patch');

/** Bump d'un commit first-parent c : le maximum des commits de `c^1..c` (un merge prend le max du côté fusionné ; un squash n'a que lui). Racine : null. */
export function bumpOfCommit(cwd, sha) {
  const parents = git(cwd, 'rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
  if (parents.length === 0) return null;
  const messages = git(cwd, 'log', '--format=%B%x00', `${sha}^1..${sha}`).split('\0').map((s) => s.trim()).filter(Boolean);
  return maxBump(messages.map(bumpOfMessage));
}

export const parseVersion = (v) => v.replace(/^v/, '').split('.').map(Number);
export const formatVersion = ([a, b, c]) => `${a}.${b}.${c}`;
export const compareVersions = (a, b) => {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
export function bumpVersion(version, kind) {
  const [a, b, c] = parseVersion(version);
  return formatVersion(kind === 'major' ? [a + 1, 0, 0] : kind === 'minor' ? [a, b + 1, 0] : [a, b, c + 1]);
}

/** Tags v<semver> atteignables depuis `rev`, du plus haut au plus bas (tri semver, pas `git describe` : celui-ci rend le tag le plus PROCHE). */
export function tagsMerged(cwd, rev = 'HEAD') {
  const out = git(cwd, 'tag', '--merged', rev, '-l', 'v*', '--sort=-v:refname');
  return out.split('\n').filter((t) => TAG_RE.test(t)).sort((a, b) => compareVersions(b, a));
}

/** Commit visé par un tag (annoté ou non). */
export const tagCommit = (cwd, tag) => git(cwd, 'rev-parse', `${tag}^{commit}`);
const tagExists = (cwd, tag) => {
  try {
    git(cwd, 'rev-parse', '-q', '--verify', `refs/tags/${tag}`);
    return true;
  } catch {
    return false;
  }
};

/** Commit pelé du tag sur origin ('' si absent ou sans remote). */
function remoteTagCommit(cwd, tag) {
  try {
    const out = git(cwd, 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`).split('\n').filter(Boolean);
    const peeled = out.find((l) => l.endsWith('^{}')) ?? out[0];
    return peeled ? peeled.split('\t')[0] : '';
  } catch {
    return '';
  }
}

/** Notes de release : une ligne par commit first-parent de (from, to]. Même format pour le futur et le rétroactif. */
export function releaseNotes(cwd, from, to) {
  const range = from ? `${from}..${to}` : to;
  const rows = git(cwd, 'log', '--first-parent', '--format=%h%x09%s', range).split('\n').filter(Boolean);
  const title = from ? `Changements depuis ${from}` : 'Changements';
  return `## ${title}\n\n${rows.map((r) => { const [h, ...s] = r.split('\t'); return `- ${s.join('\t')} (${h})`; }).join('\n')}\n`;
}

/** Version suivante depuis le plus haut tag atteignable de HEAD. Échoue (jamais de réutilisation silencieuse) si le tag existe ailleurs. */
export function nextVersion(cwd, head = 'HEAD') {
  const headSha = git(cwd, 'rev-parse', `${head}^{commit}`);
  const tags = tagsMerged(cwd, head);
  if (tags.length === 0) throw new Error('aucun tag v<semver> atteignable : lancer scripts/backfill-versions.mjs du harnais avant le premier déploiement versionné');
  const previous = tags[0];
  if (tagCommit(cwd, previous) === headSha) return { version: previous.slice(1), tag: previous, previous: tags[1] ?? '', reused: true };
  const commits = git(cwd, 'rev-list', '--first-parent', `${previous}..${headSha}`).split('\n').filter(Boolean);
  if (commits.length === 0) throw new Error(`aucun commit first-parent entre ${previous} et ${headSha} : HEAD n'est pas en avant du dernier tag`);
  const version = bumpVersion(previous.slice(1), maxBump(commits.map((c) => bumpOfCommit(cwd, c) ?? 'patch')));
  const tag = `v${version}`;
  if (tagExists(cwd, tag)) throw new Error(`${tag} existe déjà sur un autre commit (${tagCommit(cwd, tag)}) : refus de le réutiliser`);
  try {
    if (git(cwd, 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`)) throw new Error(`${tag} existe déjà sur origin : refus de le réutiliser`);
  } catch (e) {
    if (/refus de le réutiliser/.test(e.message)) throw e; // pas de remote (tests) : rien à vérifier
  }
  return { version, tag, previous, reused: false };
}

/** Tag annoté + release GitHub pour HEAD. Idempotent : tag déjà sur HEAD réutilisé, release existante conservée ; tag ailleurs = échec. */
export function publish(cwd, version, { gh = 'gh', push = true } = {}) {
  const tag = `v${version}`;
  if (!TAG_RE.test(tag)) throw new Error(`version invalide : ${version}`);
  const headSha = git(cwd, 'rev-parse', 'HEAD');
  if (tagExists(cwd, tag)) {
    if (tagCommit(cwd, tag) !== headSha) throw new Error(`${tag} existe déjà sur un autre commit : refus de le réutiliser`);
  } else {
    // Le tag peut exister sur origin sans être dans ce clone (autre exécution) : même règle, jamais de --force.
    const remote = remoteTagCommit(cwd, tag);
    if (remote && remote !== headSha) throw new Error(`${tag} existe déjà sur origin sur un autre commit (${remote}) : refus de le réutiliser`);
    git(cwd, 'config', 'user.name', 'github-actions[bot]');
    git(cwd, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
    git(cwd, 'tag', '-a', tag, headSha, '-m', `release ${tag}`);
  }
  if (push) git(cwd, 'push', 'origin', `refs/tags/${tag}`);
  const previous = tagsMerged(cwd).find((t) => t !== tag && compareVersions(t, tag) < 0) ?? '';
  const ghRun = (input, ...args) => execFileSync(gh, args, { cwd, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
  let exists = true;
  try {
    ghRun('', 'release', 'view', tag);
  } catch {
    exists = false;
  }
  if (exists) return { tag, release: 'existante' };
  ghRun(releaseNotes(cwd, previous, tag), 'release', 'create', tag, '--verify-tag', '--title', tag, '--notes-file', '-', '--latest');
  return { tag, release: 'créée' };
}

/** Vrai si passer de `prev` à `cur` change le minor ou le major (versions qui reçoivent une release de backfill). */
export const isRelease = (prev, cur) => {
  const [a, b] = [prev.slice(1).split('.').map(Number), cur.slice(1).split('.').map(Number)];
  return a[0] !== b[0] || a[1] !== b[1];
};

/** Releases rétroactives : première version, chaque changement de minor/major, dernière ; `from` = release précédente (changelog complet). */
export function releasePlan(cwd, until = 'HEAD') {
  const out = git(cwd, 'for-each-ref', '--format=%(refname:short)%09%(contents:subject)', 'refs/tags/v*');
  const tags = out.split('\n').filter(Boolean).map((l) => l.split('\t')).filter(([t, m]) => TAG_RE.test(t) && (m ?? '').startsWith(BACKFILL_MARK)).map(([t]) => t).sort(compareVersions);
  const merged = new Set(tagsMerged(cwd, until));
  const mine = tags.filter((t) => merged.has(t));
  const picks = mine.filter((t, i) => i > 0 && isRelease(mine[i - 1], t)).concat(mine.length ? [mine[mine.length - 1]] : []);
  const unique = [...new Set([...(mine.length ? [mine[0]] : []), ...picks])].sort(compareVersions);
  return unique.map((t, i) => ({ tag: t, from: i === 0 ? '' : unique[i - 1] }));
}

/**
 * Crée les releases rétroactives manquantes (`--latest=false`, relançable). À exécuter dans Actions avec GITHUB_TOKEN (workflow backfill-releases.yml) :
 * une release créée avec GITHUB_TOKEN ne déclenche aucun workflow, alors qu'avec un jeton personnel chaque release lance le workflow du commit du tag
 * (ancien `release: published` → reconstruction d'une ancienne image).
 */
export function backfillReleases(cwd, { gh = 'gh', until = 'HEAD' } = {}) {
  const run = (input, ...args) => execFileSync(gh, args, { cwd, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
  let made = 0;
  let kept = 0;
  for (const { tag, from } of releasePlan(cwd, until)) {
    try {
      run('', 'release', 'view', tag);
      kept++;
      continue;
    } catch {}
    run(releaseNotes(cwd, from, tag), 'release', 'create', tag, '--verify-tag', '--title', tag, '--notes-file', '-', '--latest=false');
    made++;
  }
  return { made, kept };
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const cwd = process.cwd();
  try {
    if (cmd === 'next') {
      const r = nextVersion(cwd);
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${r.version}\ntag=${r.tag}\nprevious=${r.previous}\nreused=${r.reused}\n`);
      console.error(`[release-version] ${r.previous || '(aucun)'} -> ${r.tag}${r.reused ? ' (HEAD déjà tagué : réutilisé)' : ''}`);
      console.log(r.version);
    } else if (cmd === 'publish' && args[0]) {
      const r = publish(cwd, args[0]);
      console.log(`[release-version] ${r.tag} : tag poussé, release ${r.release}`);
    } else if (cmd === 'backfill-releases') {
      if (!process.env.GITHUB_ACTIONS) throw new Error('à lancer dans Actions (workflow backfill-releases.yml, GITHUB_TOKEN) : une release créée avec un jeton personnel déclencherait les workflows des anciens commits');
      const r = backfillReleases(cwd);
      console.log(`[release-version] releases : ${r.made} créées, ${r.kept} déjà présentes`);
    } else if (cmd === 'notes' && args.length === 2) {
      process.stdout.write(releaseNotes(cwd, args[0], args[1]));
    } else {
      console.error('Usage : release-version.mjs next | publish <X.Y.Z> | notes <de> <à> | backfill-releases');
      process.exit(2);
    }
  } catch (e) {
    console.error(`[release-version] ERREUR : ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
