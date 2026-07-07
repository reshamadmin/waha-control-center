export type UserRole = "ADMIN" | "USER" | "CXO";
export type Persona = "CRM" | "SERVICE" | "ADMIN" | "CXO";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  defaultPersona: Persona;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedUserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  defaultPersona: Persona;
}
