import mysql from "mysql2/promise";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config.js";
import { logger } from "./logger.js";

import bcryptjs from "bcryptjs";
import axios from "axios";

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

export async function upgradeLegacyHashes(connection: mysql.PoolConnection): Promise<void> {
  logger.info("⚙️ Checking for legacy SHA-256 password hashes to upgrade...");
  
  // 1. Check local MySQL users table
  try {
    const [users] = await connection.execute<any[]>("SELECT id, password_hash FROM users");
    for (const user of users) {
      const hash = user.password_hash;
      // Detect 64-char hexadecimal string (SHA-256)
      if (hash && /^[0-9a-fA-F]{64}$/.test(hash)) {
        const bcryptHash = await bcryptjs.hash(hash, 10);
        await connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", [bcryptHash, user.id]);
        logger.info({ userId: user.id }, "✅ Upgraded legacy SHA-256 password hash to bcrypt in MySQL");
      }
    }
  } catch (err: any) {
    logger.debug({ error: err.message }, "Local MySQL users table check skipped or failed");
  }

  // 2. Check Supabase users table
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const response = await axios.get(
        `${env.SUPABASE_URL}/rest/v1/users?select=id,password_hash`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      const supabaseUsers = response.data;
      if (Array.isArray(supabaseUsers)) {
        for (const user of supabaseUsers) {
          const hash = user.password_hash;
          if (hash && /^[0-9a-fA-F]{64}$/.test(hash)) {
            const bcryptHash = await bcryptjs.hash(hash, 10);
            await axios.patch(
              `${env.SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(user.id)}`,
              { password_hash: bcryptHash },
              {
                headers: {
                  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                  "Content-Type": "application/json",
                  Prefer: "return=representation"
                }
              }
            );
            logger.info({ userId: user.id }, "✅ Upgraded legacy SHA-256 password hash to bcrypt in Supabase");
          }
        }
      }
    } catch (err: any) {
      logger.error({ error: err.message }, "❌ Failed to check or upgrade legacy SHA-256 password hashes in Supabase");
    }
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

    // 5. Run startup password hash upgrades
    await upgradeLegacyHashes(connection);
  } catch (err) {
    logger.error({ error: err }, "❌ Migration runner encountered a fatal error");
    throw err;
  } finally {
    connection.release();
  }
}
