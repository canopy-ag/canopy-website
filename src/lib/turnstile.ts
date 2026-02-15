/**
 * Cloudflare Turnstile Server-Side Verification
 * 
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify Turnstile token server-side
 * 
 * @param token - The Turnstile token from the client
 * @param secretKey - Your Cloudflare Turnstile secret key
 * @param remoteip - Optional: Client IP address for additional verification
 * @returns Promise resolving to verification result
 */
export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteip?: string
): Promise<{ success: boolean; errorCodes?: string[] }> {
  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteip) {
      formData.append('remoteip', remoteip);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Turnstile verification HTTP error: ${response.status}`);
    }

    const data: TurnstileVerifyResponse = await response.json();

    return {
      success: data.success,
      errorCodes: data['error-codes'],
    };
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return {
      success: false,
      errorCodes: ['internal-error'],
    };
  }
}
