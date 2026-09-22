import { readFile } from "node:fs/promises";
import pg from "pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('uuc-schema'))");
  await client.query(
    await readFile(new URL("../sql/001-schema.sql", import.meta.url), "utf8"),
  );
  await client.query("COMMIT");
  console.log("Schema ready. Existing rows preserved.");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
