import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const platformsRouter = Router();

const VALID_STATES = new Set(["active", "paused", "archived", "degraded"]);

function mapPlatform(p: any) {
  return {
    id: p.id,
    workspace_id: p.workspaceId,
    slug: p.slug,
    name: p.name,
    state: p.state,
    color: p.color,
    metadata: p.metadata ?? {},
    last_heartbeat_at: p.lastHeartbeatAt?.toISOString() ?? null,
    last_ingest_at: p.lastIngestAt?.toISOString() ?? null,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

// GET /platforms?workspace_id=
platformsRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { workspace_id } = req.query as Record<string, string | undefined>;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id é obrigatório." });

  const platforms = await prisma.platform.findMany({
    where: { workspaceId: workspace_id },
    orderBy: { name: "asc" },
  });
  return res.json(platforms.map(mapPlatform));
});

// POST /platforms
platformsRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { workspace_id, name, slug, state, color } = req.body ?? {};
  if (!workspace_id || !name?.trim()) {
    return res.status(400).json({ message: "workspace_id e name são obrigatórios." });
  }
  const finalState = VALID_STATES.has(state) ? state : "active";
  const finalSlug = String(slug ?? name).toLowerCase().trim().replace(/\s+/g, "-");

  const platform = await prisma.platform.upsert({
    where: { workspaceId_slug: { workspaceId: workspace_id, slug: finalSlug } },
    create: {
      workspaceId: workspace_id,
      name: String(name).trim(),
      slug: finalSlug,
      state: finalState,
      color: color || null,
      createdBy: req.auth?.userId ?? null,
    },
    update: { state: finalState, name: String(name).trim() },
  });
  return res.status(201).json(mapPlatform(platform));
});

// PATCH /platforms/:id
platformsRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params["id"] as string;
  const { state, name, color, metadata } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (state !== undefined) {
    if (!VALID_STATES.has(state)) return res.status(400).json({ message: "state inválido." });
    data.state = state;
  }
  if (name !== undefined) data.name = String(name).trim();
  if (color !== undefined) data.color = color || null;
  if (metadata !== undefined) data.metadata = metadata ?? {};
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "Nenhum campo para atualizar." });
  }

  const platform = await prisma.platform.update({ where: { id }, data });
  return res.json(mapPlatform(platform));
});
