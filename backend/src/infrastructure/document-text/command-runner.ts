import { spawn } from 'child_process';

export interface CommandOptions {
  /** Dossier de travail (le dossier temporaire privé de l'extraction). */
  cwd: string;
  /** Environnement COMPLET du processus : il n'hérite jamais de celui du serveur. */
  env: Record<string, string>;
  timeoutMs: number;
  /** Au-delà, le processus est arrêté (sortie standard bornée). */
  maxOutputBytes: number;
  signal?: AbortSignal;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandFailure =
  | 'NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'EXIT'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'OUTPUT_TOO_LARGE';

/** Échec d'un outil système. `stderr` est tronqué et ne doit JAMAIS être journalisé ni renvoyé à l'utilisateur. */
export class CommandError extends Error {
  constructor(
    readonly failure: CommandFailure,
    readonly exitCode: number | null = null,
    readonly stderr = '',
  ) {
    super(`Commande en échec (${failure})`);
    this.name = 'CommandError';
  }
}

/**
 * Port : exécute un programme externe SANS shell, avec un tableau d'arguments. Les
 * adaptateurs de test le remplacent par de faux binaires.
 */
export abstract class CommandRunner {
  abstract run(
    command: string,
    args: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult>;
}

const MAX_STDERR_BYTES = 8 * 1024;

/** Seuls programmes que l'extraction de documents a le droit de lancer. */
export const SYSTEM_DOCUMENT_TOOLS: readonly string[] = [
  'pdfinfo',
  'pdftotext',
  'pdftoppm',
  'tesseract',
];

export class ProcessCommandRunner extends CommandRunner {
  private readonly allowedCommands: ReadonlySet<string>;

  constructor(allowedCommands: readonly string[] = SYSTEM_DOCUMENT_TOOLS) {
    super();
    this.allowedCommands = new Set(allowedCommands);
  }

  run(
    command: string,
    args: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult> {
    return new Promise<CommandResult>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new CommandError('ABORTED'));
        return;
      }
      if (!this.allowedCommands.has(command)) {
        reject(new CommandError('NOT_ALLOWED'));
        return;
      }
      // Programme vérifié contre la liste blanche ci-dessus ; arguments en tableau ; aucun shell.
      // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      let stdoutBytes = 0;
      let stderr = '';
      let failure: CommandFailure | null = null;
      let settled = false;

      const finish = (action: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        action();
      };
      const stop = (reason: CommandFailure) => {
        failure ??= reason;
        child.kill('SIGKILL');
      };
      const onAbort = () => stop('ABORTED');
      const timer = setTimeout(() => stop('TIMEOUT'), options.timeoutMs);
      options.signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > options.maxOutputBytes) {
          stop('OUTPUT_TOO_LARGE');
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < MAX_STDERR_BYTES) {
          stderr += chunk.toString('utf8').slice(0, MAX_STDERR_BYTES);
        }
      });
      child.on('error', (error: NodeJS.ErrnoException) => {
        finish(() =>
          reject(
            new CommandError(error.code === 'ENOENT' ? 'NOT_FOUND' : 'EXIT'),
          ),
        );
      });
      child.on('close', (code) => {
        finish(() => {
          if (failure) {
            reject(new CommandError(failure, code, stderr));
          } else if (code !== 0) {
            reject(new CommandError('EXIT', code, stderr));
          } else {
            resolve({
              stdout: Buffer.concat(stdout).toString('utf8'),
              stderr,
            });
          }
        });
      });
    });
  }
}
