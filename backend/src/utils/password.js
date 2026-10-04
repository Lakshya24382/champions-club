// Node's built-in scrypt: strong password hashing with zero extra dependencies.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex || !/^[0-9a-f]+$/i.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== 64) return false;
  const candidate = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(candidate, expected);
}
