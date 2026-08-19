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

/**
 * Run a schema-guard exactly once per process.
 *
 * Every store guards itself with `create table if not exists` on each call, so
 * a fresh database works without anyone remembering to run migrations. The
 * guards are near-free on the server and expensive on the wire: each one is a
 * separate round trip, and against DigitalOcean Managed Postgres a round trip
 * is ~200ms. Listing the reference library was three trips — two of them
 * guards — which is why the picker sat empty for most of a second.
 *
 * Wrapping them here keeps the self-healing behaviour on the first call and
 * removes it from every call after. A failure is not cached, so a transient
 * error still retries.
 */
export function onceProcess<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = fn().catch((err) => {
        inFlight = null;
        throw err;
      });
    }
    return inFlight;
  };
}
