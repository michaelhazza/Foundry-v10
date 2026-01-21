/**
 * Database connection setup
 * CRITICAL: Uses postgres-js driver as mandated by Constitution Section D
 * @see Architecture Section 2.3, Data Model Section 7
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Environment validation
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create postgres client
const client = postgres(process.env.DATABASE_URL, {
  max: 10, // Maximum 10 connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Fail fast on connection issues
  ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined,
});

// Create Drizzle ORM instance
export const db = drizzle(client, { schema });

/**
 * Test database connection
 * Call during server startup to fail fast
 */
export async function testConnection(): Promise<void> {
  try {
    await client`SELECT 1 as test`;
    console.log('Database connection established');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

/**
 * Close database connection
 * Call during graceful shutdown
 */
export async function closeConnection(): Promise<void> {
  await client.end();
  console.log('Database connection closed');
}

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database connection...');
  await closeConnection();
  process.exit(0);
});
