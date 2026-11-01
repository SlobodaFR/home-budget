# Banc d'essai OCR (import de contrat de prêt, tranche 13)

Génère des scans **fictifs** de contrats de prêt en français, à plusieurs niveaux de
dégradation, et compare des moteurs d'OCR sur ce qui compte : montants, taux, durée,
mensualité, accents. Hors couverture de tests (`src/` seulement) et jamais déployé.

## Utilisation

```bash
npm run build --workspace=backend                       # l'extracteur compilé sert à noter les champs
# polices avec accents + Pillow, numpy, rapidfuzz : pip install --break-system-packages pillow numpy rapidfuzz
python3 -I backend/scripts/ocr-bench/generate.py --out /tmp/ocr-bench/data
# dossier de modèles tesseract contenant fra.traineddata (variante « fast »), ex. :
mkdir -p /tmp/tessdata && curl -L -o /tmp/tessdata/fra.traineddata \
  https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/fra.traineddata
cp /usr/share/tesseract-ocr/*/tessdata/eng.traineddata /tmp/tessdata/
python3 -I backend/scripts/ocr-bench/bench.py --data /tmp/ocr-bench/data \
  --dist backend/dist --tessdata /tmp/tessdata --out /tmp/ocr-bench/results
```

Options : `--tessdata-best` (dossier avec `fra.traineddata` « best »), `--ocrs-detect-model` /
`--ocrs-rec-model` (modèles `.rten` d'`ocrs`, binaire `ocrs` dans le `PATH` ; sans eux, `ocrs`
tente de les télécharger au premier lancement et est signalé « indisponible » en cas d'échec).

Variantes : `clean300`, `dpi150`, `noisy` (200 dpi, bruit, rotation 1,5°, JPEG q55), `blur` (flou),
`dpi100`, `hard` (150 dpi, bruit fort, flou, rotation 2°, ombrage, JPEG q35 : scan quasi illisible).
Mesures : CER, rappel des accents, rappel des chiffres / `,` / `%` / `€`, valeurs-clés lues à
l'identique, puis exactitude des champs extraits (justes / faux / faux **avec confiance HIGH** / absents).

## Résultats (3 contrats × 6 variantes = 18 images, A4, tesseract 5.3.4, 1 thread)

Variantes lisibles (clean300, dpi150, noisy, blur, dpi100) :

| Configuration | CER % | accents % | chiffres,%€ % | champs justes % | faux (dont HIGH) | s/page |
|---|---|---|---|---|---|---|
| tesseract fra (fast) psm 6 + espaces conservés (**adaptateur**) | 0,17 | 100 | 99,5 | 98,7 | 1 (1) | 0,4 |
| tesseract fra psm 6 sans `preserve_interword_spaces` | 0,17 | 100 | 99,5 | 95,5 | 6 (1) | 0,4 |
| tesseract fra psm 4 | 0,29 | 100 | 99,6 | 98,1 | 2 (2) | 0,5 |
| tesseract fra psm 3 | 0,14 | 100 | 99,7 | 99,4 | 1 (1) | 0,5 |
| tesseract fra **best** psm 6 + espaces | 0,14 | 100 | 99,9 | 99,4 | 1 (0) | 0,5 |
| tesseract eng psm 6 (témoin : sans accents) | 1,5 | 67 | 100 | 96,8 | 2 (2) | 0,5 |
| ocrs | non mesuré : modèles non téléchargeables ici (accès bloqué par la politique réseau) | | | | | |

Variante `hard` (illisible) : psm 6 reste le seul réglage qui sort du texte (champs justes 13 %, 5,5 s/page) ;
psm 3 et 4 ne lisent presque rien (0 %). Aucune configuration n'est fiable à ce niveau : l'import doit
alors signaler un texte de mauvaise qualité (c'est le cas) et l'utilisateur saisir à la main.

Limites : documents synthétiques (polices nettes, une page) ; les erreurs réelles de chiffres
(900 lu 200, 3 lu 8) existent et ne sont attrapées que par la validation de l'utilisateur et le
recoupement capital / taux / durée / mensualité.
