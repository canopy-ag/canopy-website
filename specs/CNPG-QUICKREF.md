# CNPG PostgreSQL Integration Guide

## Quick Reference

### View Recent Submissions

```bash
# Connect to postgres-dev cluster
kubectl exec -it -n canopy-dev postgres-dev-1 -c postgres -- psql -U postgres -d canopy_website

# View recent submissions
SELECT * FROM demo_submissions ORDER BY submitted_at DESC LIMIT 10;

# View daily summary
SELECT * FROM demo_submissions_summary;
```

### Database User Management

```sql
-- Create/update vercel user
CREATE USER canopy_vercel WITH PASSWORD 'your-secure-password';
ALTER USER canopy_vercel WITH PASSWORD 'new-password';

-- Grant permissions
GRANT CONNECT ON DATABASE canopy_website TO canopy_vercel;
GRANT USAGE ON SCHEMA public TO canopy_vercel;
GRANT SELECT, INSERT ON demo_submissions TO canopy_vercel;
GRANT USAGE, SELECT ON SEQUENCE demo_submissions_id_seq TO canopy_vercel;

-- Revoke if needed
REVOKE ALL ON demo_submissions FROM canopy_vercel;
```

### Tailscale Connection

```bash
# Check Tailscale service status
kubectl get svc -n canopy-dev postgres-dev-tailscale

# Get Tailscale hostname
tailscale status | grep postgres-dev-canopy

# Test connection (from a Tailscale-connected machine)
psql "postgresql://canopy_vercel:PASSWORD@postgres-dev-canopy.tailnet-name.ts.net:5432/canopy_website?sslmode=require"
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection timeout | Verify Tailscale Funnel is enabled on service |
| Auth failed | Check username/password in Vercel env vars |
| SSL errors | Ensure `sslmode=require` and `rejectUnauthorized: false` |
| Table not found | Run the init Job: `kubectl apply -f canopy-website-db-job.yaml` |

### Files Changed

**canopy-k8s-configs:**
- `canopy-dev/postgres/canopy-website-db-init.yaml` - ConfigMap with schema
- `canopy-dev/postgres/canopy-website-db-job.yaml` - Database init Job
- `canopy-tools/tailscale-operator/postgres-dev-tailscale-svc.yaml` - Tailscale LB
- `canopy-dev/postgres/kustomization.yaml` - Updated with new resources

**canopy-website:**
- `src/pages/api/submit-demo.ts` - Updated with DB logic
- `src/lib/db.ts` - Database connection module
- `package.json` - Added `postgres` and `resend` dependencies
- `README.md` - Documentation
