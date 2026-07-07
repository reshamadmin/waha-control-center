import mysql from "mysql2/promise";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config.js";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  multipleStatements: true // Enable executing multiple statements in migrations
});

export async function checkDatabaseConnection(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function runMigrations(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    // 1. Create tracking table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
        \`version\` VARCHAR(255) PRIMARY KEY,
        \`executed_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Read migration directory
    const migrationsDir = path.resolve(__dirname, "../../../../migrations");
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

    // 3. Fetch executed migrations
    const [rows] = await connection.execute<any[]>("SELECT version FROM schema_migrations");
    const executed = new Set(rows.map((r) => r.version));

    // 4. Execute pending migrations atomically
    for (const file of sqlFiles) {
      if (executed.has(file)) continue;

      logger.info({ file }, "⚙️ Starting atomic migration execution");
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, "utf8");

      // Wrap in atomic database transaction
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.execute("INSERT INTO schema_migrations (version) VALUES (?)", [file]);
        await connection.commit();
        logger.info({ file }, "✅ Migration committed successfully");
      } catch (err) {
        await connection.rollback();
        logger.error({ file, error: err }, "❌ Migration failed, transaction rolled back");
        throw err;
      }
    }
  } catch (err) {
    logger.error({ error: err }, "❌ Migration runner encountered a fatal error");
    throw err;
  } finally {
    connection.release();
  }
}
