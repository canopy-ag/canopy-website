# Quick Implementation Guide: Demo Form + CNPG Integration

## ⚡ TL;DR - 5-Minute Setup

### Step 1: Database Setup (Run on PostgreSQL)

```bash
# Port-forward to database
kubectl port-forward -n canopy-dev svc/postgres-dev-primary 5432:5432

# Generate a secure password
DB_PASSWORD=$(openssl rand -base64 32)
echo "Generated password: $DB_PASSWORD"

# Create database and user
psql -h localhost -U postgres <<EOF
CREATE DATABASE canopy_website;
CREATE USER canopy_website_user WITH PASSWORD '$DB_PASSWORD';
GRANT CONNECT ON DATABASE canopy_website TO canopy_website_user;
\c canopy_website
GRANT USAGE ON SCHEMA public TO canopy_website_user;
GRANT CREATE ON SCHEMA public TO canopy_website_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO canopy_website_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO canopy_website_user;
EOF

# Run schema creation
psql -h localhost -U postgres -d canopy_website -f canopy-k8s-configs/canopy-dev/postgres/init-scripts/001_canopy_website_schema.sql

# Grant table permissions after schema creation
psql -h localhost -U postgres -d canopy_website <<EOF
GRANT SELECT, INSERT, UPDATE ON demo_submissions TO canopy_website_user;
EOF
```

### Step 2: Deploy Tailscale Service

```bash
cd ~/Projects/canopy-k8s-configs
git pull  # If running from repo
kubectl apply -f canopy-dev/postgres/tailscale-service.yaml

# Verify
kubectl get svc -n canopy-dev postgres-dev-tailscale-funnel
tailscale status | grep canopy-dev-db
```

### Step 3: Configure Vercel

```bash
cd ~/Projects/canopy-website

# Set environment variables
vercel env add DATABASE_URL production
# Enter: postgresql://canopy_website_user:<PASSWORD>@canopy-dev-db.<TAILNET>.ts.net:5432/canopy_website?sslmode=require

vercel env add DATABASE_MAX_CONNECTIONS production
# Enter: 5
```

Or via dashboard: https://vercel.com/dashboard → Project → Settings → Environment Variables

### Step 4: Deploy Website

```bash
# Install new dependencies
npm install

# Deploy to production
vercel --prod
```

### Step 5: Verify

```bash
# Health check
curl https://canopy.ag/api/submit-demo

# Test submission
curl -X POST https://canopy.ag/api/submit-demo \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Test Co","contactName":"Test User","email":"test@example.com"}'

# Check database
kubectl exec -it -n canopy-dev postgres-dev-1 -- psql -U canopy_website_user -d canopy_website -c "SELECT id, company_name, email, created_at FROM demo_submissions ORDER BY created_at DESC LIMIT 5;"
```

---

## 📋 Pre-Implementation Checklist

Before starting, confirm these decisions:

- [ ] **Database**: Use existing `postgres-dev` cluster (recommended) or create new?
- [ ] **Connection**: Tailscale Funnel (recommended) or direct connection?
- [ ] **Namespace**: Keep in `canopy-dev` or create `canopy-website` namespace?
- [ ] **Backups**: Enable scheduled backups or keep suspended?

---

## 🔐 Security Notes

### Database Credentials
- Password generated with `openssl rand -base64 32`
- Stored in:
  - K8s cluster: PostgreSQL native user management
  - Vercel: Environment variables (encrypted at rest)
- Never commit credentials to git

### Network Security
- Tailscale Funnel provides HTTPS termination
- WireGuard tunnel between Tailscale and K8s cluster
- No public IP addresses exposed

### Application Security
- Input validation via Zod schema
- SQL injection prevention via parameterized queries
- XSS prevention via HTML escaping in emails

---

## 🛠️ Troubleshooting

### Database Connection Fails

```bash
# Check if Tailscale service is running
kubectl get svc -n canopy-dev postgres-dev-tailscale-funnel

# Check Tailscale operator logs
kubectl logs -n tailscale deployment/tailscale-operator

# Test connection from local
psql "postgresql://canopy_website_user:<PASSWORD>@canopy-dev-db.<TAILNET>.ts.net:5432/canopy_website?sslmode=require" -c "SELECT 1"
```

### Form Submissions Not Saving

```bash
# Check Vercel function logs
vercel logs --production

# Verify database permissions
kubectl exec -it -n canopy-dev postgres-dev-1 -- psql -U postgres -d canopy_website -c "\dp demo_submissions"
```

### Tailscale Issues

```bash
# Check Funnel status
tailscale funnel status

# Restart operator if needed
kubectl rollout restart deployment/tailscale-operator -n tailscale
```

---

## 📁 Files Modified/Created

### canopy-k8s-configs
```
canopy-dev/postgres/
├── kustomization.yaml                    # Modified: Added tailscale-service.yaml
├── tailscale-service.yaml                # NEW: Tailscale Funnel service
└── init-scripts/
    └── 001_canopy_website_schema.sql     # NEW: Database schema
```

### canopy-website
```
├── package.json                          # Modified: Added pg, zod, @types/pg
├── .env.example                          # NEW: Environment template
├── src/
│   ├── lib/
│   │   ├── db.ts                         # NEW: PostgreSQL connection pool
│   │   └── schema.ts                     # NEW: Zod validation schemas
│   └── pages/api/
│       └── submit-demo.ts                # REPLACED: Full DB implementation
└── specs/
    └── cnpg-integration-spec.md          # NEW: Full technical specification
```

---

## 📊 Post-Deployment Verification

### 1. Database Connectivity
```bash
curl https://canopy.ag/api/submit-demo
# Expected: {"status":"healthy","database":"connected",...}
```

### 2. Form Submission Flow
1. Visit https://canopy.ag
2. Click "Request a Demo"
3. Fill and submit form
4. Check email (if RESEND_API_KEY configured)
5. Verify in database:
   ```bash
   kubectl exec -it -n canopy-dev postgres-dev-1 -- psql -U canopy_website_user -d canopy_website -c "SELECT * FROM demo_submissions;"
   ```

### 3. Monitor for Errors
- Vercel Dashboard: https://vercel.com/dashboard
- Check function logs
- Check PostgreSQL logs: `kubectl logs -n canopy-dev postgres-dev-1`

---

## 🔄 Rollback Procedure

If issues occur, quickly revert:

```bash
# 1. Restore placeholder API
git checkout HEAD -- src/pages/api/submit-demo.ts

# 2. Remove database dependency from package.json
# Edit package.json and remove: pg, @types/pg, zod

# 3. Deploy without database
vercel --prod

# 4. (Optional) Remove Tailscale service
kubectl delete -f canopy-k8s-configs/canopy-dev/postgres/tailscale-service.yaml
```

---

## 📞 Support

- **Full Specification**: See `specs/cnpg-integration-spec.md`
- **CNPG Docs**: https://cloudnative-pg.io/documentation/
- **Tailscale K8s**: https://tailscale.com/kb/1236/kubernetes-operator
