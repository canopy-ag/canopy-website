import postgres from 'postgres';

/**
 * PostgreSQL Connection for Canopy Website
 * 
 * Uses environment variable POSTGRES_URL for connection.
 * Connection is pooled automatically by the postgres client.
 */

// Validate environment
if (!import.meta.env.POSTGRES_URL) {
  console.warn('POSTGRES_URL not set. Database operations will fail.');
}

// Create sql client with connection pooling
const sql = import.meta.env.POSTGRES_URL 
  ? postgres(import.meta.env.POSTGRES_URL, {
      max: parseInt(import.meta.env.DATABASE_MAX_CONNECTIONS || '10'),
      idle_timeout: 20,
      connect_timeout: 10,
      // SSL configuration for Tailscale/production
      ssl: {
        rejectUnauthorized: false
      }
    })
  : null;

/**
 * Test database connectivity
 */
export async function testConnection(): Promise<boolean> {
  if (!sql) {
    console.warn('Database not configured (POSTGRES_URL missing)');
    return false;
  }
  
  try {
    await sql`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Get the sql client for database operations
 */
export function getSql() {
  if (!sql) {
    throw new Error('Database not configured. Set POSTGRES_URL environment variable.');
  }
  return sql;
}

export { sql };
export default sql;
