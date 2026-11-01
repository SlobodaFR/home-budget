#!/usr/bin/env python3
"""Compare des moteurs d'OCR sur les scans fictifs de generate.py.

Pour chaque (configuration de moteur, image) : taux d'erreur caractère (CER), rappel des
caractères accentués, rappel des chiffres/virgules/%/€, présence exacte des valeurs-clés
(« 150 000,00 € », « 3,45 % »…), puis exactitude des CHAMPS extraits par l'extracteur du backend
(valeurs justes, absentes, fausses, et fausses avec confiance HIGH = le cas dangereux).

Usage :
  python3 -I bench.py --data /tmp/ocr-bench/data --dist ../../dist --tessdata /tmp/ocr-bench/tessdata \
      [--ocrs-detect-model D.rten --ocrs-rec-model R.rten] --out /tmp/ocr-bench/results
Le dossier --tessdata doit contenir fra.traineddata (et eng.traineddata) ; --tessdata-best : variante « best » facultative.
"""
import argparse
import collections
import json
import os
import re
import shutil
import statistics
import subprocess
import time

from rapidfuzz.distance import Levenshtein

ACCENTS = set("àâäçéèêëîïôöùûüÿœÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒ")
NUMERIC = set("0123456789,%€")


def norm(text):
    return re.sub(r"\s+", " ", text).strip()


def multiset_recall(truth, out, charset):
    expected = collections.Counter(c for c in truth if c in charset)
    got = collections.Counter(c for c in out if c in charset)
    total = sum(expected.values())
    return sum(min(n, got[c]) for c, n in expected.items()) / total if total else 1.0


def run_tesseract(image, tessdata, lang, psm, preserve, timeout=120):
    env = {"PATH": os.environ["PATH"], "TESSDATA_PREFIX": tessdata, "OMP_THREAD_LIMIT": "1", "LANG": "C.UTF-8"}
    args = ["tesseract", image, "stdout", "-l", lang, "--psm", str(psm)]
    if preserve:
        args += ["-c", "preserve_interword_spaces=1"]
    started = time.time()
    done = subprocess.run(args, capture_output=True, env=env, timeout=timeout)
    if done.returncode != 0:
        raise RuntimeError(done.stderr.decode("utf-8", "replace")[-300:])
    return done.stdout.decode("utf-8", "replace"), time.time() - started


def run_ocrs(image, detect, rec, timeout=120):
    args = ["ocrs", image]
    if detect and rec:
        args += ["--detect-model", detect, "--rec-model", rec]
    started = time.time()
    done = subprocess.run(args, capture_output=True, timeout=timeout)
    if done.returncode != 0:
        raise RuntimeError(done.stderr.decode("utf-8", "replace").strip().splitlines()[0][:200])
    return done.stdout.decode("utf-8", "replace"), time.time() - started


def extract_fields(texts, dist):
    here = os.path.dirname(os.path.abspath(__file__))
    done = subprocess.run(["node", os.path.join(here, "extract-fields.js"), dist],
                          input=json.dumps(texts).encode(), capture_output=True, check=True)
    return json.loads(done.stdout)


def score_fields(expected, result):
    found = {f["field"]: f for f in result["fields"]}
    right = wrong = missing = wrong_high = 0
    for name, want in expected.items():
        got = found.get(name)
        if got is None:
            missing += 1
        elif got["value"] == want or (isinstance(want, float) and abs(got["value"] - want) < 1e-9):
            right += 1
        else:
            wrong += 1
            wrong_high += got["confidence"] == "HIGH"
    extra = [n for n in found if n not in expected]
    return {"right": right, "wrong": wrong, "missing": missing, "wrong_high": wrong_high,
            "expected": len(expected), "extra": extra}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="/tmp/ocr-bench/data")
    parser.add_argument("--dist", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../dist"))
    parser.add_argument("--tessdata", required=True)
    parser.add_argument("--tessdata-best")
    parser.add_argument("--ocrs-detect-model")
    parser.add_argument("--ocrs-rec-model")
    parser.add_argument("--out", default="/tmp/ocr-bench/results")
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    truth = json.load(open(os.path.join(args.data, "truth.json"), encoding="utf-8"))

    have_fra = os.path.exists(os.path.join(args.tessdata, "fra.traineddata"))
    configs = []
    if have_fra:
        configs += [("tesseract fra psm6 +espaces (adaptateur)", lambda i: run_tesseract(i, args.tessdata, "fra", 6, True)),
                    ("tesseract fra psm6", lambda i: run_tesseract(i, args.tessdata, "fra", 6, False)),
                    ("tesseract fra psm4", lambda i: run_tesseract(i, args.tessdata, "fra", 4, True)),
                    ("tesseract fra psm3", lambda i: run_tesseract(i, args.tessdata, "fra", 3, True))]
    else:
        print("ATTENTION : fra.traineddata absent, comparaison en eng seulement")
    if args.tessdata_best and os.path.exists(os.path.join(args.tessdata_best, "fra.traineddata")):
        configs.append(("tesseract fra BEST psm6 +espaces", lambda i: run_tesseract(i, args.tessdata_best, "fra", 6, True)))
    configs.append(("tesseract eng psm6 +espaces (témoin sans accents)", lambda i: run_tesseract(i, args.tessdata, "eng", 6, True)))
    if shutil.which("ocrs"):
        configs.append(("ocrs", lambda i: run_ocrs(i, args.ocrs_detect_model, args.ocrs_rec_model)))

    rows, errors = [], {}
    for cname, runner in configs:
        texts, meta = {}, {}
        for name, entry in truth.items():
            try:
                text, seconds = runner(entry["image"])
            except Exception as error:  # moteur indisponible : on le note une fois et on passe
                errors[cname] = str(error)
                break
            texts[name], meta[name] = text, seconds
        if cname in errors:
            print(f"{cname}: INDISPONIBLE ({errors[cname]})")
            continue
        extracted = extract_fields(texts, args.dist)
        for name, text in texts.items():
            entry = truth[name]
            gt, out = norm(entry["text"]), norm(text)
            flat = out.replace(" ", " ")
            keys_ok = sum(k in flat for k in entry["keys"]) / len(entry["keys"])
            fields = score_fields(entry["expected"], extracted[name])
            rows.append({"config": cname, "image": name, "doc": entry["doc"], "variant": entry["variant"],
                         "cer": Levenshtein.distance(gt, out) / max(1, len(gt)),
                         "accent_recall": multiset_recall(gt, out, ACCENTS),
                         "numeric_recall": multiset_recall(gt, out, NUMERIC),
                         "keys_exact": keys_ok, "seconds": meta[name], "fields": fields,
                         "warnings": extracted[name]["warnings"], "text": text})
        print(f"{cname}: ok")

    json.dump({"rows": rows, "errors": errors}, open(os.path.join(args.out, "results.json"), "w"), ensure_ascii=False, indent=1)

    def agg(sel):
        n = len(sel)
        exp = sum(r["fields"]["expected"] for r in sel)
        return {"cer": statistics.mean(r["cer"] for r in sel) * 100,
                "acc": statistics.mean(r["accent_recall"] for r in sel) * 100,
                "num": statistics.mean(r["numeric_recall"] for r in sel) * 100,
                "keys": statistics.mean(r["keys_exact"] for r in sel) * 100,
                "right": 100 * sum(r["fields"]["right"] for r in sel) / exp,
                "wrong": sum(r["fields"]["wrong"] for r in sel),
                "wrong_high": sum(r["fields"]["wrong_high"] for r in sel),
                "missing": sum(r["fields"]["missing"] for r in sel),
                "sec": statistics.mean(r["seconds"] for r in sel), "n": n}

    lines = ["| Configuration | Variante | CER % | accents % | chiffres,%€ % | valeurs-clés exactes % | champs justes % | faux | dont HIGH | absents | s/page |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    for cname, _ in configs:
        if cname in errors:
            continue
        for variant in ["clean300", "dpi150", "noisy", "blur", "dpi100", "hard", "TOUTES"]:
            sel = [r for r in rows if r["config"] == cname and (variant == "TOUTES" or r["variant"] == variant)]
            if not sel:
                continue
            a = agg(sel)
            lines.append(f"| {cname} | {variant} | {a['cer']:.1f} | {a['acc']:.1f} | {a['num']:.1f} | {a['keys']:.0f} | {a['right']:.0f} | {a['wrong']} | {a['wrong_high']} | {a['missing']} | {a['sec']:.1f} |")
    for cname, error in errors.items():
        lines.append(f"| {cname} | INDISPONIBLE | {error} |")
    report = "\n".join(lines)
    open(os.path.join(args.out, "report.md"), "w", encoding="utf-8").write(report + "\n")
    print(report)


if __name__ == "__main__":
    main()
