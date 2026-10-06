import "server-only";
import { Pool, types, type PoolClient } from "pg";
import { config } from "./config";

// Keep DATE columns as YYYY-MM-DD strings; JS Date would shift them by the server time zone.
types.setTypeParser(1082, (v) => v);

const globalForPool = globalThis as unknown as { lemansPool?: Pool };

export function pool(): Pool {
  if (!globalForPool.lemansPool) {
    globalForPool.lemansPool = new Pool({
      connectionString: config().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
    });
  }
  return globalForPool.lemansPool;
}

export type Db = Pick<PoolClient, "query">;

/** Run work in a single transaction; any thrown error rolls the whole unit back. */
export async function withTx<T>(work: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
