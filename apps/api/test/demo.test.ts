/**
 * What this file does
 *   Tests the demo data: all ten demo accounts, the second project and the demo-accounts endpoint.
 *
 * How it works
 *   - Boots the whole API on an in-memory database with createTestEnv() and runs seedDemoData() on it.
 *   - Logs in as several demo users with the shared demo password and checks what each one sees.
 *   - Runs the seed a second time to check nothing is duplicated and changed passwords are put back.
 *
 * Where it fits
 *   Covers db/demo-data.ts, db/demo-content.ts and modules/demo.ts. Module: scripts / server core (owner: Vansh).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, DEMO_DOCUMENT_PASSWORD, DEMO_PASSWORD, seedDemoData } from '../src/db/demo-data.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;

beforeAll(async () => {
  env = await createTestEnv({ demoMode: true });
  await seedDemoData(env.ctx);
}, 120_000);
afterAll(() => env.close());

async function login(email: string) {
  const res = await env.http.post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

describe('demo accounts', () => {
  it('creates ten accounts that all log in with the demo password', async () => {
    expect(DEMO_ACCOUNTS).toHaveLength(10);
    for (const a of DEMO_ACCOUNTS) await login(a.email);
  });

  it('gives each person the projects and work the login page promises', async () => {
    // Log in first, then send the request (supertest cannot await another request in the middle of one).
    const projectsOf = async (email: string) => {
      const auth = await login(email);
      return (await env.http.get('/api/projects').set(auth).expect(200)).body.map((p: { name: string }) => p.name).sort();
    };
    expect(await projectsOf('vansh@docstruct.test')).toEqual(['Campus Canteen App', 'DocStruct Mini Project']);
    expect(await projectsOf('rohan@docstruct.test')).toEqual(['Campus Canteen App', 'DocStruct Mini Project']);
    expect(await projectsOf('priya@docstruct.test')).toEqual(['Campus Canteen App']);
    expect(await projectsOf('arjun@docstruct.test')).toEqual([]);

    const isha = await login('isha@docstruct.test');
    const queue = (await env.http.get('/api/reviews/queue').set(isha).expect(200)).body;
    expect(queue.map((r: { documentTitle: string; versionNo: number }) => [r.documentTitle, r.versionNo])).toEqual([['Canteen Pre-Order SRS', 4]]);
    const reviewer = await login('reviewer@docstruct.test');
    expect((await env.http.get('/api/reviews/queue').set(reviewer).expect(200)).body).toHaveLength(1);
  });

  it('includes a protected contract sent to every canteen member', async () => {
    const kabir = await login('kabir@docstruct.test');
    const shared = (await env.http.get('/api/me/shared').set(kabir).expect(200)).body;
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ document: { title: 'Vendor Contract Terms', isProtected: true }, readAt: null });
    const id = shared[0].document.documentId;
    await env.http.get(`/api/documents/${id}/preview`).set(kabir).expect(423);
    await env.http.post(`/api/documents/${id}/unlock`).set(kabir).send({ password: DEMO_DOCUMENT_PASSWORD }).expect(200);
  });

  it('is safe to run again and restores changed demo passwords', async () => {
    await env.ctx.db.query(
      `UPDATE user_credentials SET password_hash = $1 WHERE user_id = (SELECT user_id FROM profiles WHERE email = 'priya@docstruct.test')`,
      [await hashPassword('something-else')],
    );
    expect(await seedDemoData(env.ctx)).toBe(false);
    await login('priya@docstruct.test');
    const { rows } = await env.ctx.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM projects WHERE name = 'Campus Canteen App'`);
    expect(rows[0].n).toBe(1);
  });

  it('lists the accounts for the login page only in demo mode', async () => {
    const res = await env.http.get('/api/demo-accounts').expect(200);
    expect(res.body).toMatchObject({ password: DEMO_PASSWORD, documentPassword: DEMO_DOCUMENT_PASSWORD });
    expect(res.body.accounts).toHaveLength(10);

    const plain = await createTestEnv();
    try {
      await plain.http.get('/api/demo-accounts').expect(404);
    } finally {
      await plain.close();
    }
  });
});
