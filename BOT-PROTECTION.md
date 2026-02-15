# Bot Protection Setup

Two-layer protection for the demo form submission endpoint:

## 1. Rate Limiting (Middleware)

**Location**: `src/middleware.ts`

**How it works**:
- Tracks requests per IP address in memory
- Limit: **5 requests per minute per IP**
- Returns `429 Too Many Requests` when exceeded
- Auto-cleans expired entries every 5 minutes

**Configuration**:
```typescript
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;      // 5 requests per IP
```

**For production scale**: Replace in-memory store with `@vercel/kv` or Vercel Edge Config for multi-instance consistency.

**Testing**:
```bash
# Should succeed first 5 times, fail on 6th
for i in {1..6}; do
  curl -X POST https://canopy.ag/api/submit-demo \
    -H "Content-Type: application/json" \
    -d '{"companyName":"Test","contactName":"Test","email":"test@test.com","turnstileToken":"test"}'
done
```

---

## 2. Cloudflare Turnstile (CAPTCHA)

**Location**: 
- Frontend: `src/components/DemoForm.tsx`
- Backend: `src/pages/api/submit-demo.ts`
- Helper: `src/lib/turnstile.ts`

**Setup Steps**:

### A. Get Turnstile Keys

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Turnstile
2. Create a new site:
   - **Site name**: Canopy Website
   - **Domain**: `canopy.ag` (or `localhost` for testing)
   - **Widget mode**: Managed (recommended)
3. Copy your keys:
   - **Site Key** (public, client-side)
   - **Secret Key** (private, server-side)

### B. Set Environment Variables

**Vercel Dashboard** → Settings → Environment Variables:

```bash
# Public key (exposed to client)
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA  # Replace with your site key

# Secret key (server-side only)
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA  # Replace with your secret key
```

**Local Development** (`.env`):
```bash
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

**Testing Keys** (always pass):
- Site Key: `1x00000000000000000000AA`
- Secret Key: `1x0000000000000000000000000000000AA`

**Testing Keys** (always fail):
- Site Key: `2x00000000000000000000AB`
- Secret Key: `2x0000000000000000000000000000000AB`

### C. Configure Your Tailscale Database Connection

The API route already has Tailscale-compatible SSL settings. Just set:

```bash
# Vercel environment variable
POSTGRES_URL=postgresql://user:password@your-tailscale-hostname:5432/dbname
```

**SSL Configuration** (already in `submit-demo.ts`):
```typescript
ssl: {
  rejectUnauthorized: false // Required for Tailscale certificates
}
```

---

## How It Works Together

**Request Flow**:

1. **User opens form** → Turnstile widget loads and renders challenge
2. **User fills form** → Turnstile generates token on completion
3. **User submits** → POST to `/api/submit-demo`
4. **Middleware checks rate limit** → Returns 429 if exceeded
5. **API verifies Turnstile token** → Returns 403 if invalid
6. **API validates input** → Returns 400 if malformed
7. **API inserts to database** → Via Tailscale proxy to Postgres
8. **Success response** → User sees confirmation

---

## Security Features

✅ **Rate limiting** - Prevents brute-force spam  
✅ **CAPTCHA verification** - Blocks automated bots  
✅ **Input validation** - Prevents injection attacks  
✅ **Input sanitization** - Strips malicious content  
✅ **Parameterized queries** - SQL injection protection (postgres.js)  
✅ **SSL/TLS** - Encrypted database connection via Tailscale  
✅ **Email fallback** - Resilient to database failures  

---

## Monitoring

**Rate limit headers** (added by middleware):
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 2026-02-15T12:34:56.789Z
Retry-After: 42
```

**Turnstile error codes**:
- `missing-input-secret` - Secret key not provided
- `invalid-input-secret` - Secret key invalid
- `missing-input-response` - Token not provided
- `invalid-input-response` - Token invalid or expired
- `timeout-or-duplicate` - Token already used or expired

**Logs to check**:
```bash
# Vercel logs
vercel logs canopy-website

# Check for:
# - "Turnstile verification failed"
# - "TURNSTILE_SECRET_KEY not configured"
# - "Rate limited: <IP>"
```

---

## Upgrading to Production-Scale Protection

For high-traffic scenarios, consider:

1. **@vercel/kv** for distributed rate limiting:
   ```bash
   npm install @vercel/kv
   ```

2. **Vercel Firewall** (paid tier):
   - DDoS protection at edge
   - Geo-blocking
   - Advanced rate limiting

3. **Cloudflare Pro** (if using CF proxy):
   - WAF rules
   - Bot Fight Mode
   - Advanced DDoS protection

---

## Testing Checklist

- [ ] Turnstile widget renders in form
- [ ] Form submission blocked without completing challenge
- [ ] Valid token allows submission through
- [ ] Rate limit kicks in after 5 requests
- [ ] 429 response includes `Retry-After` header
- [ ] Environment variables set in Vercel
- [ ] Database connection works via Tailscale
- [ ] Email fallback works when DB fails
