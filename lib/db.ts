import mysql from 'mysql2/promise';

// Reuse a single mysql2 pool across hot reloads in dev and across requests in prod.
const globalForDb = globalThis as unknown as { __mysqlPool?: mysql.Pool };

export function getPool(): mysql.Pool {
  if (!globalForDb.__mysqlPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    globalForDb.__mysqlPool = mysql.createPool(url);
  }
  return globalForDb.__mysqlPool;
}
