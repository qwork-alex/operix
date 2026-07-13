import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const serviceOrdersRouter = Router();

function mapOrder(o: any) {
  return {
    id: o.id,
    workspace_id: o.workspaceId,
    visibility_scope: o.visibilityScope,
    user_id: o.userId,
    assigned_user_id: o.assignedUserId,
    client_id: o.clientId,
    client_name: o.clientName,
    car_name: o.carName,
    license_plate: o.licensePlate,
    platform: o.platform,
    platform_id: o.platformId,
    operational_unit: o.operationalUnit,
    group_id: o.groupId,
    week: o.week,
    year_reference: o.yearReference,
    technician_name: o.technicianName,
    technician_earning: o.technicianEarning,
    technician_percentage: o.technicianPercentage,
    service_1_name: o.service1Name,
    service_1_price: o.service1Price,
    service_2_name: o.service2Name,
    service_2_price: o.service2Price,
    service_3_name: o.service3Name,
    service_3_price: o.service3Price,
    service_4_name: o.service4Name,
    service_4_price: o.service4Price,
    total: o.total,
    status: o.status,
    distribution_snapshot: o.distributionSnapshot,
    created_by: o.createdBy,
    deleted_at: o.deletedAt?.toISOString() ?? null,
    created_at: o.createdAt.toISOString(),
    updated_at: o.updatedAt.toISOString(),
  };
}

function buildData(b: Record<string, any>) {
  const d: Record<string, unknown> = {};
  if (b.workspace_id !== undefined) d.workspaceId = b.workspace_id ?? null;
  if (b.visibility_scope !== undefined) d.visibilityScope = b.visibility_scope ?? "workspace";
  if (b.user_id !== undefined) d.userId = b.user_id ?? "";
  if (b.assigned_user_id !== undefined) d.assignedUserId = b.assigned_user_id ?? "";
  if (b.client_id !== undefined) d.clientId = b.client_id || null;
  if (b.client_name !== undefined) d.clientName = b.client_name ?? "";
  if (b.car_name !== undefined) d.carName = b.car_name || null;
  if (b.license_plate !== undefined) d.licensePlate = b.license_plate || null;
  if (b.platform !== undefined) d.platform = b.platform || null;
  if (b.platform_id !== undefined) d.platformId = b.platform_id || null;
  if (b.operational_unit !== undefined) d.operationalUnit = b.operational_unit || null;
  if (b.group_id !== undefined) d.groupId = b.group_id || null;
  if (b.week !== undefined) d.week = b.week || null;
  if (b.year_reference !== undefined) d.yearReference = b.year_reference ?? null;
  if (b.technician_name !== undefined) d.technicianName = b.technician_name ?? "";
  if (b.technician_earning !== undefined) d.technicianEarning = b.technician_earning ?? null;
  if (b.technician_percentage !== undefined) d.technicianPercentage = b.technician_percentage ?? null;
  if (b.service_1_name !== undefined) d.service1Name = b.service_1_name || null;
  if (b.service_1_price !== undefined) d.service1Price = b.service_1_price ?? null;
  if (b.service_2_name !== undefined) d.service2Name = b.service_2_name || null;
  if (b.service_2_price !== undefined) d.service2Price = b.service_2_price ?? null;
  if (b.service_3_name !== undefined) d.service3Name = b.service_3_name || null;
  if (b.service_3_price !== undefined) d.service3Price = b.service_3_price ?? null;
  if (b.service_4_name !== undefined) d.service4Name = b.service_4_name || null;
  if (b.service_4_price !== undefined) d.service4Price = b.service_4_price ?? null;
  if (b.total !== undefined) d.total = b.total ?? null;
  if (b.status !== undefined) d.status = b.status ?? "draft";
  if (b.distribution_snapshot !== undefined) d.distributionSnapshot = b.distribution_snapshot ?? null;
  if (b.created_by !== undefined) d.createdBy = b.created_by || null;
  return d;
}

// GET /service-orders?workspace_id=&client_id=&platform=&week=&assigned_user_id=
serviceOrdersRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { workspace_id, client_id, platform, week, assigned_user_id } = req.query as Record<string, string | undefined>;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id é obrigatório." });

  const orders = await prisma.serviceOrder.findMany({
    where: {
      workspaceId: workspace_id,
      deletedAt: null,
      ...(client_id ? { clientId: client_id } : {}),
      ...(platform ? { platform } : {}),
      ...(week ? { week } : {}),
      ...(assigned_user_id ? { assignedUserId: assigned_user_id } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json(orders.map(mapOrder));
});

// POST /service-orders (single or batch)
serviceOrdersRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const items: any[] = Array.isArray(body) ? body : [body];

  if (items.length === 0) return res.status(400).json({ message: "Payload vazio." });

  const created = await Promise.all(
    items.map((b) => {
      const data = buildData(b);
      if (!data.userId) data.userId = req.auth?.userId ?? "";
      if (!data.assignedUserId) data.assignedUserId = req.auth?.userId ?? "";
      if (!data.status) data.status = "draft";
      return prisma.serviceOrder.create({
        data: {
          ...(data as any),
          ...(b.id ? { id: b.id } : {}),
          ...(b.created_at ? { createdAt: new Date(b.created_at) } : {}),
        },
      });
    }),
  );
  return res.status(201).json(Array.isArray(body) ? created.map(mapOrder) : mapOrder(created[0]));
});

// PUT /service-orders/:id (full update / upsert-style)
serviceOrdersRouter.put("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params["id"] as string;
  const b = req.body;
  const data = buildData(b);
  if (!data.userId) data.userId = req.auth?.userId ?? "";
  if (!data.assignedUserId) data.assignedUserId = req.auth?.userId ?? "";

  const order = await prisma.serviceOrder.upsert({
    where: { id },
    create: { id, ...(data as any), ...(b.created_at ? { createdAt: new Date(b.created_at) } : {}) },
    update: data,
  });
  return res.json(mapOrder(order));
});

// PATCH /service-orders/:id
serviceOrdersRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params["id"] as string;
  const data = buildData(req.body);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "Nenhum campo para atualizar." });
  }

  const order = await prisma.serviceOrder.update({ where: { id }, data });
  return res.json(mapOrder(order));
});

// DELETE /service-orders/by-year/:year?workspace_id= — apaga o operacional de um ano
serviceOrdersRouter.delete("/by-year/:year", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const year = Number.parseInt(req.params["year"] as string, 10);
  const { workspace_id } = req.query as Record<string, string | undefined>;
  if (!Number.isFinite(year)) return res.status(400).json({ message: "Ano inválido." });
  if (!workspace_id) return res.status(400).json({ message: "workspace_id é obrigatório." });

  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const range = { gte: start, lt: end };

  const [orders, documents] = await prisma.$transaction([
    prisma.serviceOrder.updateMany({
      where: { workspaceId: workspace_id, deletedAt: null, createdAt: range },
      data: { deletedAt: new Date(), deletedBy: req.auth?.userId ?? null, deletedReason: `delete_year_${year}` },
    }),
    prisma.document.deleteMany({
      where: { workspaceId: workspace_id, entityType: "service_order", createdAt: range },
    }),
  ]);
  return res.json({ deleted: orders.count, documents_deleted: documents.count });
});

// DELETE /service-orders/:id (soft delete)
serviceOrdersRouter.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params["id"] as string;
  await prisma.serviceOrder.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return res.json({ deleted: 1 });
});

// GET /service-orders/clients — lista clientes para autocomplete
serviceOrdersRouter.get("/clients", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { workspace_id } = req.query as Record<string, string | undefined>;
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      ...(workspace_id ? { workspaceId: workspace_id } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return res.json(clients);
});
