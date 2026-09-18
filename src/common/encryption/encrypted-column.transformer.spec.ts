import { encryptedColumnTransformer } from './encrypted-column.transformer.js';

describe('encryptedColumnTransformer', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it('cifra y descifra un valor real de ida y vuelta', () => {
    const cipherText = encryptedColumnTransformer.to!('clave-real');

    expect(cipherText).not.toBe('clave-real');
    expect(encryptedColumnTransformer.from!(cipherText)).toBe('clave-real');
  });

  // Cuentas con claveServicio opcional (proveedor que solo da un código,
  // sin contraseña): la columna ahora puede llegar en null/undefined tanto
  // al guardar como al leer, y no debe intentar cifrar/descifrar nada.
  it('al guardar, deja pasar null y undefined sin cifrar', () => {
    expect(encryptedColumnTransformer.to!(null)).toBeNull();
    expect(encryptedColumnTransformer.to!(undefined)).toBeUndefined();
  });

  it('al leer, deja pasar null y undefined sin intentar descifrar', () => {
    expect(encryptedColumnTransformer.from!(null)).toBeNull();
    expect(encryptedColumnTransformer.from!(undefined)).toBeUndefined();
  });
});
