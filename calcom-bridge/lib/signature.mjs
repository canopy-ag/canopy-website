import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Cal.com signs every webhook with X-Cal-Signature-256: the lowercase hex
 * HMAC-SHA256 of the exact raw request body, keyed by the webhook's secret
 * (Cal.diy packages/features/webhooks/lib/sendPayload.ts). Verify over the raw
 * bytes, never a re-serialised object, and in constant time.
 */
export function signatureValid(raw, header, secret) {
  if (!secret || typeof header !== 'string' || !/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const given = Buffer.from(header, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
