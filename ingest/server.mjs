import { createServer } from 'node:http';
import postgres from 'postgres';
import { createHandler } from './lib/app.mjs';
import { createForwarder, startReplayLoop } from './lib/forward.mjs';

/**
 * Canopy Website — Demo-form ingest shim
 *
 * A deliberately tiny service that sits inside the cluster (namespace
 * `canopy-website`) and is the ONLY thing exposed to the public internet
 * (via Tailscale Funnel on 443). It accepts one authenticated POST, validates
 * it, writes a single row to Postgres over the in-cluster ClusterIP, and then
 * forwards that row to mastra's lead-intake pipeline (lib/forward.mjs).
 *
 * The database itself is never exposed — Vercel cannot reach raw Postgres over
 * Tailscale Funnel, so the flow is: browser -> Vercel function (same origin) ->
 * this shim (Funnel 443, shared-secret bearer) -> Postgres (ClusterIP)
 *                                               -> mastra POST /leads/intake
 *
 * This file is the process bootstrap only; the routes live in lib/app.mjs.
 */

const PORT = parseInt(process.env.PORT || '8080', 10);
const INGEST_SECRET = process.env.INGEST_SECRET;

if (!INGEST_SECRET) {
  console.error('FATAL: INGEST_SECRET is not set. Refusing to start.');
  process.exit(1);
}

const sql = postgres({
  host: process.env.PGHOST || 'canopy-website-db',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'canopy_website',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'canopy_website',
  max: parseInt(process.env.PG_MAX_CONNECTIONS || '5', 10),
  idle_timeout: 20,
  connect_timeout: 10,
  // In-cluster ClusterIP hop — no TLS needed on this leg.
  ssl: false,
});

// Lead forwarding to mastra (roadmap#324). Not fatal when unset: the shim
// still stores every submission, rows just stay `new` (and /healthz says so
// via stale_new) until the env lands — the image can roll before the k8s env.
const forwarder = createForwarder({
  sql,
  url: process.env.LEADS_INTAKE_URL,
  token: process.env.LEADS_INTAKE_TOKEN,
  timeoutMs: parseInt(process.env.LEADS_INTAKE_TIMEOUT_MS || '5000', 10),
});
if (!forwarder.enabled) {
  console.warn('lead forwarding disabled: LEADS_INTAKE_URL and/or LEADS_INTAKE_TOKEN unset; rows stay status=new');
}
const stopReplay = startReplayLoop(forwarder, {
  intervalMs: parseInt(process.env.LEADS_REPLAY_INTERVAL_MS || String(10 * 60_000), 10),
});

const server = createServer(createHandler({ sql, forwarder, ingestSecret: INGEST_SECRET }));

server.listen(PORT, () => {
  console.log(`canopy-website ingest listening on :${PORT}`);
});

// Graceful shutdown so in-flight inserts finish and the pool closes cleanly.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down`);
    stopReplay();
    server.close(() => sql.end({ timeout: 5 }).then(() => process.exit(0)));
  });
}
