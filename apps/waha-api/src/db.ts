import mysql from "mysql2/promise";
import { env } from "./config.js";

export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

export async function checkDatabaseConnection(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}
