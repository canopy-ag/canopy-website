import type { MiddlewareHandler } from 'astro';

/**
 * In-memory rate limiter for demo form submissions
 * 
 * For production with multiple serverless instances, use @vercel/kv or Vercel Edge Config
 * This implementation works for single-instance or low-traffic scenarios
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Rate limit storage (in-memory)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 5; // 5 requests per minute per IP

/**
 * Clean up expired entries every 5 minutes to prevent memory leak
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if request should be rate limited
 */
function checkRateLimit(identifier: string): { limited: boolean; remainingRequests: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);
  
  // No entry or expired entry - create new one
  if (!entry || entry.resetAt < now) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(identifier, { count: 1, resetAt });
    return { limited: false, remainingRequests: MAX_REQUESTS_PER_WINDOW - 1, resetAt };
  }
  
  // Increment count
  entry.count++;
  rateLimitStore.set(identifier, entry);
  
  // Check if over limit
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return { limited: true, remainingRequests: 0, resetAt: entry.resetAt };
  }
  
  return { limited: false, remainingRequests: MAX_REQUESTS_PER_WINDOW - entry.count, resetAt: entry.resetAt };
}

/**
 * Middleware to rate limit API routes
 */
export const onRequest: MiddlewareHandler = async ({ request, locals }, next) => {
  const url = new URL(request.url);
  
  // Only rate limit the demo submission endpoint
  if (url.pathname === '/api/submit-demo' && request.method === 'POST') {
    // Get client IP from headers (Vercel provides x-forwarded-for)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    // Check rate limit
    const { limited, remainingRequests, resetAt } = checkRateLimit(ip);
    
    if (limited) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      
      return new Response(
        JSON.stringify({ 
          error: 'Too many requests. Please wait a moment before trying again.',
          retryAfter 
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': MAX_REQUESTS_PER_WINDOW.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(resetAt).toISOString(),
          },
        }
      );
    }
    
    // Add rate limit info to response headers (will be added by the API route)
    locals.rateLimit = {
      remaining: remainingRequests,
      reset: resetAt,
    };
  }
  
  return next();
};
