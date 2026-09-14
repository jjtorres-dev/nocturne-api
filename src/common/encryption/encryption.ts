import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // longitud recomendada para GCM
const KEY_LENGTH_BYTES = 32; // AES-256

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'ENCRYPTION_KEY no está definida. Generarla con `openssl rand -hex 32`.',
    );
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY debe ser un hex de ${KEY_LENGTH_BYTES} bytes (${
        KEY_LENGTH_BYTES * 2
      } caracteres).`,
    );
  }
  return key;
}

/**
 * Cifra un texto con AES-256-GCM. El resultado incluye el IV (aleatorio en
 * cada llamada) y el auth tag, así que dos cifrados del mismo texto nunca
 * son iguales entre sí, pero ambos descifran correctamente.
 */
export function encrypt(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

export function decrypt(cipherText: string): string {
  const [ivHex, authTagHex, dataHex] = cipherText.split(':');
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error('Formato de texto cifrado inválido.');
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
