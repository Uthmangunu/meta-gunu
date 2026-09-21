import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing required environment variable DATABASE_URL");
const sql = await readFile(resolve(process.cwd(), "services/gateway/db/001_initial.sql"), "utf8");
const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query(sql);
  console.log("Database migration complete");
} finally {
  await pool.end();
}
