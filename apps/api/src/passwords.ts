import bcrypt from 'bcryptjs';

const saltRounds = 12;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, passwordHash: string) {
  if (!passwordHash || passwordHash === '!') return false;
  return bcrypt.compare(password, passwordHash);
}
