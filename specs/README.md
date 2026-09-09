# specs/

Design documents for this repo. Some describe what is live, some are the
history of how we got here. Check the status column before following any
command in them.

| File | Status | What it is |
|---|---|---|
| `blog-surfaces-spec.md` | **Current** (approved 2026-09-06, shipped in PR #17) | Blog content model, components, pages, migration, contributor pipeline, CI gate. The operator follow-ups at the end (branch protection, canopygrow.tech redirect) may still be open. |
| `blog-surfaces-plan.md` | Historical | Task-by-task implementation plan that produced the blog. Useful for the reasoning behind file layout choices. |
| `demo-form-spec.md` | Historical | Original brief for the demo-form modal. It proposed Formspree; the shipped path is the ingest shim (see `ingest/README.md`). |
| `cnpg-integration-spec.md` | Superseded | 2025 design for connecting the site directly to the CNPG `postgres-dev` cluster over Tailscale. Not what runs. The site never opens a database connection; the ingest shim writes to a dedicated `canopy-website-db` StatefulSet in the `canopy-website` namespace. |
| `QUICKSTART.md` | Superseded | Operational quickstart for the CNPG design above. Its `DATABASE_URL`, `db.ts`, and `canopy_vercel` steps no longer apply. Kept for history only. |
| `CNPG-QUICKREF.md` | Superseded | psql and Tailscale cheat sheet for the CNPG design. Same caveat. |

For how the demo form works today read the README section "Demo form and the
ingest shim", then `ingest/README.md`, then
`canopy-k8s-configs/canopy-tools/canopy-website-ingest/README.md` for the cluster
side and secret rotation.
