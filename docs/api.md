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

## Paiements récurrents (tranche 3)

Gabarits de paiements ou revenus mensuels d'un espace (loyer, salaire, abonnements). Ils servent au prévisionnel et
à repérer un paiement attendu mais absent du relevé. Libellé et montant sont chiffrés pour un espace personnel.

### `GET /api/spaces/:spaceId/recurring`
```json
[{
  "id": "…", "spaceId": "…", "kind": "EXPENSE", "bloc": "FIXE", "label": "Loyer", "amountCents": 110000,
  "dayOfMonth": 5, "startDate": "2026-01-01", "endDate": null, "active": true, "aidRuleId": null
}]
```
`kind` : `INCOME` (`bloc` = `null`) ou `EXPENSE` (`bloc` obligatoire). `amountCents` toujours positif.
`dayOfMonth` : 1 à 31, ou `null` si le jour est inconnu (l'occurrence est alors **estimée** en fin de mois ; un
jour supérieur à la longueur du mois retombe sur le dernier jour). Dates au format `AAAA-MM-JJ`.

### `POST /api/spaces/:spaceId/recurring` · `PUT /api/spaces/:spaceId/recurring/:id` · `DELETE …/:id`
Corps (`POST` et `PUT`) : `{ "kind", "bloc"?, "label", "amountCents", "dayOfMonth", "startDate", "endDate", "active", "aidRuleId"? }`
(`endDate`, `dayOfMonth` et `aidRuleId` peuvent être `null` ou absents). `POST` → `201` + l'objet ; `PUT` et `DELETE` → `204`.
`400` si invalide (montant ≤ 0, dépense sans bloc, revenu avec bloc, `endDate` avant `startDate`, jour hors 1-31,
`aidRuleId` inconnu, `aidRuleId` sur un revenu, ou `aidRuleId` sur un espace personnel : les aides ne s'appliquent qu'à
l'espace commun, car leurs plafonds sont ceux du foyer fiscal).

## Prévisionnel du mois (tranche 3)

### `GET /api/spaces/:spaceId/forecast?month=AAAA-MM`
Projette la fin du mois en ajoutant aux opérations réelles les occurrences récurrentes **pas encore retrouvées**.
Une occurrence est « retrouvée » (`PAID`) quand une opération du mois, de même type et même bloc, a un libellé
voisin (l'un contient l'autre, sans casse ni accents) ; chaque opération n'en couvre qu'une. Sans correspondance :
`MISSING` si sa date est passée (paiement attendu mais non retrouvé : relevé pas encore importé ?), `DUE` si elle est
à venir. Pour un mois entièrement passé, la projection est égale au réel.
```json
{
  "month": "2026-11",
  "asOf": "2026-11-12T00:00:00.000Z",
  "income": { "plannedCents": 380000, "actualCents": 380000, "expectedRemainingCents": 0, "projectedCents": 380000 },
  "blocs": [
    { "bloc": "FIXE", "plannedCents": 175000, "actualCents": 110000, "expectedRemainingCents": 9600, "projectedCents": 119600 }
  ],
  "projectedBalanceCents": 260400,
  "cautiousBalanceCents": 190400,
  "occurrences": [
    { "recurringId": "…", "label": "Loyer", "kind": "EXPENSE", "bloc": "FIXE", "amountCents": 110000,
      "date": "2026-11-05T00:00:00.000Z", "estimated": false, "status": "PAID" }
  ]
}
```
- `blocs` contient toujours les 4 blocs ; `projectedCents = actualCents + expectedRemainingCents`.
- `projectedBalanceCents = revenus projetés − somme des blocs projetés` (uniquement ce que l'on sait : réel + récurrents).
- `cautiousBalanceCents` : idem, mais chaque bloc compte au moins son **prévu** (`max(projeté, prévu)`) : on suppose
  qu'on dépensera au moins le plan. Égal au projeté pour un mois passé.
- `occurrences` : toutes celles du mois, triées par date, avec `status` `PAID | MISSING | DUE`.

## Épargne de sécurité (tranche 3)

Réserve du foyer (cf. leçon 2 du cours), rattachée au foyer entier, modifiable par tous les membres.

### `GET /api/household/safety-net`
`{ "safetyNet": null }` tant que rien n'est déclaré, sinon :
`{ "safetyNet": { "savedCents": 550000, "asOf": "2026-11-01", "targetMonths": 6 } }`
`savedCents` = montant **brut** déclaré à la date `asOf` (c'est ce que renvoie et qu'enregistre le formulaire, jamais
une valeur ajustée) ; les dépenses du bloc `EPARGNE` de l'espace commun **postérieures** à `asOf` s'y ajoutent dans
`progress` :
```json
{ "safetyNet": { "savedCents": 550000, "asOf": "2026-11-01", "targetMonths": 6 },
  "progress": { "currentCents": 600000, "monthlyBasisCents": 300000, "coveredMonths": 2 } }
```
`progress` vaut `null` si `safetyNet` est `null`. `currentCents` = `savedCents` + dépenses EPARGNE communes après `asOf`.
`monthlyBasisCents` = dépenses mensuelles de référence (même base que l'insight `safety-net-progress` : Fixe + Courant
du plan commun, sinon la moyenne réelle des 3 derniers mois, sinon 0). `coveredMonths` = `currentCents ÷
monthlyBasisCents` arrondi à 0,1, ou `null` si la base vaut 0.

### `PUT /api/household/safety-net`
Corps : `{ "savedCents": 550000, "asOf": "2026-11-01", "targetMonths": 6 }`. `204`. `savedCents` entier ≥ 0,
`targetMonths` entier de 1 à 24, `asOf` une date `AAAA-MM-JJ`.

## Prochaines actions (tranche 3)

### `GET /api/spaces/:spaceId/insights?month=AAAA-MM`
Conseils déterministes issus des règles du cours, classés du plus important au moins important (8 au plus). Aucun
conseil de placement : uniquement budget, épargne de sécurité, suivi mensuel.
```json
{ "insights": [{
  "id": "recurring-missing",
  "severity": "ACTION",
  "title": "2 paiements récurrents introuvables",
  "detail": "Loyer (5 nov.) et Assurance (8 nov.) sont attendus mais absents des opérations. Importez votre relevé.",
  "lesson": 4,
  "link": "/import"
}] }
```
- `severity` : `WARNING | ACTION | INFO | GOOD`.
- `lesson` : numéro de la leçon du cours qui explique la règle, ou `null`.
- `link` : route de l'application où agir (`/plan`, `/import`, `/foyer`, `/previsionnel`, `/aides`, `/`) ou `null`.
- Les `id` sont stables : `plan-missing`, `plan-overcommitted`, `plan-unassigned`, `month-deficit`, `bloc-overrun-<bloc>`,
  `recurring-missing`, `upcoming-payments`, `no-recent-activity`, `monthly-review`, `savings-behind`,
  `savings-on-track`, `safety-net-unset`, `safety-net-progress`, `contribution-incomplete`, `all-good`.
- Certains conseils n'existent que pour l'espace commun (`safety-net-*`, `contribution-incomplete`).

## Aides officielles (tranche 3)

Certaines dépenses sont en partie remboursées par une règle officielle (crédit d'impôt). Une ligne récurrente de
l'espace **commun** peut être rattachée à une règle (`aidRuleId`) ; l'application calcule alors le coût net réel.
Les règles sont du code versionné, avec leur source et la date de vérification ; **ce sont des estimations**, pas un
conseil fiscal. Les plafonds s'appliquent au foyer fiscal : les lignes rattachées à une même règle les partagent.

### `GET /api/aid-rules`
Catalogue (identique pour tous les utilisateurs authentifiés).
```json
[{
  "id": "CREDIT_IMPOT_GARDE_HORS_DOMICILE",
  "label": "Garde d'enfants de moins de 6 ans hors du domicile",
  "description": "Crèche, assistante maternelle agréée, halte-garderie, garderie périscolaire…",
  "ratePercent": 50,
  "capDescription": "3 500 € de frais par enfant de moins de 6 ans (soit 1 750 € de crédit au maximum)",
  "cashTiming": "Versé l'été de l'année suivante, après la déclaration de revenus (case frais de garde, formulaire 2042 RICI).",
  "sourceLabel": "impots.gouv.fr",
  "sourceUrl": "https://www.impots.gouv.fr/particulier/questions/je-fais-garder-mon-jeune-enfant-lexterieur-du-domicile-que-puis-je-deduire",
  "verifiedOn": "2026-10-30"
}]
```
Règles : `CREDIT_IMPOT_GARDE_HORS_DOMICILE`, `CREDIT_IMPOT_SERVICES_A_LA_PERSONNE` (ménage, vitres, jardinage, garde à
domicile, soutien scolaire…). Les montants des plafonds sont dans `capDescription` (texte) ; les calculs sont côté serveur.

### `GET /api/household/fiscal-profile` · `PUT /api/household/fiscal-profile`
Paramètres nécessaires aux plafonds, communs au foyer.
```json
{ "fiscalProfile": { "childrenUnderSix": 1, "dependentChildren": 3, "firstYearHomeServices": false } }
```
`GET` renvoie `{ "fiscalProfile": null }` tant que rien n'est déclaré (le calcul retombe alors sur 0 enfant et le
signale). `PUT` : corps = l'objet interne, `204`. `childrenUnderSix` : enfants de moins de 6 ans au 1er janvier de
l'année, gardés hors du domicile (entier 0-10) ; `dependentChildren` : enfants à charge (entier 0-10) ;
`firstYearHomeServices` : première année de recours à l'emploi à domicile (plafond relevé).

### `GET /api/spaces/:spaceId/aids?year=AAAA`
Réservé à l'espace commun (`404` sinon). `year` : année civile (par défaut l'année courante).
```json
{
  "year": 2026,
  "profileMissing": false,
  "rules": [{
    "ruleId": "CREDIT_IMPOT_SERVICES_A_LA_PERSONNE",
    "label": "Services à la personne à domicile",
    "ratePercent": 50,
    "spentCents": 120000,
    "capCents": 1500000,
    "eligibleCents": 120000,
    "expectedCreditCents": 60000,
    "capReached": false,
    "cashTiming": "…",
    "sourceUrl": "…",
    "verifiedOn": "2026-10-30",
    "lines": [{ "recurringId": "…", "label": "Femme de ménage", "yearlySpentCents": 120000,
                "monthlyCents": 10000, "netMonthlyCents": 5000 }]
  }],
  "totalExpectedCreditCents": 60000
}
```
- `spentCents` : dépenses de l'année pour les lignes rattachées = somme des occurrences mensuelles actives de
  l'année (même moteur que le prévisionnel ; une occurrence passée retrouvée dans les opérations compte pour le
  montant réel, sinon le montant du gabarit).
- `capCents` : plafond de **dépenses** retenues (pas du crédit), calculé avec le profil fiscal.
- `eligibleCents = min(spentCents, capCents)`, `expectedCreditCents = round(eligibleCents × ratePercent / 100)`.
- `netMonthlyCents` d'une ligne : `monthlyCents` moins sa part du crédit ; tant que le plafond n'est pas atteint
  = `round(monthlyCents × (100 − ratePercent) / 100)`, sinon la part du crédit est répartie au prorata.
- Une règle sans ligne rattachée n'apparaît pas. `profileMissing` : profil fiscal non déclaré.

### `GET /api/aid-rules/creche-estimate?annualResourcesCents=…&children=…&hoursPerMonth=…&kind=COLLECTIVE`
Estimateur de participation familiale en crèche financée par la prestation de service unique (barème CNAF).
Tarif horaire = (ressources annuelles N-2 ÷ 12, encadrées par un plancher et un plafond) × taux d'effort.
```json
{
  "kind": "COLLECTIVE",
  "effortRatePercent": 0.031,
  "monthlyResourcesUsedCents": 520000,
  "hourlyRateCents": 161,
  "monthlyBillCents": 25760,
  "floorCents": 81462,
  "ceilingCents": 850000,
  "ceilingApplied": false,
  "floorApplied": false,
  "verifiedOn": "2026-10-30",
  "sourceUrl": "https://www.caf.fr/…"
}
```
`children` entier ≥ 1 (enfants à charge de la famille ; taux d'effort 0,0619 / 0,0516 / 0,0413 / 0,0310 % pour 1 / 2 / 3 /
4 à 7 enfants, 0,0206 % à partir de 8). `kind` : `COLLECTIVE` (crèche collective ou micro-crèche) seulement pour
l'instant. `hoursPerMonth` : heures facturées par mois (nombre ≥ 0, jusqu'à 400). Les ressources sont celles de
l'année N-2 (revenu imposable avant abattement, à reprendre sur l'avis d'impôt). Plancher 814,62 €/mois et plafond
8 500 €/mois : à vérifier chaque année (une crèche peut appliquer un plafond plus haut). `400` si paramètre invalide.

## Chiffrement de l'espace personnel (informatif)

Les libellés et montants des opérations de l'espace personnel, ainsi que son plan, sont chiffrés au repos
(AES-256-GCM, clé dérivée par utilisateur depuis `PERSONAL_DATA_KEY`). L'API les renvoie en clair à leur
propriétaire. Limite connue : celui qui détient `PERSONAL_DATA_KEY` (l'hébergeur) peut les déchiffrer ;
une clé protégée par un secret propre à chaque utilisateur est une évolution prévue.
