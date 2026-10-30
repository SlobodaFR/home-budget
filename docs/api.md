# API (tranche 1 : foyer, espaces, blocs)

Toutes les routes sont sous `/api`, authentifiées par les cookies httpOnly `access_token` / `refresh_token`
(sauf mention « public »). Les montants sont des **entiers en centimes**. Les dates sont en ISO 8601 (UTC).
Les mois sont au format `YYYY-MM`. Les erreurs de validation renvoient `400 { message }`, un accès interdit
renvoie `404` (on ne révèle pas l'existence d'une ressource qui n'appartient pas à l'utilisateur), non
authentifié `401`.

## Vocabulaire

- **Foyer** : un groupe de personnes (un par utilisateur pour l'instant, 4 membres au plus).
- **Espace** : `COMMON` (visible par tous les membres) ou `PERSONAL` (visible par son seul propriétaire).
  L'espace personnel de l'autre membre n'apparaît **jamais** (ni dans les listes, ni par son identifiant).
- **Bloc** : `FIXE`, `COURANT`, `PLAISIR`, `EPARGNE` (cadre de la leçon 1 du cours de finances).
- **Plan** : budget prévu d'un espace pour un mois type (revenus + 4 blocs).
- **Règle de contribution** : comment le commun est financé : `EQUAL` (moitié-moitié),
  `PROPORTIONAL` (au prorata des revenus), `EQUAL_REMAINDER` (même reste pour chacun).

## Authentification

### `GET /api/auth/config` (public)
```json
{ "mode": "oauth" }                       // production
{ "mode": "dev", "devUsers": ["alice", "bob"] }   // AUTH_MODE=dev uniquement
```

### `GET /api/auth/dev-login?as=alice` (public, AUTH_MODE=dev uniquement, sinon 404)
Pose le cookie `access_token` (HS256, secret local) et redirige vers `/`. Refuse de démarrer si
`AUTH_MODE=dev` et `NODE_ENV=production`.

### `POST /api/auth/logout`
Efface les cookies de session locaux (`204`). Pas de déconnexion globale.

### `GET /api/auth/me`
`{ "user": { "id", "email", "name" } }` ou `401`.

## Foyer

### `GET /api/household`
`{ "household": null }` si l'utilisateur n'a pas de foyer, sinon :
```json
{
  "household": {
    "id": "…", "name": "Famille",
    "role": "OWNER",
    "contributionMode": "PROPORTIONAL",
    "members": [
      { "userId": "…", "name": "Alice", "role": "OWNER", "netMonthlyIncomeCents": 350000 },
      { "userId": "…", "name": "Bob", "role": "MEMBER", "netMonthlyIncomeCents": null }
    ],
    "spaces": [
      { "id": "…", "kind": "COMMON", "name": "Commun" },
      { "id": "…", "kind": "PERSONAL", "name": "Perso" }
    ]
  }
}
```
`spaces` ne contient que l'espace commun et **l'espace personnel de l'utilisateur courant**.

### `POST /api/household`
Corps : `{ "name": "Famille", "netMonthlyIncomeCents": 350000 }` (revenu optionnel). Crée le foyer, l'espace
commun et l'espace personnel. `409` si l'utilisateur a déjà un foyer. Renvoie **le foyer lui-même** (l'objet
`household`, sans l'enveloppe `{ household }` de `GET`).

### `POST /api/household/invitations`
Renvoie `{ "code": "…", "expiresAt": "…" }` (valable 7 jours, usage unique).

### `POST /api/household/join`
Corps : `{ "code": "…" }`. Ajoute l'utilisateur au foyer et crée son espace personnel. `404` si le code est
inconnu, expiré ou déjà utilisé ; `409` si l'utilisateur a déjà un foyer ou si le foyer est plein.
Renvoie le foyer lui-même, comme `POST /api/household`.

### `PUT /api/household/me/income`
Corps : `{ "netMonthlyIncomeCents": 200000 }` (ou `null`). `204`.

### `PUT /api/household/contribution-mode`
N'importe quel membre peut modifier la règle (décision de couple). Corps : `{ "mode": "EQUAL" | "PROPORTIONAL" | "EQUAL_REMAINDER" }`. `204`.

### `GET /api/household/contribution`
Calcule la part de chacun dans le **budget de l'espace commun** (somme des 4 blocs du plan commun) selon la
règle du foyer. Revenus manquants : `incomplete: true`.
```json
{
  "mode": "PROPORTIONAL",
  "commonNeedCents": 330000,
  "incomplete": false,
  "shortfallCents": 0,
  "shares": [
    { "userId": "…", "name": "Alice", "incomeCents": 350000, "contributionCents": 210000, "remainingCents": 140000 },
    { "userId": "…", "name": "Bob", "incomeCents": 200000, "contributionCents": 120000, "remainingCents": 80000 }
  ]
}
```

## Espaces

L'accès à `:spaceId` est vérifié partout : espace commun → membres du foyer ; espace personnel → propriétaire.
Sinon `404`.

### `GET /api/spaces/:spaceId/plan` · `PUT /api/spaces/:spaceId/plan`
```json
{ "incomeCents": 380000, "fixeCents": 175000, "courantCents": 100000, "plaisirCents": 45000, "epargneCents": 20000 }
```
`GET` renvoie des zéros si le plan n'existe pas encore. `PUT` : `204`, tous les champs entiers ≥ 0.

### `GET /api/spaces/:spaceId/transactions?month=YYYY-MM`
Liste des opérations du mois (la plus récente d'abord) :
```json
[{ "id": "…", "spaceId": "…", "kind": "EXPENSE", "bloc": "COURANT", "label": "Courses", "amountCents": 14230, "date": "2026-10-03T00:00:00.000Z" }]
```
`kind` : `INCOME` (alors `bloc` est `null`) ou `EXPENSE` (alors `bloc` est obligatoire). `amountCents` est
toujours **positif** ; le sens vient de `kind`.

### `POST /api/spaces/:spaceId/transactions`
Corps : `{ "kind", "bloc"?, "label", "amountCents", "date"? }` (`date` par défaut : maintenant). `201` + l'opération.

### `PUT /api/spaces/:spaceId/transactions/:id` · `DELETE …/:id`
Même corps que `POST` pour `PUT` ; `204`.

### `GET /api/spaces/:spaceId/summary?month=YYYY-MM`
```json
{
  "month": "2026-10",
  "income": { "plannedCents": 380000, "actualCents": 380000, "gapCents": 0 },
  "blocs": [
    { "bloc": "FIXE", "plannedCents": 175000, "actualCents": 128100, "gapCents": -46900 },
    { "bloc": "COURANT", "plannedCents": 100000, "actualCents": 23670, "gapCents": -76330 },
    { "bloc": "PLAISIR", "plannedCents": 45000, "actualCents": 7799, "gapCents": -37201 },
    { "bloc": "EPARGNE", "plannedCents": 20000, "actualCents": 30000, "gapCents": 10000 }
  ],
  "plannedBalanceCents": 40000,
  "actualBalanceCents": 190431,
  "savingsRate": 0.0789
}
```
`gapCents = actualCents − plannedCents`. `actualBalanceCents = revenus réels − somme des dépenses réelles (4 blocs)`.
`savingsRate` = épargne réelle ÷ revenus réels (`null` si pas de revenu).

## Import de relevé (tranche 2)

Le relevé est envoyé **en texte** (le client lit le fichier CSV et le décode : UTF-8, sinon Windows-1252). Rien n'est
enregistré par l'aperçu. Corps JSON limité à 1 Mo, 2 000 lignes au plus.

### `POST /api/spaces/:spaceId/imports/preview`
Corps : `{ "text": "date;libellé;montant\n02/10/2026;PRLV LOYER;-1100,00\n…" }`. `200` :
```json
{
  "rows": [
    {
      "index": 0,
      "date": "2026-10-02T00:00:00.000Z",
      "label": "PRLV LOYER",
      "amountCents": -110000,
      "suggestion": { "target": "FIXE", "rule": "loyer" },
      "duplicate": false
    }
  ],
  "skipped": [{ "line": 1, "reason": "en-tête" }],
  "truncated": false
}
```
- `amountCents` est **signé** : négatif = dépense, positif = revenu.
- `suggestion.target` : `FIXE`, `COURANT`, `PLAISIR`, `EPARGNE`, `INCOME`, `IGNORE`, ou `null` (« à classer »).
  `suggestion.rule` : le mot-clé de la règle qui a classé la ligne (`null` si aucune, ou pour un revenu automatique).
- `duplicate` : une opération identique (même jour, même montant, même libellé) existe déjà dans l'espace.
- Lignes illisibles ou sans date valide : listées dans `skipped` (numéro de ligne, 1 = première ligne du texte).
- Formats lus : séparateur `;` ou tabulation ; dates `JJ/MM/AAAA`, `JJ-MM-AAAA`, `JJ.MM.AAAA`, `AAAA-MM-JJ` ;
  montants `-1 100,00`, `1.100,00`, `-1100.00` ; colonnes « Débit » / « Crédit » séparées si l'en-tête les nomme.

### `POST /api/spaces/:spaceId/imports/commit`
Corps : `{ "items": [ { "kind": "EXPENSE", "bloc": "FIXE", "label": "PRLV LOYER", "amountCents": 110000, "date": "2026-10-02T00:00:00.000Z" } ] }`
(`amountCents` **positif** ici, comme pour `POST …/transactions` ; `bloc` obligatoire pour une dépense, absent pour
un revenu). 1 à 500 éléments. **Tout ou rien** : une ligne invalide renvoie `400` et rien n'est enregistré.
`201 { "created": 12 }`.

### `GET /api/spaces/:spaceId/rules` · `PUT /api/spaces/:spaceId/rules`
Règles de classement de l'espace (propres à chaque espace, chiffrées pour un espace personnel).
```json
{ "rules": [{ "keyword": "loyer", "target": "FIXE" }, { "keyword": "virement interne", "target": "IGNORE" }], "isDefault": false }
```
`GET` renvoie un jeu de règles de départ avec `isDefault: true` tant que rien n'a été enregistré. `PUT` : corps
`{ "rules": [...] }`, `204`, au plus 200 règles, mot-clé de 2 à 40 caractères, `target` parmi
`FIXE|COURANT|PLAISIR|EPARGNE|INCOME|IGNORE`.
Sémantique : un mot-clé correspond s'il est contenu dans le libellé, sans tenir compte de la casse ni des accents ;
les règles `IGNORE` sont testées en premier ; un montant positif est un revenu sauf règle `IGNORE` ; sinon la
première règle qui correspond (dans l'ordre) l'emporte.

## Chiffrement de l'espace personnel (informatif)

Les libellés et montants des opérations de l'espace personnel, ainsi que son plan, sont chiffrés au repos
(AES-256-GCM, clé dérivée par utilisateur depuis `PERSONAL_DATA_KEY`). L'API les renvoie en clair à leur
propriétaire. Limite connue : celui qui détient `PERSONAL_DATA_KEY` (l'hébergeur) peut les déchiffrer ;
une clé protégée par un secret propre à chaque utilisateur est une évolution prévue.
