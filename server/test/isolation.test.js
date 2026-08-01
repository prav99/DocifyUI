// Cross-account isolation, token integrity, and account deletion.
//
// The security policy states that every API query is scoped to the
// authenticated account and that cross-account access is denied. These tests
// are what makes that claim checkable: they stand up a real server against a
// throwaway SQLite database, create two accounts with real data, and assert
// that neither can reach the other's rows through the HTTP API.
//
// Two rules keep these tests honest, because a weak isolation test is worse
// than none — it manufactures confidence:
//   1. Assert the EXACT status (404/401), never `!== 200`. A 500, or a 404
//      caused by a typo in the route, must not read as "access denied".
//   2. Every cross-account assertion is paired with a positive control
//      proving the same request SUCCEEDS for the rightful owner. Without
//      that, a test passes when the resource simply is not ready yet.
//
// Run with:  npm test   (from server/)
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import net from 'node:net';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

// A fixed port makes back-to-back runs fail when the previous server has not
// released the socket yet — flaky tests are worse than none when a published
// security claim cites them.
const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
// Unique per run: a leftover server from a previous run still holding the
// old file made signup 500 intermittently, which failed the whole suite in
// before(). A per-process database removes that class of flake entirely.
const DB_FILE = path.join(here, 'isolation-test-' + process.pid + '.db');
// SQLite writes -wal/-shm alongside the database; leaving them behind drops
// real account rows in the repository working tree.
const DB_ARTIFACTS = () => [DB_FILE, DB_FILE + '-journal', DB_FILE + '-wal', DB_FILE + '-shm'];
const DB_URL = 'file:' + DB_FILE;
let PORT;   // assigned in before()
let BASE;
const SECRET = 'isolation-test-secret-not-used-anywhere-else';

let child;
let prisma;
const env = {
  ...process.env,
  DATABASE_URL: DB_URL,
  JWT_SECRET: SECRET,
  NODE_ENV: 'test',
  SMTP_HOST: '',              // keep signup synchronous (no OTP round-trip)
  RATE_LIMIT_AUTH: '10000',   // the limiter is not what we are testing here
  RATE_LIMIT_API: '10000',
  ALLOW_DEMO_LOGIN: 'false',
  ANTHROPIC_API_KEY: '',      // generation falls back to template content
  // Google must be CONFIGURED, or the OAuth callback short-circuits on
  // "not configured" before it ever validates the state we are testing.
  GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  NODE_OPTIONS: '--experimental-detect-module'
};

const api = async (p, { method = 'GET', token, body } = {}) => {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = {};
  try { json = await res.json(); } catch { /* empty or non-JSON body */ }
  return { status: res.status, body: json };
};

const signup = async (email) => {
  const r = await api('/auth/signup', { method: 'POST', body: { email, password: 'test-password-123' } });
  assert.ok(r.status === 200 || r.status === 201, 'signup failed for ' + email + ': ' + JSON.stringify(r.body));
  return { token: r.body.token, id: r.body.user.id, email };
};

// A generation is created asynchronously (fire-and-forget pipeline). Several
// endpoints 404 until it reaches a terminal state, which would make a
// cross-account 404 meaningless.
const waitForGeneration = async (id, token) => {
  for (let i = 0; i < 120; i++) {
    const r = await api('/generations/' + id, { token });
    const status = r.body && (r.body.generation ? r.body.generation.status : r.body.status);
    if (status === 'complete' || status === 'failed') return status;
    await new Promise((r2) => setTimeout(r2, 500));
  }
  throw new Error('generation ' + id + ' never reached a terminal state');
};

let alice, bob, aliceDoc, aliceVersionId, aliceDocStatus;

before(async () => {
  PORT = await freePort();
  BASE = 'http://localhost:' + PORT + '/api';
  env.PORT = String(PORT);
  for (const f of DB_ARTIFACTS()) if (fs.existsSync(f)) fs.unlinkSync(f);
  await new Promise((resolve, reject) => {
    const p = spawn('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'],
      { cwd: serverDir, env, stdio: 'ignore' });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('prisma db push failed (' + c + ')'))));
  });
  prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  child = spawn('node', ['src/index.js'], { cwd: serverDir, env, stdio: 'ignore' });
  // Assert the server is genuinely OURS before any test runs. Without this a
  // failed boot leaves every request erroring, and "access denied" assertions
  // would pass for entirely the wrong reason.
  let booted = false;
  for (let i = 0; i < 60; i++) {
    try {
      const ping = await fetch('http://localhost:' + PORT + '/api/ping');
      if (ping.ok && (await ping.json()).pid === child.pid) { booted = true; break; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(booted, 'test server did not start on port ' + PORT + ' (exit code ' + child.exitCode + ')');

  alice = await signup('alice@example.test');
  bob = await signup('bob@example.test');

  const gen = await api('/generations', {
    method: 'POST', token: alice.token,
    body: { repo: 'alice/private-repo', track: 'technical', docTypes: ['userguide'], format: 'pdf' }
  });
  assert.ok(gen.status === 200 || gen.status === 201, 'could not create Alice document: ' + JSON.stringify(gen.body));
  aliceDoc = gen.body.generation ? gen.body.generation.id : gen.body.id;
  assert.ok(aliceDoc, 'no generation id returned');
  aliceDocStatus = await waitForGeneration(aliceDoc, alice.token);

  await api('/sources', { method: 'POST', token: alice.token, body: { provider: 'github', detail: 'alice/private-repo' } });
  await api('/team/invite', { method: 'POST', token: alice.token, body: { email: 'alice-colleague@example.test' } });

  // A real version row, so the restore test exercises the ownership check
  // rather than 404-ing on a version that never existed.
  const v = await prisma.docVersion.create({
    data: { userId: alice.id, generationId: aliceDoc, version: 1, title: 'v1', content: 'alice private content', score: 90 }
  });
  aliceVersionId = v.id;
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  // Wait for the server to actually exit before removing its database —
  // killing and deleting immediately leaves a live process on the file.
  if (child && child.exitCode === null) {
    await new Promise((resolve) => {
      child.once('exit', resolve);
      child.kill();
      setTimeout(resolve, 5000).unref();
    });
  }
  for (const f of DB_ARTIFACTS()) if (fs.existsSync(f)) fs.unlinkSync(f);
});

describe('cross-account isolation', () => {
  test('the fixture is genuinely readable by its owner (positive control)', async () => {
    assert.equal(aliceDocStatus, 'complete',
      'Alice\'s document did not complete, so every 404 below would be meaningless');
    assert.equal((await api('/generations/' + aliceDoc, { token: alice.token })).status, 200);
    const versions = await api('/history/' + aliceDoc + '/versions', { token: alice.token });
    assert.equal(versions.status, 200);
  });

  test('Bob cannot read Alice\'s document by id', async () => {
    assert.equal((await api('/generations/' + aliceDoc, { token: bob.token })).status, 404);
  });

  test('Bob cannot read Alice\'s version history', async () => {
    assert.equal((await api('/history/' + aliceDoc + '/versions', { token: bob.token })).status, 404);
  });

  test('Bob cannot download Alice\'s document, but Alice can', async () => {
    const mine = await fetch(BASE + '/generations/' + aliceDoc + '/download',
      { headers: { Authorization: 'Bearer ' + alice.token } });
    assert.equal(mine.status, 200, 'owner could not download — the negative test below would prove nothing');
    const theirs = await fetch(BASE + '/generations/' + aliceDoc + '/download',
      { headers: { Authorization: 'Bearer ' + bob.token } });
    assert.equal(theirs.status, 404);
  });

  test('Bob cannot read Alice\'s quality report, but Alice can', async () => {
    assert.equal((await api('/generations/' + aliceDoc + '/quality', { token: alice.token })).status, 200);
    assert.equal((await api('/generations/' + aliceDoc + '/quality', { token: bob.token })).status, 404);
  });

  test('Bob cannot restore a real version into Alice\'s document', async () => {
    assert.ok(aliceVersionId, 'no version fixture');
    const r = await api('/history/' + aliceDoc + '/restore',
      { method: 'POST', token: bob.token, body: { versionId: aliceVersionId } });
    assert.equal(r.status, 404);
    const still = await prisma.generation.findUnique({ where: { id: aliceDoc } });
    assert.equal(still.userId, alice.id, 'Alice\'s document changed owner');
  });

  test('Bob cannot change the approval status of Alice\'s document', async () => {
    const before = await prisma.generation.findUnique({ where: { id: aliceDoc } });
    const r = await api('/history/' + aliceDoc + '/status',
      { method: 'POST', token: bob.token, body: { to: 'approved' } });
    assert.equal(r.status, 404);
    const afterRow = await prisma.generation.findUnique({ where: { id: aliceDoc } });
    assert.equal(afterRow.approval, before.approval, 'Bob changed Alice\'s approval state');
  });

  test('isolation holds in the other direction too', async () => {
    const gen = await api('/generations', {
      method: 'POST', token: bob.token,
      body: { repo: 'bob/secret-repo', track: 'technical', docTypes: ['userguide'], format: 'pdf' }
    });
    const bobDoc = gen.body.generation ? gen.body.generation.id : gen.body.id;
    await waitForGeneration(bobDoc, bob.token);
    assert.equal((await api('/generations/' + bobDoc, { token: bob.token })).status, 200);
    assert.equal((await api('/generations/' + bobDoc, { token: alice.token })).status, 404);
  });

  test('listing endpoints return only the caller\'s own rows', async () => {
    const hist = await api('/history', { token: bob.token });
    const docs = hist.body.documents || hist.body.generations || [];
    assert.equal(docs.filter((d) => d.repo === 'alice/private-repo').length, 0,
      'Alice\'s repository appeared in Bob\'s document list');

    const sources = await api('/sources', { token: bob.token });
    assert.equal((sources.body.sources || []).filter((s) => (s.detail || '').includes('alice/')).length, 0,
      'Alice\'s source appeared in Bob\'s source list');

    const team = await api('/team', { token: bob.token });
    const mates = (team.body.members || []).map((m) => m.email);
    assert.ok(!mates.includes('alice-colleague@example.test'), 'Alice\'s teammate appeared in Bob\'s team');
    assert.ok(!mates.includes(alice.email), 'Alice appeared in Bob\'s team');
  });

  test('Bob cannot delete Alice\'s account', async () => {
    const r = await api('/account', { method: 'DELETE', token: bob.token, body: { confirm: alice.email } });
    assert.equal(r.status, 400, 'the confirmation is matched against the CALLER\'s email, not the target\'s');
    assert.equal((await api('/auth/me', { token: alice.token })).status, 200, 'Alice\'s account was destroyed');
  });
});

describe('token integrity', () => {
  const forge = (payload, expiresIn = '7d') => jwt.sign(payload, SECRET, { expiresIn });

  test('a request with no token is rejected', async () => {
    assert.equal((await api('/history')).status, 401);
  });

  test('a token with no subject cannot authenticate', async () => {
    // Would otherwise reach Prisma as `where: { userId: undefined }`, which
    // matches every row in the table.
    assert.equal((await api('/history', { token: forge({ typ: 'session' }) })).status, 401);
  });

  test('an OAuth state token cannot be used as a session', async () => {
    assert.equal((await api('/history', { token: forge({ t: 'oauth', p: 'github' }, '10m') })).status, 401);
    assert.equal((await api('/history', { token: forge({ t: 'idp', p: 'google', n: 'x' }, '10m') })).status, 401);
  });

  test('an identity-link token cannot be used as a session even though it carries a uid', async () => {
    assert.equal((await api('/auth/me', { token: forge({ t: 'idp-link', p: 'google', uid: alice.id }, '10m') })).status, 401);
  });

  test('an email-verification token cannot be used as a session', async () => {
    assert.equal((await api('/auth/me', { token: forge({ v: alice.email }, '2d') })).status, 401);
  });

  test('a session for a user id that does not exist is rejected', async () => {
    assert.equal((await api('/auth/me', { token: forge({ uid: 'no-such-user-id', typ: 'session' }) })).status, 401);
  });

  test('OAuth state is signed with a key distinct from the session key', async () => {
    const stateKey = crypto.createHmac('sha256', SECRET).update('docify-oauth-state-v1').digest('hex');
    assert.notEqual(stateKey, SECRET, 'state key must not equal the session key');

    // Positive control: a state signed with the STATE key gets past state
    // validation and fails later (missing PKCE cookie). This proves the
    // negative case below is really about the signing key.
    const goodState = jwt.sign({ t: 'idp', p: 'google', n: 'x', f: 'abc' }, stateKey, { expiresIn: '10m' });
    const okRes = await fetch(BASE + '/auth/google/callback?code=x&state=' + encodeURIComponent(goodState),
      { redirect: 'manual' });
    const okLoc = decodeURIComponent(okRes.headers.get('location') || '');
    assert.match(okLoc, /security token/i, 'a correctly signed state did not reach the PKCE check: ' + okLoc);

    // A state signed with the SESSION key must be refused as unverifiable.
    const badState = jwt.sign({ t: 'idp', p: 'google', n: 'x', f: 'abc' }, SECRET, { expiresIn: '10m' });
    const badRes = await fetch(BASE + '/auth/google/callback?code=x&state=' + encodeURIComponent(badState),
      { redirect: 'manual' });
    const badLoc = decodeURIComponent(badRes.headers.get('location') || '');
    assert.match(badLoc, /expired/i, 'a session-key-signed state was accepted by the OAuth callback: ' + badLoc);
  });

  test('a genuine session still works (guards against over-tightening)', async () => {
    const me = await api('/auth/me', { token: alice.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, alice.email);
  });

  test('sessions issued before the typ claim existed remain valid', async () => {
    assert.equal((await api('/auth/me', { token: forge({ uid: alice.id }) })).status, 200,
      'a pre-existing session was invalidated');
  });
});

describe('plan limits are enforced server-side', () => {
  // The pricing page advertises these caps. An advertised cap the server
  // ignores is both a false claim and an unbounded Anthropic bill.
  test('the Free plan stops at 5 documents a month', async () => {
    const u = await signup('capped@example.test');
    const plan = await prisma.user.findUnique({ where: { id: u.id } });
    assert.equal(plan.plan, 'free', 'new accounts must start on the Free plan');

    // Burn the allowance without running five real pipelines.
    await prisma.usageEvent.create({ data: { userId: u.id, kind: 'document', count: 5 } });

    const blocked = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'capped/repo', track: 'technical', docTypes: ['userguide'], format: 'pdf' }
    });
    assert.equal(blocked.status, 402, 'a sixth document was allowed on the Free plan');
    assert.match(blocked.body.error || '', /5 documents/);
    assert.equal(await prisma.generation.count({ where: { userId: u.id } }), 0,
      'a blocked request still created a generation row');
  });

  test('a multi-document run cannot straddle the cap', async () => {
    const u = await signup('straddle@example.test');
    await prisma.usageEvent.create({ data: { userId: u.id, kind: 'document', count: 4 } });
    // 1 remaining, asking for 3.
    const r = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'straddle/repo', track: 'technical', docTypes: ['userguide', 'api', 'quickstart'], format: 'pdf' }
    });
    assert.equal(r.status, 402, 'a run larger than the remaining allowance was accepted');
    assert.match(r.body.error || '', /remain/);
  });

  test('usage is recorded per document produced, and surfaced on /billing', async () => {
    const u = await signup('usage@example.test');
    const before = await api('/billing', { token: u.token });
    assert.equal(before.body.usage.documents.used, 0);
    assert.equal(before.body.usage.documents.limit, 5);

    const gen = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'usage/repo', track: 'technical', docTypes: ['userguide', 'api'], format: 'pdf' }
    });
    assert.ok(gen.status === 200 || gen.status === 201);
    const afterBill = await api('/billing', { token: u.token });
    assert.equal(afterBill.body.usage.documents.used, 2, 'a two-document run must consume two of the allowance');
  });

  test('the Free plan cannot create an automation pipeline', async () => {
    const u = await signup('nopipe@example.test');
    const r = await api('/profiles', { method: 'POST', token: u.token, body: { name: 'p1', config: {} } });
    assert.equal(r.status, 402);
    assert.equal(await prisma.automationProfile.count({ where: { userId: u.id } }), 0);
  });

  test('a paid plan gets its higher allowance', async () => {
    const u = await signup('starter@example.test');
    await prisma.user.update({ where: { id: u.id }, data: { plan: 'starter' } });
    await prisma.usageEvent.create({ data: { userId: u.id, kind: 'document', count: 5 } });
    // Would be blocked on Free; Starter allows 60.
    const r = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'starter/repo', track: 'technical', docTypes: ['userguide'], format: 'markdown' }
    });
    assert.ok(r.status === 200 || r.status === 201, 'Starter was capped at the Free limit: ' + JSON.stringify(r.body));
    const one = await api('/profiles', { method: 'POST', token: u.token, body: { name: 'p1', config: {} } });
    assert.equal(one.status, 201, 'Starter includes one pipeline');
    const two = await api('/profiles', { method: 'POST', token: u.token, body: { name: 'p2', config: {} } });
    assert.equal(two.status, 402, 'Starter allowed a second pipeline');
  });

  test('Enterprise is uncapped', async () => {
    const u = await signup('enterprise@example.test');
    await prisma.user.update({ where: { id: u.id }, data: { plan: 'enterprise' } });
    await prisma.usageEvent.create({ data: { userId: u.id, kind: 'document', count: 10000 } });
    const r = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'ent/repo', track: 'technical', docTypes: ['userguide'], format: 'markdown' }
    });
    assert.ok(r.status === 200 || r.status === 201, 'Enterprise was capped');
    const bill = await api('/billing', { token: u.token });
    assert.equal(bill.body.usage.documents.limit, null, 'Enterprise must report an unlimited cap');
  });

  test('concurrent requests cannot overshoot the cap (the check is atomic)', async () => {
    const u = await signup('race@example.test');
    // 20 at once against a limit of 5. A read-then-write check lets them all
    // observe used=0 and pass; only an atomic reservation holds the line.
    const results = await Promise.all(Array.from({ length: 20 }, () => api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'race/repo', track: 'technical', docTypes: ['userguide'], format: 'pdf' }
    })));
    const created = results.filter((r) => r.status === 200 || r.status === 201).length;
    assert.ok(created <= 5, 'quota overshot: ' + created + ' documents created against a limit of 5');
    const bill = await api('/billing', { token: u.token });
    assert.ok(bill.body.usage.documents.used <= 5,
      'ledger recorded ' + bill.body.usage.documents.used + ' against a limit of 5');
  });

  test('Doc Sync AI operations consume the same allowance', async () => {
    const u = await signup('docsync-quota@example.test');
    await prisma.usageEvent.create({ data: { userId: u.id, kind: 'document', count: 5 } });
    const doc = await prisma.syncDoc.create({
      data: { userId: u.id, name: 'd', content: 'hello world', status: 'ready' }
    });
    // Every Doc Sync route that reaches Anthropic must refuse at quota.
    for (const path of ['/sync/documents/' + doc.id + '/standardize',
      '/sync/documents/' + doc.id + '/sync',
      '/sync/documents/' + doc.id + '/simulate']) {
      const r = await api(path, { method: 'POST', token: u.token, body: {} });
      assert.equal(r.status, 402, path + ' spent model time at quota (status ' + r.status + ')');
    }
    const rw = await api('/sync/rewrite', { method: 'POST', token: u.token, body: { text: 'x', mode: 'clarity' } });
    assert.equal(rw.status, 402, '/sync/rewrite spent model time at quota');
  });

  test('cloning a pipeline respects the pipeline cap', async () => {
    const u = await signup('clone@example.test');
    await prisma.user.update({ where: { id: u.id }, data: { plan: 'starter' } }); // 1 pipeline
    const first = await api('/profiles', { method: 'POST', token: u.token, body: { name: 'p1', config: {} } });
    assert.equal(first.status, 201);
    const id = first.body.profile.id;
    const clone = await api('/profiles/' + id + '/clone', { method: 'POST', token: u.token, body: {} });
    assert.equal(clone.status, 402, 'clone bypassed the pipeline cap');
    assert.equal(await prisma.automationProfile.count({ where: { userId: u.id } }), 1);
  });

  // The pricing table sells export formats and source count by tier. Both were
  // advertised and unenforced, so a Free account received everything the paid
  // tiers promise. Each assertion below is paired with a positive control, so
  // a route that simply broke cannot read as "correctly restricted".
  test('export formats are restricted to the plan that includes them', async () => {
    const u = await signup('formats@example.test'); // Free: PDF + Word only
    const locked = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'fmt/repo', track: 'technical', docTypes: ['userguide'], formats: ['dita'] }
    });
    assert.equal(locked.status, 402, 'Free exported DITA, a Team-tier format');
    assert.equal(locked.body.upgrade, true);
    assert.equal(await prisma.generation.count({ where: { userId: u.id } }), 0,
      'a blocked format still created a generation row');

    // Positive control: an included format on the same account must work.
    const allowed = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'fmt/repo', track: 'technical', docTypes: ['userguide'], formats: ['pdf'] }
    });
    assert.equal(allowed.status, 201, 'Free could not export PDF, which its plan includes');

    // And the same format is available one tier up.
    await prisma.user.update({ where: { id: u.id }, data: { plan: 'team' } });
    const upgraded = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'fmt/repo', track: 'technical', docTypes: ['userguide'], formats: ['dita'] }
    });
    assert.equal(upgraded.status, 201, 'Team was refused a format its plan includes');
  });

  test('a downgrade stops paid-format downloads of documents already generated', async () => {
    const u = await signup('downgrade@example.test');
    await prisma.user.update({ where: { id: u.id }, data: { plan: 'team' } });
    const gen = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'down/repo', track: 'technical', docTypes: ['userguide'], formats: ['dita'] }
    });
    assert.equal(gen.status, 201);
    await waitForGeneration(gen.body.generation.id, u.token);

    const ok = await fetch(BASE + '/generations/' + gen.body.generation.id + '/download?fmt=dita',
      { headers: { Authorization: 'Bearer ' + u.token } });
    assert.equal(ok.status, 200, 'Team could not download the format it paid for');

    await prisma.user.update({ where: { id: u.id }, data: { plan: 'free' } });
    const blocked = await fetch(BASE + '/generations/' + gen.body.generation.id + '/download?fmt=dita',
      { headers: { Authorization: 'Bearer ' + u.token } });
    assert.equal(blocked.status, 402, 'a downgraded account kept downloading a paid format');
  });

  test('the Free plan holds one connected source', async () => {
    const u = await signup('sources@example.test');
    const first = await api('/sources', {
      method: 'POST', token: u.token, body: { provider: 'github', token: 'ghp_test_1', detail: 'test' }
    });
    assert.equal(first.status, 200, 'the first source was refused');

    const second = await api('/sources', {
      method: 'POST', token: u.token, body: { provider: 'gitlab', token: 'glpat_test_2', detail: 'test' }
    });
    assert.equal(second.status, 402, 'Free connected a second source');
    assert.equal(await prisma.source.count({ where: { userId: u.id } }), 1);

    // Reconnecting an EXISTING source must never be mistaken for a new one.
    const again = await api('/sources', {
      method: 'POST', token: u.token, body: { provider: 'github', token: 'ghp_test_refreshed', detail: 'test' }
    });
    assert.equal(again.status, 200, 'reconnecting the existing source was blocked');

    await prisma.user.update({ where: { id: u.id }, data: { plan: 'team' } });
    const paid = await api('/sources', {
      method: 'POST', token: u.token, body: { provider: 'gitlab', token: 'glpat_test_3', detail: 'test' }
    });
    assert.equal(paid.status, 200, 'Team was capped at the Free source limit');
  });

  test('free-plan output is watermarked, and paid output is not', async () => {
    const u = await signup('watermark@example.test');
    const gen = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'wm/repo', track: 'technical', docTypes: ['userguide'], formats: ['pdf'] }
    });
    assert.equal(gen.status, 201);
    await waitForGeneration(gen.body.generation.id, u.token);
    const row = await prisma.generation.findUnique({ where: { id: gen.body.generation.id } });
    assert.match(JSON.parse(row.output || '{}').watermark || '', /free plan/i,
      'free-plan output was not watermarked');

    const paidUser = await signup('nowatermark@example.test');
    await prisma.user.update({ where: { id: paidUser.id }, data: { plan: 'team' } });
    const paidGen = await api('/generations', {
      method: 'POST', token: paidUser.token,
      body: { repo: 'wm/repo', track: 'technical', docTypes: ['userguide'], formats: ['pdf'] }
    });
    await waitForGeneration(paidGen.body.generation.id, paidUser.token);
    const paidRow = await prisma.generation.findUnique({ where: { id: paidGen.body.generation.id } });
    assert.equal(JSON.parse(paidRow.output || '{}').watermark || '', '',
      'a paid plan was watermarked');
  });

  test('an unknown document type is refused before any quota is spent', async () => {
    const u = await signup('badtype@example.test');
    const before = await api('/billing', { token: u.token });
    assert.equal(before.body.usage.documents.used, 0);

    const bogus = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'bad/repo', track: 'technical', docTypes: ['nonsense'], formats: ['pdf'] }
    });
    assert.equal(bogus.status, 400, 'an unknown document type ran the pipeline');
    assert.match(bogus.body.error || '', /Unknown document type/);

    // A marketing type on the technical track is equally invalid.
    const crossTrack = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'bad/repo', track: 'technical', docTypes: ['onepager'], formats: ['pdf'] }
    });
    assert.equal(crossTrack.status, 400, 'a marketing type was accepted on the technical track');

    const after = await api('/billing', { token: u.token });
    assert.equal(after.body.usage.documents.used, 0, 'a rejected request consumed the allowance');
    assert.equal(await prisma.generation.count({ where: { userId: u.id } }), 0);

    // Positive control: the real id for the same document works.
    const good = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'bad/repo', track: 'technical', docTypes: ['api'], formats: ['pdf'] }
    });
    assert.equal(good.status, 201, 'a valid document type was rejected');
  });

  test('a failed run hands the reserved documents back', async () => {
    const u = await signup('refund@example.test');
    const gen = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'refund/repo', track: 'technical', docTypes: ['userguide', 'api'], formats: ['pdf'] }
    });
    assert.equal(gen.status, 201);
    const id = gen.body.generation.id;

    // The reservation must be keyed to the run, or nothing can be given back.
    const reserved = await prisma.usageEvent.findMany({ where: { userId: u.id, generationId: id } });
    assert.equal(reserved.length, 1, 'the reservation was not linked to the generation');
    assert.equal(reserved[0].count, 2, 'a two-document run reserved ' + reserved[0].count);
    const mid = await api('/billing', { token: u.token });
    assert.equal(mid.body.usage.documents.used, 2, 'the reservation never reached the ledger');

    // Induce a REAL pipeline failure: deleting the row mid-run makes the very
    // next stage write throw, which is the same code path a database outage
    // or a crashing renderer takes.
    await prisma.generation.delete({ where: { id } }).catch(() => {});

    // The refund happens inside the pipeline's failure handler, so wait for
    // the ledger to settle rather than assuming an instant write.
    let used = null;
    for (let i = 0; i < 60; i++) {
      const bill = await api('/billing', { token: u.token });
      used = bill.body.usage.documents.used;
      if (used === 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.equal(used, 0, 'a failed run kept the customer\'s documents (used ' + used + ')');
    assert.equal(await prisma.usageEvent.count({ where: { generationId: id } }), 0,
      'the reservation row survived the refund');
  });

  test('a delivered document is never refunded, even if a later run over it fails', async () => {
    // Automation updates a mapped document in place, and crash recovery can
    // re-enter the pipeline for a row that already succeeded. Refunding then
    // would hand back documents the customer actually received.
    const u = await signup('nodoublerefund@example.test');
    const gen = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'delivered/repo', track: 'technical', docTypes: ['userguide'], formats: ['pdf'] }
    });
    assert.equal(gen.status, 201);
    const id = gen.body.generation.id;
    await waitForGeneration(id, u.token);

    const row = await prisma.generation.findUnique({ where: { id } });
    assert.ok(row.content, 'the run did not deliver a document, so this test proves nothing');
    const billed = await api('/billing', { token: u.token });
    assert.equal(billed.body.usage.documents.used, 1);

    // Re-enter the pipeline for the delivered row and make it fail.
    await prisma.generation.update({ where: { id }, data: { status: 'queued' } });
    await api('/generations', { // any request keeps the server warm while we wait
      method: 'POST', token: u.token,
      body: { repo: 'other/repo', track: 'technical', docTypes: ['userguide'], formats: ['pdf'] }
    });
    await new Promise((r) => setTimeout(r, 1500));
    await prisma.generation.delete({ where: { id } }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));

    const after = await api('/billing', { token: u.token });
    assert.ok(after.body.usage.documents.used >= 1,
      'a document that was delivered got refunded (used ' + after.body.usage.documents.used + ')');
  });

  test('automation profiles reject unknown document types and formats', async () => {
    const u = await signup('profcfg@example.test');
    await prisma.user.update({ where: { id: u.id }, data: { plan: 'team' } }); // pipelines allowed

    const badType = await api('/profiles', {
      method: 'POST', token: u.token,
      body: { name: 'p', config: { track: 'technical', docTypes: ['api', 'nonsense'] } }
    });
    assert.equal(badType.status, 400, 'a profile accepted an unknown document type');
    assert.match(badType.body.error || '', /Unknown document type/);

    const badFormat = await api('/profiles', {
      method: 'POST', token: u.token,
      body: { name: 'p', config: { track: 'technical', docTypes: ['api'], formats: ['bogus'] } }
    });
    assert.equal(badFormat.status, 400, 'a profile accepted an unknown format');

    // Positive control: a valid config still creates the pipeline.
    const ok = await api('/profiles', {
      method: 'POST', token: u.token,
      body: { name: 'p', config: { track: 'technical', docTypes: ['api'], formats: ['markdown'] } }
    });
    assert.equal(ok.status, 201, 'a valid profile config was rejected');

    // And the same validation applies on update.
    const badUpdate = await api('/profiles/' + ok.body.profile.id, {
      method: 'PUT', token: u.token,
      body: { config: { track: 'technical', docTypes: ['made-up'] } }
    });
    assert.equal(badUpdate.status, 400, 'PUT let an unknown document type through');
  });

  test('a paid format is not served as text by the detail endpoint either', async () => {
    // The download route refuses it; returning the same content in the
    // generation payload would hand over exactly what the gate withholds.
    const u = await signup('leak@example.test');
    await prisma.user.update({ where: { id: u.id }, data: { plan: 'team' } });
    const gen = await api('/generations', {
      method: 'POST', token: u.token,
      body: { repo: 'leak/repo', track: 'technical', docTypes: ['userguide'], formats: ['dita'] }
    });
    assert.equal(gen.status, 201);
    const id = gen.body.generation.id;
    await waitForGeneration(id, u.token);

    const paid = await api('/generations/' + id, { token: u.token });
    const paidCell = paid.body.generation.outputs['userguide::dita'];
    assert.ok(paidCell && paidCell.content && paidCell.content.length > 0,
      'Team was not served the format it paid for');

    await prisma.user.update({ where: { id: u.id }, data: { plan: 'free' } });
    const free = await api('/generations/' + id, { token: u.token });
    const freeCell = free.body.generation.outputs['userguide::dita'];
    assert.equal(freeCell.content, '', 'a locked format was still served in full');
    assert.equal(freeCell.locked, true, 'the cell was not marked locked for the UI');
  });

  test('the free-plan watermark cannot be switched off by the request', async () => {
    // A blank-but-truthy value passes a bare || check while the exporters trim
    // it away — the watermark would vanish without the user paying for it.
    const u = await signup('wmbypass@example.test');
    const gen = await api('/generations', {
      method: 'POST', token: u.token,
      body: {
        repo: 'wm2/repo', track: 'technical', docTypes: ['userguide'], formats: ['pdf'],
        output: { watermark: '   ' }
      }
    });
    assert.equal(gen.status, 201);
    await waitForGeneration(gen.body.generation.id, u.token);
    const row = await prisma.generation.findUnique({ where: { id: gen.body.generation.id } });
    assert.match(JSON.parse(row.output || '{}').watermark || '', /free plan/i,
      'a blank watermark disabled free-plan watermarking');
  });

  test('a paid plan cannot be self-granted while payments are simulated', async () => {
    const u = await signup('upgrade@example.test');
    const r = await api('/billing/checkout', {
      method: 'POST', token: u.token, body: { plan: 'team', cycle: 'annual', seats: 50 }
    });
    assert.notEqual(r.status, 200, 'checkout granted a paid plan with no payment');
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    assert.equal(after.plan, 'free', 'plan was upgraded without payment');
  });

  test('seats are enforced', async () => {
    const u = await signup('seats@example.test'); // Free = 1 seat, owner occupies it
    const r = await api('/team/invite', { method: 'POST', token: u.token, body: { email: 'mate@example.test' } });
    assert.equal(r.status, 402, 'Free plan allowed a second seat');
  });

  test('usage is per account — one tenant cannot exhaust another\'s allowance', async () => {
    const a = await signup('quota-a@example.test');
    const b = await signup('quota-b@example.test');
    await prisma.usageEvent.create({ data: { userId: a.id, kind: 'document', count: 5 } });
    const blockedA = await api('/generations', {
      method: 'POST', token: a.token,
      body: { repo: 'a/repo', track: 'technical', docTypes: ['userguide'], format: 'pdf' }
    });
    assert.equal(blockedA.status, 402);
    const okB = await api('/generations', {
      method: 'POST', token: b.token,
      body: { repo: 'b/repo', track: 'technical', docTypes: ['userguide'], format: 'pdf' }
    });
    assert.ok(okB.status === 200 || okB.status === 201, 'one account\'s usage blocked another account');
  });
});

describe('account deletion really deletes', () => {
  test('every user-scoped table is emptied, including those with no cascade', async () => {
    const doomed = await signup('doomed@example.test');

    // Populate the six models that carry a userId but have NO cascading
    // relation to User — the exact rows a plain user.delete() would orphan.
    // Rows are created directly: this test is about deletion, and waiting on
    // the AI pipeline would make it slow and load-sensitive.
    const doomedGen = await prisma.generation.create({
      data: {
        userId: doomed.id, repo: 'doomed/repo', track: 'technical',
        docTypes: JSON.stringify(['userguide']), format: 'pdf', status: 'complete'
      }
    });
    await prisma.docVersion.create({ data: { userId: doomed.id, generationId: doomedGen.id, version: 1, content: 'x' } });
    await prisma.usageEvent.create({ data: { userId: doomed.id, kind: 'document', count: 1, generationId: doomedGen.id } });
    await prisma.repository.create({ data: { userId: doomed.id, provider: 'github', repo: 'doomed/repo' } });
    await prisma.writingProfile.create({ data: { userId: doomed.id } });
    await prisma.orgConnection.create({ data: { userId: doomed.id, provider: 'github', org: 'doomed-org' } });
    await prisma.ruleSet.create({ data: { userId: doomed.id, name: 'rules' } });
    await prisma.relevanceDecision.create({ data: { userId: doomed.id, repo: 'doomed/repo' } });
    await prisma.waitlist.create({ data: { email: doomed.email, provider: 'azure' } });

    const counts = async () => ({
      user: await prisma.user.count({ where: { id: doomed.id } }),
      generation: await prisma.generation.count({ where: { userId: doomed.id } }),
      docVersion: await prisma.docVersion.count({ where: { userId: doomed.id } }),
      repository: await prisma.repository.count({ where: { userId: doomed.id } }),
      writingProfile: await prisma.writingProfile.count({ where: { userId: doomed.id } }),
      orgConnection: await prisma.orgConnection.count({ where: { userId: doomed.id } }),
      ruleSet: await prisma.ruleSet.count({ where: { userId: doomed.id } }),
      relevanceDecision: await prisma.relevanceDecision.count({ where: { userId: doomed.id } }),
      usageEvent: await prisma.usageEvent.count({ where: { userId: doomed.id } }),
      waitlist: await prisma.waitlist.count({ where: { email: doomed.email } })
    });

    const before = await counts();
    for (const [k, v] of Object.entries(before)) assert.ok(v > 0, 'fixture missing rows for ' + k);

    const wrong = await api('/account', { method: 'DELETE', token: doomed.token, body: { confirm: 'nope' } });
    assert.equal(wrong.status, 400, 'deletion proceeded without the correct confirmation');
    assert.deepEqual(await counts(), before, 'a failed confirmation still deleted data');

    const ok = await api('/account', { method: 'DELETE', token: doomed.token, body: { confirm: doomed.email } });
    assert.equal(ok.status, 200, 'deletion failed: ' + JSON.stringify(ok.body));

    const afterCounts = await counts();
    for (const [k, v] of Object.entries(afterCounts)) assert.equal(v, 0, k + ' rows survived account deletion');
  });

  test('the session dies with the account and cannot recreate rows', async () => {
    const doomed = await signup('doomed2@example.test');
    const token = doomed.token;
    assert.equal((await api('/auth/me', { token })).status, 200);

    assert.equal((await api('/account', { method: 'DELETE', token, body: { confirm: doomed.email } })).status, 200);

    // A JWT stays cryptographically valid for 7 days; the account behind it
    // must not. These endpoints would otherwise recreate rows under a dead
    // user id that nothing can ever clean up.
    assert.equal((await api('/auth/me', { token })).status, 401, 'session survived account deletion');
    assert.equal((await api('/hub/rulesets', { token })).status, 401);
    assert.equal((await api('/style-profile', { token })).status, 401);
    assert.equal((await api('/billing', { token })).status, 401, 'a deleted account reached a handler that assumes a user row');
    assert.equal((await api('/history', { token })).status, 401);

    assert.equal(await prisma.ruleSet.count({ where: { userId: doomed.id } }), 0, 'rows were recreated for a deleted account');
    assert.equal(await prisma.writingProfile.count({ where: { userId: doomed.id } }), 0, 'rows were recreated for a deleted account');
  });

  test('the address can be registered again after deletion', async () => {
    const again = await api('/auth/signup', { method: 'POST', body: { email: 'doomed@example.test', password: 'test-password-123' } });
    assert.ok(again.status === 200 || again.status === 201, 'the deleted address could not be registered again');
  });
});
