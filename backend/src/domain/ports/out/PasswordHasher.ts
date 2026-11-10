/**
 * Puerto de salida: el nucleo necesita poder "hashear" y "comparar"
 * contrasenas, pero no debe conocer el algoritmo concreto.
 */
export interface PasswordHasher {
  hash(passwordPlano: string): Promise<string>;
  comparar(passwordPlano: string, passwordHash: string): Promise<boolean>;
  necesitaRehash(passwordHash: string): boolean;
}
