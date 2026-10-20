import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { verifyPassword } from '../src/modules/auth/passwords.mjs';

// Independent MD5-crypt vectors from Apache Commons Codec:
// https://github.com/apache/commons-codec/blob/master/src/test/java/org/apache/commons/codec/digest/Md5CryptTest.java
const md5Vectors = [
  ['secret', '$1$1234$ImZYBLmYC.rbBKg9ERxX70'],
  ['secret', '$1$12345678$hj0uLpdidjPhbMMZeno8X/'],
  ['12345678901234567890', '$1$1234$MoxekaNNUgfPRVqoeYjCD/'],
  ['täst', '$1$./$52agTEQZs877L9jyJnCNZ1'],
];

test('existing $1$ MD5-crypt hashes validate against independent known vectors', async () => {
  for (const [password, hash] of md5Vectors) {
    assert.equal(await verifyPassword(password, hash), true, password);
    assert.equal(await verifyPassword(`${password}!`, hash), false);
  }
});

test('MD5-crypt passwords use UTF-8 bytes without Latin-1 fallback', async () => {
  assert.equal(await verifyPassword('täst', '$1$./$52agTEQZs877L9jyJnCNZ1'), true);
  assert.equal(await verifyPassword('täst', '$1$./$J2UbKzGe0Cpe63WZAt6p//'), false);
  assert.equal(await verifyPassword('tast', '$1$./$52agTEQZs877L9jyJnCNZ1'), false);
});

test('bcrypt 2a, 2b and 2y fixtures support correct and incorrect UTF-8 passwords', async () => {
  for (const prefix of ['2a', '2b', '2y']) {
    const password = 'Ação & café 🔐';
    const hash = await bcrypt.hash(password, `$${prefix}$04$abcdefghijklmnopqrstuu`);
    assert.equal(await verifyPassword(password, hash), true, prefix);
    assert.equal(await verifyPassword('Acao & cafe 🔐', hash), false, prefix);
  }
});

test('password verification preserves whitespace and case', async () => {
  const password = '  Senha com Espaços  ';
  const hash = await bcrypt.hash(password, '$2b$04$abcdefghijklmnopqrstuu');
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword(password.trim(), hash), false);
  assert.equal(await verifyPassword(password.toLowerCase(), hash), false);
});

test('empty passwords, unknown schemes and plaintext values never authenticate', async () => {
  for (const hash of [
    '', 'secret', '5ebe2294ecd0e0f08eab7690d2a6ee69', '$apr1$1234$ImZYBLmYC.rbBKg9ERxX70',
    '$5$1234$hash', '$6$1234$hash', '*0', '*1', null, undefined, {}, 1234,
  ]) {
    assert.equal(await verifyPassword('secret', hash), false);
  }
  for (const password of ['', null, undefined, {}, 1234, Buffer.from('secret')]) {
    assert.equal(await verifyPassword(password, md5Vectors[0][1]), false);
  }
  assert.equal(await verifyPassword('', '$1$foo$9mS5ExwgIECGE5YKlD5o91'), false);
});

test('malformed hashes are rejected without throwing', async () => {
  for (const hash of [
    '$1$1234$ImZYBLmYC.rbBKg9ERxX7',
    '$1$1234$ImZYBLmYC.rbBKg9ERxX700',
    '$1$toolongsalt$ImZYBLmYC.rbBKg9ERxX70',
    '$1$inv@lid$ImZYBLmYC.rbBKg9ERxX70',
    '$1$1234$ImZYBLmYC.rbBKg9ERxX7!',
    '$2b$03$abcdefghijklmnopqrstuu' + 'a'.repeat(31),
    '$2b$32$abcdefghijklmnopqrstuu' + 'a'.repeat(31),
    '$2x$04$abcdefghijklmnopqrstuu' + 'a'.repeat(31),
    '$2b$04$abcdefghijklmnopqrstuu' + 'a'.repeat(30),
  ]) {
    assert.equal(await verifyPassword('secret', hash), false, hash);
  }
});

test('bcrypt never silently accepts a password truncated at 72 UTF-8 bytes', async () => {
  const password = 'á'.repeat(36);
  const hash = await bcrypt.hash(password, '$2b$04$abcdefghijklmnopqrstuu');
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword(`${password}suffix`, hash), false);
});

test('oversized and NUL-containing input fails safely', async () => {
  assert.equal(await verifyPassword('a'.repeat(1025), md5Vectors[0][1]), false);
  assert.equal(await verifyPassword('secret\0', md5Vectors[0][1]), false);
});
