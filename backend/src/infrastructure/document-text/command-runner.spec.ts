import { CommandError, ProcessCommandRunner } from './command-runner';

const node = process.execPath;
const runner = new ProcessCommandRunner([node, 'programme-inexistant-hb']);
const base = {
  cwd: process.cwd(),
  env: { PATH: process.env.PATH ?? '' },
  timeoutMs: 5_000,
  maxOutputBytes: 1024 * 1024,
};

describe('ProcessCommandRunner (avec node comme programme de test)', () => {
  it('lance un programme avec un tableau d’arguments et rend sa sortie', async () => {
    const result = await runner.run(node, ['-e', 'console.log("ok é")'], base);
    expect(result.stdout.trim()).toBe('ok é');
  });

  it('ne passe jamais par un shell : les métacaractères restent des arguments littéraux', async () => {
    const hostile = '; echo PWNED && $(id) `id` | cat';
    const result = await runner.run(
      node,
      ['-e', 'console.log(process.argv[1])', hostile],
      base,
    );
    expect(result.stdout.trim()).toBe(hostile);
  });

  it('transmet uniquement l’environnement donné, pas celui du serveur', async () => {
    process.env.SECRET_DU_SERVEUR = 'ne-pas-fuiter';
    try {
      const result = await runner.run(
        node,
        ['-e', 'console.log(JSON.stringify(Object.keys(process.env).sort()))'],
        { ...base, env: { PATH: process.env.PATH ?? '', LANG: 'C' } },
      );
      const keys = JSON.parse(result.stdout) as string[];
      expect(keys).not.toContain('SECRET_DU_SERVEUR');
      expect(keys).toEqual(expect.arrayContaining(['LANG', 'PATH']));
    } finally {
      delete process.env.SECRET_DU_SERVEUR;
    }
  });

  it('échoue avec le code de sortie et un stderr borné', async () => {
    const error = await runner
      .run(node, ['-e', 'console.error("oups"); process.exit(3)'], base)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CommandError);
    expect(error).toMatchObject({ failure: 'EXIT', exitCode: 3 });
    expect((error as CommandError).stderr).toContain('oups');
  });

  it('refuse de lancer un programme hors liste blanche', async () => {
    const strict = new ProcessCommandRunner();
    await expect(
      strict.run(node, ['-e', 'console.log("ne doit pas partir")'], base),
    ).rejects.toMatchObject({ failure: 'NOT_ALLOWED' });
  });

  it('NOT_FOUND quand le programme est absent', async () => {
    await expect(
      runner.run('programme-inexistant-hb', [], base),
    ).rejects.toMatchObject({ failure: 'NOT_FOUND' });
  });

  it('arrête le processus au délai dépassé', async () => {
    const started = Date.now();
    await expect(
      runner.run(node, ['-e', 'setTimeout(()=>{}, 20000)'], {
        ...base,
        timeoutMs: 200,
      }),
    ).rejects.toMatchObject({ failure: 'TIMEOUT' });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('arrête le processus dont la sortie dépasse le plafond', async () => {
    await expect(
      runner.run(
        node,
        ['-e', 'setInterval(()=>process.stdout.write("x".repeat(65536)), 1)'],
        { ...base, maxOutputBytes: 100_000 },
      ),
    ).rejects.toMatchObject({ failure: 'OUTPUT_TOO_LARGE' });
  });

  it('arrête le processus à l’annulation, ou refuse de partir si déjà annulé', async () => {
    const controller = new AbortController();
    const pending = runner.run(node, ['-e', 'setTimeout(()=>{}, 20000)'], {
      ...base,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toMatchObject({ failure: 'ABORTED' });
    await expect(
      runner.run(node, ['-e', '0'], { ...base, signal: controller.signal }),
    ).rejects.toMatchObject({ failure: 'ABORTED' });
  });
});
