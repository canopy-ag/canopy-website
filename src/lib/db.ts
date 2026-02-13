import { Pool, PoolClient } from 'pg';

/**
 * PostgreSQL Connection Pool for Canopy Website
 * 
 * Uses environment variable DATABASE_URL for connection.
 * Pool is shared across requests for connection efficiency.
 */

// Validate environment
if (!import.meta.env.DATABASE_URL) {
  console.warn('DATABASE_URL not set. Database operations will fail.');
}

// Connection pool configuration
const pool = new Pool({
  connectionString: import.meta.env.DATABASE_URL,
  max: parseInt(import.meta.env.DATABASE_MAX_CONNECTIONS || '5'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // SSL configuration for Tailscale/production
  ssl: import.meta.env.PROD ? { rejectUnauthorized: false } : false,
});

// Connection error handling
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

// Graceful shutdown handlers (Node.js environment only)
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing database pool...');
    await pool.end();
  });
  
  process.on('SIGINT', async () => {
    console.log('SIGINT received, closing database pool...');
    await pool.end();
  });
}

/**
 * Test database connectivity
 */
export async function testConnection(): Promise<boolean> {
  let client: PoolClient | null = null;
  
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Get a client from the pool (remember to release!)
 */
export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

export { pool };
export type { PoolClient };
