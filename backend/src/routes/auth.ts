import { Router, type NextFunction, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generateDisplayCode } from "../lib/displayCode.js";
import { signAccessToken } from "../lib/jwt.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

const registerSchema = z.object({
  email: z.string().email().transform((value: string) => value.trim().toLowerCase()),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
  fullName: z.string().min(2, "Informe o nome completo."),
  role: z.enum(["admin", "technician", "partner", "client"]).default("admin"),
});

const loginSchema = z.object({
  email: z.string().email().transform((value: string) => value.trim().toLowerCase()),
  password: z.string().min(1, "A senha é obrigatória."),
});

const changePasswordSchema = z.object({
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

export const authRouter = Router();

authRouter.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = registerSchema.parse(req.body);
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({ message: "Já existe um usuário com este e-mail." });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const displayCode = await generateDisplayCode(input.role);
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdUser = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          role: input.role,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      });

      await tx.appUser.create({
        data: {
          authUserId: createdUser.id,
          email: createdUser.email,
          name: createdUser.fullName,
        },
      });

      await tx.profile.create({
        data: {
          id: createdUser.id,
          fullName: createdUser.fullName,
          email: createdUser.email,
          displayCode,
          isSystemOwner: createdUser.email.toLowerCase() === "qwork@qworkgroup.com",
        },
      });

      await tx.userRole.create({
        data: {
          userId: createdUser.id,
          role: input.role,
        },
      });

      return createdUser;
    });

    const token = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return res.status(201).json({
      token,
      user,
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    const token = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth?.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/change-password", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const input = changePasswordSchema.parse((req as AuthenticatedRequest & { body: unknown }).body);

    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.user.update({
      where: { id: req.auth?.userId },
      data: { passwordHash },
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});
