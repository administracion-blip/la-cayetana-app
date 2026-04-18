/**
 * Genera un hash bcrypt compatible con lib/auth/password.ts (12 rondas).
 * Uso: npm run hash:password -- "tu contraseña"
 */
import bcrypt from "bcryptjs";

const ROUNDS = 12;
const plain = process.argv[2];

if (!plain) {
  console.error('Uso: npm run hash:password -- "contraseña"');
  process.exit(1);
}

console.log(bcrypt.hashSync(plain, ROUNDS));
