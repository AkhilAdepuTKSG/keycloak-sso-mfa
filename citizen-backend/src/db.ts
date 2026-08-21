import { Pool } from "pg";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { config } from "./config";
import { logger } from "./http";

export const pool = new Pool({ connectionString: config.databaseUrl });

// Separate tracking table — this backend shares appdb with the workforce
// backend, so its migrations are tracked independently.
const MIGRATIONS_TABLE = "citizen_schema_migrations";

async function waitForDb(): Promise<void> {
  for (let i = 1; i <= 20; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch {
      logger.info("db not ready", { attempt: i });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("database not reachable");
}

export async function migrate(): Promise<void> {
  await waitForDb();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const dir = join(__dirname, "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const done = await pool.query(`SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE name=$1`, [file]);
    if (done.rowCount) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO ${MIGRATIONS_TABLE}(name) VALUES($1)`, [file]);
      await client.query("COMMIT");
      logger.info("migration applied", { name: file });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
