/**
 * What this file does
 *   Tests account features: password hashing, sign-up, duplicate e-mails, login, throttling, logout, idle
 *   session expiry, profile edit, password reset and password change.
 *
 * How it works
 *   - The first block calls hashPassword() and verifyPassword() directly.
 *   - The rest use createTestEnv() from helpers.ts, which boots the whole API on an in-memory PGlite
 *     database, and send real HTTP requests to /api/auth/... with supertest.
 *   - Some tests edit the database directly (for example to age a session) and then check the API's reaction.
 *
 * Where it fits
 *   Run by vitest. Covers modules/auth. Module: M01 Authentication (owner: Vansh).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';
import { createTestEnv, signUp, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

describe('password hashing (SE-4)', () => {
  it('stores a salted scrypt hash, never the password', async () => {
    const a = await hashPassword('s3cret-pass');
    const b = await hashPassword('s3cret-pass');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toContain('s3cret-pass');
    expect(a).not.toBe(b);
    expect(await verifyPassword('s3cret-pass', a)).toBe(true);
    expect(await verifyPassword('wrong-pass', a)).toBe(false);
  });
});

describe('M01 authentication', () => {
  it('signs up, creates the profile and signs the user in (Account.SignUp, .Profile)', async () => {
    const res = await env.http
      .post('/api/auth/signup')
      .send({ email: 'Vansh@Example.test', password: 'long-enough-1', displayName: 'Vansh Lathiya' })
      .expect(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'vansh@example.test', displayName: 'Vansh Lathiya' });

    const me = await env.http.get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`).expect(200);
    expect(me.body.displayName).toBe('Vansh Lathiya');
  });

  it('rejects a duplicate e-mail regardless of case (Account.SignUp.Duplicate)', async () => {
    const res = await env.http
      .post('/api/auth/signup')
      .send({ email: 'VANSH@example.test', password: 'long-enough-1', displayName: 'Again' })
      .expect(409);
    expect(res.body.error.code).toBe('ACCOUNT_EXISTS');
  });

  it('validates input on the server (SE-14)', async () => {
    const res = await env.http.post('/api/auth/signup').send({ email: 'not-an-email', password: 'short', displayName: '' }).expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('gives the same generic message for a wrong password and an unknown e-mail (Account.Login.Failure)', async () => {
    const wrong = await env.http.post('/api/auth/login').send({ email: 'vansh@example.test', password: 'nope-nope' }).expect(401);
    const unknown = await env.http.post('/api/auth/login').send({ email: 'ghost@example.test', password: 'nope-nope' }).expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.message).toBe('Invalid email or password');
  });

  it('logs in with correct credentials and refuses access without a token (Account.Login, SE-2)', async () => {
    await env.http.get('/api/auth/me').expect(401);
    const res = await env.http.post('/api/auth/login').send({ email: 'vansh@example.test', password: 'long-enough-1' }).expect(200);
    await env.http.get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`).expect(200);
  });

  it('throttles repeated failures for one account', async () => {
    const user = await signUp(env, 'Throttle');
    // After 5 failures even the correct password is refused with 429.
    for (let i = 0; i < 5; i++) await env.http.post('/api/auth/login').send({ email: user.email, password: 'bad-password' }).expect(401);
    await env.http.post('/api/auth/login').send({ email: user.email, password: 'correct-horse-1' }).expect(429);
  });

  it('invalidates the session on logout (Account.Session)', async () => {
    const user = await signUp(env, 'Logout');
    await env.http.post('/api/auth/logout').set(user.auth).expect(204);
    const res = await env.http.get('/api/auth/me').set(user.auth).expect(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('expires an idle session (Account.Session.Expiry)', async () => {
    const user = await signUp(env, 'Idle');
    await env.ctx.db.query(`UPDATE sessions SET last_seen_at = now() - interval '2 hours' WHERE user_id = $1`, [user.userId]);
    await env.http.get('/api/auth/me').set(user.auth).expect(401);
  });

  it('lets users edit only their own display name (Account.Profile.Edit)', async () => {
    const user = await signUp(env, 'Editor');
    const res = await env.http.patch('/api/auth/me').set(user.auth).send({ displayName: 'Renamed' }).expect(200);
    expect(res.body.displayName).toBe('Renamed');
  });

  it('resets a password through a single-use e-mailed link (Account.PasswordReset)', async () => {
    const user = await signUp(env, 'Forgetful');
    await env.http.post('/api/auth/password/forgot').send({ email: user.email }).expect(202);
    // Unknown addresses get the same answer.
    await env.http.post('/api/auth/password/forgot').send({ email: 'nobody@example.test' }).expect(202);

    // No real e-mail is sent, so the test reads the reset link from the mail_outbox table.
    const { rows } = await env.ctx.db.query<{ body: string }>('SELECT body FROM mail_outbox WHERE to_email = $1', [user.email]);
    const token = /token=([\w-]+)/.exec(rows[0].body)![1];

    await env.http.post('/api/auth/password/reset').send({ token, password: 'brand-new-pass' }).expect(204);
    await env.http.post('/api/auth/password/reset').send({ token, password: 'another-pass-2' }).expect(400);
    await env.http.get('/api/auth/me').set(user.auth).expect(401); // old sessions ended
    await env.http.post('/api/auth/login').send({ email: user.email, password: 'brand-new-pass' }).expect(200);
  });

  it('changes the password and keeps only the current session', async () => {
    const user = await signUp(env, 'Changer');
    const other = await env.http.post('/api/auth/login').send({ email: user.email, password: 'correct-horse-1' }).expect(200);
    await env.http
      .post('/api/auth/password/change')
      .set(user.auth)
      .send({ currentPassword: 'correct-horse-1', newPassword: 'changed-pass-9' })
      .expect(204);
    await env.http.get('/api/auth/me').set(user.auth).expect(200);
    await env.http.get('/api/auth/me').set('Authorization', `Bearer ${other.body.token}`).expect(401);
  });
});
