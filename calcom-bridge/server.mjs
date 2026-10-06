import { createServer } from 'node:http';
import { parseBookingEvent } from './lib/booking.mjs';
import { createErpClient } from './lib/erpnext.mjs';
import { createSync } from './lib/sync.mjs';
import { signatureValid } from './lib/signature.mjs';

/**
 * Cal.com -> ERPNext bridge.
 *
 * Receives Cal.com booking webhooks (created / rescheduled / cancelled) and
 * mirrors them into ERPNext as a Lead + Opportunity. Runs in namespace
 * canopy-tools and is reachable ONLY from the Cal.com pod (ClusterIP +
 * NetworkPolicy in canopy-k8s-configs/canopy-tools/calcom-erpnext-bridge/):
 * there is no public route. Every request must still carry a valid
 * X-Cal-Signature-256 (HMAC-SHA256 of the raw body with the webhook secret).
 *
 * Responses: 2xx = applied or deliberately ignored (do not retry); 4xx = the
 * request itself is wrong (retrying cannot help); 5xx = ERPNext failed (safe to
 * retry, every write is idempotent).
 */

const env = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    console.error(`FATAL: ${name} is not set. Refusing to start.`);
    process.exit(1);
  }
  return v;
};

const PORT = parseInt(process.env.PORT || '8080', 10);
const WEBHOOK_SECRET = env('CALCOM_WEBHOOK_SECRET');
const MAX_BODY = 256 * 1024;

const erp = createErpClient({
  baseUrl: env('ERPNEXT_URL'),
  apiKey: env('ERPNEXT_API_KEY'),
  apiSecret: env('ERPNEXT_API_SECRET'),
});

const log = (event, fields = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));

const apply = createSync({
  erp,
  company: env('ERPNEXT_COMPANY'),
  timeZone: env('ERPNEXT_TIME_ZONE'),
  opportunityType: process.env.ERPNEXT_OPPORTUNITY_TYPE || 'Sales',
  log,
});

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('payload too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') return json(res, 200, { status: 'ok' });

  if (req.method !== 'POST' || req.url !== '/webhook') return json(res, 404, { error: 'not found' });

  let raw;
  try {
    raw = await readBody(req);
  } catch {
    return json(res, 413, { error: 'payload too large' });
  }

  if (!signatureValid(raw, req.headers['x-cal-signature-256'], WEBHOOK_SECRET)) {
    log('webhook.rejected', { reason: 'bad signature' });
    return json(res, 401, { error: 'invalid signature' });
  }

  let body;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    return json(res, 400, { error: 'invalid JSON' });
  }

  // Cal's "Ping test" in the webhook form sends a body with no booking.
  if (body?.triggerEvent === 'PING') return json(res, 200, { ok: true, ping: true });

  let ev;
  try {
    ev = parseBookingEvent(body);
  } catch (err) {
    log('webhook.invalid', { trigger: body?.triggerEvent, error: err.message });
    return json(res, 422, { error: err.message });
  }
  if (ev.ignored) return json(res, 202, { ignored: ev.ignored });

  try {
    const result = await apply(ev);
    log('webhook.applied', { trigger: ev.trigger, uid: ev.uid, ...result });
    return json(res, 200, result);
  } catch (err) {
    log('webhook.failed', { trigger: ev.trigger, uid: ev.uid, status: err.status, error: err.message });
    return json(res, 502, { error: 'erpnext sync failed' });
  }
});

{
  server.listen(PORT, () => log('listening', { port: PORT }));
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => server.close(() => process.exit(0)));
  }
}
