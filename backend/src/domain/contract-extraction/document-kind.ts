/**
 * Type d'un document reçu, reconnu sur ses PREMIERS OCTETS (jamais sur l'extension ni
 * sur le type annoncé par le client) : PDF, PNG ou JPEG.
 */
export type DocumentKind = 'PDF' | 'PNG' | 'JPEG';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return (
    bytes.length >= magic.length && magic.every((byte, i) => bytes[i] === byte)
  );
}

export function detectDocumentKind(bytes: Uint8Array): DocumentKind | null {
  if (startsWith(bytes, PDF_MAGIC)) {
    return 'PDF';
  }
  if (startsWith(bytes, PNG_MAGIC)) {
    return 'PNG';
  }
  if (startsWith(bytes, JPEG_MAGIC)) {
    return 'JPEG';
  }
  return null;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Dimensions lues dans l'en-tête de l'image (sans la décoder) ; null si l'en-tête est illisible. */
export function readImageSize(
  bytes: Uint8Array,
  kind: 'PNG' | 'JPEG',
): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (kind === 'PNG') {
    // Signature (8) + longueur (4) + « IHDR » (4), puis largeur et hauteur sur 4 octets chacune.
    if (bytes.length < 24 || view.getUint32(12) !== 0x49484452) {
      return null;
    }
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Marqueurs sans longueur : SOI, EOI, RSTn, TEM.
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (offset + 9 > bytes.length) {
        return null;
      }
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    if (length < 2) {
      return null;
    }
    offset += 2 + length;
  }
  return null;
}
