## Spec: Canopy Website Form + CNPG PostgreSQL Integration

### Goal
Integrate the Canopy Website demo form with the existing CNPG PostgreSQL cluster in canopy-dev to persist form submissions.

### Background
- Demo form exists in canopy-website (Astro + React)
- API endpoint at `/api/submit-demo.ts` has placeholder logic
- Existing CNPG cluster `postgres-dev` running in canopy-dev namespace
- Tailscale operator already configured for secure access

### Clarifying Questions (Answered)

**Q: Should we create a new CNPG cluster or use existing one in canopy-dev?**
A: ✅ Use existing `postgres-dev` cluster in canopy-dev. Add new database and user for isolation.

**Q: Preferred connection method: Tailscale funnel vs direct connection?**
A: ✅ Use Tailscale Funnel for secure HTTPS access from Vercel. Already partially configured.

**Q: What namespace for the database resources?**
A: ✅ Use existing `canopy-dev` namespace (where CNPG cluster runs).

**Q: Any backup/retention requirements?**
A: Use existing CNPG backup schedule. Database is low-volume form submissions.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Vercel Edge                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  canopy-website                                         │   │
│  │  ┌──────────────┐    ┌─────────────────────────────┐   │   │
│  │  │  DemoForm    │───▶│  /api/submit-demo.ts        │   │   │
│  │  │  (React)     │    │  - Validate input           │   │   │
│  │  └──────────────┘    │  - Connect to PostgreSQL    │   │   │
│  │                      │  - Insert submission        │   │   │
│  │                      └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Tailscale Funnel  │
                    │   (HTTPS/Winderguard)│
                    └──────────┬──────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    Home K8s Cluster                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  canopy-dev namespace                                   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  postgres-dev (CNPG Cluster)                    │   │   │
│  │  │  ┌─────────────────────────────────────────┐   │   │   │
│  │  │  │  Database: canopy_website              │   │   │   │
│  │  │  │  User: canopy_vercel                   │   │   │   │
│  │  │  │  Table: demo_submissions               │   │   │   │
│  │  │  └─────────────────────────────────────────┘   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Tailscale Ingress Service                     │   │   │
│  │  │  - Exposes postgres via Tailscale Funnel       │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Steps

#### Phase 1: Database Setup (canopy-k8s-configs)

**1.1 Create database init script**
File: `canopy-dev/postgres/canopy-website-db-init.yaml`
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: canopy-website-db-init
  namespace: canopy-dev
data:
  init-canopy-db.sql: |
    -- Create database (if not exists, run manually or via Job)
    CREATE DATABASE canopy_website;
    
    -- Connect to canopy_website and create schema
    \c canopy_website;
    
    -- Create table for demo submissions
    CREATE TABLE IF NOT EXISTS demo_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      company_size VARCHAR(50),
      message TEXT,
      ip_address INET,
      user_agent TEXT,
      referrer TEXT,
      submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      status VARCHAR(50) DEFAULT 'new'
    );
    
    -- Create indexes
    CREATE INDEX idx_demo_submissions_status ON demo_submissions(status);
    CREATE INDEX idx_demo_submissions_submitted_at ON demo_submissions(submitted_at DESC);
    CREATE INDEX idx_demo_submissions_email ON demo_submissions(email);
    
    -- Create summary view
    CREATE VIEW demo_submissions_summary AS
    SELECT 
      DATE(submitted_at) as date,
      COUNT(*) as count,
      COUNT(DISTINCT company_name) as unique_companies
    FROM demo_submissions
    GROUP BY DATE(submitted_at)
    ORDER BY date DESC;
```

**1.2 Create Kubernetes Job to initialize database**
File: `canopy-dev/postgres/canopy-website-db-job.yaml`
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: init-canopy-website-db
  namespace: canopy-dev
spec:
  template:
    spec:
      containers:
      - name: psql
        image: ghcr.io/cloudnative-pg/postgresql:15
        command:
        - /bin/bash
        - -c
        - |
          psql -h postgres-dev-rw -U postgres << 'EOF'
          SELECT 'CREATE DATABASE canopy_website' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'canopy_website');
          EOF
          
          psql -h postgres-dev-rw -U postgres -d canopy_website -f /init/init-canopy-db.sql
        env:
        - name: PGPASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-dev-superuser
              key: password
        volumeMounts:
        - name: init-script
          mountPath: /init
      volumes:
      - name: init-script
        configMap:
          name: canopy-website-db-init
      restartPolicy: OnFailure
  backoffLimit: 4
```

**1.3 Create Vercel database user (run manually once)**
```sql
-- Run this against postgres-dev after Tailscale is connected
CREATE USER canopy_vercel WITH PASSWORD 'generate-strong-password';
GRANT CONNECT ON DATABASE canopy_website TO canopy_vercel;
GRANT USAGE ON SCHEMA public TO canopy_vercel;
GRANT SELECT, INSERT ON demo_submissions TO canopy_vercel;
GRANT USAGE, SELECT ON SEQUENCE demo_submissions_id_seq TO canopy_vercel;
```

#### Phase 2: Tailscale Configuration

**2.1 Update Tailscale service for database**
File: `canopy-tools/tailscale-operator/canopy-website-db-ingress.yaml`
```yaml
# Tailscale LoadBalancer Service for PostgreSQL
apiVersion: v1
kind: Service
metadata:
  name: postgres-dev-tailscale
  namespace: canopy-dev
  annotations:
    tailscale.com/expose: "true"
    tailscale.com/hostname: "postgres-dev-canopy"
    tailscale.com/funnel: "true"
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
```

**2.2 Add to kustomization**
Update `canopy-dev/postgres/kustomization.yaml`:
```yaml
resources:
  - postgres-cluster.yaml
  - postgres-scheduled-backup.yaml
  - canopy-website-db-init.yaml
  - canopy-website-db-job.yaml
  - ../canopy-tools/tailscale-operator/canopy-website-db-ingress.yaml
```

#### Phase 3: Vercel API Update (canopy-website)

**3.1 Add PostgreSQL client dependency**
```bash
npm install @vercel/postgres
# OR for more control:
npm install postgres
```

**3.2 Update API endpoint**
File: `src/pages/api/submit-demo.ts`
```typescript
import type { APIRoute } from 'astro';
import { sql } from '@vercel/postgres';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.companyName || !data.contactName || !data.email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get client info
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const referrer = request.headers.get('referer') || 'unknown';

    // Insert into PostgreSQL via Tailscale connection
    const result = await sql`
      INSERT INTO demo_submissions 
        (company_name, contact_name, email, phone, company_size, message, ip_address, user_agent, referrer)
      VALUES 
        (${data.companyName}, ${data.contactName}, ${data.email}, ${data.phone}, 
         ${data.companySize}, ${data.message}, ${ip}, ${userAgent}, ${referrer})
      RETURNING id
    `;

    return new Response(
      JSON.stringify({ 
        success: true, 
        id: result.rows[0].id,
        message: 'Thank you! We will be in touch within 24 hours.'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Form submission error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Something went wrong. Please try again or email us directly at hello@canopy.ag'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
```

**3.3 Configure Vercel environment variables**
```bash
# Add to Vercel
POSTGRES_URL="postgresql://canopy_vercel:PASSWORD@postgres-dev-canopy.tailnet-name.ts.net:5432/canopy_website?sslmode=require"
```

### Security Checklist

- [ ] Strong password generated for `canopy_vercel` user
- [ ] User has minimal permissions (INSERT/SELECT only, no DELETE/UPDATE)
- [ ] TLS enforced (sslmode=require)
- [ ] IP address logging for audit trail
- [ ] Input validation on API endpoint
- [ ] No SQL injection (using parameterized queries)
- [ ] Tailscale ACLs configured to allow only Vercel IPs (if possible)
- [ ] Database credentials stored in Vercel env vars (not in code)
- [ ] CNPG backup enabled for canopy_website database

### Token Budget for Implementation

| Phase | Est. Tokens | Complexity |
|-------|-------------|------------|
| Database Setup | 15K | Low |
| Tailscale Config | 10K | Low |
| API Update | 20K | Medium |
| Testing | 10K | Low |
| **Total** | **55K** | **M tier** |

### Rollback Plan

1. **If DB migration fails**: Use existing placeholder logic (email fallback)
2. **If Tailscale connection fails**: Switch to Vercel KV as temporary storage
3. **If performance issues**: Add connection pooling (PgBouncer)

### Acceptance Criteria

- [ ] Form submissions persist to CNPG database
- [ ] Tailscale Funnel provides secure HTTPS connection
- [ ] Data is queryable via SQL
- [ ] API returns proper error messages
- [ ] Backups are working
- [ ] Can view submissions via admin query
