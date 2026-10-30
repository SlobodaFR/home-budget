# Foyer Budget

Application de budget de foyer, mobile d'abord (PWA) : un espace commun et un espace personnel prive par
membre, chacun organise en 4 blocs (Fixe, Courant, Plaisir, Epargne) avec un plan prevu, des operations et une
regle de contribution au commun. Cadre pedagogique : le cours « Finances familiales » (4 blocs, epargne de
securite, suivi mensuel).

## Fonctionnalites

| Tranche | Fonctionnalite |
| --- | --- |
| 1 | Foyer, espace commun / espace personnel prive, 4 blocs, plan, operations, regle de contribution, PWA |
| 2 | Import de releves bancaires (CSV) avec regles de classement et detection des doublons |
| 3 | Paiements recurrents, previsionnel du mois, epargne de securite, conseils deterministes, aides officielles (credits d'impot garde d'enfants et services a la personne, estimateur du tarif de creche) |
| 4 | Comptes bancaires (soldes, projection de fin de mois), commun finance par les contributions |
| 5 | Paiements non mensuels, provisions lissees, vue des 12 mois |
| 6 | Projets d'epargne (naissance, vacances, voiture...) avec versements |
| 7 | Revue mensuelle guidee, export JSON et CSV des donnees |
| 8 | Credits et dettes, simulateur de remboursement anticipe |
| 9 | Tendances de depenses |
| 10 | Suivi des contributions de chacun au commun |
| 11 | Evenements de vie (naissance) : demarches sourcees, echeances, progression |

Le contrat de l'API est dans [`docs/api.md`](docs/api.md) ; la feuille de route et les limites connues dans
[`docs/ROADMAP.md`](docs/ROADMAP.md). Les regles officielles (plafonds, delais, baremes) sont du code versionne
avec leur source et leur date de verification : a revoir chaque annee.

## Stack

- **Backend**: NestJS + TypeORM + SQLite (better-sqlite3), clean architecture (domain / application / infrastructure / interfaces)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS, clean architecture (domain / application / infrastructure / presentation)
- **Monorepo**: npm workspaces (`backend`, `frontend`)
- **Docker**: single image, the Nest backend serves the built React app as static assets

## Architecture

```
backend/src/
  domain/          # Entities, value objects, repository ports (no framework deps)
  application/      # Use-cases orchestrating domain objects
  infrastructure/    # TypeORM entities/repositories, SQLite config
  interfaces/http/   # Controllers, DTOs, Nest modules

frontend/src/
  domain/          # Types and formatting (Money, Account, Transaction)
  application/      # Hooks orchestrating data fetching (use-cases)
  infrastructure/    # API client
  presentation/      # React components and pages
```

## Authentification

L'authentification est deleguee au service central [auth.sloboda.fr](https://auth.sloboda.fr) via OAuth2
Authorization Code flow :

- `GET /api/auth/login` redirige vers `auth.sloboda.fr/authorize`.
- `GET /api/auth/callback` echange le code contre une paire de tokens (`/token`), recupere le profil
  (`/userinfo`) et upserte l'utilisateur local (mirror : `id`/`email`/`name`/`avatarUrl`).
- La session cote budget est stockee dans deux cookies httpOnly : `access_token` (courte duree, fournie
  par auth-service) et `refresh_token` (~30 jours). `JwtAuthGuard` verifie l'access token via JWKS
  (`/.well-known/jwks.json`) et tente un refresh silencieux si besoin.
- `POST /api/auth/logout` ne fait que vider les cookies locaux (pas de logout global).
- `POST /api/auth/disconnect?secret=AUTH_WEBHOOK_SECRET` est le `logoutWebhookUrl` enregistre aupres
  d'auth-service (`{ "userId": "..." }`) : appele lors d'un logout global, il marque l'utilisateur
  comme revoque (horodatage courant) ; tout access token emis avant cet instant est ensuite rejete par
  `JwtAuthGuard`.

Comptes et transactions sont rattaches a l'utilisateur connecte (`id` = `sub` fourni par auth-service).

## Variables d'environnement (backend)

| Variable | Requis | Defaut | Description |
| --- | --- | --- | --- |
| `AUTH_MODE` | non | `oauth` | `oauth` (auth.sloboda.fr) ou `dev` (connexion factice alice/bob, refuse de demarrer en production). |
| `DEV_AUTH_SECRET` | non | - | Mode dev : secret de signature des jetons factices. |
| `PERSONAL_DATA_KEY` | prod | - | Cle maitre (32 octets : 64 caracteres hexadecimaux ou base64) du chiffrement de l'espace personnel. Obligatoire en production. |
| `AUTH_SERVICE_URL` | oui (oauth) | - | Base URL du service d'authentification central (`https://auth.sloboda.fr`). |
| `AUTH_CLIENT_ID` | oui | - | Identifiant client OAuth2 enregistre aupres d'auth-service. |
| `AUTH_CLIENT_SECRET` | oui | - | Secret client OAuth2 correspondant. |
| `AUTH_WEBHOOK_SECRET` | oui | - | Secret partage pour le webhook `POST /api/auth/internal/session-revoked`. |
| `FRONTEND_URL` | non | `http://localhost:3000` | Base URL du frontend, utilisee pour le `redirect_uri` OAuth2 et la config CORS. |
| `DATABASE_PATH` | non | - | Chemin du fichier SQLite. |
| `NODE_ENV` | non | - | `production` active le flag `secure` sur le cookie de session. |
| `PORT` | non | `3000` | Port d'ecoute du serveur. |
| `MINIO_ENDPOINT` | non | - | URL du serveur MinIO (S3-compatible). |
| `MINIO_BUCKET` | non | - | Bucket de destination. Si defini, active la replication Litestream de la DB SQLite. |
| `MINIO_REPLICA_PATH` | non | `foyer-budget` | Prefixe du chemin de replication dans le bucket. |
| `MINIO_REGION` | non | `us-east-1` | Region S3 (requise par le SDK, peu importante pour MinIO). |
| `MINIO_ACCESS_KEY_ID` | non | - | Cle d'acces MinIO. |
| `MINIO_SECRET_ACCESS_KEY` | non | - | Cle secrete MinIO. |

Copiez `backend/.env.example` en `backend/.env` et completez les valeurs. Ce fichier est lu
automatiquement par `ConfigModule` en dev, et peut aussi etre passe a `docker run --env-file`.

## Development

```bash
npm install
cp backend/.env.example backend/.env   # puis editez JWT_SECRET etc.
npm run dev:backend    # Nest on :3000
npm run dev:frontend   # Vite on :5173, proxies /api to :3000
```

## Tests

```bash
npm test               # backend (jest) + frontend (vitest)
```

## Build & run with Docker

```bash
docker build -t foyer-budget .
docker run -p 3000:3000 \
  -v foyer-budget-data:/app/backend/data \
  --env-file backend/.env \
  foyer-budget
```

The app is served entirely on port 3000 (API under `/api`, React app on `/`).

### Replication SQLite vers MinIO (Litestream)

Si `MINIO_BUCKET` est defini, l'entrypoint restaure la DB depuis le replica MinIO au demarrage
(si le fichier local est absent), puis lance le serveur sous `litestream replicate` qui expedie
en continu le WAL vers le bucket. Sans `MINIO_BUCKET`, le conteneur demarre normalement, sans
replication.

## Domain model

- **Household** : un foyer (4 membres au plus ; un utilisateur n'appartient qu'a un foyer). On le rejoint avec un
  code d'invitation a usage unique valable 7 jours.
- **Space** : `COMMON` (visible par tous les membres) ou `PERSONAL` (visible par son seul proprietaire). L'espace
  d'un autre membre n'existe pas pour vous : 404, jamais 403. Regle unique : `isVisibleTo` (domaine) appliquee par
  `SpaceAccessService` (application) ; testee dans `space-access.spec.ts` et `e2e/app.e2e.spec.ts`.
- **SpacePlan** : budget prevu d'un espace (revenus + 4 blocs).
- **Transaction** : revenu (`INCOME`) ou depense (`EXPENSE`, rangee dans un bloc), montant positif en centimes.
- **Contribution** : part de chacun dans le budget du commun selon la regle du foyer (`EQUAL`, `PROPORTIONAL`,
  `EQUAL_REMAINDER`), a l'euro pres (methode du plus fort reste).

Contrat HTTP : [docs/api.md](docs/api.md).

## Import de releve

Ecran `/import` (frontend) : on choisit le CSV du mois de sa banque (lu sur l'appareil, decode en UTF-8 ou
Windows-1252), le serveur propose un bloc par ligne a partir de regles de mots-cles propres a chaque espace
(jeu de depart, modifiable, chiffre pour un espace personnel), repere les lignes deja importees, puis
l'utilisateur corrige et valide : l'enregistrement est tout ou rien. Details et formats lus : docs/api.md.

## Donnees personnelles chiffrees

Libelles et montants des operations de l'espace personnel, ainsi que son plan, sont chiffres au repos
(AES-256-GCM, cle par utilisateur derivee de `PERSONAL_DATA_KEY` par HKDF, le chiffre est lie a sa ligne). Limite
assumee : qui detient `PERSONAL_DATA_KEY` (l'hebergeur) peut dechiffrer. Evolution prevue : cle derivee d'un secret
propre a chaque utilisateur. Sans `PERSONAL_DATA_KEY` hors production, une cle de dev non secrete est utilisee
(avertissement au demarrage).

## Migrations

`synchronize` est desactive : le schema evolue par migrations TypeORM (`backend/src/infrastructure/persistence/migrations`,
listees dans `index.ts`), jouees au demarrage. `migrations.spec.ts` verifie qu'elles produisent exactement le schema
des entites. La premiere migration conserve l'ancien modele (comptes, operations, recurrents) sous le prefixe
`legacy_`. Au deploiement, `PERSONAL_DATA_KEY` doit exister dans 1Password (`BUDGET_PERSONAL_DATA_KEY`).

## Developper avec la connexion factice

```bash
AUTH_MODE=dev npm run dev:backend      # base: backend/data/budget.sqlite
npm run dev:frontend                   # http://localhost:5173 -> boutons « alice » / « bob » sur la page de connexion
```
