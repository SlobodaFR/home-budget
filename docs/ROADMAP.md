# Feuille de route et limites connues

## Fait (tranches 1 a 11)

Voir le tableau « Fonctionnalites » du README. Chaque tranche est testee (unitaires, e2e HTTP, e2e Chromium sur le vrai
backend) et livree avec sa migration reversible.

## Regles officielles a revoir chaque annee

Ces valeurs sont en code, avec `verifiedOn` : les remettre a jour (et la date) quand elles changent.

- Credit d'impot garde d'enfants hors domicile : 50 %, plafond de depenses 3 500 € par enfant de moins de 6 ans.
- Credit d'impot services a la personne : 50 %, plafond 12 000 € + 1 500 € par enfant, limite 15 000 € (18 000 € la 1re annee).
- Bareme PSU des creches (taux d'effort, plancher 814,62 €/mois, plafond de ressources 8 500 €/mois a confirmer pour 2026).
- Catalogue des demarches de naissance (delais, conges : congé supplementaire de naissance depuis le 1er juillet 2026).
- Seuil d'endettement de 35 % : repere pedagogique, pas une regle de droit.

## Idees pour la suite

- **Virements entre comptes** (le suivi des contributions couvre le cas commun/perso ; les virements generiques restent a faire).
- **Conseil par IA via API** (a envisager en dernier : les conseils actuels sont deterministes et auditables) ; garde-fous
  prevus : aucune donnee de l'espace personnel envoyee sans accord explicite, pas de conseil de placement.
- **Lecture de tickets de caisse et de releves scannes** (OCR / vision), avec validation humaine avant enregistrement.
- **Notifications** (rappels de demarches, paiements attendus) : necessite le push web ; a evaluer sur iOS.
- **Autres evenements de vie** (demenagement, achat immobilier, separation, changement de travail).
- **Cle de chiffrement propre a chaque utilisateur** : aujourd'hui l'hebergeur detient `PERSONAL_DATA_KEY`.

## Limites connues

- Connexion reelle via auth.sloboda.fr non testee de bout en bout dans les e2e (mode dev uniquement).
- Comportement de la PWA sur iOS non teste sur appareil.
- Le webhook de deconnexion transmet son secret dans l'URL.
- Pas de cle d'idempotence sur la creation d'operations (un rejeu reseau pourrait dupliquer).
- Image Docker en Node 20 alors que `.nvmrc` indique Node 24 : a aligner (la CI teste en Node 24).
- Les etapes de naissance supposent une naissance (pas une adoption) ; les conditions varient selon la situation.
