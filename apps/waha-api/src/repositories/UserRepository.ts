import { pool } from "../db.js";
import { User, UserRole, Persona } from "../models/User.js";

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  default_persona: Persona;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    defaultPersona: row.default_persona,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const [rows] = await pool.execute<any[]>(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) return null;
    return mapRow(rows[0] as UserRow);
  }

  async findById(id: string): Promise<User | null> {
    const [rows] = await pool.execute<any[]>(
      "SELECT * FROM users WHERE id = ? LIMIT 1",
      [id]
    );

    if (rows.length === 0) return null;
    return mapRow(rows[0] as UserRow);
  }
}
