import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { env } from "./config.js";
import { UserRepository } from "./repositories/UserRepository.js";
import { UserRole, Persona } from "./models/User.js";
import { logger } from "./logger.js";

const userRepository = new UserRepository();

export interface JwtPayload {
  sub: string;
  name: string;
  email: string;
  role: UserRole;
  defaultPersona: Persona;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.PUBLIC_WEB_ORIGIN.startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
};

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.SESSION_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.SESSION_SECRET) as JwtPayload;
  } catch (err: any) {
    logger.debug({ error: err.message }, "Token verification failed");
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

export function getAuthenticatedUser(req: Request): JwtPayload | null {
  let token = null;

  const cookies = parseCookies(req.headers.cookie);
  if (cookies[env.SESSION_COOKIE_NAME]) {
    token = cookies[env.SESSION_COOKIE_NAME];
  }

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
    logger.warn("Authentication failed: session token is missing or invalid");
    res.status(401).json({
      status: "error",
      code: "UNAUTHORIZED",
      message: "Authentication required."
    });
    return;
  }

  const dbUser = await userRepository.findById(jwtUser.sub);
  if (!dbUser) {
    logger.warn({ userId: jwtUser.sub }, "Authentication failed: user no longer exists in database");
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
