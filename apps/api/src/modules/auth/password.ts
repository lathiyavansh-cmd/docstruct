/**
 * What this file does
 *   Hashes passwords before they are stored, and checks a typed password against a stored hash.
 *
 * How it works
 *   - hashPassword() makes a random salt and runs scrypt to produce the stored string.
 *   - verifyPassword() splits the stored string, re-runs scrypt with the same salt and compares the results.
 *   - decoyHash() gives a fake hash to check against when the e-mail does not exist.
 *
 * Where it fits
 *   Called by AuthService (service.ts) for sign-up, login, password change and password reset. Uses only
 *   Node's built-in crypto module. Module: M01 Authentication (owner: Vansh).
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt (SE-4), a memory-hard key-derivation function from Node's crypto module.
 * Stored format: scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>, so parameters can be raised later without
 * invalidating existing hashes.
 */
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // NFKC normalisation makes visually identical Unicode passwords hash the same way.
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  // A new random salt per password, so two users with the same password get different hashes.
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
  // timingSafeEqual takes the same time however many bytes match, so an attacker cannot guess the hash byte by byte.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A hash of a random password, verified against when an e-mail is unknown so timing does not reveal it. */
let decoy: Promise<string> | undefined;
export function decoyHash(): Promise<string> {
  // Created once on first use and reused after that.
  decoy ??= hashPassword(randomBytes(16).toString('hex'));
  return decoy;
}
