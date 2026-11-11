/**
 * Intégration RÉELLE : lance pdftotext / pdftoppm / tesseract sur un petit PDF et sur des
 * images générés par le test. Ignorée proprement si les outils (ou la langue OCR
 * demandée, `OCR_LANG`, `fra` par défaut) ne sont pas installés : la suite unitaire n'en
 * dépend pas. Pour l'activer en local : installer poppler-utils et tesseract-ocr-fra, ou
 * pointer `TESSDATA_PREFIX` vers un dossier contenant `fra.traineddata`.
 */
import { execFileSync, spawnSync } from 'child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { extractContractFields } from '../../domain/contract-extraction/contract-extractor';
import { readImageSize } from '../../domain/contract-extraction/document-kind';
import { ProcessCommandRunner } from './command-runner';
import { TesseractOcrEngine } from './ocr-engine';
import {
  DEFAULT_EXTRACTOR_CONFIG,
  SystemDocumentTextExtractor,
} from './system-document-text-extractor';

const LANG = process.env.OCR_LANG ?? 'fra';

function exits0(command: string, args: string[]): boolean {
  try {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- test-only probe called with literal tool names, no shell
    return spawnSync(command, args, { timeout: 8_000 }).status === 0;
  } catch {
    return false;
  }
}

function toolsReady(): boolean {
  if (
    !['pdfinfo', 'pdftotext', 'pdftoppm'].every((tool) => exits0(tool, ['-v']))
  ) {
    return false;
  }
  const langs = spawnSync('tesseract', ['--list-langs'], { timeout: 8_000 });
  if (langs.status !== 0) {
    return false;
  }
  const installed = new Set(
    `${String(langs.stdout)}\n${String(langs.stderr)}`
      .split('\n')
      .map((line) => line.trim()),
  );
  return LANG.split('+').every((lang) => installed.has(lang));
}

const TEXT_LINES = [
  'OFFRE DE PRET IMMOBILIER - BANQUE EXEMPLE',
  'Reference du contrat : PI-2024-004517',
  'Etablissement preteur : Banque Exemple',
  'Montant du credit : 150 000,00 EUR',
  'Duree du pret : 240 mois',
  'Taux debiteur annuel fixe : 3,45 %',
  'Mensualite hors assurance : 862,33 EUR',
  'Frais de dossier : 900,00 EUR',
  'Les conditions generales de ce contrat de pret sont annexees a la presente offre.',
];

/** PDF d'une page avec une couche texte (Helvetica), offsets xref exacts. */
function textPdf(lines: string[]): Buffer {
  const stream = [
    'BT /F1 16 Tf 40 780 Td 24 TL',
    ...lines.map((line) => `(${line.replace(/[\\()]/g, '\\$&')}) Tj T*`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/** PDF « scanné » : une seule image JPEG (RGB), sans aucune couche texte. */
function scannedPdf(jpeg: Buffer, dpi: number): Buffer {
  const size = readImageSize(jpeg, 'JPEG')!;
  const width = size.width;
  const height = size.height;
  // Taille de la page en points (1/72 pouce) d'après la résolution du scan.
  const pageWidth = ((width * 72) / dpi).toFixed(2);
  const pageHeight = ((height * 72) / dpi).toFixed(2);
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Buffer | string) => {
    const buffer =
      typeof data === 'string' ? Buffer.from(data, 'latin1') : data;
    parts.push(buffer);
    length += buffer.length;
  };
  push('%PDF-1.4\n');
  const object = (n: number, body: Buffer | string) => {
    offsets.push(length);
    push(`${n} 0 obj\n`);
    push(body);
    push('\nendobj\n');
  };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
  );
  object(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  object(
    5,
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
        'latin1',
      ),
      jpeg,
      Buffer.from('\nendstream', 'latin1'),
    ]),
  );
  const xref = length;
  let tail = `xref\n0 6\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    tail += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  tail += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  push(tail);
  return Buffer.concat(parts);
}

vi.setConfig({ testTimeout: 90_000 });

const describeIfTools = toolsReady() ? describe : describe.skip;

describeIfTools(
  `SystemDocumentTextExtractor — outils réels (pdftotext, pdftoppm, tesseract -l ${LANG})`,
  () => {
    const hooks = () => ({
      onProgress: () => undefined,
      signal: new AbortController().signal,
    });
    let work: string;
    let extractor: SystemDocumentTextExtractor;

    beforeAll(() => {
      work = mkdtempSync(join(tmpdir(), 'hb-it-'));
      extractor = new SystemDocumentTextExtractor(
        new ProcessCommandRunner(),
        new TesseractOcrEngine(LANG),
        { ...DEFAULT_EXTRACTOR_CONFIG, minCharsPerPage: 150 },
      );
    });

    afterAll(() => {
      rmSync(work, { recursive: true, force: true });
    });

    it('detecte les outils réels', async () => {
      await expect(extractor.capabilities()).resolves.toMatchObject({
        available: true,
        engines: ['tesseract'],
      });
    });

    it('lit la couche texte d’un petit PDF avec pdftotext', async () => {
      const pdf = textPdf(TEXT_LINES);
      const info = await extractor.inspect(pdf);
      expect(info).toEqual({ kind: 'PDF', pages: 1 });
      const text = await extractor.extract(pdf, info, hooks());
      expect(text.source).toBe('TEXT_LAYER');
      expect(text.engine).toBeNull();
      expect(text.pages).toHaveLength(1);
      expect(text.pages[0]).toContain('Montant du credit : 150 000,00 EUR');
      const fields = extractContractFields(text.pages).fields;
      expect(fields.find((f) => f.field === 'principalCents')?.value).toBe(
        15000000,
      );
      expect(fields.find((f) => f.field === 'annualRatePercent')?.value).toBe(
        3.45,
      );
    });

    it('refuse un PDF corrompu', async () => {
      await expect(
        extractor.inspect(Buffer.from('%PDF-1.4\nce n’est pas un vrai pdf')),
      ).rejects.toThrow(/illisible/);
    });

    it('lit une image PNG (page rastérisée du PDF) avec tesseract', async () => {
      const pdfPath = join(work, 'source.pdf');
      writeFileSync(pdfPath, textPdf(TEXT_LINES));
      execFileSync('pdftoppm', [
        '-r',
        '200',
        '-png',
        '-singlefile',
        pdfPath,
        join(work, 'scan'),
      ]);
      const png = readFileSync(join(work, 'scan.png'));
      const info = await extractor.inspect(png);
      expect(info.kind).toBe('PNG');
      const text = await extractor.extract(png, info, hooks());
      expect(text.source).toBe('OCR');
      expect(text.engine).toBe('tesseract');
      const flat = text.pages[0].replace(/\s+/g, ' ');
      expect(flat).toMatch(/150 000,00/);
      // L'OCR peut confondre un chiffre (3 lu 8) : on ne vérifie que la forme du taux.
      expect(flat).toMatch(/\d,45 %/);
      expect(flat).toMatch(/240 mois/);
    });

    it('traite un PDF scanné (sans couche texte) : rastérisation puis OCR', async () => {
      const pdfPath = join(work, 'source2.pdf');
      writeFileSync(pdfPath, textPdf(TEXT_LINES));
      execFileSync('pdftoppm', [
        '-r',
        '150',
        '-jpeg',
        '-singlefile',
        pdfPath,
        join(work, 'scanjpg'),
      ]);
      const jpeg = readFileSync(join(work, 'scanjpg.jpg'));
      const scanned = scannedPdf(jpeg, 150);
      const info = await extractor.inspect(scanned);
      expect(info).toEqual({ kind: 'PDF', pages: 1 });
      const stages: string[] = [];
      const text = await extractor.extract(scanned, info, {
        signal: new AbortController().signal,
        onProgress: (p) => stages.push(p.stage),
      });
      expect(text.source).toBe('OCR');
      expect(stages).toContain('TEXT');
      expect(stages).toContain('OCR');
      const result = extractContractFields(text.pages);
      expect(
        result.fields.find((f) => f.field === 'principalCents')?.value,
      ).toBe(15000000);
      expect(
        result.fields.find((f) => f.field === 'initialTermMonths')?.value,
      ).toBe(240);
    });

    it('ne laisse aucun dossier temporaire derrière lui', async () => {
      const before = readdirSync(tmpdir()).filter((n) =>
        n.startsWith('hb-extract-'),
      );
      const pdf = textPdf(TEXT_LINES);
      await extractor.extract(pdf, await extractor.inspect(pdf), hooks());
      await extractor
        .inspect(Buffer.from('%PDF-1.4\ncorrompu'))
        .catch(() => undefined);
      const after = readdirSync(tmpdir()).filter((n) =>
        n.startsWith('hb-extract-'),
      );
      expect(after.sort()).toEqual(before.sort());
    });
  },
);
