import { FakeClock } from '../../testing/fake-clock';
import {
  computeWebhookSignature,
  WebhookSignatureVerifier,
} from './webhook-signature';

/**
 * Vecteurs de test FIXES du contrat PC7, recopiés de home-auth
 * (backend/src/domain/shared/webhook-signer.spec.ts, PR #83). Recoupés avec
 * `printf '%s' '<id>.<timestamp>.<corps>' | openssl dgst -sha256 -hmac <secret>` : la clé est la
 * chaîne du secret elle-même (ses 64 caractères hexadécimaux, en UTF-8), PAS ses octets décodés.
 */
const SECRET_1 =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const SECRET_2 =
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';
const ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const BODY = '{"userId":"u1"}';
const VECTOR_1 =
  '41294c53497c1d18871786b2d5c3ec091e6b357638e7104d826de50af8813242';
const VECTOR_2 =
  '89de6c4652b33d864427b3091771ed8b9266a99b3bf915b126eb4655a2dce09f';

describe('computeWebhookSignature (vecteurs PC7)', () => {
  it('vecteur 1 : HMAC-SHA256(secret, id.timestamp.rawBody)', () => {
    expect(computeWebhookSignature(SECRET_1, ID, '1700000000', BODY)).toBe(
      VECTOR_1,
    );
  });

  it('vecteur 2 : autre secret, même message', () => {
    expect(computeWebhookSignature(SECRET_2, ID, '1700000000', BODY)).toBe(
      VECTOR_2,
    );
  });

  it('vecteur 3 : corps haché en octets UTF-8 (identifiant non ASCII)', () => {
    expect(
      computeWebhookSignature(
        SECRET_1,
        '9b2f0f6e-8d3a-4f6b-9c1e-2a7d5e4c1b30',
        '1700000123',
        '{"userId":"4b8f-é"}',
      ),
    ).toBe('d9a2c8cec34058ebb100f8b454ba46b1214cf777000d9aab00dda91205d5a3ac');
  });

  it('accepte le corps brut sous forme d’octets (même signature que la chaîne UTF-8)', () => {
    expect(
      computeWebhookSignature(
        SECRET_1,
        '9b2f0f6e-8d3a-4f6b-9c1e-2a7d5e4c1b30',
        '1700000123',
        Buffer.from('{"userId":"4b8f-é"}', 'utf8'),
      ),
    ).toBe('d9a2c8cec34058ebb100f8b454ba46b1214cf777000d9aab00dda91205d5a3ac');
  });
});

describe('WebhookSignatureVerifier', () => {
  const NOW = '2023-11-14T22:13:20.000Z'; // 1700000000
  let clock: FakeClock;
  let verifier: WebhookSignatureVerifier;

  beforeEach(() => {
    clock = FakeClock.at(NOW);
    verifier = new WebhookSignatureVerifier(SECRET_1, clock);
  });

  const check = (
    headers: { id?: string; timestamp?: string; signature?: string },
    rawBody: string | Buffer = BODY,
  ) => verifier.verify(headers, rawBody);
  const valid = (overrides: { id?: string; timestamp?: string } = {}) => ({
    id: ID,
    timestamp: '1700000000',
    signature: `v1=${VECTOR_1}`,
    ...overrides,
  });

  it('accepte une signature valide (vecteur 1)', () => {
    expect(check(valid())).toBe('ok');
  });

  it('accepte le corps brut sous forme d’octets', () => {
    expect(check(valid(), Buffer.from(BODY))).toBe('ok');
  });

  it('accepte plusieurs entrées v1= si l’une correspond, quelle que soit sa place (recouvrement)', () => {
    expect(
      check({ ...valid(), signature: `v1=${VECTOR_2},v1=${VECTOR_1}` }),
    ).toBe('ok');
    clock.set(NOW);
    const other = new WebhookSignatureVerifier(SECRET_1, clock);
    expect(
      other.verify(
        {
          ...valid({ id: 'autre-id' }),
          signature: `v1=${computeWebhookSignature(SECRET_1, 'autre-id', '1700000000', BODY)},v1=${VECTOR_2}`,
        },
        BODY,
      ),
    ).toBe('ok');
  });

  it('tolère des espaces autour des virgules', () => {
    expect(
      check({ ...valid(), signature: `v1=${VECTOR_2}, v1=${VECTOR_1}` }),
    ).toBe('ok');
  });

  it('refuse une signature qui ne correspond pas (mauvais secret, corps, id ou horodatage)', () => {
    expect(check({ ...valid(), signature: `v1=${VECTOR_2}` })).not.toBe('ok');
    expect(check(valid(), '{"userId":"u2"}')).not.toBe('ok');
    expect(check(valid({ id: 'autre-id' }))).not.toBe('ok');
    expect(check(valid({ timestamp: '1700000001' }))).not.toBe('ok');
  });

  it('signe les octets reçus, pas leur re-sérialisation', () => {
    const spaced = '{ "userId": "u1" }';
    const signature = `v1=${computeWebhookSignature(SECRET_1, ID, '1700000000', spaced)}`;
    expect(check({ ...valid(), signature }, spaced)).toBe('ok');
    expect(check({ ...valid(), signature }, BODY)).not.toBe('ok');
  });

  it.each([
    ['absent', undefined],
    ['vide', ''],
    ['sans version', VECTOR_1],
    ['version inconnue', `v2=${VECTOR_1}`],
    ['hex trop court', `v1=${VECTOR_1.slice(2)}`],
    ['hex trop long', `v1=${VECTOR_1}00`],
    ['caractères non hexadécimaux', `v1=${'zz' + VECTOR_1.slice(2)}`],
    ['une entrée valide et une mal formée', `v1=${VECTOR_1},v1=abc`],
    ['entrée vide', `v1=${VECTOR_1},`],
  ])('refuse un en-tête de signature mal formé : %s', (_label, signature) => {
    expect(check({ ...valid(), signature })).not.toBe('ok');
  });

  it.each([
    ['id absent', { id: undefined }],
    ['id vide', { id: '' }],
    ['horodatage absent', { timestamp: undefined }],
    ['horodatage non numérique', { timestamp: 'hier' }],
    ['horodatage décimal', { timestamp: '1700000000.5' }],
    ['horodatage signé', { timestamp: '+1700000000' }],
  ])('refuse des en-têtes incomplets ou invalides : %s', (_label, override) => {
    expect(check({ ...valid(), ...override })).not.toBe('ok');
  });

  describe('fenêtre de ±120 s', () => {
    const signedAt = (timestamp: string) => ({
      id: ID,
      timestamp,
      signature: `v1=${computeWebhookSignature(SECRET_1, ID, timestamp, BODY)}`,
    });

    it('accepte exactement 120 s d’écart, passé ou futur', () => {
      expect(check(signedAt('1699999880'))).toBe('ok');
      const future = new WebhookSignatureVerifier(SECRET_1, clock);
      expect(future.verify(signedAt('1700000120'), BODY)).toBe('ok');
    });

    it('compte en secondes entières, comme l’émetteur (120 s pile malgré les millisecondes)', () => {
      clock.set('2023-11-14T22:13:20.900Z');
      expect(check(signedAt('1699999880'))).toBe('ok');
    });

    it('refuse 121 s d’écart, passé ou futur', () => {
      expect(check(signedAt('1699999879'))).not.toBe('ok');
      expect(check(signedAt('1700000121'))).not.toBe('ok');
    });
  });

  describe('rejeu', () => {
    it('refuse un identifiant déjà vu dans les 10 dernières minutes', () => {
      expect(check(valid())).toBe('ok');
      expect(check(valid())).not.toBe('ok');
      clock.set('2023-11-14T22:23:19.000Z'); // +9 min 59 s
      const later = {
        id: ID,
        timestamp: '1700000599',
        signature: `v1=${computeWebhookSignature(SECRET_1, ID, '1700000599', BODY)}`,
      };
      expect(check(later)).not.toBe('ok');
    });

    it('oublie l’identifiant après 10 minutes', () => {
      expect(check(valid())).toBe('ok');
      clock.set('2023-11-14T22:23:21.000Z'); // +10 min 1 s
      const later = {
        id: ID,
        timestamp: '1700000601',
        signature: `v1=${computeWebhookSignature(SECRET_1, ID, '1700000601', BODY)}`,
      };
      expect(check(later)).toBe('ok');
    });

    it('ne retient pas l’identifiant d’une signature invalide', () => {
      expect(check({ ...valid(), signature: `v1=${VECTOR_2}` })).not.toBe('ok');
      expect(check(valid())).toBe('ok');
    });

    it('ne retient pas l’identifiant d’une requête hors fenêtre', () => {
      clock.set('2023-11-14T22:20:00.000Z'); // 400 s plus tard : 1700000000 est périmé
      expect(check(valid())).not.toBe('ok');
      clock.set(NOW);
      expect(check(valid())).toBe('ok');
    });
  });

  describe('raison de l’échec', () => {
    it('distingue format, fenêtre, hmac et rejeu', () => {
      expect(check({ ...valid(), signature: 'abc' })).toBe('format');
      expect(check({ ...valid(), id: undefined })).toBe('format');
      expect(check({ ...valid(), timestamp: 'hier' })).toBe('format');
      const old = {
        id: ID,
        timestamp: '1699999000',
        signature: `v1=${computeWebhookSignature(SECRET_1, ID, '1699999000', BODY)}`,
      };
      expect(check(old)).toBe('window');
      expect(check({ ...valid(), signature: `v1=${VECTOR_2}` })).toBe('hmac');
      expect(check(valid())).toBe('ok');
      expect(check(valid())).toBe('replay');
    });

    it('un identifiant déjà vu est un rejeu même si les autres en-têtes manquent ou sont mal formés', () => {
      expect(check(valid())).toBe('ok');
      expect(check({ id: ID })).toBe('replay');
      expect(check({ id: ID, timestamp: 'hier', signature: 'abc' })).toBe(
        'replay',
      );
    });

    it('un identifiant déjà vu est un rejeu même si la signature rejouée est fausse', () => {
      expect(check(valid())).toBe('ok');
      expect(check({ ...valid(), signature: `v1=${VECTOR_2}` })).toBe('replay');
    });
  });
});
