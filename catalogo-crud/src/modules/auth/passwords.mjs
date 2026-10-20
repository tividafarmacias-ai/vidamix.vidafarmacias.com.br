import { timingSafeEqual } from 'node:crypto';
import apacheMd5 from 'apache-md5';
import bcrypt from 'bcryptjs';

const md5CryptPattern = /^\$1\$[./0-9A-Za-z]{1,8}\$[./0-9A-Za-z]{22}$/;
const bcryptPattern = /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./0-9A-Za-z]{53}$/;

export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string' || !password || !hash) return false;
  if (Buffer.byteLength(password, 'utf8') > 1024 || password.includes('\0')) return false;

  try {
    if (md5CryptPattern.test(hash)) {
      // apache-md5 uses one-byte strings internally. Pass UTF-8 bytes as latin1
      // so accented characters are hashed exactly as by PHP/Unix MD5-crypt.
      const bytes = Buffer.from(password, 'utf8').toString('latin1');
      const calculated = Buffer.from(apacheMd5(bytes, hash), 'ascii');
      const expected = Buffer.from(hash, 'ascii');
      return calculated.length === expected.length && timingSafeEqual(calculated, expected);
    }
    if (bcryptPattern.test(hash)) {
      // Do not silently accept distinct passwords sharing the first 72 bytes.
      if (bcrypt.truncates(password)) return false;
      return await bcrypt.compare(password, hash);
    }
    // Unsupported, empty and plaintext database values never authenticate.
    return false;
  } catch {
    return false;
  }
}
