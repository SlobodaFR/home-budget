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
Corps : `{ "kind", "bloc"?, "label", "amountCents", "date"?, "accountId"? }` (`date` par défaut : maintenant ;
`accountId` : compte bancaire de l'espace, cf. « Comptes bancaires », `null` ou absent = non rattachée). `201` + l'opération,
qui expose désormais `accountId` (`null` si non rattachée). `400` si le compte n'existe pas dans cet espace ou est archivé.

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
  "dayOfMonth": 5, "startDate": "2026-01-01", "endDate": null, "active": true, "aidRuleId": null, "accountId": null
}]
```
`kind` : `INCOME` (`bloc` = `null`) ou `EXPENSE` (`bloc` obligatoire). `amountCents` toujours positif.
`dayOfMonth` : 1 à 31, ou `null` si le jour est inconnu (l'occurrence est alors **estimée** en fin de mois ; un
jour supérieur à la longueur du mois retombe sur le dernier jour). Dates au format `AAAA-MM-JJ`.

### `POST /api/spaces/:spaceId/recurring` · `PUT /api/spaces/:spaceId/recurring/:id` · `DELETE …/:id`
Corps (`POST` et `PUT`) : `{ "kind", "bloc"?, "label", "amountCents", "dayOfMonth", "startDate", "endDate", "active", "aidRuleId"?, "accountId"? }`
(`endDate`, `dayOfMonth`, `aidRuleId` et `accountId` peuvent être `null` ou absents ; `accountId` : même règle que pour les opérations). `POST` → `201` + l'objet ; `PUT` et `DELETE` → `204`.
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
  "income": { "plannedCents": 380000, "actualCents": 380000, "expectedRemainingCents": 0, "projectedCents": 380000, "contributionAssumed": false },
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
- **Espace commun** : son plan n'a pas de revenu propre (il est financé par les contributions du foyer). Si
  `plan.incomeCents` vaut 0, `income.plannedCents` = somme des blocs du plan (les contributions couvrent le plan par
  construction) et `income.projectedCents = max(actualCents + expectedRemainingCents, plannedCents)` : on suppose que
  chacun verse sa contribution. `income.contributionAssumed` vaut alors `true` (sinon `false`). Cela évite un solde
  commun négatif artificiel. Espace personnel : inchangé, `contributionAssumed` toujours `false`.
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
- `link` : route de l'application où agir (`/plan`, `/import`, `/foyer`, `/previsionnel`, `/aides`, `/comptes`, `/projets`, `/revue`, `/dettes`, `/`) ou `null`.
- Les `id` sont stables : `plan-missing`, `plan-overcommitted`, `plan-unassigned`, `month-deficit`, `bloc-overrun-<bloc>`,
  `recurring-missing`, `upcoming-payments`, `no-recent-activity`, `monthly-review`, `savings-behind`,
  `savings-on-track`, `account-negative-projected`, `accounts-unassigned`, `upcoming-big-payment`, `provision-suggestion`, `project-behind`, `projects-exceed-savings`, `project-reached`, `review-done`, `debt-ratio-high`, `debt-never-paid-off`, `safety-net-unset`, `safety-net-progress`, `contribution-incomplete`, `all-good`.
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

## Comptes bancaires (tranche 4)

Un **compte** dit *où l'argent circule* (Compte commun, Courant de Thomas, Livret…) ; l'**espace** dit *qui décide du
budget*. Un compte appartient à un espace : ceux de l'espace commun sont visibles par tout le foyer, ceux d'un espace
personnel par son seul propriétaire (mêmes règles d'accès, `404` sinon). Le nom et le solde d'ouverture sont chiffrés
pour un espace personnel. Les virements entre comptes ne sont pas gérés dans cette tranche.

### `GET /api/spaces/:spaceId/accounts`
```json
[{
  "id": "…", "spaceId": "…", "name": "Compte commun", "kind": "CHECKING",
  "openingBalanceCents": 120000, "openingDate": "2026-10-01", "archived": false,
  "balanceCents": 98450, "projectedMonthEndCents": 41200, "transactionCount": 37
}]
```
- `kind` : `CHECKING` (compte courant) | `SAVINGS` (livret/épargne) | `CASH` (espèces).
- `openingBalanceCents` : entier signé (découvert possible) ; `openingDate` `AAAA-MM-JJ`.
- `balanceCents` = solde d'ouverture + revenus − dépenses des opérations rattachées au compte dont la date (jour,
  UTC) est ≥ `openingDate`.
- `projectedMonthEndCents` = `balanceCents` + (revenus − dépenses) des occurrences récurrentes rattachées au compte
  encore `DUE` ou `MISSING` du **mois courant** (même moteur que le prévisionnel). Les comptes archivés sont listés
  en dernier ; leur projection vaut `balanceCents`.
- `transactionCount` : nombre d'opérations rattachées (tous mois).

### `POST /api/spaces/:spaceId/accounts` · `PUT /api/spaces/:spaceId/accounts/:id` · `DELETE …/:id`
Corps (`POST` et `PUT`) : `{ "name", "kind", "openingBalanceCents", "openingDate" }`, `PUT` accepte en plus
`"archived": true|false`. `POST` → `201` + l'objet (avec ses soldes) ; `PUT` et `DELETE` → `204`.
`name` : 1 à 60 caractères, unique dans l'espace (insensible à la casse) ; `400` sinon. `DELETE` : `400` si des
opérations ou paiements récurrents y sont rattachés (message : archivez-le plutôt). Un compte archivé n'accepte plus
de nouvelle opération, mais garde son historique.

### Import de relevé
`POST …/imports/preview` et `POST …/imports/commit` acceptent `"accountId"` (optionnel). Au commit, toutes les
opérations créées sont rattachées à ce compte. `400` si le compte n'appartient pas à l'espace ou est archivé. La
détection de doublons reste calculée sur tout l'espace.

### Conseils liés aux comptes
Nouveaux ids d'insights : `account-negative-projected` (`WARNING` : un compte passerait sous zéro avant la fin du mois
d'après `projectedMonthEndCents` ; lien `/comptes`) et `accounts-unassigned` (`INFO` : le mois a des opérations non
rattachées alors que l'espace a au moins un compte ; lien `/comptes`). Aucun des deux pour un espace sans compte.

## Paiements non mensuels et provisions (tranche 5)

Les gros paiements qui ne tombent pas chaque mois (taxe foncière, assurance annuelle, impôt, vacances) cassent un
budget mensuel : on les **lisse** en les provisionnant chaque mois (cf. cours).

### Périodicité des paiements récurrents
Les objets « paiement récurrent » (`GET/POST/PUT …/recurring`) gagnent deux champs :
`"frequency": "MONTHLY" | "QUARTERLY" | "YEARLY"` (défaut `MONTHLY` si absent) et `"monthOfYear": 1-12 | null`.
- `MONTHLY` : comme avant ; `monthOfYear` doit être `null`.
- `YEARLY` : une occurrence par an, au mois `monthOfYear` (obligatoire), au `dayOfMonth` (ou fin de mois si `null`).
- `QUARTERLY` : une occurrence tous les 3 mois à partir de `monthOfYear` (obligatoire, 1-12) : mois m, m+3, m+6, m+9.
- Les occurrences respectent `startDate` / `endDate` comme avant. Le prévisionnel, l'appariement (PAID/MISSING/DUE), les
  aides (dépensé annuel) et les insights n'utilisent que les mois où une occurrence existe.
- `400` si `monthOfYear` manque pour `YEARLY`/`QUARTERLY`, ou est fourni pour `MONTHLY`, ou hors 1-12.
- Les revenus peuvent aussi être non mensuels (prime annuelle, 13e mois).

### `GET /api/spaces/:spaceId/provisions?asOf=AAAA-MM-JJ`
`asOf` par défaut : aujourd'hui. Dépenses **non mensuelles actives** de l'espace, avec ce qu'il faut mettre de côté.
```json
{
  "asOf": "2026-10-30",
  "items": [{
    "recurringId": "…", "label": "Taxe foncière", "bloc": "FIXE", "frequency": "YEARLY",
    "amountCents": 120000, "nextDueDate": "2027-10-15", "monthsUntilDue": 11,
    "monthlyProvisionCents": 10000, "provisionedSoFarCents": null
  }],
  "totalMonthlyProvisionCents": 10000,
  "totalNextTwelveMonthsCents": 120000
}
```
- `monthlyProvisionCents` = montant ÷ 12 pour `YEARLY`, ÷ 3 pour `QUARTERLY`, arrondi à l'entier supérieur.
- `nextDueDate` : prochaine occurrence à partir de `asOf` (incluse), `monthsUntilDue` : mois entiers restants.
- `provisionedSoFarCents` : toujours `null` dans cette tranche (le suivi des provisions viendra avec les projets).
- Triés par `nextDueDate` croissante. `totalNextTwelveMonthsCents` : somme des occurrences dans les 12 mois.

### `GET /api/spaces/:spaceId/forecast/year?year=AAAA`
Vue des 12 mois à partir des paiements récurrents seulement (pas des opérations) pour voir où sont les pics.
```json
{
  "year": 2026,
  "months": [{
    "month": "2026-01", "incomeCents": 380000, "expenseCents": 291000,
    "balanceCents": 89000, "cumulativeCents": 89000, "peak": false,
    "items": [{ "recurringId": "…", "label": "Loyer", "kind": "EXPENSE", "amountCents": 110000 }]
  }],
  "totalIncomeCents": 4560000, "totalExpenseCents": 3492000, "provisionHintCents": 10000
}
```
`peak` : vrai pour un mois dont les dépenses dépassent de 30 % la moyenne mensuelle des dépenses de l'année.
`provisionHintCents` = `totalMonthlyProvisionCents` des provisions. Pour l'espace commun, les revenus récurrents
absents sont complétés comme dans le prévisionnel (contributions supposées : somme des blocs du plan par mois).

### Conseils
Nouveaux ids : `upcoming-big-payment` (`INFO`, une dépense non mensuelle ≥ 20 % du revenu mensuel connu ou ≥ 500 € dans
les 60 jours ; détail : montant, date, provision mensuelle conseillée ; lien `/previsionnel`) et
`provision-suggestion` (`INFO`, des dépenses non mensuelles existent et le bloc `EPARGNE` prévu du plan est inférieur
à `totalMonthlyProvisionCents` ; lien `/plan`).

## Projets d'épargne (tranche 6)

Un **projet** est un objectif daté (naissance, vacances, voiture, travaux, fonds de sécurité) alimenté par des
versements. Il rend concret le bloc `EPARGNE` du plan. Les projets de l'espace commun sont visibles par tout le
foyer ; ceux d'un espace personnel par son propriétaire (chiffrement du nom, de l'objectif et des versements).

### `GET /api/spaces/:spaceId/projects`
```json
[{
  "id": "…", "spaceId": "…", "name": "Vacances été 2027", "kind": "HOLIDAY",
  "targetCents": 300000, "targetDate": "2027-07-01", "startCents": 0, "startDate": "2026-11-01",
  "savedCents": 40000, "remainingCents": 260000, "progressPercent": 13,
  "monthsLeft": 8, "monthlyNeededCents": 32500,
  "status": "BEHIND", "expectedSavedCents": 75000,
  "archived": false, "accountId": null
}]
```
- `kind` : `GENERIC | BABY | HOLIDAY | PURCHASE | HOME | EDUCATION | OTHER`.
- `startCents` : déjà épargné au départ à `startDate` (entier ≥ 0). `savedCents` = `startCents` + versements.
- `remainingCents` = max(0, objectif − épargné) ; `progressPercent` = entier 0-100 (arrondi inférieur, 100 si atteint).
- `monthsLeft` : mois entiers entre aujourd'hui et `targetDate` (0 si passée ou dans le mois) ; `monthlyNeededCents` =
  `remainingCents` ÷ max(1, `monthsLeft`) arrondi à l'entier supérieur (0 si atteint).
- `expectedSavedCents` : épargne attendue aujourd'hui sur une progression linéaire de `startDate` à `targetDate`
  (départ `startCents`, arrivée `targetCents`, bornée entre les deux).
- `status` : `DONE` (objectif atteint) | `LATE` (échéance passée, non atteint) | `AHEAD` (épargné ≥ attendu + 5 % de
  l'objectif) | `BEHIND` (épargné < attendu − 5 % de l'objectif) | `ON_TRACK`.
- Triés : non archivés d'abord, puis par `targetDate` croissante.

### `POST /api/spaces/:spaceId/projects` · `PUT …/:id` · `DELETE …/:id`
Corps : `{ "name", "kind", "targetCents", "targetDate", "startCents", "startDate", "accountId"? }` ; `PUT` accepte en
plus `"archived"`. `201` + l'objet ; `204` pour `PUT`/`DELETE`. `name` 1-80 car. ; `targetCents` entier > 0 ;
`targetDate` postérieure à `startDate` ; `accountId` doit être un compte de l'espace (ex. livret) ou `null`.
`DELETE` supprime aussi ses versements.

### Versements
`GET /api/spaces/:spaceId/projects/:id/deposits` → `[{ "id", "date": "AAAA-MM-JJ", "amountCents", "note": "" }]`
(du plus récent au plus ancien) ; `POST …/deposits` `{ "date", "amountCents", "note"? }` → `201` + l'objet ;
`DELETE …/deposits/:depositId` → `204`. `amountCents` entier non nul (négatif = retrait), la somme ne peut pas rendre
`savedCents` négatif (`400`). `note` ≤ 120 car.

### `GET /api/spaces/:spaceId/projects/summary`
`{ "totalMonthlyNeededCents": 61500, "plannedEpargneCents": 50000, "gapCents": 11500, "activeCount": 2 }`
`totalMonthlyNeededCents` : somme des `monthlyNeededCents` des projets non archivés et non atteints ;
`plannedEpargneCents` : bloc `EPARGNE` du plan de l'espace ; `gapCents` = max(0, besoin − prévu).

### Conseils
Nouveaux ids : `project-behind` (`WARNING`, un projet `BEHIND` ou `LATE` ; détail : nom, retard en euros, versement
mensuel conseillé ; lien `/projets`), `projects-exceed-savings` (`ACTION`, `gapCents` > 0 ; lien `/plan`),
`project-reached` (`GOOD`, un projet atteint dans les 30 derniers jours non archivé ; lien `/projets`).

## Revue mensuelle et export (tranche 7)

Le rituel du cours : une fois par mois, regarder ce qui s'est passé, répondre à trois questions et décider **une**
chose pour le mois suivant. La revue est propre à un espace (commune pour le foyer, personnelle pour son propriétaire ;
réponses chiffrées en espace personnel).

### `GET /api/spaces/:spaceId/reviews/:month` (`month` = `AAAA-MM`)
```json
{
  "month": "2026-10",
  "status": "TODO",
  "answers": { "wentWell": "", "surprise": "", "decision": "" },
  "completedAt": null,
  "snapshot": {
    "incomeCents": 380000, "expenseCents": 351000, "balanceCents": 29000,
    "savingsRatePercent": 8,
    "blocs": [{ "bloc": "FIXE", "plannedCents": 175000, "actualCents": 171000, "deltaCents": -4000 }],
    "topExpenses": [{ "label": "Courses", "amountCents": 142300, "count": 9 }],
    "missingRecurring": [{ "label": "Assurance", "amountCents": 5000 }],
    "unassignedTransactionCount": 0
  }
}
```
- `status` : `TODO` (rien de saisi), `DRAFT` (réponses sauvegardées non terminées), `DONE` (terminée).
- `snapshot` est toujours recalculé à la lecture (jamais stocké) à partir des opérations du mois, du plan et des
  paiements récurrents. `savingsRatePercent` = entier : `balanceCents ÷ incomeCents` arrondi (0 si pas de revenu, peut
  être négatif). `deltaCents` = réel − prévu. `topExpenses` : 5 libellés au plus (regroupés sans casse ni accents,
  triés par montant décroissant), `count` = nombre d'opérations. `missingRecurring` : paiements récurrents `MISSING` du
  mois. Un mois futur renvoie `400`. Mois sans plan : `plannedCents` = 0.

### `PUT /api/spaces/:spaceId/reviews/:month`
Corps : `{ "answers": { "wentWell", "surprise", "decision" }, "complete": false|true }`. `204`. Chaque réponse ≤ 500
caractères. `complete: true` exige une `decision` non vide (`400` sinon) et fixe `completedAt` (le garde si déjà
terminée). Réponses vides + `complete: false` → retombe à `TODO`. Une revue `DONE` reste modifiable.

### `GET /api/spaces/:spaceId/reviews?limit=12`
Historique des revues non `TODO`, de la plus récente à la plus ancienne :
`[{ "month": "2026-09", "status": "DONE", "decision": "…", "completedAt": "…" }]`.

### Conseil
L'insight existant `monthly-review` n'apparaît que si la revue du mois précédent n'est pas `DONE`, avec le lien
`/revue` (route de l'application ajoutée à la liste) ; une fois `DONE`, il laisse place à un `GOOD` `review-done`
(jours 1 à 7 du mois seulement) citant la décision prise.

## Export des données (tranche 7)

### `GET /api/export`
Sauvegarde JSON de **toutes les données auxquelles l'utilisateur a accès** (foyer, espace commun, SON espace personnel,
déchiffré) : `{ "exportedAt", "version": 1, "household", "spaces": [{ "space", "plan", "transactions", "recurring",
"accounts", "projects", "reviews" }], "safetyNet", "fiscalProfile" }`. Jamais l'espace personnel d'un autre membre.
En-tête `Content-Disposition: attachment; filename="budget-export-AAAA-MM-JJ.json"`.

### `GET /api/spaces/:spaceId/transactions/export?from=AAAA-MM-JJ&to=AAAA-MM-JJ`
CSV (UTF-8 avec BOM, séparateur `;`, décimale `,`, colonnes `Date;Type;Bloc;Libellé;Montant;Compte`) des opérations
de la période (limites incluses, 366 jours au plus, `400` sinon). Les libellés commençant par `=`, `+`, `-`, `@` sont
préfixés d'une apostrophe (injection de formules). `Content-Disposition: attachment; filename="operations-AAAA-MM-JJ_AAAA-MM-JJ.csv"`.

## Crédits et dettes (tranche 8)

Suivre un crédit (immobilier, auto, conso) et mesurer ce que rapporterait un remboursement accéléré (leçon sur le
crédit). Rattaché à un espace ; nom et montants chiffrés en espace personnel. Les calculs sont des estimations.

### `GET /api/spaces/:spaceId/debts`
```json
[{
  "id": "…", "spaceId": "…", "name": "Prêt auto", "kind": "CAR",
  "principalCents": 1500000, "remainingCents": 1120000, "annualRatePercent": 3.9,
  "monthlyPaymentCents": 32000, "startDate": "2024-09-01", "paymentDay": 5, "insuranceMonthlyCents": 1500,
  "monthsRemaining": 38, "payoffDate": "2029-12-05", "totalInterestRemainingCents": 96000,
  "paidSharePercent": 25, "archived": false, "recurringId": null
}]
```
- `kind` : `MORTGAGE | CAR | CONSUMER | STUDENT | OTHER`.
- `remainingCents` : capital restant dû **déclaré** (relevé de la banque) ; `principalCents` : capital emprunté.
- `annualRatePercent` : nombre ≥ 0 (TAEG hors assurance, jusqu'à 2 décimales) ; `monthlyPaymentCents` : mensualité
  **hors assurance** ; `insuranceMonthlyCents` : assurance emprunteur mensuelle (≥ 0).
- `monthsRemaining`, `payoffDate`, `totalInterestRemainingCents` : amortissement simulé à partir de `remainingCents`
  avec intérêts mensuels = capital × taux ÷ 12 (arrondi au centime), paiement fixe `monthlyPaymentCents`, dernière
  mensualité ajustée. `null` partout si la mensualité ne couvre pas les intérêts (la dette ne diminue pas) :
  `"neverPaidOff": true` est alors ajouté. `paidSharePercent` = (principal − restant) ÷ principal, entier 0-100.
- `recurringId` : paiement récurrent de l'espace qui représente la mensualité (optionnel) ; s'il est renseigné, il doit
  exister dans l'espace (`400` sinon).

### `POST /api/spaces/:spaceId/debts` · `PUT …/:id` · `DELETE …/:id`
Corps : `{ "name", "kind", "principalCents", "remainingCents", "annualRatePercent", "monthlyPaymentCents", "startDate",
"paymentDay", "insuranceMonthlyCents", "recurringId"? }` ; `PUT` accepte en plus `"archived"`. `201` + l'objet ;
`204`. `name` 1-60 car. ; `remainingCents` ≤ `principalCents` ; `paymentDay` 1-28 ; `400` sinon.

### `GET /api/spaces/:spaceId/debts/:id/what-if?extraMonthlyCents=…&lumpSumCents=…`
Simulation d'un remboursement accéléré (versement mensuel supplémentaire et/ou remboursement partiel immédiat) :
```json
{
  "baseline": { "monthsRemaining": 38, "totalInterestRemainingCents": 96000, "payoffDate": "2029-12-05" },
  "scenario": { "monthsRemaining": 29, "totalInterestRemainingCents": 69000, "payoffDate": "2029-03-05" },
  "interestSavedCents": 27000, "monthsSaved": 9,
  "note": "Vérifiez les indemnités de remboursement anticipé de votre contrat."
}
```
`extraMonthlyCents` et `lumpSumCents` entiers ≥ 0 (au moins un > 0, sinon `400`) ; plafonnés à `remainingCents`.

### `GET /api/spaces/:spaceId/debts/summary`
`{ "activeCount": 2, "totalRemainingCents": 21800000, "totalMonthlyCents": 112000, "debtToIncomePercent": 31 }` :
mensualités + assurances des dettes actives ÷ revenus mensuels (somme des revenus du foyer pour le commun ; revenu du
membre pour le perso ; `null` si inconnu). Au-dessus de 35 %, l'insight `debt-ratio-high` (`WARNING`, lien `/dettes`)
est émis (seuil de 35 % : repère du cours, pas une règle de droit) ; `debt-never-paid-off` (`ACTION`) si
`neverPaidOff`.

## Chiffrement de l'espace personnel (informatif)

Les libellés et montants des opérations de l'espace personnel, ainsi que son plan, sont chiffrés au repos
(AES-256-GCM, clé dérivée par utilisateur depuis `PERSONAL_DATA_KEY`). L'API les renvoie en clair à leur
propriétaire. Limite connue : celui qui détient `PERSONAL_DATA_KEY` (l'hébergeur) peut les déchiffrer ;
une clé protégée par un secret propre à chaque utilisateur est une évolution prévue.
