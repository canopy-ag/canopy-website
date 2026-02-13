import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { DemoSubmissionSchema, formatValidationErrors } from '../../lib/schema';

/**
 * Demo Form Submission API
 * 
 * Accepts demo requests, validates input, and persists to PostgreSQL.
 * Includes optional email notification via Resend.
 */

// Initialize connection pool
const pool = new Pool({
  connectionString: import.meta.env.DATABASE_URL,
  max: parseInt(import.meta.env.DATABASE_MAX_CONNECTIONS || '5'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: import.meta.env.PROD ? { rejectUnauthorized: false } : false,
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

/**
 * POST /api/submit-demo
 * Submit a new demo request
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let client;
  
  try {
    // Check if database is configured
    if (!import.meta.env.DATABASE_URL) {
      console.error('DATABASE_URL not configured');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Service temporarily unavailable' 
        }),
        { 
          status: 503, 
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          } 
        }
      );
    }

    // Parse and validate request body
    let rawData;
    try {
      rawData = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Invalid JSON in request body' 
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

    const validationResult = DemoSubmissionSchema.safeParse(rawData);
    
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Validation failed', 
          errors: formatValidationErrors(validationResult.error)
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
            <p><strong>Company:</strong> ${escapeHtml(data.companyName)}</p>
            <p><strong>Contact:</strong> ${escapeHtml(data.contactName)}</p>
            <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
            <p><strong>Phone:</strong> ${escapeHtml(data.phone) || 'N/A'}</p>
            <p><strong>Company Size:</strong> ${escapeHtml(data.companySize) || 'N/A'}</p>
            <p><strong>Message:</strong> ${escapeHtml(data.message) || 'N/A'}</p>
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

/**
 * GET /api/submit-demo
 * Health check endpoint
 */
export const GET: APIRoute = async () => {
  let client;
  
  try {
    // Check if database is configured
    if (!import.meta.env.DATABASE_URL) {
      return new Response(
        JSON.stringify({ 
          status: 'unhealthy',
          database: 'not_configured',
          timestamp: new Date().toISOString()
        }),
        { 
          status: 503, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    
    client = await pool.connect();
    await client.query('SELECT 1');
    
    return new Response(
      JSON.stringify({ 
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Health check failed:', error);
    
    return new Response(
      JSON.stringify({ 
        status: 'unhealthy',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
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

/**
 * Escape HTML to prevent XSS in emails
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
