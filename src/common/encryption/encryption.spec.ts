import { decrypt, encrypt } from './encryption.js';

describe('encryption', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    // 32 bytes en hex (64 caracteres), fija para que los tests sean deterministas.
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it('descifra exactamente lo que se cifró', () => {
    const plainText = 'mi-clave-super-secreta';

    const cipherText = encrypt(plainText);

    expect(decrypt(cipherText)).toBe(plainText);
  });

  it('dos cifrados del mismo texto no son iguales (IV aleatorio)', () => {
    const plainText = 'mismo-texto';

    const first = encrypt(plainText);
    const second = encrypt(plainText);

    expect(first).not.toBe(second);
    expect(decrypt(first)).toBe(plainText);
    expect(decrypt(second)).toBe(plainText);
  });

  it('lanza si ENCRYPTION_KEY no está definida', () => {
    delete process.env.ENCRYPTION_KEY;

    expect(() => encrypt('algo')).toThrow(/ENCRYPTION_KEY/);
  });

  it('lanza si ENCRYPTION_KEY no tiene 32 bytes', () => {
    process.env.ENCRYPTION_KEY = 'demasiado-corta';

    expect(() => encrypt('algo')).toThrow(/ENCRYPTION_KEY/);
  });

  it('lanza al descifrar un texto con formato inválido', () => {
    expect(() => decrypt('no-tiene-el-formato-esperado')).toThrow(
      /formato/i,
    );
  });

  it('lanza al descifrar con un texto manipulado (auth tag no coincide)', () => {
    const cipherText = encrypt('dato-sensible');
    const [iv, authTag, data] = cipherText.split(':');
    const tampered = [iv, authTag, data.slice(0, -2) + '00'].join(':');

    expect(() => decrypt(tampered)).toThrow();
  });
});
