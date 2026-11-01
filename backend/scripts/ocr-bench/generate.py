#!/usr/bin/env python3
"""Génère des scans FICTIFS de contrats de prêt en français, à plusieurs niveaux de dégradation.

Aucun document réel : noms d'établissements inventés, valeurs arbitraires. Chaque contrat est
dessiné à 300 dpi avec Pillow (polices avec accents), puis dégradé :

  clean300  propre, 300 dpi
  dpi150    150 dpi
  noisy     200 dpi, bruit, rotation de 1,5°, contraste réduit, JPEG qualité 55
  blur      200 dpi, flou gaussien, léger bruit, rotation de -1°
  dpi100    100 dpi (photo de mauvaise définition)
  hard      150 dpi, bruit fort, flou, rotation de 2°, ombrage inégal, JPEG qualité 35

Sortie : <out>/images/<doc>_<variante>.(png|jpg) et <out>/truth.json (texte exact dessiné et
valeurs attendues par champ).

Usage : python3 -I generate.py --out /tmp/ocr-bench/data
"""
import argparse
import json
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

FONT_DIRS = {
    "sans": ["/usr/share/fonts/truetype/freefont/FreeSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    "sansb": ["/usr/share/fonts/truetype/freefont/FreeSansBold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "serif": ["/usr/share/fonts/truetype/freefont/FreeSerif.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
    "carlito": ["/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    "carlitob": ["/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
}
DPI = 300
PAGE = (int(8.27 * DPI), int(11.69 * DPI))  # A4


def font(kind, pt):
    for path in FONT_DIRS[kind]:
        if os.path.exists(path):
            return ImageFont.truetype(path, round(pt * DPI / 72))
    raise SystemExit(f"Aucune police trouvée pour {kind}")


def monthly_cents(principal_cents, rate_percent, months):
    r = rate_percent / 100 / 12
    payment = principal_cents * r / (1 - (1 + r) ** -months) if r else principal_cents / months
    return round(payment)


def euros(cents, symbol="€"):
    whole, rest = divmod(cents, 100)
    return f"{whole:,}".replace(",", " ") + f",{rest:02d} {symbol}"


def pct(hundredths):
    return f"{hundredths // 100},{hundredths % 100:02d} %"


def doc_immo():
    principal, rate, months = 15_000_000, 345, 240
    pay = monthly_cents(principal, rate / 100, months)
    ins = 3_500
    rows = [
        ("title", "BANQUE EXEMPLE"),
        ("subtitle", "Offre de prêt immobilier"),
        ("gap", ""),
        ("kv", "Référence du contrat", "PI-2024-004517"),
        ("kv", "Établissement prêteur", "Banque Exemple SA"),
        ("kv", "Montant du crédit", euros(principal)),
        ("kv", "Durée du prêt", f"{months} mois"),
        ("kv", "Taux débiteur annuel fixe", pct(rate)),
        ("kv", "Taux annuel effectif global (TAEG)", "3,89 %"),
        ("kv", "Mensualité hors assurance", euros(pay)),
        ("kv", "Assurance emprunteur", euros(ins) + " par mois"),
        ("kv", "Mensualité avec assurance", euros(pay + ins)),
        ("kv", "Frais de dossier", euros(90_000)),
        ("kv", "Garantie", "Caution Crédit Logement"),
        ("kv", "Frais de garantie", euros(150_000)),
        ("kv", "Date de première échéance", "05/04/2024"),
        ("gap", ""),
        ("p", "L'emprunteur dispose d'un délai de rétractation de quatorze jours calendaires révolus"),
        ("p", "à compter de l'acceptation de l'offre. Le prêt n'est définitivement conclu qu'à"),
        ("p", "l'expiration de ce délai. Toute modification doit être convenue par écrit."),
    ]
    expected = {
        "lender": "Banque Exemple", "contractReference": "PI-2024-004517", "principalCents": principal,
        "annualRatePercent": 3.45, "initialTermMonths": months, "monthlyPaymentCents": pay,
        "insuranceMonthlyCents": ins, "feesCents": 90_000, "guaranteeKind": "SURETY",
        "guaranteeCents": 150_000, "startDate": "2024-04-05", "rateType": "FIXED",
    }
    keys = [euros(principal), pct(rate), f"{months} mois", euros(pay), euros(ins), euros(90_000), euros(150_000), "05/04/2024", "PI-2024-004517"]
    return {"id": "immo", "font": "sans", "bold": "sansb", "pt": 11.5, "layout": "colon", "rows": rows, "expected": expected, "keys": keys}


def doc_auto():
    principal, rate, months = 1_850_000, 490, 60
    pay = monthly_cents(principal, rate / 100, months)
    rows = [
        ("title", "CRÉDIT DU NORD-TEST"),
        ("subtitle", "Offre préalable de crédit affecté — véhicule"),
        ("gap", ""),
        ("kv", "Prêteur", "Crédit du Nord-Test"),
        ("kv", "Numéro de contrat", "CA-77120-3391"),
        ("kv", "Montant total du crédit", euros(principal, "EUR")),
        ("kv", "Durée du contrat", f"{months} mois"),
        ("kv", "Taux débiteur fixe", pct(rate)),
        ("kv", "TAEG fixe", "5,79 %"),
        ("kv", "Montant des échéances (hors assurance)", euros(pay, "EUR")),
        ("kv", "Assurance facultative", euros(1_250) + " / mois"),
        ("kv", "Coût total du crédit", euros(238_420)),
        ("kv", "Montant total dû par l'emprunteur", euros(principal + 238_420)),
        ("kv", "Frais de dossier", "150 €"),
        ("gap", ""),
        ("p", "Vous disposez d'un délai de rétractation de quatorze jours. Le prêteur vous"),
        ("p", "adressera le tableau d'amortissement détaillé après la signature du contrat."),
    ]
    expected = {
        "lender": "Crédit du Nord-Test", "contractReference": "CA-77120-3391", "principalCents": principal,
        "annualRatePercent": 4.9, "initialTermMonths": months, "monthlyPaymentCents": pay,
        "insuranceMonthlyCents": 1_250, "feesCents": 15_000, "rateType": "FIXED",
    }
    keys = [euros(principal, "EUR"), pct(rate), f"{months} mois", euros(pay, "EUR"), euros(1_250), "150 €", "CA-77120-3391"]
    return {"id": "auto", "font": "carlito", "bold": "carlitob", "pt": 12.5, "layout": "columns", "rows": rows, "expected": expected, "keys": keys}


def doc_conso():
    principal, rate, months = 3_250_000, 510, 84
    pay = monthly_cents(principal, rate / 100, months)
    rows = [
        ("title", "Crédit Exemple Consommation"),
        ("subtitle", "Contrat de prêt personnel — travaux"),
        ("gap", ""),
        ("kv", "Établissement prêteur", "Crédit Exemple Conso"),
        ("kv", "Référence du prêt", "PP/2024/0098145"),
        ("kv", "Montant emprunté", euros(principal)),
        ("kv", "Durée", "7 ans (84 mois)"),
        ("kv", "Taux d'intérêt nominal", pct(rate)),
        ("kv", "TAEG", "5,95 %"),
        ("kv", "Mensualité hors assurance", euros(pay)),
        ("kv", "Taux annuel de l'assurance", "0,42 % du capital initial"),
        ("kv", "Frais de dossier", euros(32_500)),
        ("kv", "Date de début du prêt", "15 mars 2024"),
        ("gap", ""),
        ("p", "Le présent contrat est soumis aux dispositions du code de la consommation. En cas"),
        ("p", "de défaillance, l'emprunteur reste tenu du remboursement des sommes restant dues."),
    ]
    expected = {
        "lender": "Crédit Exemple Conso", "contractReference": "PP/2024/0098145", "principalCents": principal,
        "annualRatePercent": 5.1, "initialTermMonths": months, "monthlyPaymentCents": pay,
        "insuranceRatePercent": 0.42, "insuranceMode": "PERCENT_INITIAL", "feesCents": 32_500,
        "startDate": "2024-03-15",
    }
    keys = [euros(principal), pct(rate), "7 ans (84 mois)", euros(pay), "0,42 %", euros(32_500), "15 mars 2024", "PP/2024/0098145"]
    return {"id": "conso", "font": "serif", "bold": "sansb", "pt": 12, "layout": "colon", "rows": rows, "expected": expected, "keys": keys}


def render(doc):
    """Dessine le document à 300 dpi ; retourne (image, texte exact dessiné)."""
    image = Image.new("L", PAGE, 255)
    draw = ImageDraw.Draw(image)
    body, bold = font(doc["font"], doc["pt"]), font(doc["bold"], doc["pt"] + 3)
    margin_x, y = int(0.9 * DPI), int(1.0 * DPI)
    line_h = int(doc["pt"] * DPI / 72 * 1.9)
    value_x = int(4.1 * DPI) if doc["layout"] == "columns" else None
    lines = []
    for row in doc["rows"]:
        kind = row[0]
        if kind == "gap":
            y += line_h // 2
            continue
        if kind in ("title", "subtitle"):
            draw.text((margin_x, y), row[1], font=bold, fill=0)
            lines.append(row[1])
            y += int(line_h * 1.3)
        elif kind == "kv":
            label, value = row[1], row[2]
            if doc["layout"] == "columns":
                draw.text((margin_x, y), label, font=body, fill=0)
                draw.text((value_x, y), value, font=body, fill=0)
                lines.append(f"{label}  {value}")
            else:
                text = f"{label} : {value}"
                draw.text((margin_x, y), text, font=body, fill=0)
                lines.append(text)
            y += line_h
        else:
            draw.text((margin_x, y), row[1], font=body, fill=0)
            lines.append(row[1])
            y += line_h
    return image, "\n".join(lines)


def degrade(image, variant, rng):
    if variant == "clean300":
        return image, "png"
    if variant == "dpi150":
        return image.resize((image.width // 2, image.height // 2), Image.LANCZOS), "png"
    scale = 200 / DPI
    small = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    if variant == "noisy":
        arr = np.asarray(small, dtype=np.float32)
        arr = 255 - (255 - arr) * 0.82  # encre moins contrastée
        arr += rng.normal(0, 12, arr.shape)
        noisy = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        noisy = noisy.rotate(1.5, resample=Image.BICUBIC, expand=False, fillcolor=244)
        return noisy, "jpg"
    if variant == "blur":
        blurred = small.filter(ImageFilter.GaussianBlur(1.4))
        arr = np.asarray(blurred, dtype=np.float32) + rng.normal(0, 4, (blurred.height, blurred.width))
        out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        out = out.rotate(-1.0, resample=Image.BICUBIC, expand=False, fillcolor=250)
        return ImageEnhance.Contrast(out).enhance(0.9), "png"
    if variant == "dpi100":
        return image.resize((image.width // 3, image.height // 3), Image.LANCZOS), "png"
    if variant == "hard":
        small = image.resize((image.width // 2, image.height // 2), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.0))
        arr = np.asarray(small, dtype=np.float32)
        arr = 255 - (255 - arr) * 0.7
        yy, xx = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
        arr *= 1 - 0.18 * (xx / arr.shape[1]) - 0.1 * (yy / arr.shape[0])  # ombrage inégal
        arr += rng.normal(0, 22, arr.shape)
        out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        return out.rotate(2.0, resample=Image.BICUBIC, expand=False, fillcolor=225), "jpg"
    raise ValueError(variant)


VARIANTS = ["clean300", "dpi150", "noisy", "blur", "dpi100", "hard"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="/tmp/ocr-bench/data")
    parser.add_argument("--seed", type=int, default=13)
    args = parser.parse_args()
    images_dir = os.path.join(args.out, "images")
    os.makedirs(images_dir, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    random.seed(args.seed)
    truth = {}
    for doc in (doc_immo(), doc_auto(), doc_conso()):
        master, text = render(doc)
        for variant in VARIANTS:
            image, ext = degrade(master, variant, rng)
            name = f"{doc['id']}_{variant}"
            path = os.path.join(images_dir, f"{name}.{ext}")
            if ext == "jpg":
                image.save(path, quality=35 if variant == "hard" else 55)
            else:
                image.save(path, dpi=(image.width / 8.27, image.height / 11.69))
            truth[name] = {"doc": doc["id"], "variant": variant, "image": path, "text": text,
                           "expected": doc["expected"], "keys": doc["keys"]}
    with open(os.path.join(args.out, "truth.json"), "w", encoding="utf-8") as handle:
        json.dump(truth, handle, ensure_ascii=False, indent=1)
    print(f"{len(truth)} images dans {images_dir}")


if __name__ == "__main__":
    main()
