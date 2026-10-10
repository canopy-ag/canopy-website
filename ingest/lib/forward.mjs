/**
 * Lead forwarding: demo_submissions -> mastra POST /leads/intake.
 *
 * canopy-ag/canopy-roadmap#324 (E5-s1). The shim keeps its DB write as the
 * source of truth (pipelines spec § 6 decision 2); after each INSERT it POSTs
 * the stored row to mastra as the `website-ingest` service principal
 * (bearer SERVICE_TOKEN_WEBSITE_INGEST on mastra's side, scope lead:intake)
 * and marks the row `forwarded` on a 2xx. A row left at `new` — mastra down,
 * non-2xx, timeout — is picked up by `replayOnce()` from the in-process loop.
 *
 * The row's `id` is the idempotency key mastra uses, so a replay of a row
 * whose first delivery was lost after mastra accepted it creates nothing.
 *
 * What is sent: exactly the nine columns in INTAKE_FIELDS. `ip_address` and
 * `user_agent` are audit columns and never leave the shim.
 */

export const INTAKE_FIELDS = Object.freeze([
  'id',
  'submitted_at',
  'company_name',
  'contact_name',
  'email',
  'phone',
  'company_size',
  'message',
  'referrer',
]);

/** The forwardable projection of a demo_submissions row. */
export function intakePayload(row) {
  const payload = {};
  for (const field of INTAKE_FIELDS) payload[field] = row[field] ?? null;
  return payload;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_REPLAY_BATCH = 20;

/**
 * @param {object} opts
 * @param {Function} opts.sql       postgres.js tagged template (or a fake)
 * @param {string}  [opts.url]      LEADS_INTAKE_URL; unset disables forwarding
 * @param {string}  [opts.token]    LEADS_INTAKE_TOKEN; unset disables forwarding
 * @param {Function} [opts.fetchImpl]
 * @param {number}  [opts.timeoutMs]
 * @param {number}  [opts.replayBatch]
 * @param {object}  [opts.log]      console-shaped
 */
export function createForwarder({
  sql,
  url,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  replayBatch = DEFAULT_REPLAY_BATCH,
  log = console,
}) {
  const enabled = Boolean(url && token);

  const warn = (id, reason) =>
    // Never the token, never the payload: id + reason is enough to find the
    // row and the failure, and nothing here can leak the bearer into logs.
    log.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'lead forward failed', id, reason }));

  /** Forward one row. Never throws; returns { ok, status? , reason? }. */
  async function forward(row) {
    if (!enabled) return { ok: false, reason: 'not configured' };
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(intakePayload(row)),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      const reason = timedOut ? `timeout after ${timeoutMs}ms` : `request failed: ${err?.message ?? err}`;
      warn(row.id, reason);
      return { ok: false, reason };
    }
    if (res.status < 200 || res.status >= 300) {
      const reason = `intake answered ${res.status}`;
      warn(row.id, reason);
      return { ok: false, reason };
    }
    try {
      await sql`UPDATE demo_submissions SET status = 'forwarded' WHERE id = ${row.id}`;
    } catch (err) {
      // mastra has the lead (idempotent on id); the replay will mark it next tick.
      const reason = `accepted ${res.status} but status update failed: ${err?.message ?? err}`;
      warn(row.id, reason);
      return { ok: false, reason };
    }
    log.info(JSON.stringify({ ts: new Date().toISOString(), event: 'lead forwarded', id: row.id, status: res.status }));
    return { ok: true, status: res.status };
  }

  /**
   * One replay tick: rows still `new` after five minutes, oldest first, at
   * most `replayBatch` of them. Five minutes keeps the loop from racing an
   * in-flight first delivery; the batch cap bounds one tick's work.
   */
  async function replayOnce() {
    if (!enabled) return { attempted: 0, forwarded: 0 };
    const rows = await sql`
      SELECT id, submitted_at, company_name, contact_name, email, phone, company_size, message, referrer
      FROM demo_submissions
      WHERE status = 'new' AND submitted_at < now() - interval '5 minutes'
      ORDER BY submitted_at ASC
      LIMIT ${replayBatch}
    `;
    let forwarded = 0;
    for (const row of rows) {
      const result = await forward(row);
      if (result.ok) forwarded += 1;
    }
    if (rows.length > 0) {
      log.info(JSON.stringify({ ts: new Date().toISOString(), event: 'lead replay', attempted: rows.length, forwarded }));
    }
    return { attempted: rows.length, forwarded };
  }

  /** Rows still `new` after one hour: the epic's observable gate (exit criterion 4). */
  async function staleNewCount() {
    const [row] = await sql`
      SELECT count(*)::int AS stale_new
      FROM demo_submissions
      WHERE status = 'new' AND submitted_at < now() - interval '1 hour'
    `;
    return Number(row?.stale_new ?? 0);
  }

  return { enabled, forward, replayOnce, staleNewCount };
}

const DEFAULT_REPLAY_INTERVAL_MS = 10 * 60_000;
const DEFAULT_REPLAY_INITIAL_DELAY_MS = 60_000;

/**
 * Runs `replayOnce` every `intervalMs` (ten minutes), first after
 * `initialDelayMs` so a restarted pod catches up without hammering mastra at
 * boot. Timers are unref'd: they never keep the process alive. Returns stop().
 */
export function startReplayLoop(
  forwarder,
  { intervalMs = DEFAULT_REPLAY_INTERVAL_MS, initialDelayMs = DEFAULT_REPLAY_INITIAL_DELAY_MS, log = console } = {},
) {
  if (!forwarder.enabled) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return; // a slow tick never overlaps the next one
    running = true;
    try {
      await forwarder.replayOnce();
    } catch (err) {
      log.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'lead replay failed', reason: err?.message ?? String(err) }));
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, initialDelayMs);
  first.unref?.();
  const every = setInterval(tick, intervalMs);
  every.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
