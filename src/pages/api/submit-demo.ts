import type { APIRoute } from 'astro';

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

    // Call the database API
    // In production, this would connect to your Tailscale-exposed PostgreSQL
    // For now, we'll store in a queue or send to a webhook
    
    // Option 1: Direct PostgreSQL connection (requires @vercel/postgres or similar)
    // const { sql } = await import('@vercel/postgres');
    // await sql`INSERT INTO demo_submissions ...`;

    // Option 2: Webhook to your home lab
    if (import.meta.env.HOME_LAB_WEBHOOK_URL) {
      const webhookResponse = await fetch(import.meta.env.HOME_LAB_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          ipAddress: ip,
          userAgent,
          referrer,
          submittedAt: new Date().toISOString(),
        }),
      });

      if (!webhookResponse.ok) {
        throw new Error('Failed to forward to home lab');
      }
    }

    // Option 3: Send email as fallback
    if (import.meta.env.RESEND_API_KEY) {
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
