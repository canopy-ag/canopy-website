import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHandler } from '../lib/app.mjs';
import { createForwarder, intakePayload } from '../lib/forward.mjs';

// canopy-ag/canopy-roadmap#324 (E5-s1): the shim forwards each stored demo
// submission to mastra's POST /leads/intake, replays rows left at `new`, and
// reports stale rows on /healthz. Fakes stand in for Postgres and for mastra,
// the way calcom-bridge/test/bridge.test.mjs fakes ERPNext.

const INGEST_SECRET = 'ingest-shared-secret';
const LEADS_TOKEN = 'website-ingest-bearer-never-logged';
const LEADS_URL = 'http://mastra.canopy-tools.svc.cluster.local:3300/leads/intake';

// The nine fields the story names, stated here as literals on purpose: the
// test must not derive its expectation from the module under test.
const INTAKE_FIELDS = [
  'id',
  'submitted_at',
  'company_name',
  'contact_name',
  'email',
  'phone',
  'company_size',
  'message',
  'referrer',
];

const minutesAgo = (m) => new Date(Date.now() - m * 60_000);

/**
 * In-memory demo_submissions behind a postgres.js-shaped tagged template.
 * Dispatches on the query text and THROWS on anything it does not recognise,
 * so a query the shim changes shape on fails loudly instead of passing by
 * returning nothing.
 */
function fakeDb() {
  const rows = [];
  const queries = [];
  let seq = 0;
  const seed = (overrides = {}) => {
    const row = {
      id: `row-${++seq}`,
      company_name: 'Seeded Co',
      contact_name: 'Seed Person',
      email: `seed${seq}@example.com`,
      phone: null,
      company_size: null,
      message: null,
      ip_address: '198.51.100.7',
      user_agent: 'seed-agent',
      referrer: null,
      submitted_at: new Date(),
      status: 'new',
      ...overrides,
    };
    rows.push(row);
    return row;
  };
  const sql = async (strings, ...values) => {
    const text = strings.join(' $ ').replace(/\s+/g, ' ').trim();
    queries.push(text);
    if (/^SELECT 1$/.test(text)) return [{ '?column?': 1 }];
    if (/^INSERT INTO demo_submissions/.test(text)) {
      const [company_name, contact_name, email, phone, company_size, message, ip_address, user_agent, referrer] = values;
      const row = seed({ company_name, contact_name, email, phone, company_size, message, ip_address, user_agent, referrer });
      // RETURNING: the forwardable columns only, never ip/user_agent.
      const { ip_address: _ip, user_agent: _ua, status: _s, ...returned } = row;
      return [returned];
    }
    if (/^UPDATE demo_submissions SET status = 'forwarded' WHERE id = \$$/.test(text)) {
      const row = rows.find((r) => r.id === values[0]);
      if (row) row.status = 'forwarded';
      return [];
    }
    if (/^SELECT count\(\*\)::int AS stale_new FROM demo_submissions WHERE status = 'new' AND submitted_at < now\(\) - interval '1 hour'$/.test(text)) {
      const cutoff = minutesAgo(60);
      return [{ stale_new: rows.filter((r) => r.status === 'new' && r.submitted_at < cutoff).length }];
    }
    if (/^SELECT .+ FROM demo_submissions WHERE status = 'new' AND submitted_at < now\(\) - interval '5 minutes' ORDER BY submitted_at ASC LIMIT \$$/.test(text)) {
      const cutoff = minutesAgo(5);
      return rows
        .filter((r) => r.status === 'new' && r.submitted_at < cutoff)
        .sort((a, b) => a.submitted_at - b.submitted_at)
        .slice(0, values[0])
        .map(({ ip_address: _ip, user_agent: _ua, status: _s, ...rest }) => ({ ...rest }));
    }
    throw new Error(`fakeDb: unrecognised query: ${text}`);
  };
  return { sql, rows, queries, seed };
}

/** A fake POST /leads/intake. `hang` never answers until the caller aborts. */
function fakeIntake({ status = 202, hang = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    if (hang) {
      await new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return new Response(null, { status });
  };
  return { calls, fetchImpl };
}

function fakeLog() {
  const lines = { info: [], warn: [], error: [] };
  return {
    lines,
    info: (...a) => lines.info.push(a.join(' ')),
    warn: (...a) => lines.warn.push(a.join(' ')),
    error: (...a) => lines.error.push(a.join(' ')),
  };
}

function forwarderWith(db, intake, { log = fakeLog(), timeoutMs = 5000, url = LEADS_URL, token = LEADS_TOKEN } = {}) {
  return createForwarder({ sql: db.sql, fetchImpl: intake.fetchImpl, url, token, timeoutMs, log });
}

async function startApp({ db, forwarder, log = fakeLog() }) {
  const server = createServer(createHandler({ sql: db.sql, forwarder, ingestSecret: INGEST_SECRET, log }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((resolve) => server.close(resolve));
  return { base, close };
}

const submission = { companyName: 'Green Acres Nursery', contactName: 'Pat Grower', email: 'Pat@Example.com', message: 'Call me' };

function postDemo(base, body = submission) {
  return fetch(`${base}/demo`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${INGEST_SECRET}`,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9',
      'x-original-user-agent': 'Mozilla/5.0 (test)',
      'x-original-referer': 'https://canopy.ag/',
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------- AC-1

test('forwards and marks forwarded (roadmap#324 AC-1)', async () => {
  const db = fakeDb();
  const intake = fakeIntake({ status: 202 });
  const app = await startApp({ db, forwarder: forwarderWith(db, intake) });
  try {
    const res = await postDemo(app.base);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    assert.equal(db.rows.length, 1, 'one row inserted');
    const [row] = db.rows;
    assert.equal(row.email, 'pat@example.com');
    assert.equal(row.status, 'forwarded');

    assert.equal(intake.calls.length, 1, 'exactly one forward');
    const [call] = intake.calls;
    assert.equal(call.url, LEADS_URL);
    assert.equal(call.headers.authorization, `Bearer ${LEADS_TOKEN}`);
    assert.deepEqual(Object.keys(call.body).sort(), [...INTAKE_FIELDS].sort());
    assert.equal(call.body.id, row.id);
    assert.equal(call.body.company_name, 'Green Acres Nursery');
    assert.equal(call.body.referrer, 'https://canopy.ag/');
    assert.equal('ip_address' in call.body, false, 'ip_address never leaves the shim');
    assert.equal('user_agent' in call.body, false, 'user_agent never leaves the shim');
    assert.equal(JSON.stringify(call.body).includes('203.0.113.9'), false);
  } finally {
    await app.close();
  }
});

// ---------------------------------------------------------------- AC-2

test('keeps new on forward failure (roadmap#324 AC-2)', async (t) => {
  await t.test('intake answers 503', async () => {
    const db = fakeDb();
    const intake = fakeIntake({ status: 503 });
    const log = fakeLog();
    const app = await startApp({ db, forwarder: forwarderWith(db, intake, { log }), log });
    try {
      const res = await postDemo(app.base);
      assert.equal(res.status, 200, 'the browser still gets 200');
      assert.equal((await res.json()).success, true);
      assert.equal(db.rows.length, 1);
      assert.equal(db.rows[0].status, 'new');
      assert.equal(intake.calls.length, 1);
      assert.equal(log.lines.warn.length, 1, 'one warning');
      const warning = log.lines.warn[0];
      assert.match(warning, /lead forward failed/);
      assert.match(warning, /503/);
      assert.ok(warning.includes(db.rows[0].id), 'the warning names the row');
      assert.equal(warning.includes(LEADS_TOKEN), false, 'the warning never carries the token');
    } finally {
      await app.close();
    }
  });

  await t.test('intake times out', async () => {
    const db = fakeDb();
    const intake = fakeIntake({ hang: true });
    const log = fakeLog();
    const app = await startApp({ db, forwarder: forwarderWith(db, intake, { log, timeoutMs: 25 }), log });
    try {
      const res = await postDemo(app.base);
      assert.equal(res.status, 200);
      assert.equal(db.rows[0].status, 'new');
      assert.equal(log.lines.warn.length, 1);
      assert.match(log.lines.warn[0], /lead forward failed/);
      assert.match(log.lines.warn[0], /timeout/);
      assert.equal(log.lines.warn[0].includes(LEADS_TOKEN), false);
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------- AC-3

test('replays stale new rows (roadmap#324 AC-3)', async () => {
  const db = fakeDb();
  const old1 = db.seed({ submitted_at: minutesAgo(9) });
  const old2 = db.seed({ submitted_at: minutesAgo(6) });
  const young = db.seed({ submitted_at: minutesAgo(1) });
  db.seed({ submitted_at: minutesAgo(30), status: 'forwarded' });
  const intake = fakeIntake({ status: 202 });
  const forwarder = forwarderWith(db, intake);

  const result = await forwarder.replayOnce();

  assert.deepEqual(result, { attempted: 2, forwarded: 2 });
  assert.deepEqual(
    intake.calls.map((c) => c.body.id),
    [old1.id, old2.id],
    'exactly the two older rows, oldest first',
  );
  assert.equal(old1.status, 'forwarded');
  assert.equal(old2.status, 'forwarded');
  assert.equal(young.status, 'new', 'the young row waits for the next tick');
  assert.equal(intake.calls.every((c) => !('ip_address' in c.body) && !('user_agent' in c.body)), true);
});

test('replay leaves a row at new when the intake endpoint is missing (404)', async () => {
  const db = fakeDb();
  const row = db.seed({ submitted_at: minutesAgo(10) });
  const intake = fakeIntake({ status: 404 });
  const log = fakeLog();
  const result = await forwarderWith(db, intake, { log }).replayOnce();
  assert.deepEqual(result, { attempted: 1, forwarded: 0 });
  assert.equal(row.status, 'new');
  assert.equal(log.lines.warn.length, 1);
  assert.match(log.lines.warn[0], /404/);
});

// ---------------------------------------------------------------- AC-4

test('healthz reports stale_new (roadmap#324 AC-4)', async () => {
  const db = fakeDb();
  db.seed({ submitted_at: minutesAgo(61) });
  db.seed({ submitted_at: minutesAgo(120) });
  db.seed({ submitted_at: minutesAgo(600) });
  db.seed({ submitted_at: minutesAgo(10) }); // new but not stale
  db.seed({ submitted_at: minutesAgo(600), status: 'forwarded' }); // old but done
  const app = await startApp({ db, forwarder: forwarderWith(db, fakeIntake()) });
  try {
    const res = await fetch(`${app.base}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.equal(body.database, 'connected');
    assert.equal(body.stale_new, 3);
  } finally {
    await app.close();
  }
});

// ---------------------------------------------------------------- guards

test('intakePayload carries exactly the nine fields and nothing from the request', () => {
  const payload = intakePayload({
    id: 'x',
    submitted_at: new Date('2026-10-10T00:00:00Z'),
    company_name: 'A',
    contact_name: 'B',
    email: 'c@d.e',
    phone: null,
    company_size: '1-10',
    message: 'm',
    referrer: null,
    ip_address: '203.0.113.9',
    user_agent: 'ua',
    status: 'new',
  });
  assert.deepEqual(Object.keys(payload).sort(), [...INTAKE_FIELDS].sort());
});

test('forwarding is off, and the row stays new, when the intake URL or token is unset', async () => {
  const db = fakeDb();
  const intake = fakeIntake();
  const log = fakeLog();
  const forwarder = forwarderWith(db, intake, { log, token: '' });
  assert.equal(forwarder.enabled, false);
  const app = await startApp({ db, forwarder, log });
  try {
    const res = await postDemo(app.base);
    assert.equal(res.status, 200);
    assert.equal(db.rows[0].status, 'new');
    assert.equal(intake.calls.length, 0);
    assert.deepEqual(await forwarder.replayOnce(), { attempted: 0, forwarded: 0 });
  } finally {
    await app.close();
  }
});

test('POST /demo still refuses a bad bearer and a bad body before any forward', async () => {
  const db = fakeDb();
  const intake = fakeIntake();
  const app = await startApp({ db, forwarder: forwarderWith(db, intake) });
  try {
    const unauth = await fetch(`${app.base}/demo`, { method: 'POST', body: '{}' });
    assert.equal(unauth.status, 401);
    const invalid = await postDemo(app.base, { companyName: '' });
    assert.equal(invalid.status, 400);
    assert.equal(db.rows.length, 0);
    assert.equal(intake.calls.length, 0);
  } finally {
    await app.close();
  }
});
