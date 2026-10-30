import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AesGcmFieldCipher } from './aes-gcm-field-cipher';

function cipherWith(env: Record<string, string | undefined>) {
  return new AesGcmFieldCipher({
    get: (key: string) => env[key],
  } as ConfigService);
}

describe('AesGcmFieldCipher', () => {
  const key = randomBytes(32).toString('base64');
  const cipher = cipherWith({ PERSONAL_DATA_KEY: key });

  it('round-trips a value', () => {
    const token = cipher.encrypt('alice', 'tx:1', '{"label":"Cadeau"}');
    expect(token.startsWith('v1.')).toBe(true);
    expect(token).not.toContain('Cadeau');
    expect(cipher.decrypt('alice', 'tx:1', token)).toBe('{"label":"Cadeau"}');
  });

  it('produces a different token each time', () => {
    expect(cipher.encrypt('alice', 'a', 'x')).not.toBe(
      cipher.encrypt('alice', 'a', 'x'),
    );
  });

  it('does not decrypt with another owner key', () => {
    const token = cipher.encrypt('alice', 'tx:1', 'secret');
    expect(() => cipher.decrypt('bob', 'tx:1', token)).toThrow();
  });

  it('does not decrypt when moved to another row (AAD)', () => {
    const token = cipher.encrypt('alice', 'tx:1', 'secret');
    expect(() => cipher.decrypt('alice', 'tx:2', token)).toThrow();
  });

  it('detects tampering', () => {
    const token = cipher.encrypt('alice', 'tx:1', 'secret');
    const parts = token.split('.');
    parts[3] = Buffer.from('forged').toString('base64url');
    expect(() => cipher.decrypt('alice', 'tx:1', parts.join('.'))).toThrow();
  });

  it('does not decrypt with another master key', () => {
    const other = cipherWith({
      PERSONAL_DATA_KEY: randomBytes(32).toString('base64'),
    });
    const token = cipher.encrypt('alice', 'tx:1', 'secret');
    expect(() => other.decrypt('alice', 'tx:1', token)).toThrow();
  });

  it('accepts a 32-byte key written as 64 hexadecimal characters', () => {
    const hex = randomBytes(32).toString('hex');
    const a = cipherWith({ PERSONAL_DATA_KEY: hex });
    const b = cipherWith({ PERSONAL_DATA_KEY: hex.toUpperCase() });
    expect(b.decrypt('u', 'x', a.encrypt('u', 'x', 'ok'))).toBe('ok');
    const same = cipherWith({
      PERSONAL_DATA_KEY: Buffer.from(hex, 'hex').toString('base64'),
    });
    expect(same.decrypt('u', 'x', a.encrypt('u', 'x', 'ok'))).toBe('ok');
  });

  it('ignores surrounding whitespace in the key', () => {
    const k = randomBytes(32).toString('hex');
    const a = cipherWith({ PERSONAL_DATA_KEY: `${k}\n` });
    expect(
      a.decrypt(
        'u',
        'x',
        cipherWith({ PERSONAL_DATA_KEY: k }).encrypt('u', 'x', 'ok'),
      ),
    ).toBe('ok');
  });

  it('requires the key in production and rejects a malformed one', () => {
    expect(() => cipherWith({ NODE_ENV: 'production' })).toThrow('obligatoire');
    expect(() => cipherWith({ PERSONAL_DATA_KEY: 'court' })).toThrow(
      '32 octets',
    );
  });

  it('falls back to a development key outside production', () => {
    const dev = cipherWith({ NODE_ENV: 'development' });
    expect(dev.decrypt('a', 'x', dev.encrypt('a', 'x', 'ok'))).toBe('ok');
  });
});
