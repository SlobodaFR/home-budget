import { OcrEngineName } from '../../domain/contract-extraction/document-text-extractor';
import { CommandOptions, CommandRunner } from './command-runner';

/** Moteur d'OCR : lit UNE image (nom généré par le serveur) et rend son texte. */
export interface OcrEngine {
  readonly name: OcrEngineName;
  /** Le binaire (et la langue demandée) sont utilisables. */
  isAvailable(runner: CommandRunner, options: CommandOptions): Promise<boolean>;
  recognize(
    imagePath: string,
    runner: CommandRunner,
    options: CommandOptions,
  ): Promise<string>;
}

const LANG_PATTERN = /^[a-z_]{3,12}(\+[a-z_]{3,12})*$/;

export class TesseractOcrEngine implements OcrEngine {
  readonly name = 'tesseract';

  constructor(private readonly lang: string) {
    if (!LANG_PATTERN.test(lang)) {
      throw new Error(`Langue OCR invalide : ${lang}`);
    }
  }

  async isAvailable(
    runner: CommandRunner,
    options: CommandOptions,
  ): Promise<boolean> {
    try {
      const { stdout, stderr } = await runner.run(
        'tesseract',
        ['--list-langs'],
        options,
      );
      const installed = new Set(
        `${stdout}\n${stderr}`.split('\n').map((line) => line.trim()),
      );
      return this.lang.split('+').every((lang) => installed.has(lang));
    } catch {
      return false;
    }
  }

  async recognize(
    imagePath: string,
    runner: CommandRunner,
    options: CommandOptions,
  ): Promise<string> {
    const { stdout } = await runner.run(
      'tesseract',
      [
        imagePath,
        'stdout',
        '-l',
        this.lang,
        '--psm',
        '6',
        '-c',
        'preserve_interword_spaces=1',
      ],
      options,
    );
    return stdout;
  }
}
