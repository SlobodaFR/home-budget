import { detectDocumentKind, readImageSize } from './document-kind';

function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    // APP0 de 16 octets de données
    Buffer.from([0xff, 0xe0, 0x00, 0x10]),
    Buffer.alloc(14),
    // SOF0 : longueur 17, précision 8, hauteur, largeur
    Buffer.from([
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      height >> 8,
      height & 0xff,
      width >> 8,
      width & 0xff,
      0x03,
    ]),
    Buffer.alloc(20),
  ]);
}

describe('detectDocumentKind', () => {
  it('reconnaît PDF, PNG et JPEG sur les premiers octets', () => {
    expect(detectDocumentKind(Buffer.from('%PDF-1.7\n'))).toBe('PDF');
    expect(detectDocumentKind(png(10, 10))).toBe('PNG');
    expect(detectDocumentKind(jpeg(10, 10))).toBe('JPEG');
  });

  it.each([
    ['texte', Buffer.from('Bonjour')],
    ['vide', Buffer.alloc(0)],
    ['GIF', Buffer.from('GIF89a......')],
    ['HTML', Buffer.from('<html><body>%PDF-</body></html>')],
    ['PDF décalé', Buffer.from(' %PDF-1.4')],
    ['ZIP', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    ['PNG tronqué', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  ])('refuse %s', (_name, bytes) => {
    expect(detectDocumentKind(bytes)).toBeNull();
  });
});

describe('readImageSize', () => {
  it('lit les dimensions d’un PNG et d’un JPEG sans les décoder', () => {
    expect(readImageSize(png(1654, 2339), 'PNG')).toEqual({
      width: 1654,
      height: 2339,
    });
    expect(readImageSize(jpeg(3000, 4000), 'JPEG')).toEqual({
      width: 3000,
      height: 4000,
    });
  });

  it('renvoie null pour un en-tête tronqué ou incohérent', () => {
    expect(readImageSize(png(1, 1).subarray(0, 20), 'PNG')).toBeNull();
    expect(
      readImageSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]), 'JPEG'),
    ).toBeNull();
    const notIhdr = png(5, 5);
    notIhdr.write('XXXX', 12, 'ascii');
    expect(readImageSize(notIhdr, 'PNG')).toBeNull();
  });
});
