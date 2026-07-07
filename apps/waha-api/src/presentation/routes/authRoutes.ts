import { Router } from "express";
import { z } from "zod";
import { UserRepository } from "../../infrastructure/repositories/UserRepository.js";
import { 
  verifyPassword, 
  generateToken, 
  setSessionCookie, 
  clearSessionCookie, 
  requireAuth 
} from "../../application/auth.js";

const router = Router();
const userRepository = new UserRepository();

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required.")
});

// POST /auth/login
router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map((i) => i.message).join("; ")
      });
      return;
    }

    const { email, password } = parsed.data;
    const user = await userRepository.findByEmail(email);

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({
        status: "error",
        code: "UNAUTHORIZED",
        message: "Invalid email or password."
      });
      return;
    }

    const tokenPayload = {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      defaultPersona: user.defaultPersona
    };

    const token = generateToken(tokenPayload);
    setSessionCookie(res, token);

    res.json({
      status: "success",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        defaultPersona: user.defaultPersona
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout
router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ status: "success" });
});

// GET /auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({
    status: "success",
    user: res.locals.authUser
  });
});

export { router as authRouter };
