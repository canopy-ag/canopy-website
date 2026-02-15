import type { APIRoute } from 'astro';
import postgres from 'postgres';
import { verifyTurnstileToken } from '../../lib/turnstile';

// Database connection singleton
let sqlClient: ReturnType<typeof postgres> | null = null;

function getSqlClient() {
  if (!sqlClient) {
    const connectionString = import.meta.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('POSTGRES_URL environment variable is not configured');
    }
    
    sqlClient = postgres(connectionString, {
      max: 10, // Connection pool size
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: {
        rejectUnauthorized: false // Required for Tailscale certificates
      }
    });
  }
  return sqlClient;
}

// Input validation helper
function validateInput(data: Record<string, unknown>): { valid: boolean; error?: string } {
  // Required fields
  if (!data.companyName || typeof data.companyName !== 'string' || data.companyName.trim().length < 2) {
    return { valid: false, error: 'Company name is required (min 2 characters)' };
  }
  
  if (!data.contactName || typeof data.contactName !== 'string' || data.contactName.trim().length < 2) {
    return { valid: false, error: 'Contact name is required (min 2 characters)' };
  }
  
  if (!data.email || typeof data.email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  // Turnstile token validation
  if (!data.turnstileToken || typeof data.turnstileToken !== 'string') {
    return { valid: false, error: 'Bot verification failed. Please refresh and try again.' };
  }
  
  // Optional field validations
  if (data.phone && typeof data.phone === 'string' && data.phone.length > 50) {
    return { valid: false, error: 'Phone number too long' };
  }
  
  if (data.companySize && typeof data.companySize === 'string' && data.companySize.length > 50) {
    return { valid: false, error: 'Company size value too long' };
  }
  
  if (data.message && typeof data.message === 'string' && data.message.length > 5000) {
    return { valid: false, error: 'Message too long (max 5000 characters)' };
  }
  
  return { valid: true };
}

// Sanitize input to prevent injection
function sanitizeInput(str: string | undefined | null): string | null {
  if (!str || typeof str !== 'string') return null;
  return str.trim().slice(0, 5000); // Limit length
}

export const POST: APIRoute = async ({ request }) => {
  let sql: ReturnType<typeof postgres> | null = null;
  
  try {
    // Parse request body
    let data: Record<string, unknown>;
    try {
      data = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate input
    const validation = validateInput(data);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify Turnstile token
    const turnstileSecret = import.meta.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                 request.headers.get('x-real-ip');
      
      const turnstileResult = await verifyTurnstileToken(
        data.turnstileToken as string,
        turnstileSecret,
        ip || undefined
      );

      if (!turnstileResult.success) {
        console.error('Turnstile verification failed:', turnstileResult.errorCodes);
        return new Response(
          JSON.stringify({ 
            error: 'Bot verification failed. Please refresh the page and try again.' 
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.warn('TURNSTILE_SECRET_KEY not configured - skipping bot verification');
    }

    // Get client info for audit trail
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
               request.headers.get('x-real-ip') || 
               'unknown';
    const userAgent = sanitizeInput(request.headers.get('user-agent'));
    const referrer = sanitizeInput(request.headers.get('referer'));

    // Sanitize form data
    const companyName = sanitizeInput(data.companyName as string)!;
    const contactName = sanitizeInput(data.contactName as string)!;
    const email = sanitizeInput(data.email as string)!;
    const phone = sanitizeInput(data.phone as string);
    const companySize = sanitizeInput(data.companySize as string);
    const message = sanitizeInput(data.message as string);

    // Check if database is configured
    if (!import.meta.env.POSTGRES_URL) {
      console.warn('POSTGRES_URL not configured, falling back to email-only mode');
      
      // Fallback: Send email notification
      if (import.meta.env.RESEND_API_KEY) {
        const { Resend } = await import('resend');
        const resend = new Resend(import.meta.env.RESEND_API_KEY);
        
        await resend.emails.send({
          from: 'Canopy Website <hello@canopy.ag>',
          to: ['hello@canopy.ag'],
          subject: `Demo Request: ${companyName}`,
          html: `
            <h2>New Demo Request (DB Not Connected)</h2>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>Contact:</strong> ${contactName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
            <p><strong>Company Size:</strong> ${companySize || 'N/A'}</p>
            <p><strong>Message:</strong> ${message || 'N/A'}</p>
            <p><em>Note: Database connection not configured. Store this manually.</em></p>
          `,
        });
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Thank you! We will be in touch within 24 hours.'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Connect to database and insert submission
    try {
      sql = getSqlClient();
      
      const result = await sql`
        INSERT INTO demo_submissions 
          (company_name, contact_name, email, phone, company_size, message, ip_address, user_agent, referrer)
        VALUES 
          (${companyName}, ${contactName}, ${email}, ${phone}, ${companySize}, ${message}, ${ip}, ${userAgent}, ${referrer})
        RETURNING id, submitted_at
      `;

      console.log(`Demo submission stored: ${result[0]?.id}`);

      // Also send email notification (non-blocking)
      if (import.meta.env.RESEND_API_KEY) {
        const { Resend } = await import('resend');
        const resend = new Resend(import.meta.env.RESEND_API_KEY);
        
        resend.emails.send({
          from: 'Canopy Website <hello@canopy.ag>',
          to: ['hello@canopy.ag'],
          subject: `Demo Request: ${companyName}`,
          html: `
            <h2>New Demo Request</h2>
            <p><strong>ID:</strong> ${result[0]?.id}</p>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>Contact:</strong> ${contactName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
            <p><strong>Company Size:</strong> ${companySize || 'N/A'}</p>
            <p><strong>Message:</strong> ${message || 'N/A'}</p>
          `,
        }).catch((err: Error) => console.error('Email notification failed:', err));
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          id: result[0]?.id,
          message: 'Thank you! We will be in touch within 24 hours.'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
      
    } catch (dbError) {
      console.error('Database error:', dbError);
      
      // Database connection failed - fallback to email
      if (import.meta.env.RESEND_API_KEY) {
        const { Resend } = await import('resend');
        const resend = new Resend(import.meta.env.RESEND_API_KEY);
        
        await resend.emails.send({
          from: 'Canopy Website <hello@canopy.ag>',
          to: ['hello@canopy.ag'],
          subject: `Demo Request (DB Failed): ${companyName}`,
          html: `
            <h2>New Demo Request (Database Error)</h2>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>Contact:</strong> ${contactName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
            <p><strong>Company Size:</strong> ${companySize || 'N/A'}</p>
            <p><strong>Message:</strong> ${message || 'N/A'}</p>
            <p><em>Error: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}</em></p>
          `,
        });
      }
      
      // Return success to user (we have the data via email) but log the issue
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Thank you! We will be in touch within 24 hours.'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Form submission error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Something went wrong. Please try again or email us directly at hello@canopy.ag'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    // Note: We don't close the connection here to allow connection pooling
    // The connection will be reused for subsequent requests
  }
};
