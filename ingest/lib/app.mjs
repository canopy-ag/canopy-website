import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * The ingest shim's request handler, separated from the process bootstrap in
 * ../server.mjs so a test can run POST /demo and GET /healthz against a real
 * listener with a fake `sql` and a fake forwarder.
 *
 * Routes (nothing else; no query surface, no method fallbacks):
 *   POST /demo     Bearer INGEST_SECRET; validate, INSERT, forward to mastra
 *   GET  /healthz  unauthenticated; SELECT 1 + the count of stale `new` rows
 */

// Mirrors canopy-website/src/lib/schema.ts so the shim and the site agree.
export const DemoSubmissionSchema = z.object({
  companyName: z.string().min(1).max(255).trim(),
  contactName: z.string().min(1).max(255).trim(),
  email: z.string().email().max(255).toLowerCase().trim(),
  phone: z.string().max(50).optional().default(''),
  companySize: z.enum(['', '1-10', '11-50', '51-200', '200+']).optional().default(''),
  message: z.string().max(5000).optional().default(''),
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

/** Constant-time bearer-token check. */
function authorized(req, secret) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req, limitBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new Error('payload too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {object} opts
 * @param {Function} opts.sql          postgres.js tagged template
 * @param {object}   opts.forwarder    from lib/forward.mjs createForwarder()
 * @param {string}   opts.ingestSecret the shared bearer the Vercel function sends
 * @param {object}   [opts.log]        console-shaped
 */
export function createHandler({ sql, forwarder, ingestSecret, log = console }) {
  if (!ingestSecret) throw new Error('createHandler: ingestSecret is required');

  return async (req, res) => {
    // Health check — unauthenticated, used by k8s probes. `stale_new` is the
    // count of rows still `new` after an hour (roadmap#175 exit criterion 4);
    // it is a signal, not a failure: the status stays 200 whatever the count.
    if (req.method === 'GET' && req.url === '/healthz') {
      try {
        await sql`SELECT 1`;
        const staleNew = await forwarder.staleNewCount();
        return json(res, 200, { status: 'healthy', database: 'connected', stale_new: staleNew });
      } catch {
        return json(res, 503, { status: 'unhealthy', database: 'disconnected' });
      }
    }

    // The one real route.
    if (req.method === 'POST' && req.url === '/demo') {
      if (!authorized(req, ingestSecret)) {
        return json(res, 401, { error: 'unauthorized' });
      }

      let raw;
      try {
        raw = await readBody(req);
      } catch {
        return json(res, 413, { error: 'payload too large' });
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: 'invalid JSON' });
      }

      const result = DemoSubmissionSchema.safeParse(parsed);
      if (!result.success) {
        return json(res, 400, {
          error: 'validation failed',
          details: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        });
      }
      const data = result.data;

      const rawIp =
        (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
        (req.headers['x-real-ip'] || '').toString().trim();
      // ip_address is an INET column — only store values that look like an IP
      // (v4 or v6), otherwise NULL. Guards against "unknown"/hostnames -> cast error.
      const ip = /^[0-9a-fA-F:.]{3,}$/.test(rawIp) ? rawIp : null;
      const userAgent = (req.headers['x-original-user-agent'] || req.headers['user-agent'] || '').toString().slice(0, 2000) || null;
      const referrer = (req.headers['x-original-referer'] || '').toString().slice(0, 2000) || null;

      let row;
      try {
        // RETURNING the forwardable columns (never ip_address / user_agent) so
        // the forward sends what the database stored, not what was parsed.
        const rows = await sql`
          INSERT INTO demo_submissions
            (company_name, contact_name, email, phone, company_size, message, ip_address, user_agent, referrer)
          VALUES
            (${data.companyName}, ${data.contactName}, ${data.email},
             ${data.phone || null}, ${data.companySize || null}, ${data.message || null},
             ${ip}, ${userAgent}, ${referrer})
          RETURNING id, submitted_at, company_name, contact_name, email, phone, company_size, message, referrer
        `;
        row = rows[0];
        log.info(`demo submission stored: ${row?.id} (${data.companyName})`);
      } catch (err) {
        log.error('database insert failed:', err instanceof Error ? err.message : err);
        return json(res, 502, { error: 'failed to store submission' });
      }

      // The DB write is the source of truth; the forward is best-effort and
      // bounded by its timeout. Whatever it returns, the browser gets 200 —
      // a row left at `new` is the replay loop's job.
      if (row) await forwarder.forward(row);
      return json(res, 200, { success: true, id: row?.id, submitted_at: row?.submitted_at });
    }

    // Everything else — no query surface, no method fallbacks.
    return json(res, 404, { error: 'not found' });
  };
}
