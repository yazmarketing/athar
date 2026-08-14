import "server-only";
import { Pool, types } from "pg";

// pg returns numeric/int8 columns as strings; the app expects numbers
// (cost, seed, qc_score). Seeds stay below 2^31 + 4 so Number is safe.
types.setTypeParser(types.builtins.NUMERIC, parseFloat);
types.setTypeParser(types.builtins.INT8, Number);

let pool: Pool | null = null;

/**
 * Lazily-created connection pool for DigitalOcean Managed Postgres.
 * Server-only — never import from client code.
 */
export function db(): Pool {
  if (!pool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) {
      throw new Error("Missing DATABASE_URL env var");
    }
    // Strip sslmode from the URL — pg can ignore our ssl option when the
    // query string still says sslmode=require (which verifies the DO CA).
    const connectionString = raw
      .replace(/[?&]sslmode=[^&]*/g, "")
      .replace(/\?$/, "");
    const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
    pool = new Pool({
      connectionString,
      max: 5,
      // DO Managed Postgres uses a CA Node does not trust by default.
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}
