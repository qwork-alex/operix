import { Router, type NextFunction, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { buildBillingContext } from "../lib/subscription.js";

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(120),
  legalName: z.string().min(2).max(200),
  billingEmail: z.string().email(),
  vatNumber: z.string().max(50).optional().nullable(),
  country: z.string().min(2).max(2).default("PT"),
});

export const workspaceRouter = Router();

workspaceRouter.use(requireAuth);

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

workspaceRouter.post("/", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const input = createWorkspaceSchema.parse((req as AuthenticatedRequest & { body: unknown }).body);

    const appUser = await prisma.appUser.findUnique({
      where: { authUserId: req.auth!.userId },
      select: { id: true, workspaceId: true },
    });

    if (!appUser) {
      return res.status(404).json({ message: "App user not found." });
    }

    const workspace = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdWorkspace = await tx.workspace.create({
        data: {
          name: input.name.trim(),
          ownerUserId: appUser.id,
        },
      });

      await tx.membership.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: createdWorkspace.id,
            userId: appUser.id,
          },
        },
        update: {
          role: "admin",
          status: "active",
          source: "onboarding",
        },
        create: {
          workspaceId: createdWorkspace.id,
          userId: appUser.id,
          role: "admin",
          status: "active",
          source: "onboarding",
        },
      });

      await tx.billingProfile.upsert({
        where: { workspaceId: createdWorkspace.id },
        update: {
          legalName: input.legalName.trim(),
          billingEmail: input.billingEmail.trim().toLowerCase(),
          vatNumber: input.vatNumber?.trim() || null,
          country: input.country.toUpperCase(),
          isBusiness: true,
          companyName: input.legalName.trim(),
        },
        create: {
          workspaceId: createdWorkspace.id,
          legalName: input.legalName.trim(),
          billingEmail: input.billingEmail.trim().toLowerCase(),
          vatNumber: input.vatNumber?.trim() || null,
          country: input.country.toUpperCase(),
          isBusiness: true,
          companyName: input.legalName.trim(),
        },
      });

      await tx.appUser.update({
        where: { id: appUser.id },
        data: { workspaceId: createdWorkspace.id },
      });

      await tx.workspaceSubscription.upsert({
        where: { workspaceId: createdWorkspace.id },
        update: {
          planCode: "starter",
          status: "trial",
          billingCycle: "monthly",
          trialStartedAt: new Date(),
          trialEndsAt: addDays(new Date(), 14),
        },
        create: {
          workspaceId: createdWorkspace.id,
          planCode: "starter",
          status: "trial",
          billingCycle: "monthly",
          trialStartedAt: new Date(),
          trialEndsAt: addDays(new Date(), 14),
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          workspaceId: createdWorkspace.id,
          eventType: "trial_started",
          severity: "info",
          message: "Workspace criada com periodo experimental ativo.",
        },
      });

      return createdWorkspace;
    });

    return res.status(201).json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        owner_user_id: workspace.ownerUserId,
      },
    });
  } catch (error) {
    return next(error);
  }
});

workspaceRouter.get("/:workspaceId/billing-context", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const paramsSchema = z.object({
      workspaceId: z.string().uuid(),
    });
    const { workspaceId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);

    const appUser = await prisma.appUser.findUnique({
      where: { authUserId: req.auth!.userId },
      select: { id: true },
    });

    if (!appUser) {
      return res.status(404).json({ message: "App user not found." });
    }

    const access = await prisma.membership.findFirst({
      where: {
        workspaceId,
        userId: appUser.id,
        status: "active",
      },
      select: { id: true },
    });

    if (!access && req.auth!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden." });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        createdAt: true,
        memberships: {
          where: { status: "active", role: "technician" },
          select: { id: true },
        },
        subscription: true,
      },
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found." });
    }

    return res.json(buildBillingContext({
      workspaceId: workspace.id,
      workspaceCreatedAt: workspace.createdAt,
      technicianCount: workspace.memberships.length,
      subscription: workspace.subscription,
    }));
  } catch (error) {
    return next(error);
  }
});

workspaceRouter.get("/:workspaceId/members", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const paramsSchema = z.object({
      workspaceId: z.string().uuid(),
    });
    const { workspaceId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);

    const appUser = await prisma.appUser.findUnique({
      where: { authUserId: req.auth!.userId },
      select: { id: true },
    });

    if (!appUser) {
      return res.status(404).json({ message: "App user not found." });
    }

    const access = await prisma.membership.findFirst({
      where: {
        workspaceId,
        userId: appUser.id,
        status: "active",
      },
      select: { id: true },
    });

    if (!access) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const members = await prisma.membership.findMany({
      where: { workspaceId },
      select: {
        id: true,
        role: true,
        status: true,
        userId: true,
        user: {
          select: {
            id: true,
            authUserId: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return res.json({
      members: members.map((membership: {
        id: string;
        userId: string;
        role: string;
        status: string;
        user: { authUserId: string; name: string | null; email: string; phone: string | null };
      }) => ({
        membership_id: membership.id,
        app_user_id: membership.userId,
        auth_user_id: membership.user.authUserId,
        name: membership.user.name,
        email: membership.user.email,
        phone: membership.user.phone,
        role: membership.role,
        status: membership.status,
      })),
    });
  } catch (error) {
    return next(error);
  }
});
