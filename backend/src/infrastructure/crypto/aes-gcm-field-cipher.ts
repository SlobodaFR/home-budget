import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'crypto';
import { FieldCipher } from '../../domain/shared/field-cipher';

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const HKDF_INFO = 'home-budget/personal-space/v1';

/**
 * Chiffrement AES-256-GCM des donnees de l'espace personnel.
 *
 * Methode volontairement simple pour la phase de dev : une cle maitre
 * (PERSONAL_DATA_KEY, 32 octets en base64) dont on derive une cle par utilisateur
 * (HKDF-SHA256). Protege la base, ses sauvegardes et le replica Litestream ; ne
 * protege PAS contre celui qui detient la cle maitre (l'hebergeur). Evolution
 * prevue : cle derivee d'un secret propre a chaque utilisateur.
 *
 * Format : v1.<iv>.<tag>.<chiffre> (base64url).
 */
@Injectable()
export class AesGcmFieldCipher extends FieldCipher {
  private readonly masterKey: Buffer;
  private readonly logger = new Logger(AesGcmFieldCipher.name);

  constructor(config: ConfigService) {
    super();
    const raw = config.get<string>('PERSONAL_DATA_KEY');
    if (raw) {
      const key = Buffer.from(raw, 'base64');
      if (key.length !== KEY_BYTES) {
        throw new Error(
          'PERSONAL_DATA_KEY doit contenir 32 octets encodes en base64',
        );
      }
      this.masterKey = key;
    } else if (config.get<string>('NODE_ENV') === 'production') {
      throw new Error('PERSONAL_DATA_KEY est obligatoire en production');
    } else {
      this.logger.warn(
        'PERSONAL_DATA_KEY absente : cle de developpement NON SECRETE utilisee',
      );
      this.masterKey = createHash('sha256')
        .update('home-budget-dev-only-key')
        .digest();
    }
  }

  encrypt(ownerUserId: string, aad: string, plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.keyFor(ownerUserId), iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [VERSION, iv, cipher.getAuthTag(), encrypted]
      .map((part) =>
        typeof part === 'string' ? part : part.toString('base64url'),
      )
      .join('.');
  }

  decrypt(ownerUserId: string, aad: string, token: string): string {
    const [version, iv, tag, encrypted] = token.split('.');
    if (version !== VERSION || !iv || !tag || encrypted === undefined) {
      throw new Error('Format de donnee chiffree inconnu');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.keyFor(ownerUserId),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private keyFor(ownerUserId: string): Buffer {
    return Buffer.from(
      hkdfSync(
        'sha256',
        this.masterKey,
        Buffer.from(ownerUserId, 'utf8'),
        HKDF_INFO,
        KEY_BYTES,
      ),
    );
  }
}
