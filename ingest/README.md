# canopy-website ingest shim

The demo form on canopy.ag stores leads in a Postgres database that runs in the
homelab Kubernetes cluster. Vercel serverless functions **cannot** reach that
database directly — Tailscale Funnel only forwards HTTPS-style traffic on
443/8443/10000, not raw Postgres (5432), and Vercel functions are not tailnet
members. So the write path is:

```
browser
  → POST /api/submit-demo        (Vercel function, same origin, no CORS)
    → POST <INGEST_URL>/demo     (this shim, Tailscale Funnel :443, Bearer INGEST_SECRET)
      → INSERT demo_submissions  (Postgres, in-cluster ClusterIP)
      → POST <LEADS_INTAKE_URL>  (mastra's lead-intake pipeline, Bearer LEADS_INTAKE_TOKEN)
```

This service is the only thing exposed publicly. It has exactly one route
(`POST /demo`), requires a shared-secret bearer token, validates input with the
same Zod schema the site uses, and performs a single parameterized INSERT. There
is no query/read surface.

After the INSERT it forwards the stored row to mastra (canopy-roost
`apps/mastra`, `POST /leads/intake`) as the `website-ingest` service principal
and marks the row `status='forwarded'` on a 2xx. The database write stays the
source of truth: if mastra is down, slow (5 s timeout) or answers non-2xx, the
browser still gets `200`, the row stays `new`, and an in-process replay loop
retries every ten minutes (rows `new` for more than five minutes, oldest first,
twenty per tick). `/healthz` reports `stale_new`, the count of rows still `new`
after one hour — the observable gate of canopy-ag/canopy-roadmap#175.

The forwarded body is exactly `{ id, submitted_at, company_name, contact_name,
email, phone, company_size, message, referrer }`. `ip_address` and
`user_agent` are audit columns and never leave the shim; `id` is the
idempotency key mastra dedupes on, so a replay after a lost 2xx creates nothing.

## Layout

| File | What |
|------|------|
| `server.mjs` | Process bootstrap: env, Postgres pool, replay loop, listen, graceful shutdown |
| `lib/app.mjs` | The request handler (`POST /demo`, `GET /healthz`) and the Zod schema mirrored from `src/lib/schema.ts` |
| `lib/forward.mjs` | `createForwarder()` (forward one row, `replayOnce()`, `staleNewCount()`) and `startReplayLoop()` |
| `test/*.test.mjs` | `node --test` suite with a fake `demo_submissions` and a fake / live-stub intake endpoint |

## Endpoints

| Method | Path       | Auth            | Purpose                         |
|--------|------------|-----------------|---------------------------------|
| POST   | `/demo`    | `Bearer` secret | Validate + insert one submission, then forward it |
| GET    | `/healthz` | none            | Liveness/readiness (SELECT 1) + `stale_new` count |

Anything else returns `404`.

`GET /healthz` → `{ "status": "healthy", "database": "connected", "stale_new": 0 }`.
`stale_new` is a signal, not a failure: the status stays `200` whatever the
count (a non-zero value means mastra has not accepted those rows for an hour;
check the shim logs for `lead forward failed`).

## Environment

| Var                 | Required | Default             | Notes                                   |
|---------------------|----------|---------------------|-----------------------------------------|
| `INGEST_SECRET`     | yes      | —                   | Shared bearer token (also set in Vercel) |
| `PGHOST`            | no       | `canopy-website-db` | ClusterIP service of the database        |
| `PGPORT`            | no       | `5432`              |                                         |
| `PGUSER`            | no       | `canopy_website`    |                                         |
| `PGPASSWORD`        | yes      | —                   | From the `canopy-website-db-credentials` secret |
| `PGDATABASE`        | no       | `canopy_website`    |                                         |
| `PG_MAX_CONNECTIONS`| no       | `5`                 |                                         |
| `PORT`              | no       | `8080`              |                                         |
| `LEADS_INTAKE_URL`  | no       | —                   | mastra's `POST /leads/intake`, in-cluster: `http://mastra.canopy-tools.svc.cluster.local:3300/leads/intake`. Unset ⇒ forwarding off (rows stay `new`, one warning at boot) |
| `LEADS_INTAKE_TOKEN`| no       | —                   | Bearer of the `website-ingest` service principal — the same value mastra reads as `SERVICE_TOKEN_WEBSITE_INGEST`. From the `canopy-website-ingest-leads-token` secret (Vault). Unset ⇒ forwarding off |
| `LEADS_INTAKE_TIMEOUT_MS` | no | `5000`            | Per-forward timeout; the browser never waits longer than this on a hung mastra |
| `LEADS_REPLAY_INTERVAL_MS`| no | `600000`          | Replay tick (ten minutes); the first tick runs one minute after boot |

Logs are one JSON line per event: `lead forwarded` (id, status), `lead forward
failed` (id, reason — never the token or the payload), `lead replay`
(attempted, forwarded).

## Local run

```bash
npm install
INGEST_SECRET=dev-secret PGHOST=localhost PGPASSWORD=... npm start
curl -sS localhost:8080/healthz
curl -sS -X POST localhost:8080/demo \
  -H 'Authorization: Bearer dev-secret' -H 'Content-Type: application/json' \
  -d '{"companyName":"Test Co","contactName":"Jane","email":"jane@test.com"}'
```

## Tests

```bash
npm --prefix ingest test        # from the repo root, or `npm test` in ingest/
```

Node's built-in runner (`node --test test/*.test.mjs`), no extra dependencies.
Postgres and mastra are fakes injected through `createHandler({ sql, forwarder })`
and `createForwarder({ sql, fetchImpl })`; one case runs the real `fetch`
against a stub HTTP listener that answers 404 and then 202, which is exactly
how dev behaves until the mastra route ships.

## Image

Built + published by `.github/workflows/ingest-image.yml` to
`ghcr.io/canopy-ag/canopy-website-ingest` (the image carries `server.mjs` and
`lib/`; tests stay out of it). The deployment in
`canopy-k8s-configs/canopy-tools/canopy-website-ingest/` pins an immutable tag
and sets the `LEADS_INTAKE_*` env from an ExternalSecret.
