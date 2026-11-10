import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import { Argon2PasswordHasher } from '../../src/infrastructure/adapters/out/security/Argon2PasswordHasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('crea hashes Argon2id y verifica la contraseña', async () => {
    const hash = await hasher.hash('UnaClaveSegura2026!');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(hasher.comparar('UnaClaveSegura2026!', hash)).resolves.toBe(true);
    await expect(hasher.comparar('incorrecta', hash)).resolves.toBe(false);
    expect(hasher.necesitaRehash(hash)).toBe(false);
  });

  it('verifica hashes bcrypt heredados y los marca para rehash', async () => {
    const legacyHash = await bcrypt.hash('ClaveHeredada2026!', 4);

    await expect(hasher.comparar('ClaveHeredada2026!', legacyHash)).resolves.toBe(true);
    expect(hasher.necesitaRehash(legacyHash)).toBe(true);
  });

  it('rechaza formatos de hash no soportados', async () => {
    await expect(hasher.comparar('cualquier-clave', 'hash-desconocido')).resolves.toBe(false);
    expect(hasher.necesitaRehash('hash-desconocido')).toBe(true);
  });
});
