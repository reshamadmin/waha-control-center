import jwt from "jsonwebtoken";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "./config.js";
import { UserRepository } from "./repositories/UserRepository.js";
import { UserRole, Persona } from "./models/User.js";

const userRepository = new UserRepository();

export interface JwtPayload {
  sub: string;
  name: string;
  email: string;
  role: UserRole;
  defaultPersona: Persona;
}

// Cookie setting parameters
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.PUBLIC_WEB_ORIGIN.startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
};

export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  const inputHash = hashPassword(password);
  const inputBuffer = Buffer.from(inputHash, "utf8");
  const targetBuffer = Buffer.from(hash, "utf8");

  if (inputBuffer.length !== targetBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, targetBuffer);
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.SESSION_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.SESSION_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(env.SESSION_COOKIE_NAME, token, COOKIE_OPTIONS);
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.PUBLIC_WEB_ORIGIN.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/"
  });
}

// Middleware: Extract user cookie from cookies or Auth Bearer header
export function getAuthenticatedUser(req: Request): JwtPayload | null {
  let token = null;

  // Extract from Cookie
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[env.SESSION_COOKIE_NAME]) {
    token = cookies[env.SESSION_COOKIE_NAME];
  }

  // Fallback: Authorization header (for APIs/n8n triggers)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const jwtUser = getAuthenticatedUser(req);
  if (!jwtUser) {
    res.status(401).json({
      status: "error",
      code: "UNAUTHORIZED",
      message: "Authentication required."
    });
    return;
  }

  // Lookup in DB to verify user still exists and role hasn't changed
  const dbUser = await userRepository.findById(jwtUser.sub);
  if (!dbUser) {
    res.status(401).json({
      status: "error",
      code: "UNAUTHORIZED",
      message: "Session user no longer exists."
    });
    return;
  }

  res.locals.authUser = {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    role: dbUser.role,
    defaultPersona: dbUser.defaultPersona
  };

  next();
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, cookie) => {
      const [name, ...rest] = cookie.split("=");
      if (name) acc[name] = decodeURIComponent(rest.join("="));
      return acc;
    }, {});
}
