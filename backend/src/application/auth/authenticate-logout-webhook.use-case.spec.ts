import {
  computeWebhookSignature,
  WebhookSignatureVerifier,
} from '../../domain/auth/webhook-signature';
import { FeatureFlags } from '../../domain/shared/feature-flags';
import { FakeClock } from '../../testing/fake-clock';
import {
  AuthenticateLogoutWebhookUseCase,
  LogoutWebhookRequest,
  REQUIRE_SIGNATURE_FLAG,
} from './authenticate-logout-webhook.use-case';

const SIGNING_SECRET =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const LEGACY_SECRET = 'ancien-secret-de-query';
const BODY = '{"userId":"u1"}';
const ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const NOW = '2023-11-14T22:13:20.000Z'; // 1700000000

class FakeFlags extends FeatureFlags {
  enabled = false;
  readonly asked: [string, boolean][] = [];
  async isEnabled(key: string, codeDefault: boolean): Promise<boolean> {
    this.asked.push([key, codeDefault]);
    return key === REQUIRE_SIGNATURE_FLAG ? this.enabled : codeDefault;
  }
}

describe('AuthenticateLogoutWebhookUseCase', () => {
  let flags: FakeFlags;
  let clock: FakeClock;
  let logger: { log: string[]; warn: string[] };
  const loggerPort = () => ({
    log: (m: string) => logger.log.push(m),
    warn: (m: string) => logger.warn.push(m),
  });

  beforeEach(() => {
    logger = { log: [], warn: [] };
    flags = new FakeFlags();
    clock = FakeClock.at(NOW);
  });

  function useCase(
    options: { signingSecret?: string | null; legacySecret?: string } = {},
  ) {
    const signingSecret =
      options.signingSecret === undefined
        ? SIGNING_SECRET
        : options.signingSecret;
    return new AuthenticateLogoutWebhookUseCase(
      signingSecret ? new WebhookSignatureVerifier(signingSecret, clock) : null,
      options.legacySecret ?? LEGACY_SECRET,
      flags,
      clock,
      loggerPort(),
    );
  }

  function signed(id = ID, secret = SIGNING_SECRET, body = BODY) {
    return {
      headers: {
        id,
        timestamp: '1700000000',
        signature: `v1=${computeWebhookSignature(secret, id, '1700000000', body)}`,
      },
      rawBody: Buffer.from(body),
    };
  }
  const unsigned = { headers: {}, rawBody: Buffer.from(BODY) };

  describe(`${REQUIRE_SIGNATURE_FLAG} désactivé (double acceptation)`, () => {
    it('accepte une signature valide, sans ?secret=', async () => {
      expect(await useCase().execute({ ...signed() })).toBe(true);
    });

    it('accepte l’ancien ?secret= sans signature', async () => {
      expect(
        await useCase().execute({ ...unsigned, querySecret: LEGACY_SECRET }),
      ).toBe(true);
    });

    it('accepte une signature valide même si ?secret= est faux', async () => {
      expect(
        await useCase().execute({ ...signed(), querySecret: 'faux' }),
      ).toBe(true);
    });

    it('accepte l’ancien ?secret= même si la signature est fausse (hmac)', async () => {
      const forged = signed(ID, 'f'.repeat(64));
      expect(
        await useCase().execute({ ...forged, querySecret: LEGACY_SECRET }),
      ).toBe(true);
    });

    it('refuse sans signature valide ni ?secret= correct', async () => {
      const uc = useCase();
      expect(await uc.execute({ ...unsigned })).toBe(false);
      expect(await uc.execute({ ...unsigned, querySecret: 'faux' })).toBe(
        false,
      );
      expect(await uc.execute({ ...unsigned, querySecret: '' })).toBe(false);
      expect(
        await uc.execute({
          ...signed(ID, 'f'.repeat(64)),
          querySecret: 'faux',
        }),
      ).toBe(false);
    });

    it('compare ?secret= en entier (préfixe, suffixe, casse)', async () => {
      const uc = useCase();
      for (const guess of [
        LEGACY_SECRET.slice(0, -1),
        `${LEGACY_SECRET}x`,
        LEGACY_SECRET.toUpperCase(),
      ])
        expect(await uc.execute({ ...unsigned, querySecret: guess })).toBe(
          false,
        );
    });

    it('refuse le rejeu d’un identifiant signé, même avec un ?secret= valide', async () => {
      const uc = useCase();
      expect(await uc.execute({ ...signed() })).toBe(true);
      expect(await uc.execute({ ...signed() })).toBe(false);
      expect(
        await uc.execute({ ...signed(), querySecret: LEGACY_SECRET }),
      ).toBe(false);
      expect(logger.warn).toEqual([]);
    });

    it('refuse un id rejoué seul (autres en-têtes absents) même avec un ?secret= valide', async () => {
      const uc = useCase();
      expect(await uc.execute({ ...signed() })).toBe(true);
      expect(
        await uc.execute({
          headers: { id: ID },
          rawBody: Buffer.from(BODY),
          querySecret: LEGACY_SECRET,
        }),
      ).toBe(false);
    });

    it('sans secret de signature configuré, seul l’ancien chemin existe', async () => {
      const uc = useCase({ signingSecret: null });
      expect(await uc.execute({ ...signed() })).toBe(false);
      expect(
        await uc.execute({ ...signed(), querySecret: LEGACY_SECRET }),
      ).toBe(true);
    });

    it('un ancien secret absent ou vide ne laisse passer personne', async () => {
      for (const legacySecret of ['', undefined as unknown as string]) {
        const uc = useCase({ legacySecret });
        expect(await uc.execute({ ...unsigned, querySecret: '' })).toBe(false);
        expect(await uc.execute({ ...unsigned })).toBe(false);
      }
    });

    it('lit le flag avec false comme défaut du code, et seulement si la signature ne suffit pas', async () => {
      const uc = useCase();
      await uc.execute({ ...signed() });
      expect(flags.asked).toEqual([]);
      await uc.execute({ ...unsigned, querySecret: LEGACY_SECRET });
      expect(flags.asked).toEqual([[REQUIRE_SIGNATURE_FLAG, false]]);
    });
  });

  describe(`${REQUIRE_SIGNATURE_FLAG} activé (signature obligatoire)`, () => {
    beforeEach(() => {
      flags.enabled = true;
    });

    it('accepte une signature valide', async () => {
      expect(await useCase().execute({ ...signed() })).toBe(true);
    });

    it('refuse l’ancien ?secret= seul', async () => {
      expect(
        await useCase().execute({ ...unsigned, querySecret: LEGACY_SECRET }),
      ).toBe(false);
    });

    it('refuse une signature fausse même avec le bon ?secret=', async () => {
      expect(
        await useCase().execute({
          ...signed(ID, 'f'.repeat(64)),
          querySecret: LEGACY_SECRET,
        }),
      ).toBe(false);
    });

    it('refuse le rejeu, même avec le bon ?secret=', async () => {
      const uc = useCase();
      expect(await uc.execute({ ...signed() })).toBe(true);
      expect(
        await uc.execute({ ...signed(), querySecret: LEGACY_SECRET }),
      ).toBe(false);
    });

    it('sans secret de signature configuré, tout est refusé (échec fermé)', async () => {
      const uc = useCase({ signingSecret: null });
      expect(await uc.execute({ ...signed() })).toBe(false);
      expect(
        await uc.execute({ ...unsigned, querySecret: LEGACY_SECRET }),
      ).toBe(false);
    });
  });

  describe('journalisation des acceptations', () => {
    const all = () => [...logger.log, ...logger.warn].join('\n');
    const withSecret = (r: LogoutWebhookRequest): LogoutWebhookRequest => ({
      ...r,
      querySecret: LEGACY_SECRET,
    });

    const situations: [string, () => Promise<boolean>][] = [
      ['no-signature-headers', () => useCase().execute(withSecret(unsigned))],
      [
        'missing-signing-secret',
        () => useCase({ signingSecret: null }).execute(withSecret(signed())),
      ],
      [
        'format',
        () =>
          useCase().execute(
            withSecret({
              ...signed(),
              headers: { ...signed().headers, signature: 'abc' },
            }),
          ),
      ],
      [
        'window',
        () =>
          useCase().execute(
            withSecret({
              headers: {
                id: ID,
                timestamp: '1699990000',
                signature: `v1=${computeWebhookSignature(SIGNING_SECRET, ID, '1699990000', BODY)}`,
              },
              rawBody: Buffer.from(BODY),
            }),
          ),
      ],
      ['hmac', () => useCase().execute(withSecret(signed(ID, 'f'.repeat(64))))],
      [
        'raw-body-unavailable',
        () => useCase().execute(withSecret({ headers: signed().headers })),
      ],
    ];

    it.each(situations)(
      'WARN avec la raison %s quand ?secret= sauve la requête',
      async (reason, run) => {
        expect(await run()).toBe(true);
        expect(logger.warn).toHaveLength(1);
        expect(logger.warn[0]).toContain(reason);
        expect(logger.log).toEqual([]);
      },
    );

    it('INFO quand la signature est acceptée', async () => {
      expect(await useCase().execute(signed())).toBe(true);
      expect(logger.log).toHaveLength(1);
      expect(logger.log[0]).toContain('signature');
      expect(logger.warn).toEqual([]);
    });

    it('une ligne par raison toutes les 5 minutes (INFO : sa propre clé)', async () => {
      const uc = useCase();
      await uc.execute(withSecret(unsigned));
      await uc.execute(withSecret(unsigned));
      expect(logger.warn).toHaveLength(1);

      // autre raison : indépendante
      await uc.execute(withSecret(signed(ID, 'f'.repeat(64))));
      expect(logger.warn).toHaveLength(2);

      await uc.execute(signed('a1'));
      await uc.execute(signed('a2'));
      expect(logger.log).toHaveLength(1);

      clock.set('2023-11-14T22:18:19.000Z'); // +4 min 59 s
      await uc.execute(withSecret(unsigned));
      expect(logger.warn).toHaveLength(2);

      clock.set('2023-11-14T22:18:20.000Z'); // +5 min
      await uc.execute(withSecret(unsigned));
      expect(logger.warn).toHaveLength(3);
    });

    it('ne journalise jamais le secret, la signature ni l’identifiant', async () => {
      const uc = useCase();
      const forged = signed('id-secret-xyz', 'f'.repeat(64));
      await uc.execute(withSecret(forged));
      await uc.execute(signed('id-valide-abc'));
      for (const [, run] of situations) await run();
      const out = all();
      expect(logger.warn.length).toBeGreaterThan(0);
      expect(out).not.toContain(LEGACY_SECRET);
      expect(out).not.toContain(SIGNING_SECRET);
      expect(out).not.toContain('id-secret-xyz');
      expect(out).not.toContain('id-valide-abc');
      expect(out).not.toContain(ID);
      expect(out).not.toContain(forged.headers.signature);
      expect(out).not.toContain(signed().headers.signature);
    });
  });
});
