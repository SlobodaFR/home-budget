# Foyer Budget

Application de gestion de budget de foyer : comptes de depenses + comptes de revenus.

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
| `AUTH_SERVICE_URL` | oui | - | Base URL du service d'authentification central (`https://auth.sloboda.fr`). |
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

- **Account**: `EXPENSE` (3 comptes de prelevements, avec budget mensuel) ou `SOURCE` (1 compte d'entrees, sans budget)
- **Transaction**: montant signe (positif = credit, negatif = debit), categorie, date
- Le solde d'un compte est calcule a la volee comme la somme de ses transactions
- **RecurringTransaction**: gabarit de paiement recurrent mensuel (loyer, salaire, remboursement...) utilise pour le
  previsionnel. `dayOfMonth` peut etre `null` quand la date exacte est inconnue (ex: remboursement secu) ; dans ce
  cas l'occurrence est estimee en fin de mois.

## Previsionnel

`/forecast` (page "Previsionnel") affiche, pour une date cible choisie, le solde projete de chaque compte
(solde actuel + occurrences des paiements recurrents prevues d'ici cette date) ainsi que la liste des paiements a
venir. Les paiements recurrents se gerent depuis la meme page.
