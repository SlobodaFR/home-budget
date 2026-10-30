/**
 * Port (driven side). Chiffrement authentifie de champs sensibles, avec une cle
 * propre a chaque proprietaire. `aad` lie le chiffre a sa ligne : un chiffre
 * recopie ailleurs ne se dechiffre pas.
 */
export abstract class FieldCipher {
  abstract encrypt(ownerUserId: string, aad: string, plaintext: string): string;
  abstract decrypt(ownerUserId: string, aad: string, token: string): string;
}
