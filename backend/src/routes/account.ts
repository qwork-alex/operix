import { Router, type NextFunction, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { buildPermissionsForRole } from "../lib/permissionPolicy.js";

const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  avatar_url: z.string().max(500).nullable().optional(),
});

export const accountRouter = Router();

accountRouter.use(requireAuth);

function toDisplayRole(role: string | null) {
  switch (role) {
    case "admin":
      return "admin";
    case "partner":
      return "socio";
    case "technician":
      return "tecnico";
    case "client":
      return "cliente";
    default:
      return null;
  }
}

accountRouter.get("/profile", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: req.auth!.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        address: true,
        avatarUrl: true,
        displayCode: true,
      },
    });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found." });
    }

    return res.json({
      profile: {
        id: profile.id,
        full_name: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        avatar_url: profile.avatarUrl,
        display_code: profile.displayCode,
      },
    });
  } catch (error) {
    return next(error);
  }
});

accountRouter.patch("/profile", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const input = updateProfileSchema.parse((req as AuthenticatedRequest & { body: unknown }).body);

    const profile = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedProfile = await tx.profile.update({
        where: { id: req.auth!.userId },
        data: {
          fullName: input.full_name,
          phone: input.phone,
          address: input.address,
          avatarUrl: input.avatar_url,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          address: true,
          avatarUrl: true,
          displayCode: true,
        },
      });

      await tx.appUser.update({
        where: { authUserId: req.auth!.userId },
        data: {
          name: input.full_name,
          phone: input.phone,
        },
      });

      await tx.user.update({
        where: { id: req.auth!.userId },
        data: {
          fullName: input.full_name,
        },
      });

      return updatedProfile;
    });

    return res.json({
      profile: {
        id: profile.id,
        full_name: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        avatar_url: profile.avatarUrl,
        display_code: profile.displayCode,
      },
    });
  } catch (error) {
    return next(error);
  }
});

accountRouter.get("/role", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const querySchema = z.object({
      userId: z.string().uuid().optional(),
    });
    const { userId } = querySchema.parse((req as AuthenticatedRequest & { query: unknown }).query);
    const targetUserId = userId ?? req.auth!.userId;

    if (targetUserId !== req.auth!.userId && req.auth!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden." });
    }

    const userRole = await prisma.userRole.findUnique({
      where: { userId: targetUserId },
      select: { role: true },
    });

    return res.json({ role: userRole?.role ?? null });
  } catch (error) {
    return next(error);
  }
});

accountRouter.get("/workspaces", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const appUser = await prisma.appUser.findUnique({
      where: { authUserId: req.auth!.userId },
      select: {
        id: true,
        memberships: {
          where: { status: "active" },
          select: {
            workspaceId: true,
            role: true,
            status: true,
            workspace: {
              select: {
                id: true,
                name: true,
                ownerUserId: true,
              },
            },
          },
        },
      },
    });

    return res.json({
      appUserId: appUser?.id ?? null,
      workspaces:
        appUser?.memberships.map((membership: {
          workspaceId: string;
          role: string;
          status: string;
          workspace: { name: string; ownerUserId: string };
        }) => ({
          workspaceId: membership.workspaceId,
          workspaceName: membership.workspace.name,
          ownerAppUserId: membership.workspace.ownerUserId,
          membershipRole: membership.role,
          membershipStatus: membership.status,
        })) ?? [],
    });
  } catch (error) {
    return next(error);
  }
});

accountRouter.get("/context", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const querySchema = z.object({
      userId: z.string().uuid().optional(),
    });
    const { userId } = querySchema.parse((req as AuthenticatedRequest & { query: unknown }).query);
    const targetUserId = userId ?? req.auth!.userId;

    if (targetUserId !== req.auth!.userId && req.auth!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden." });
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        isActive: true,
        role: true,
        appUser: {
          select: {
            id: true,
            workspaceId: true,
            memberships: {
              where: { status: "active" },
              select: {
                workspaceId: true,
                role: true,
              },
            },
          },
        },
        profile: {
          select: {
            isSystemOwner: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const workspaceIds =
      user.appUser?.memberships.map((membership: { workspaceId: string; role: string }) => membership.workspaceId) ??
      [];
    const currentWorkspaceId = user.appUser?.workspaceId ?? workspaceIds[0] ?? null;
    const membershipRole =
      user.appUser?.memberships.find(
        (membership: { workspaceId: string; role: string }) => membership.workspaceId === currentWorkspaceId,
      )?.role ?? null;
    const primaryRole = toDisplayRole(user.role);

    return res.json({
      context: {
        auth_user_id: user.id,
        app_user_id: user.appUser?.id ?? null,
        email: user.email,
        is_active: user.isActive,
        is_system_owner: user.profile?.isSystemOwner ?? false,
        primary_role: primaryRole,
        primary_db_role: user.role,
        secondary_roles: [],
        current_workspace_id: currentWorkspaceId,
        workspace_ids: workspaceIds,
        membership_role: membershipRole,
        effective_role: primaryRole,
        can_manage_all: user.role === "admin",
        can_view_all_workspace: user.role === "admin",
        ownership: {
          technician_id: user.role === "technician" ? user.appUser?.id ?? null : null,
          owns_filter_uids: user.id ? [user.id] : [],
        },
        flags: {
          is_admin: user.role === "admin",
          is_partner: user.role === "partner",
          is_technician: user.role === "technician",
          is_client: user.role === "client",
          is_impersonating: false,
        },
        computed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error);
  }
});

accountRouter.get("/permissions", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const querySchema = z.object({
      userId: z.string().uuid().optional(),
    });
    const { userId } = querySchema.parse((req as AuthenticatedRequest & { query: unknown }).query);
    const targetUserId = userId ?? req.auth!.userId;

    if (targetUserId !== req.auth!.userId && req.auth!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden." });
    }

    const userRole = await prisma.userRole.findUnique({
      where: { userId: targetUserId },
      select: { role: true },
    });

    const permissions = buildPermissionsForRole(userRole?.role ?? null);
    return res.json({
      role: userRole?.role ?? null,
      ...permissions,
    });
  } catch (error) {
    return next(error);
  }
});
