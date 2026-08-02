// Honesty tests for repository intelligence and pre-generation preflight.
//
// The rule these features live by: nothing is claimed that the evidence does
// not prove, and a check that could not run says so instead of pretending its
// answer is "no". These tests pin that rule in the two places it was found
// broken and fixed:
//   1. The analyzer's detection tables — a docker-compose `image:` service, a
//      generic template.yaml, or a standalone symfony/* component must not be
//      presented as facts about the customer's code.
//   2. POST /generations/preflight — when the repository could not be read,
//      "nothing to write from" and "no spec found" are predictions made from
//      missing data and must not fire. (Each suppression is paired with a
//      positive control proving the warning DOES fire when the facts are
//      actually known, so a broken warning cannot pass as a suppressed one.)
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { composeServiceNames, FRAMEWORKS, DEPLOY_FILES, depsFromGoMod, depsFromToml } from '../src/adapters/repointel.js';

/* ------------------------ Pure detection-table tests ----------------------- */

describe('compose services: only what this repository builds', () => {
  const compose = [
    'services:',
    '  app:',
    '    build: .',
    '    ports:',
    '      - "3000:3000"',
    '  worker:',
    '    build:',
    '      context: ./worker',
    '  db:',
    '    image: postgres:16',
    '  cache:',
    '    image: redis:7'
  ].join('\n');

  test('services with a build key are counted', () => {
    assert.deepEqual(composeServiceNames(compose), ['app', 'worker']);
  });

  test('image-only services are not claimed as code living in the repo', () => {
    const infraOnly = 'services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7\n';
    assert.deepEqual(composeServiceNames(infraOnly), []);
  });
});

const frameworksFor = (dep) => FRAMEWORKS.filter(([, re]) => re.test(dep)).map(([name]) => name);

describe('framework table: components are not applications', () => {
  test('a standalone Symfony component proves nothing', () => {
    assert.deepEqual(frameworksFor('symfony/console'), []);
    assert.deepEqual(frameworksFor('symfony/http-client'), []);
  });
  test('a real Symfony application marker is detected', () => {
    assert.deepEqual(frameworksFor('symfony/framework-bundle'), ['Symfony']);
  });
  test('CLI parsers are detected from manifests (quick-start suggestions)', () => {
    assert.deepEqual(frameworksFor('commander'), ['Commander']);
    assert.deepEqual(frameworksFor('clap'), ['clap']);
    assert.deepEqual(frameworksFor('@oclif/core'), ['oclif']);
    assert.deepEqual(frameworksFor('typer'), ['Typer']);
  });
  test('substring lookalikes do not fire (login is not Gin)', () => {
    assert.deepEqual(frameworksFor('login'), []);
    assert.deepEqual(frameworksFor('express-session'), []);
  });
});

describe('manifest parsing: other people\'s dependencies are not this repo\'s frameworks', () => {
  test('go.mod "// indirect" modules (the transitive graph) are ignored', () => {
    const gomod = ['module example.com/tool', '', 'require (',
      '\tgithub.com/spf13/cobra v1.8.0',
      '\tgoogle.golang.org/grpc v1.60.0 // indirect',
      '\tgithub.com/gorilla/mux v1.8.1 // indirect',
      ')'].join('\n');
    assert.deepEqual(depsFromGoMod(gomod).names, ['github.com/spf13/cobra']);
  });
  test('[dev-dependencies] and [build-dependencies] tables are ignored', () => {
    const cargo = ['[dependencies]', 'axum = "0.7"', '', '[dev-dependencies]', 'tokio = "1"',
      '', '[build-dependencies]', 'cc = "1"'].join('\n');
    assert.deepEqual(depsFromToml(cargo).names, ['axum']);
  });
});

const deployFor = (p) => DEPLOY_FILES.filter(([re]) => re.test(p)).map(([, name]) => name);

describe('deployment table: a generic filename is not a deployment claim', () => {
  test('template.yaml anywhere no longer reads as serverless', () => {
    assert.deepEqual(deployFor('template.yaml'), []);
    assert.deepEqual(deployFor('config/template.yml'), []);
  });
  test('unambiguous markers still detect', () => {
    assert.deepEqual(deployFor('serverless.yml'), ['serverless']);
    assert.deepEqual(deployFor('samconfig.toml'), ['serverless']);
    assert.deepEqual(deployFor('Dockerfile'), ['docker']);
  });
});

/* ------------------------- Preflight against a real server ----------------- */

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
const DB_FILE = path.join(here, 'intel-test-' + process.pid + '.db');
const DB_ARTIFACTS = () => [DB_FILE, DB_FILE + '-journal', DB_FILE + '-wal', DB_FILE + '-shm'];
let PORT;
let BASE;
let child;

const env = {
  ...process.env,
  DATABASE_URL: 'file:' + DB_FILE,
  JWT_SECRET: 'intel-test-secret-not-used-anywhere-else',
  NODE_ENV: 'test',
  SMTP_HOST: '',
  RATE_LIMIT_AUTH: '10000',
  RATE_LIMIT_API: '10000',
  RATE_LIMIT_PREFLIGHT: '10000',
  ALLOW_DEMO_LOGIN: 'false',
  ANTHROPIC_API_KEY: '',
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

let user;

describe('preflight claims are gated on the check actually running', () => {
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
    child = spawn('node', ['src/index.js'], { cwd: serverDir, env, stdio: 'ignore' });
    let booted = false;
    for (let i = 0; i < 60; i++) {
      try {
        const ping = await fetch('http://localhost:' + PORT + '/api/ping');
        if (ping.ok && (await ping.json()).pid === child.pid) { booted = true; break; }
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(booted, 'test server did not start on port ' + PORT + ' (exit code ' + child.exitCode + ')');
    const r = await api('/auth/signup', { method: 'POST', body: { email: 'intel@example.test', password: 'test-password-123' } });
    assert.ok(r.status === 200 || r.status === 201, 'signup failed: ' + JSON.stringify(r.body));
    user = { token: r.body.token, id: r.body.user.id };
  });

  after(async () => {
    if (child) child.kill('SIGKILL');
    for (const f of DB_ARTIFACTS()) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
  });

  const ids = (r) => (r.body.warnings || []).map((w) => w.id);

  test('positive control: with no repo and no connectors, no-grounding fires', async () => {
    const r = await api('/generations/preflight', {
      method: 'POST', token: user.token,
      body: { repo: '', track: 'technical', docTypes: ['userguide'], format: 'pdf' }
    });
    assert.equal(r.status, 200);
    assert.ok(ids(r).includes('no-grounding'),
      'nothing to write from IS known here and must be said: ' + JSON.stringify(r.body.warnings));
    assert.equal(r.body.ok, false);
  });

  test('an unreadable repository suppresses the absence claims, not the error', async () => {
    // This owner/repo does not exist, so the source read fails. That failure
    // must be reported as exactly that — not converted into confident claims
    // that the repository has nothing to write from and no API spec.
    const r = await api('/generations/preflight', {
      method: 'POST', token: user.token,
      body: { repo: 'docify-intel-test-no-such-owner/no-such-repo', track: 'technical', docTypes: ['api'], format: 'pdf' }
    });
    assert.equal(r.status, 200);
    const got = ids(r);
    assert.ok(got.includes('source-unreadable'), 'the real failure must be reported: ' + JSON.stringify(r.body.warnings));
    assert.ok(!got.includes('no-grounding'), '"nothing to write from" is unknowable when the repo could not be read');
    assert.ok(!got.includes('no-spec'), '"no spec found" is unknowable when the repo could not be read');
    assert.equal(r.body.repoChecked, false);
  });

  test('positive control: a readable-but-empty source still warns about the spec', async () => {
    // No repository at all + an API reference: the spec absence IS known
    // (there are simply no sources), so the warning must fire.
    const r = await api('/generations/preflight', {
      method: 'POST', token: user.token,
      body: { repo: '', track: 'technical', docTypes: ['api'], format: 'pdf' }
    });
    assert.equal(r.status, 200);
    assert.ok(ids(r).includes('no-spec'), JSON.stringify(r.body.warnings));
  });

  test('intel endpoint fails soft with a reason, never a fabricated profile', async () => {
    const r = await api('/hub/intel?provider=github&repo=not-a-valid-repo-name', { token: user.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, false);
    assert.ok(r.body.reason, 'a failed analysis must say why');
    assert.equal(r.body.hasReadme, false);
    assert.deepEqual(r.body.languages, []);
  });
});
