import { randomInt } from 'node:crypto';
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function generateCode(length = 8): string {
  if (!Number.isInteger(length) || length < 7 || length > 8) throw new RangeError('Code length must be 7 or 8');
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}
