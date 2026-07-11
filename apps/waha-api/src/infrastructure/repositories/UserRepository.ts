import axios from "axios";
import { env } from "../config.js";
import { User, UserRole, Persona } from "../../domain/User.js";
import { logger } from "../logger.js";

function mapSupabaseRole(supabaseRole: string): { role: UserRole; defaultPersona: Persona } {
  const roleLower = String(supabaseRole || "").toLowerCase();
  if (roleLower === "admin") {
    return { role: "ADMIN", defaultPersona: "ADMIN" };
  } else if (roleLower === "cxo") {
    return { role: "CXO", defaultPersona: "CXO" };
  } else {
    return { role: "USER", defaultPersona: "CRM" };
  }
}

function mapSupabaseRow(row: any): User {
  const { role, defaultPersona } = mapSupabaseRole(row.role);
  return {
    id: row.id,
    name: row.name || row.email,
    email: row.email,
    passwordHash: row.password_hash || "",
    role,
    defaultPersona,
    createdAt: new Date(row.created_at || Date.now()),
    updatedAt: new Date(row.updated_at || Date.now())
  };
}

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await axios.get(
        `${env.SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(normalizedEmail)}&select=*`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      
      const rows = response.data;
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }
      
      return mapSupabaseRow(rows[0]);
    } catch (err: any) {
      logger.error({ error: err.message, email }, "Failed to fetch user from Supabase");
      return null;
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      const response = await axios.get(
        `${env.SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(id)}&select=*`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      
      const rows = response.data;
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }
      
      return mapSupabaseRow(rows[0]);
    } catch (err: any) {
      logger.error({ error: err.message, id }, "Failed to fetch user from Supabase");
      return null;
    }
  }
}
