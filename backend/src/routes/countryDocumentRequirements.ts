import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { buildPermissionsForRole } from "../lib/permissionPolicy.js";

export const countryDocumentRequirementsRouter = Router();

function checkPermission(req: AuthenticatedRequest, action: "view" | "edit"): boolean {
  const { admin, map } = buildPermissionsForRole(req.auth?.role);
  if (admin) return true;
  return map[`country_document_requirements.${action}`]?.allowed ?? false;
}

function mapRequirement(r: any) {
  return {
    id: r.id,
    country: r.country,
    document_name: r.documentName,
    applies_to: r.appliesTo,
    sort_order: r.sortOrder,
    active: r.active,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

// GET /country-document-requirements?country=&active=
countryDocumentRequirementsRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req, "view")) {
    return res.status(403).json({ message: "Você não tem permissão para visualizar esta configuração." });
  }
  const { country, active } = req.query as Record<string, string | undefined>;
  // active ausente -> só ativos (default); active=all -> sem filtro (ativos+inativos); active=true/false -> filtro explícito.
  const activeFilter: boolean | undefined = active === undefined ? true : active === "all" ? undefined : active === "true";
  const requirements = await prisma.countryDocumentRequirement.findMany({
    where: {
      ...(country ? { country } : {}),
      active: activeFilter,
    },
    orderBy: [{ country: "asc" }, { sortOrder: "asc" }],
  });
  return res.json(requirements.map(mapRequirement));
});

// GET /country-document-requirements/countries — lista distinta de países configurados
countryDocumentRequirementsRouter.get("/countries", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req, "view")) {
    return res.status(403).json({ message: "Você não tem permissão para visualizar esta configuração." });
  }
  const rows = await prisma.countryDocumentRequirement.findMany({
    where: { active: true },
    select: { country: true },
    distinct: ["country"],
    orderBy: { country: "asc" },
  });
  return res.json(rows.map((r) => r.country));
});

// POST /country-document-requirements
countryDocumentRequirementsRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req, "edit")) {
    return res.status(403).json({ message: "Você não tem permissão para editar esta configuração." });
  }
  const { country, document_name, applies_to, sort_order } = req.body ?? {};
  if (!String(country ?? "").trim() || !String(document_name ?? "").trim()) {
    return res.status(400).json({ message: "country e document_name são obrigatórios." });
  }

  const existing = await prisma.countryDocumentRequirement.findUnique({
    where: { country_documentName: { country: String(country).trim(), documentName: String(document_name).trim() } },
  });
  if (existing && existing.active) {
    return res.status(409).json({ message: "Este documento já está configurado para este país." });
  }
  if (existing && !existing.active) {
    const reactivated = await prisma.countryDocumentRequirement.update({
      where: { id: existing.id },
      data: { active: true, sortOrder: sort_order ?? existing.sortOrder, appliesTo: applies_to ?? existing.appliesTo },
    });
    return res.status(201).json(mapRequirement(reactivated));
  }

  const requirement = await prisma.countryDocumentRequirement.create({
    data: {
      country: String(country).trim(),
      documentName: String(document_name).trim(),
      appliesTo: applies_to === "technician" || applies_to === "provider_operational" ? applies_to : "both",
      sortOrder: typeof sort_order === "number" ? sort_order : 0,
    },
  });
  return res.status(201).json(mapRequirement(requirement));
});

// PATCH /country-document-requirements/:id — inclui remoção lógica via active:false (FR-020/FR-023)
countryDocumentRequirementsRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!checkPermission(req, "edit")) {
    return res.status(403).json({ message: "Você não tem permissão para editar esta configuração." });
  }
  const id = req.params["id"] as string;
  const { document_name, applies_to, sort_order, active } = req.body ?? {};

  const data: Record<string, unknown> = {};
  if (document_name !== undefined) data.documentName = String(document_name).trim();
  if (applies_to !== undefined) data.appliesTo = applies_to;
  if (sort_order !== undefined) data.sortOrder = sort_order;
  if (active !== undefined) data.active = Boolean(active);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "Nenhum campo para atualizar." });
  }

  try {
    const requirement = await prisma.countryDocumentRequirement.update({ where: { id }, data });
    return res.json(mapRequirement(requirement));
  } catch {
    return res.status(404).json({ message: "Documento obrigatório não encontrado." });
  }
});

// DELETE /country-document-requirements/:id — nunca hard delete (preserva Document.countryRequirementId)
countryDocumentRequirementsRouter.delete("/:id", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(405).json({
    message: "Exclusão direta não permitida. Use PATCH com { active: false } para remover logicamente sem apagar documentos já anexados.",
  });
});
