import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  DocumentExtractionError,
  DocumentRejectedError,
  ExtractionProgress,
} from '../../domain/contract-extraction/document-text-extractor';
import {
  CommandError,
  CommandOptions,
  CommandResult,
  CommandRunner,
} from './command-runner';
import { TesseractOcrEngine } from './ocr-engine';
import {
  DEFAULT_EXTRACTOR_CONFIG,
  SystemDocumentTextExtractor,
  SystemExtractorConfig,
} from './system-document-text-extractor';

interface Call {
  command: string;
  args: readonly string[];
  options: CommandOptions;
}

type Handler = (
  args: readonly string[],
  options: CommandOptions,
) => CommandResult | Promise<CommandResult>;

/** Faux binaires : aucun outil système n'est lancé. */
class FakeRunner extends CommandRunner {
  readonly calls: Call[] = [];
  handlers: Record<string, Handler> = {};
  dirs = new Set<string>();

  async run(
    command: string,
    args: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult> {
    this.calls.push({ command, args, options });
    this.dirs.add(options.cwd);
    const handler = this.handlers[command];
    if (!handler) {
      throw new CommandError('NOT_FOUND');
    }
    return handler(args, options);
  }

  count(command: string): number {
    return this.calls.filter((c) => c.command === command).length;
  }
}

const ok = (stdout = ''): CommandResult => ({ stdout, stderr: '' });
const PDF = Buffer.from('%PDF-1.4\ncontenu fictif\n');

function pdfInfo(pages: number, size = '595.276 x 841.89 pts (A4)') {
  return ok(
    `Title:          Contrat\nPages:          ${pages}\nEncrypted:      no\nPage size:      ${size}\n`,
  );
}

function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

const LONG_PAGE = 'Offre de prêt Banque Exemple montant du crédit '.repeat(8);

function setup(
  config: Partial<SystemExtractorConfig> = {},
  lang = 'fra',
): { runner: FakeRunner; extractor: SystemDocumentTextExtractor } {
  const runner = new FakeRunner();
  runner.handlers = {
    pdfinfo: (args) => (args[0] === '-v' ? ok() : pdfInfo(2)),
    pdftotext: (args) =>
      args[0] === '-v' ? ok() : ok(`${LONG_PAGE}\f${LONG_PAGE}\f`),
    pdftoppm: (args, options) => {
      if (args[0] !== '-v') {
        const last = Number(args[args.indexOf('-l') + 1]);
        const digits = String(last).length;
        for (let page = 1; page <= last; page++) {
          writeFileSync(
            join(options.cwd, `page-${String(page).padStart(digits, '0')}.png`),
            'png',
          );
        }
      }
      return ok();
    },
    tesseract: (args) =>
      args[0] === '--list-langs'
        ? ok('List of available languages in "/x" (3):\neng\nfra\nosd\n')
        : ok(`texte OCR de ${args[0]}`),
  };
  const extractor = new SystemDocumentTextExtractor(
    runner,
    new TesseractOcrEngine(lang),
    { ...DEFAULT_EXTRACTOR_CONFIG, ...config },
  );
  return { runner, extractor };
}

const hooks = (signal = new AbortController().signal) => {
  const events: ExtractionProgress[] = [];
  return {
    events,
    hooks: { onProgress: (p: ExtractionProgress) => events.push(p), signal },
  };
};

describe('SystemDocumentTextExtractor', () => {
  describe('capabilities', () => {
    it('available quand tous les outils et la langue sont présents', async () => {
      const { extractor } = setup();
      await expect(extractor.capabilities()).resolves.toEqual({
        available: true,
        engines: ['tesseract'],
        maxFileBytes: 10485760,
        maxPages: 40,
      });
    });

    it('detecte les outils une seule fois', async () => {
      const { extractor, runner } = setup();
      await extractor.capabilities();
      const calls = runner.calls.length;
      await extractor.capabilities();
      await extractor.capabilities();
      expect(runner.calls.length).toBe(calls);
    });

    it.each(['pdfinfo', 'pdftotext', 'pdftoppm', 'tesseract'])(
      'indisponible si %s est absent',
      async (tool) => {
        const { extractor, runner } = setup();
        delete runner.handlers[tool];
        await expect(extractor.capabilities()).resolves.toMatchObject({
          available: false,
          engines: [],
          maxPages: 40,
        });
      },
    );

    it('indisponible si la langue OCR demandée n’est pas installée', async () => {
      const { extractor } = setup({}, 'deu');
      await expect(extractor.capabilities()).resolves.toMatchObject({
        available: false,
        engines: [],
      });
    });

    it('accepte plusieurs langues (fra+eng)', async () => {
      const { extractor } = setup({}, 'fra+eng');
      expect((await extractor.capabilities()).available).toBe(true);
      const missing = setup({}, 'fra+deu');
      expect((await missing.extractor.capabilities()).available).toBe(false);
    });

    it('supprime le dossier temporaire de détection', async () => {
      const { extractor, runner } = setup();
      await extractor.capabilities();
      for (const dir of runner.dirs) {
        expect(existsSync(dir)).toBe(false);
      }
    });
  });

  describe('inspect', () => {
    it('refuse un fichier vide, trop gros ou d’un autre type', async () => {
      const { extractor } = setup({ maxFileBytes: 100 });
      await expect(extractor.inspect(Buffer.alloc(0))).rejects.toThrow(/vide/);
      await expect(extractor.inspect(Buffer.alloc(101, 0x25))).rejects.toThrow(
        /taille maximale/,
      );
      await expect(
        extractor.inspect(Buffer.from('MZ binaire')),
      ).rejects.toThrow(/Format non pris en charge/);
    });

    it('lit un PDF : nombre de pages', async () => {
      const { extractor, runner } = setup();
      await expect(extractor.inspect(PDF)).resolves.toEqual({
        kind: 'PDF',
        pages: 2,
      });
      const call = runner.calls.find((c) => c.command === 'pdfinfo')!;
      expect(call.args).toEqual(['document.pdf']);
    });

    it('refuse un PDF protégé par mot de passe', async () => {
      const { extractor, runner } = setup();
      runner.handlers.pdfinfo = () => {
        throw new CommandError(
          'EXIT',
          1,
          'Command Line Error: Incorrect password',
        );
      };
      const error = await extractor.inspect(PDF).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DocumentRejectedError);
      expect((error as Error).message).toMatch(/mot de passe/);
    });

    it('refuse un PDF illisible', async () => {
      const { extractor, runner } = setup();
      runner.handlers.pdfinfo = () => {
        throw new CommandError('EXIT', 1, "Syntax Error: Couldn't read xref");
      };
      await expect(extractor.inspect(PDF)).rejects.toThrow(/illisible/);
      runner.handlers.pdfinfo = () => ok('Title: x\n');
      await expect(extractor.inspect(PDF)).rejects.toThrow(/illisible/);
    });

    it('refuse un PDF de plus de 40 pages ou aux pages démesurées', async () => {
      const { extractor, runner } = setup();
      runner.handlers.pdfinfo = () => pdfInfo(41);
      await expect(extractor.inspect(PDF)).rejects.toThrow(/41 pages/);
      runner.handlers.pdfinfo = () => pdfInfo(1, '20000 x 20000 pts');
      await expect(extractor.inspect(PDF)).rejects.toThrow(/démesurées/);
      runner.handlers.pdfinfo = () => pdfInfo(40);
      await expect(extractor.inspect(PDF)).resolves.toMatchObject({
        pages: 40,
      });
    });

    it('lit une image sans lancer d’outil et refuse les images démesurées', async () => {
      const { extractor, runner } = setup();
      await expect(extractor.inspect(png(1654, 2339))).resolves.toEqual({
        kind: 'PNG',
        pages: 1,
      });
      await expect(extractor.inspect(png(20000, 20000))).rejects.toThrow(
        /trop grande/,
      );
      await expect(extractor.inspect(png(0, 0))).rejects.toThrow(/illisible/);
      expect(runner.calls).toEqual([]);
    });

    it('supprime le dossier temporaire même si pdfinfo échoue', async () => {
      const { extractor, runner } = setup();
      runner.handlers.pdfinfo = () => {
        throw new CommandError('EXIT', 1, '');
      };
      await extractor.inspect(PDF).catch(() => undefined);
      for (const dir of runner.dirs) {
        expect(existsSync(dir)).toBe(false);
      }
    });
  });

  describe('extract — PDF avec couche texte', () => {
    it('lit pdftotext -layout page par page, sans OCR', async () => {
      const { extractor, runner } = setup();
      const { events, hooks: h } = hooks();
      const text = await extractor.extract(PDF, { kind: 'PDF', pages: 2 }, h);
      expect(text).toEqual({
        source: 'TEXT_LAYER',
        engine: null,
        pages: [LONG_PAGE, LONG_PAGE],
      });
      expect(runner.count('pdftoppm')).toBe(0);
      expect(runner.count('tesseract')).toBe(0);
      const call = runner.calls.find((c) => c.command === 'pdftotext')!;
      expect(call.args).toEqual([
        '-layout',
        '-enc',
        'UTF-8',
        '-f',
        '1',
        '-l',
        '2',
        'document.pdf',
        '-',
      ]);
      expect(events[0]).toEqual({ stage: 'TEXT', done: 0, total: 2 });
      expect(events.every((e) => e.stage === 'TEXT')).toBe(true);
    });

    it('écrit le document sous un nom généré, jamais fourni par l’utilisateur', async () => {
      const { extractor, runner } = setup();
      let written: Buffer | null = null;
      runner.handlers.pdftotext = (_args, options) => {
        written = readFileSync(join(options.cwd, 'document.pdf'));
        return ok(`${LONG_PAGE}\f${LONG_PAGE}`);
      };
      await extractor.extract(PDF, { kind: 'PDF', pages: 2 }, hooks().hooks);
      expect(written).toEqual(PDF);
    });
  });

  describe('extract — PDF scanné', () => {
    function scan(pages: number) {
      const ctx = setup();
      ctx.runner.handlers.pdftotext = () => ok('\f'.repeat(pages - 1));
      return ctx;
    }

    it('rastérise à 200 dpi puis fait l’OCR page par page, dans l’ordre numérique', async () => {
      const { extractor, runner } = scan(12);
      const { events, hooks: h } = hooks();
      const text = await extractor.extract(PDF, { kind: 'PDF', pages: 12 }, h);
      expect(text.source).toBe('OCR');
      expect(text.engine).toBe('tesseract');
      expect(text.pages).toHaveLength(12);
      expect(text.pages[0]).toBe('texte OCR de page-01.png');
      expect(text.pages[1]).toBe('texte OCR de page-02.png');
      expect(text.pages[11]).toBe('texte OCR de page-12.png');
      const raster = runner.calls.find(
        (c) => c.command === 'pdftoppm' && c.args[0] !== '-v',
      )!;
      expect(raster.args).toEqual([
        '-r',
        '200',
        '-png',
        '-f',
        '1',
        '-l',
        '12',
        'document.pdf',
        'page',
      ]);
      const ocr = events.filter((e) => e.stage === 'OCR');
      expect(ocr[0]).toEqual({ stage: 'OCR', done: 0, total: 12 });
      expect(ocr[ocr.length - 1]).toEqual({
        stage: 'OCR',
        done: 12,
        total: 12,
      });
    });

    it('appelle tesseract avec la langue configurée et un tableau d’arguments', async () => {
      const { extractor, runner } = scan(1);
      await extractor.extract(PDF, { kind: 'PDF', pages: 1 }, hooks().hooks);
      const call = runner.calls.find(
        (c) => c.command === 'tesseract' && c.args[0] !== '--list-langs',
      )!;
      expect(call.args.slice(0, 6)).toEqual([
        'page-1.png',
        'stdout',
        '-l',
        'fra',
        '--psm',
        '6',
      ]);
    });

    it('garde la couche texte quand l’OCR ne lit rien de plus', async () => {
      const { extractor, runner } = setup();
      const thin = 'Montant du crédit : 150 000,00 € Taux débiteur : 3,45 %';
      runner.handlers.pdftotext = () => ok(thin);
      runner.handlers.tesseract = () => ok('');
      const text = await extractor.extract(
        PDF,
        { kind: 'PDF', pages: 1 },
        hooks().hooks,
      );
      expect(text).toEqual({
        source: 'TEXT_LAYER',
        engine: null,
        pages: [thin],
      });
    });

    it('passe à l’OCR quand pdftotext échoue (extraction interdite)', async () => {
      const { extractor, runner } = setup();
      runner.handlers.pdftotext = () => {
        throw new CommandError('EXIT', 1, 'Copying of text is not allowed');
      };
      const text = await extractor.extract(
        PDF,
        { kind: 'PDF', pages: 2 },
        hooks().hooks,
      );
      expect(text.source).toBe('OCR');
    });

    it('échoue proprement si pdftoppm ne produit aucune image', async () => {
      const { extractor, runner } = scan(1);
      runner.handlers.pdftoppm = () => ok();
      await expect(
        extractor.extract(PDF, { kind: 'PDF', pages: 1 }, hooks().hooks),
      ).rejects.toBeInstanceOf(DocumentExtractionError);
    });
  });

  describe('extract — image', () => {
    it('lit une image par OCR directe, sous un nom généré', async () => {
      const { extractor, runner } = setup();
      const { events, hooks: h } = hooks();
      const text = await extractor.extract(
        png(100, 100),
        { kind: 'PNG', pages: 1 },
        h,
      );
      expect(text).toEqual({
        source: 'OCR',
        engine: 'tesseract',
        pages: ['texte OCR de document.png'],
      });
      expect(runner.count('pdftotext')).toBe(0);
      expect(events).toEqual([
        { stage: 'OCR', done: 0, total: 1 },
        { stage: 'OCR', done: 1, total: 1 },
      ]);
      const jpeg = await extractor.extract(
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
        { kind: 'JPEG', pages: 1 },
        hooks().hooks,
      );
      expect(jpeg.pages[0]).toBe('texte OCR de document.jpg');
    });
  });

  describe('sécurité d’exécution', () => {
    it('donne aux outils un environnement minimal et un dossier privé 0700', async () => {
      process.env.SECRET_DU_SERVEUR = 'ne-pas-fuiter';
      try {
        const { extractor, runner } = setup();
        let mode = 0;
        runner.handlers.pdftotext = (_args, options) => {
          mode = statSync(options.cwd).mode & 0o777;
          return ok(`${LONG_PAGE}\f${LONG_PAGE}`);
        };
        await extractor.extract(PDF, { kind: 'PDF', pages: 2 }, hooks().hooks);
        expect(mode).toBe(0o700);
        for (const call of runner.calls) {
          expect(Object.keys(call.options.env).sort()).toEqual(
            expect.arrayContaining(['HOME', 'LANG', 'PATH']),
          );
          expect(call.options.env).not.toHaveProperty('SECRET_DU_SERVEUR');
          expect(call.options.env.HOME).toBe(call.options.cwd);
          expect(call.options.timeoutMs).toBeLessThanOrEqual(120_000);
          expect(call.options.maxOutputBytes).toBe(
            DEFAULT_EXTRACTOR_CONFIG.maxOutputBytes,
          );
        }
      } finally {
        delete process.env.SECRET_DU_SERVEUR;
      }
    });

    it('transmet TESSDATA_PREFIX quand il est défini', async () => {
      process.env.TESSDATA_PREFIX = '/opt/tessdata';
      try {
        const { extractor, runner } = setup();
        await extractor.extract(
          png(10, 10),
          { kind: 'PNG', pages: 1 },
          hooks().hooks,
        );
        const call = runner.calls.find((c) => c.command === 'tesseract')!;
        expect(call.options.env.TESSDATA_PREFIX).toBe('/opt/tessdata');
      } finally {
        delete process.env.TESSDATA_PREFIX;
      }
    });

    it('supprime le dossier temporaire après un succès', async () => {
      const { extractor, runner } = setup();
      await extractor.extract(PDF, { kind: 'PDF', pages: 2 }, hooks().hooks);
      expect(runner.dirs.size).toBeGreaterThan(0);
      for (const dir of runner.dirs) {
        expect(existsSync(dir)).toBe(false);
      }
    });

    it('supprime le dossier temporaire après une erreur d’outil, avec un message sûr', async () => {
      const { extractor, runner } = setup();
      runner.handlers.pdftotext = () => ok('\f');
      runner.handlers.tesseract = () => {
        throw new CommandError('EXIT', 1, 'Banque Exemple 150 000,00 €');
      };
      const error = await extractor
        .extract(PDF, { kind: 'PDF', pages: 2 }, hooks().hooks)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DocumentExtractionError);
      expect((error as DocumentExtractionError).userMessage).not.toMatch(
        /Banque Exemple|150/,
      );
      for (const dir of runner.dirs) {
        expect(existsSync(dir)).toBe(false);
      }
    });

    it('traduit un délai d’outil dépassé et supprime le dossier', async () => {
      const { extractor, runner } = setup();
      runner.handlers.pdftotext = () => {
        throw new CommandError('TIMEOUT');
      };
      await expect(
        extractor.extract(PDF, { kind: 'PDF', pages: 2 }, hooks().hooks),
      ).rejects.toThrow(/trop de temps/);
      for (const dir of runner.dirs) {
        expect(existsSync(dir)).toBe(false);
      }
    });

    it('laisse remonter un refus de liste blanche, bug interne et non problème de document', async () => {
      const { extractor, runner } = setup();
      runner.handlers.pdftotext = () => {
        throw new CommandError('NOT_ALLOWED');
      };
      const error = await extractor
        .extract(PDF, { kind: 'PDF', pages: 2 }, hooks().hooks)
        .catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(DocumentExtractionError);
      expect(error).toMatchObject({ failure: 'NOT_ALLOWED' });
    });

    it('applique un délai global à l’extraction entière', async () => {
      const { extractor, runner } = setup({ totalTimeoutMs: 80 });
      runner.handlers.pdftotext = (_args, options) =>
        new Promise<CommandResult>((_, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new CommandError('ABORTED')),
          );
        });
      const error = await extractor
        .extract(PDF, { kind: 'PDF', pages: 2 }, hooks().hooks)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DocumentExtractionError);
      expect((error as DocumentExtractionError).userMessage).toMatch(
        /trop de temps/,
      );
      for (const dir of runner.dirs) {
        expect(existsSync(dir)).toBe(false);
      }
    });

    it('propage l’annulation aux outils et supprime le dossier', async () => {
      const { extractor, runner } = setup();
      const controller = new AbortController();
      runner.handlers.pdftotext = (_args, options) =>
        new Promise<CommandResult>((_, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new CommandError('ABORTED')),
          );
          setTimeout(() => controller.abort(), 20);
        });
      const error = await extractor
        .extract(PDF, { kind: 'PDF', pages: 2 }, hooks(controller.signal).hooks)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CommandError);
      expect(error).toMatchObject({ failure: 'ABORTED' });
      for (const dir of runner.dirs) {
        expect(existsSync(dir)).toBe(false);
      }
    });

    it('traduit une sortie démesurée en erreur sûre', async () => {
      const { extractor, runner } = setup();
      runner.handlers.pdftotext = () => {
        throw new CommandError('OUTPUT_TOO_LARGE');
      };
      await expect(
        extractor.extract(PDF, { kind: 'PDF', pages: 2 }, hooks().hooks),
      ).rejects.toThrow(/démesuré/);
    });
  });
});

describe('TesseractOcrEngine', () => {
  it('refuse une langue qui ressemble à un argument ou à un chemin', () => {
    for (const lang of ['', '-c', '../fra', 'fra;id', 'fra eng', '--psm']) {
      expect(() => new TesseractOcrEngine(lang)).toThrow(/Langue OCR invalide/);
    }
    expect(() => new TesseractOcrEngine('fra+eng')).not.toThrow();
  });
});
