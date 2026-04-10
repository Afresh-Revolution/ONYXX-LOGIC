import pg from "pg";
import { assertDb, config } from "./config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  assertDb();
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
    });
  }
  return pool;
}
