# Technical Specification: Canopy Website Demo Form + CNPG Integration

**Date:** 2025-02-13  
**Status:** Draft - Pending User Review  
**Author:** Spec Writer Agent  

---

## 📋 Executive Summary

This specification outlines the integration of the Canopy Website demo form with the existing CNPG (CloudNativePG) PostgreSQL cluster in the `canopy-dev` Kubernetes environment. The solution uses Tailscale Funnel to securely expose the database to Vercel without public IP exposure.

---

## 🎯 Objectives

1. Persist demo form submissions to PostgreSQL
2. Maintain secure, encrypted connection between Vercel and home lab
3. Implement proper database schema and migrations
4. Update API endpoint with production-ready DB operations
5. Maintain GitOps workflow via ArgoCD

---

## ❓ Clarifying Questions (For User Review)

Before implementation, please confirm the following:

| Question | Current Assumption | Decision |
|----------|-------------------|----------|
| **CNPG Cluster** | Use existing `postgres-dev` cluster in `canopy-dev` namespace | ☐ Use existing ☐ Create new |
| **Connection Method** | Tailscale Funnel (secure, encrypted, no public IP) | ☐ Tailscale Funnel ☐ Direct connection |
| **Database Namespace** | Create `canopy-website` namespace for isolation | ☐ `canopy-website` ☐ `canopy-dev` (shared) |
| **Backup/Retention** | Inherit from existing cluster (manual backups via ` ScheduledBackup`, currently suspended) | ☐ Enable scheduled backups ☐ Keep suspended |
| **Database User** | Create dedicated `canopy_website` user with limited permissions | ☐ Dedicated user ☐ Use existing superuser |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    Vercel Edge                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     canopy-website (Astro + React)                         │  │
│  │  ┌─────────────────┐         ┌──────────────────────────────────────┐    │  │
│  │  │   DemoForm.tsx  │────────▶│      /api/submit-demo.ts             │    │  │
│  │  │  (React Modal)  │         │  (PostgreSQL client via Tailscale)   │    │  │
│  │  └─────────────────┘         └──────────────────────────────────────┘    │  │
│  │                                           │                               │  │
│  └───────────────────────────────────────────┼───────────────────────────────┘  │
│                                              │                                   │
│                                              ▼                                   │
│                              Tailscale Funnel (HTTPS)                            │
└──────────────────────────────────────────────┬───────────────────────────────────┘
                                               │
                                               │ WireGuard Tunnel
                                               │ (Encrypted)
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Home K8s Cluster (canopy-dev)                       │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                      Tailscale Kubernetes Operator                         │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                Tailscale LoadBalancer Service                        │  │  │
│  │  │   ┌─────────────┐         ┌──────────────────────────────────────┐  │  │  │
│  │  │   │  Tailscale  │────────▶│  CNPG Cluster (postgres-dev)         │  │  │  │
│  │  │   │   Funnel    │         │  ┌────────────────────────────────┐  │  │  │
│  │  │   │  (Proxy)    │         │  │  Database: canopy_website      │  │  │  │
│  │  │   └─────────────┘         │  │  Table: demo_submissions       │  │  │  │
│  │  │                           │  └────────────────────────────────┘  │  │  │
│  │  └───────────────────────────┴──────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 1. CNPG Cluster Configuration

### Decision: Use Existing Cluster

The existing `postgres-dev` cluster in `canopy-dev` namespace will be used. A new database and user will be created for the canopy website.

### 1.1 Database Setup (One-time)

Execute these commands on the PostgreSQL primary:

```sql
-- Create dedicated database
CREATE DATABASE canopy_website;

-- Create dedicated user with limited permissions
CREATE USER canopy_website_user WITH PASSWORD '<GENERATED_PASSWORD>';

-- Grant connect permission
GRANT CONNECT ON DATABASE canopy_website TO canopy_website_user;

-- Connect to the new database and set up schema
\c canopy_website

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO canopy_website_user;

-- Grant table creation and usage (for migrations)
GRANT CREATE ON SCHEMA public TO canopy_website_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO canopy_website_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO canopy_website_user;
```

---

## 📊 2. Database Schema

### 2.1 Migration File

**File:** `canopy-k8s-configs/canopy-dev/postgres/init-scripts/001_canopy_website_schema.sql`

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Demo submissions table
CREATE TABLE IF NOT EXISTS demo_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    company_size VARCHAR(50),
    message TEXT,
    ip_address INET,
    user_agent TEXT,
    referrer TEXT,
    status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX idx_demo_submissions_email ON demo_submissions(email);
CREATE INDEX idx_demo_submissions_status ON demo_submissions(status);
CREATE INDEX idx_demo_submissions_created_at ON demo_submissions(created_at DESC);
CREATE INDEX idx_demo_submissions_company_name ON demo_submissions(company_name);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_demo_submissions_updated_at
    BEFORE UPDATE ON demo_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (optional - if multi-tenant in future)
-- ALTER TABLE demo_submissions ENABLE ROW LEVEL SECURITY;

-- Grant permissions to application user
GRANT SELECT, INSERT, UPDATE ON demo_submissions TO canopy_website_user;
GRANT USAGE, SELECT ON SEQUENCE demo_submissions_id_seq TO canopy_website_user;

-- Insert test record (optional, remove in production)
-- INSERT INTO demo_submissions (company_name, contact_name, email, company_size, status)
-- VALUES ('Test Company', 'Test User', 'test@example.com', '1-10', 'new');
```

### 2.2 CNPG Init Script Configuration

Add to `postgres-cluster.yaml`:

```yaml
spec:
  postgresql:
    pgHBA:
      # Allow connections from Tailscale subnet (adjust as needed)
      - host all all 100.64.0.0/10 scram-sha-256
  
  # Initialize with custom scripts
  initdb:
    database: app
    owner: app
    secret:
      name: postgres-dev-superuser
    
    # Reference to ConfigMap with init scripts
    import:
      databases:
        - name: canopy_website
          role: canopy_website_user
```

---

## 🔗 3. Connection Architecture

### 3.1 Tailscale Funnel Setup

**File:** `canopy-k8s-configs/canopy-dev/postgres/tailscale-service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-dev-tailscale-funnel
  namespace: canopy-dev
  annotations:
    # Expose via Tailscale
    tailscale.com/expose: "true"
    # Funnel for public HTTPS access (encrypted to Tailscale, then WireGuard to cluster)
    tailscale.com/funnel: "true"
    # Hostname in your tailnet
    tailscale.com/hostname: "canopy-dev-db"
    # Tags for ACLs
    tailscale.com/tags: "tag:database"
spec:
  type: LoadBalancer
  loadBalancerClass: tailscale
  selector:
    cnpg.io/cluster: postgres-dev
    role: primary
  ports:
    - name: postgres
      port: 5432
      targetPort: 5432
      protocol: TCP
```

### 3.2 Alternative: Direct Tailscale Proxy

If Funnel is not preferred, use Ingress:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: postgres-dev-tailscale-ingress
  namespace: canopy-dev
  annotations:
    tailscale.com/experimental-forward-cluster-traffic-via-ingress: "true"
spec:
  ingressClassName: tailscale
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: postgres-dev-lb
            port:
              number: 5432
```

### 3.3 Connection Flow

```
Vercel Function ──▶ Tailscale Funnel URL ──▶ Tailscale Network
                                                │
                                                ▼
                                        Tailscale Proxy Pod
                                                │
                                                ▼
                                    Kubernetes Service (ClusterIP)
                                                │
                                                ▼
                                    CNPG Primary Pod (PostgreSQL)
```

---

## 🔐 4. Vercel Environment Configuration

### 4.1 Required Environment Variables

Add these to Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Value | Environment |
|----------|-------|-------------|
| `DATABASE_URL` | `postgresql://canopy_website_user:<PASSWORD>@canopy-dev-db.<TAILNET>.ts.net:5432/canopy_website?sslmode=require` | Production |
| `DATABASE_URL` | `postgresql://canopy_website_user:<PASSWORD>@192.168.1.190:5432/canopy_website?sslmode=disable` | Development (local) |
| `DATABASE_MAX_CONNECTIONS` | `10` | All |
| `TAILSCALE_AUTH_KEY` | `tskey-auth-k...` (for Vercel Functions) | Production |

### 4.2 Local Development `.env` Template

**File:** `canopy-website/.env.example`

```bash
# Database connection (for local dev, direct to LoadBalancer)
DATABASE_URL=postgresql://canopy_website_user:localpassword@192.168.1.190:5432/canopy_website?sslmode=disable

# Optional: Resend for email fallback
RESEND_API_KEY=re_...

# Optional: Webhook for notifications
HOME_LAB_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## 💻 5. Updated API Endpoint Code

### 5.1 Add PostgreSQL Dependencies

**File:** `canopy-website/package.json`

```json
{
  "dependencies": {
    "@astrojs/check": "^0.9.4",
    "@astrojs/react": "^4.2.0",
    "@astrojs/vercel": "^8.1.0",
    "@tailwindcss/vite": "^4.0.0",
    "astro": "^5.2.0",
    "pg": "^8.13.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.3",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.16",
    "@types/pg": "^8.11.0"
  }
}
```

### 5.2 Database Client Utility

**File:** `canopy-website/src/lib/db.ts`

```typescript
import { Pool, PoolClient } from 'pg';

// Connection pool configuration
const pool = new Pool({
  connectionString: import.meta.env.DATABASE_URL,
  max: parseInt(import.meta.env.DATABASE_MAX_CONNECTIONS || '10'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Connection error handling
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

// Graceful shutdown
if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => pool.end());
  process.on('SIGINT', () => pool.end());
}

export { pool };
export type { PoolClient };
```

### 5.3 Schema Validation

**File:** `canopy-website/src/lib/schema.ts`

```typescript
import { z } from 'zod';

export const DemoSubmissionSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(255),
  contactName: z.string().min(1, 'Contact name is required').max(255),
  email: z.string().email('Invalid email address').max(255),
  phone: z.string().max(50).optional().default(''),
  companySize: z.enum(['', '1-10', '11-50', '51-200', '200+']).optional().default(''),
  message: z.string().max(5000).optional().default(''),
});

export type DemoSubmission = z.infer<typeof DemoSubmissionSchema>;
```

### 5.4 Updated API Endpoint

**File:** `canopy-website/src/pages/api/submit-demo.ts`

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { DemoSubmissionSchema } from '../../lib/schema';

// Initialize connection pool
const pool = new Pool({
  connectionString: import.meta.env.DATABASE_URL,
  max: parseInt(import.meta.env.DATABASE_MAX_CONNECTIONS || '5'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// SQL query for inserting submissions
const INSERT_SUBMISSION_SQL = `
  INSERT INTO demo_submissions (
    company_name, 
    contact_name, 
    email, 
    phone, 
    company_size, 
    message, 
    ip_address, 
    user_agent, 
    referrer
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  RETURNING id, created_at
`;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let client;
  
  try {
    // Parse and validate request body
    const rawData = await request.json();
    const validationResult = DemoSubmissionSchema.safeParse(rawData);
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }));
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Validation failed', 
          errors 
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          } 
        }
      );
    }

    const data = validationResult.data;

    // Get client metadata
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
               clientAddress || 
               'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const referrer = request.headers.get('referer') || 'unknown';

    // Get database client from pool
    client = await pool.connect();

    // Insert submission
    const result = await client.query(INSERT_SUBMISSION_SQL, [
      data.companyName,
      data.contactName,
      data.email,
      data.phone || null,
      data.companySize || null,
      data.message || null,
      ip,
      userAgent,
      referrer
    ]);

    const submission = result.rows[0];

    // Optional: Send notification email
    if (import.meta.env.RESEND_API_KEY) {
      try {
        const { default: Resend } = await import('resend');
        const resend = new Resend(import.meta.env.RESEND_API_KEY);
        
        await resend.emails.send({
          from: 'Canopy Website <hello@canopy.ag>',
          to: ['hello@canopy.ag'],
          subject: `Demo Request: ${data.companyName}`,
          html: `
            <h2>New Demo Request</h2>
            <p><strong>Company:</strong> ${data.companyName}</p>
            <p><strong>Contact:</strong> ${data.contactName}</p>
            <p><strong>Email:</strong> ${data.email}</p>
            <p><strong>Phone:</strong> ${data.phone || 'N/A'}</p>
            <p><strong>Company Size:</strong> ${data.companySize || 'N/A'}</p>
            <p><strong>Message:</strong> ${data.message || 'N/A'}</p>
            <hr/>
            <p><small>Submission ID: ${submission.id}</small></p>
            <p><small>Submitted at: ${submission.created_at}</small></p>
          `,
        });
      } catch (emailError) {
        // Log but don't fail the request
        console.error('Failed to send notification email:', emailError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Thank you! We will be in touch within 24 hours.',
        submissionId: submission.id
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        } 
      }
    );

  } catch (error) {
    console.error('Form submission error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Something went wrong. Please try again or email us directly at hello@canopy.ag'
      }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        } 
      }
    );
  } finally {
    // Always release client back to pool
    if (client) {
      client.release();
    }
  }
};

// Health check endpoint
export const GET: APIRoute = async () => {
  let client;
  
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    
    return new Response(
      JSON.stringify({ 
        status: 'healthy',
        database: 'connected'
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        status: 'unhealthy',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 503, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } finally {
    if (client) {
      client.release();
    }
  }
};
```

---

## 📁 6. File Structure

### 6.1 canopy-k8s-configs Changes

```
canopy-k8s-configs/
└── canopy-dev/
    └── postgres/
        ├── kustomization.yaml          # Add tailscale-service.yaml
        ├── postgres-cluster.yaml        # Add initdb config
        ├── tailscale-service.yaml       # NEW: Tailscale Funnel service
        └── init-scripts/                # NEW: Database migrations
            └── 001_canopy_website_schema.sql
```

### 6.2 canopy-website Changes

```
canopy-website/
├── package.json                       # Add pg, zod dependencies
├── .env.example                       # NEW: Environment template
├── src/
│   ├── lib/                          # NEW: Utility modules
│   │   ├── db.ts                     # PostgreSQL connection pool
│   │   └── schema.ts                 # Zod validation schemas
│   ├── components/
│   │   └── DemoForm.tsx              # Minor updates (no changes needed)
│   └── pages/
│       └── api/
│           └── submit-demo.ts        # REPLACE: Full DB implementation
```

---

## ✅ 7. Security Checklist

### 7.1 Database Security

| Item | Status | Notes |
|------|--------|-------|
| Dedicated database user (not superuser) | ☐ | `canopy_website_user` with limited permissions |
| Password complexity | ☐ | Use strong password, stored in K8s secret |
| SSL/TLS required | ☐ | `sslmode=require` in connection string |
| Connection limits | ☐ | Pool max 5-10 connections |
| Query parameterization | ✅ | Uses parameterized queries in pg |
| Input validation | ✅ | Zod schema validation |
| SQL injection prevention | ✅ | Parameterized queries |

### 7.2 Network Security

| Item | Status | Notes |
|------|--------|-------|
| Tailscale Funnel encryption | ✅ | HTTPS to Tailscale edge |
| WireGuard tunnel | ✅ | Tailscale to cluster |
| No public IP exposure | ✅ | Only Tailscale IPs |
| pg_hba.conf restrictions | ☐ | Restrict to Tailscale subnet |
| Firewall rules | ☐ | Allow 5432 from Tailscale only |

### 7.3 Application Security

| Item | Status | Notes |
|------|--------|-------|
| Environment variables in Vercel | ☐ | Mark as sensitive, no logging |
| Error message sanitization | ✅ | Generic error messages to client |
| Rate limiting | ☐ | Consider Vercel or API level |
| CORS configuration | ☐ | Restrict to canopy.ag domains |
| Content Security Policy | ☐ | Add CSP headers |

### 7.4 Operational Security

| Item | Status | Notes |
|------|--------|-------|
| Database backup strategy | ☐ | Enable ScheduledBackup |
| Secrets management | ☐ | Use K8s secrets + Vercel env vars |
| Access logging | ☐ | Enable PostgreSQL logs |
| Audit trail | ✅ | `demo_submissions` tracks IP/user agent |
| PII handling | ☐ | Document GDPR compliance |

---

## 🚀 8. Implementation Steps

### Phase 1: Database Setup (5 min)

```bash
# 1. Port-forward to PostgreSQL primary
kubectl port-forward -n canopy-dev svc/postgres-dev-primary 5432:5432

# 2. Connect and run setup
psql -h localhost -U postgres -f init-scripts/001_canopy_website_schema.sql

# 3. Create application user (generate password)
psql -h localhost -U postgres -c "CREATE USER canopy_website_user WITH PASSWORD '$(openssl rand -base64 32)';"
```

### Phase 2: Tailscale Configuration (10 min)

```bash
# 1. Apply Tailscale service
kubectl apply -f canopy-k8s-configs/canopy-dev/postgres/tailscale-service.yaml

# 2. Verify service is exposed
tailscale status | grep canopy-dev-db

# 3. Get Tailscale URL
tailscale funnel status
```

### Phase 3: Vercel Configuration (5 min)

```bash
# 1. Add environment variables
vercel env add DATABASE_URL production
vercel env add DATABASE_MAX_CONNECTIONS production

# 2. Or via Vercel dashboard
# Project Settings → Environment Variables
```

### Phase 4: Application Deployment (5 min)

```bash
# 1. Install dependencies
cd canopy-website
npm install pg zod @types/pg

# 2. Update code (copy files from spec)

# 3. Test locally
npm run dev

# 4. Deploy
vercel --prod
```

### Phase 5: Verification (5 min)

```bash
# 1. Test health endpoint
curl https://canopy.ag/api/submit-demo

# 2. Test form submission
curl -X POST https://canopy.ag/api/submit-demo \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Test Co","contactName":"Test User","email":"test@example.com"}'

# 3. Verify in database
kubectl exec -it -n canopy-dev postgres-dev-1 -- psql -U canopy_website_user -d canopy_website -c "SELECT * FROM demo_submissions;"
```

---

## 📈 9. Monitoring & Alerting

### 9.1 Key Metrics

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Database connections | PostgreSQL logs | > 80% of max |
| Form submission rate | Application logs | Sudden drop/spike |
| Error rate | Vercel Analytics | > 5% |
| Response time | Vercel Analytics | > 2s p95 |

### 9.2 Health Checks

```bash
# Database health
curl https://canopy.ag/api/submit-demo

# Kubernetes health
kubectl get pods -n canopy-dev -l cnpg.io/cluster=postgres-dev

# Tailscale connectivity
tailscale ping canopy-dev-db
```

---

## 📝 10. Rollback Plan

If issues occur:

1. **Immediate**: Revert API endpoint to placeholder version
2. **Database**: Keep existing table, can truncate if needed
3. **Tailscale**: Delete service to remove exposure
4. **Vercel**: Remove DATABASE_URL env var to force fallback behavior

---

## 🤔 Open Questions

1. **Rate Limiting**: Should we implement rate limiting on the API endpoint?
2. **Data Retention**: How long should demo submissions be retained?
3. **GDPR**: Do we need consent checkboxes for EU visitors?
4. **Notifications**: Besides email, should we add Slack/webhook notifications?
5. **Analytics**: Should we track form conversion metrics?

---

## 📚 References

- [CloudNativePG Documentation](https://cloudnative-pg.io/documentation/)
- [Tailscale Kubernetes Operator](https://tailscale.com/kb/1236/kubernetes-operator)
- [Vercel PostgreSQL Guide](https://vercel.com/docs/storage/vercel-postgres)
- [PostgreSQL Connection Pooling](https://node-postgres.com/features/pooling)

---

**End of Specification**

*This document should be reviewed and approved before implementation begins.*
