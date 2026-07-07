import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  WAHA_BASE_URL: z.string().url().default("http://localhost:3001"),
  WAHA_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"),
  PUBLIC_WEB_ORIGIN: z.string().url().default("http://localhost:3003"),
  SESSION_COOKIE_NAME: z.string().default("session_token")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Environment validation error:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
