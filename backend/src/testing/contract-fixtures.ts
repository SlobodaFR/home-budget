/**
 * Textes de contrats de prêt FICTIFS (noms d'établissements inventés, valeurs
 * arbitraires) reproduisant des mises en page variées. Aucun document réel.
 */

/** Offre de prêt immobilier classique, libellés explicites, une page. */
export const IMMO_CLEAN = `
OFFRE DE PRÊT IMMOBILIER
Référence du contrat : PI-2024-004517

Entre les soussignés :
La société Banque Exemple, société anonyme au capital de 1 000 000 euros, dont le siège social est situé
12 rue de la Paix, 75002 Paris, ci-après dénommée « le Prêteur »,
et M. Jean Dupont, ci-après « l'Emprunteur ».

CARACTÉRISTIQUES DU PRÊT
Établissement prêteur : Banque Exemple SA
Montant du crédit : 150 000,00 €
Durée du prêt : 20 ans (240 mois)
Taux débiteur annuel fixe : 3,45 % l'an
Taux annuel effectif global (TAEG) : 3,89 %
Mensualité hors assurance : 862,33 €
Assurance emprunteur : 35,00 € par mois
Mensualité avec assurance : 897,33 €
Frais de dossier : 900,00 €
Garantie : Caution Crédit Logement
Frais de garantie : 1 500,00 €
Date de première échéance : 05/04/2024
`;

/** Crédit auto en mise en page à deux colonnes (espaces de colonnes, points de conduite). */
export const AUTO_COLUMNS = `
CRÉDIT DU NORD-TEST
Offre préalable de crédit affecté - véhicule

Prêteur                                   Crédit du Nord-Test
Numéro de contrat                         CA-77120-3391
Montant total du crédit ................. 18 500,00 EUR
Durée du contrat ........................ 60 mois
Taux débiteur fixe ...................... 4,90 %
TAEG fixe ............................... 5,79 %
Montant des échéances (hors assurance) .. 348,07 €
Assurance facultative ................... 12,50 € / mois
Coût total du crédit .................... 2 384,20 €
Montant total dû par l'emprunteur ....... 20 884,20 €
Frais de dossier ........................ 150 €
`;

/** Tableau « en-têtes puis valeurs ». */
export const TABLE_LAYOUT = `
Banque Exemple - Tableau récapitulatif de l'offre de prêt

Montant du crédit      Durée du prêt      Taux débiteur      TAEG
120 000,00 €          180 mois           2,95 %            3,40 %
`;

/** Libellés sur une ligne, valeurs sur la suivante (formulaire). */
export const FORM_NEXT_LINE = `
OFFRE DE CRÉDIT
Nom du prêteur
Banque Exemple Régionale
Montant du crédit
85 000,00 €
Durée du crédit
15 ans
Taux débiteur annuel
3,10 %
Mensualité hors assurance
591,24 €
`;

/** Prêt à deux paliers de taux : plusieurs taux plausibles. */
export const MULTI_RATES = `
Banque Exemple
Offre de prêt à paliers
Montant du prêt : 200 000,00 €
Durée du prêt : 25 ans
Taux débiteur (phase 1, 60 premiers mois) : 3,45 %
Taux débiteur (phase 2, mois suivants) : 3,85 %
TAEG : 3,70 %
`;

/** Seul le TAEG figure dans le document. */
export const TAEG_ONLY = `
Banque Exemple - Fiche d'information précontractuelle
Montant du crédit : 90 000,00 €
Durée du crédit : 20 ans
Taux annuel effectif global (TAEG) : 3,89 %
Mensualité hors assurance : 524,10 €
`;

/** Taux d'assurance en % du capital initial, mensualité assurance comprise seulement. */
export const INSURANCE_RATE_ONLY_TOTAL = `
Crédit Exemple Immobilier
Offre de prêt n° 2023-98412
Montant du prêt : 180 000,00 €
Durée du prêt : 240 mois
Taux d'intérêt nominal : 3,20 %
Taux annuel de l'assurance : 0,36 % du capital initial
Échéance assurance comprise : 1 078,41 €
`;

/** Assurance calculée sur le capital restant dû. */
export const INSURANCE_REMAINING = `
Banque Exemple
Prêt immobilier - conditions particulières
Montant emprunté : 250 000,00 €
Durée : 300 mois
Taux d'intérêt : 3,60 %
Mensualité hors assurance : 1 263,05 €
Assurance emprunteur
Taux de cotisation : 0,28 % l'an
Cotisation calculée sur le capital restant dû
`;

/** Texte bruité par l'OCR : confusions O/0, l/1, S/5, B/8 dans les chiffres. */
export const OCR_NOISY_DIGITS = `
Banque Exemple
Offre de prêt immobilier
Établissement prêteur : Banque Exemple
Montant du crédit : l50 000,OO €
Durée du prêt : 24O mois
Taux débiteur : 3,4S %
Frais de dossier : 9OO,00 €
Mensualité hors assurance : 862,33 €
`;

/** Texte très dégradé : caractères parasites et mots illisibles. */
export const OCR_GARBAGE = `
B@nqu3 Ex€mpl# ~~ |||| prèt imm0bil1er
M0ntant du cr£d1t : 15O 0OO,OO €
Dur@e du pr^t : 2O ans
T@ux d€b1t€ur : 3,4S %
xrtq wzkp nnbvc hgfdsa qwrtp zxcvb ¤§¤ ¦¦ ~~~ ^^^ ¨¨
lkjhgf mnbvcx qpwoei rutyzl kdjfhg sdlkfj wmcnvb poiuyt
tgbnhy ujmikl oplkmn bvcxzs aqwsed rfvtgb yhnujm ikolpm
`;

/** Document sans rapport avec un prêt. */
export const UNRELATED = `
FACTURE D'ÉLECTRICITÉ
Fournisseur Énergie Exemple
Consommation du 01/01/2024 au 31/01/2024 : 412 kWh
Montant à payer : 84,52 €
Date limite de paiement : 15/02/2024
Merci de votre confiance. Pour toute question, contactez notre service client du lundi au vendredi.
Le présent document ne constitue pas une offre commerciale et vous est adressé pour information.
`;

/** Prêt à taux zéro avec privilège de prêteur de deniers, durée en années et mois. */
export const PTZ = `
Banque Exemple
Prêt à taux zéro (PTZ)
Montant du prêt : 32 000,00 €
Durée totale du prêt : 20 ans et 6 mois
Taux débiteur : 0,00 %
Taux annuel effectif global : 0,00 %
Garantie : privilège de prêteur de deniers
Frais de dossier : néant
Date de mise à disposition des fonds : 1er mars 2024
`;

/** Texte sans accents (OCR en anglais). */
export const NO_ACCENTS = `
Etablissement preteur : Banque Exemple
Reference du pret : LC-2022-554821
Montant du pret : 95 000,00 euros
Duree du pret : 25 ans
Taux debiteur : 2,75 %
Mensualite hors assurance : 436,29 euros
Frais de dossier : 475,00 euros
Garantie : hypotheque conventionnelle
`;

/** Taux variable plafonné, texte qui évoque aussi d'autres types de taux. */
export const VARIABLE_RATE = `
Banque Exemple
Type de taux : variable capé
Montant du crédit : 140 000,00 €
Durée : 22 ans
Taux d'intérêt initial : 3,05 %
Le taux peut évoluer selon l'indice Euribor 3 mois + marge de 1,20 %.
Vous pouvez choisir un taux fixe ou variable lors de la souscription.
`;

/** Contrat de 3 pages : les informations sont réparties. */
export const MULTI_PAGE = [
  `CONTRAT DE PRÊT
Établissement prêteur : Banque Exemple
Référence du contrat : 2024/PR/00871
Conditions générales — article 1 : objet du contrat`,
  `Article 2 : caractéristiques
Montant du crédit : 210 000,00 €
Durée du prêt : 300 mois
Mensualité hors assurance : 1 069,42 €`,
  `Article 3 : taux
Le prêt est consenti au taux débiteur fixe de 3,15 % l'an.
Frais de dossier : 1 050,00 €
Garantie : hypothèque conventionnelle
Frais d'hypothèque : 2 310,00 €
`,
];

/** Prêteur indiqué seulement par « ci-après le Prêteur ». */
export const LENDER_BY_DEFINITION = `
Entre les soussignés :
Banque Exemple Atlantique, société anonyme à directoire au capital de 480 000 000 euros, RCS Nantes 123 456 789,
dont le siège est 1 place des Armateurs, 44000 Nantes, ci-après dénommée « le Prêteur »,
Montant du prêt : 60 000,00 €
Durée : 12 ans
Taux d'intérêt annuel : 2,40 %
`;

/** Prêteur douteux : on ne propose rien plutôt que de deviner. */
export const LENDER_DOUBTFUL = `
Prêteur : dont le siège est situé à Lyon, représenté par son directeur
Montant du prêt : 60 000,00 €
Durée : 12 ans
Taux d'intérêt annuel : 2,40 %
Taux annuel effectif global : 2,95 %
`;

/** Établissement connu cité sans libellé. */
export const KNOWN_BANK_ONLY = `
Société Générale
Offre de prêt personnel
Montant du crédit : 15 000,00 €
Durée : 48 mois
Taux débiteur : 5,20 %
Assurance facultative : 9,80 € par mois
`;

/** Offre longue avec les clauses habituelles (rétractation, remboursement anticipé, usure…) : tests de faux positifs. */
export const REALISTIC_LONG = [
  `BANQUE EXEMPLE
Société anonyme au capital de 250 000 000 euros - RCS Paris 552 000 000
OFFRE DE PRÊT IMMOBILIER N° 2024-0047781
Émise le 12 février 2024
Offre valable 30 jours à compter de sa réception par l'emprunteur.

I - LES PARTIES
Le Prêteur : Banque Exemple, société anonyme, dont le siège social est situé 8 boulevard des Tests, 75009 Paris.
L'Emprunteur : Madame Claire Martin, née le 04/05/1985, demeurant 14 rue des Lilas 59000 Lille.

II - CARACTÉRISTIQUES DU PRÊT
Prêt immobilier amortissable
Objet : acquisition de la résidence principale
Montant du prêt : 235 000,00 euros
Durée du prêt : 25 ans, soit 300 mois, dont 0 mois de différé
Taux d'intérêt nominal annuel fixe : 3,70 %
Périodicité : mensuelle
Montant de l'échéance hors assurance : 1 198,64 euros
Montant de l'assurance : 58,75 euros par mois
Montant de l'échéance assurance comprise : 1 257,39 euros
Taux annuel effectif global (TAEG) : 4,41 % (hors garantie), assurance incluse
Coût total du crédit : 126 128,60 euros
Montant total dû par l'emprunteur : 361 128,60 euros`,
  `III - GARANTIE
Le prêt est garanti par un cautionnement de la société Crédit Logement. Frais de caution : 2 116,00 euros dont 1 410,67 euros remboursables.
Frais de dossier : 1 000,00 euros.

IV - CONDITIONS GÉNÉRALES
Article 5 - Faculté de rétractation : l'emprunteur dispose d'un délai de rétractation de 14 jours calendaires.
Article 6 - Remboursement anticipé : une indemnité égale à 6 mois d'intérêts sur le capital remboursé, plafonnée à 3 % du capital restant dû, est due.
Article 7 - Défaillance : en cas de retard de paiement, le taux d'intérêt de retard est majoré de 3 points. Le taux de l'usure applicable est de 6,12 %.
Article 8 - Assurance : l'assurance emprunteur couvre le décès à hauteur de 100 % du capital emprunté. Quotité assurée : 100 %.
Le taux de cotisation de l'assurance est de 0,30 % du capital initial.
Article 9 - Première échéance : le prélèvement de la première échéance intervient le 05/05/2024.
Le taux ne peut être révisé en cours de prêt : ce prêt est à taux fixe.`,
];
