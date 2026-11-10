import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import { PasswordHasher } from '../../../../domain/ports/out/PasswordHasher';

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;
const HASH_ARGON2ID = /^\$argon2id\$/;
const HASH_BCRYPT = /^\$2[aby]\$/;

export class Argon2PasswordHasher implements PasswordHasher {
  hash(passwordPlano: string): Promise<string> {
    return argon2.hash(passwordPlano, ARGON2_OPTIONS);
  }

  async comparar(passwordPlano: string, passwordHash: string): Promise<boolean> {
    if (HASH_ARGON2ID.test(passwordHash)) {
      return argon2.verify(passwordHash, passwordPlano);
    }
    if (HASH_BCRYPT.test(passwordHash)) {
      return bcrypt.compare(passwordPlano, passwordHash);
    }
    return false;
  }

  necesitaRehash(passwordHash: string): boolean {
    return !HASH_ARGON2ID.test(passwordHash) || argon2.needsRehash(passwordHash, ARGON2_OPTIONS);
  }
}
