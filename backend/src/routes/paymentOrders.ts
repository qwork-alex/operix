import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const paymentOrdersRouter = Router();

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
    operational_unit: o.operationalUnit,
    group_id: o.groupId,
    list_name: o.listName,
    year_reference: o.yearReference,
    technician_id: o.technicianId,
    technician_name: o.technicianName,
    services: o.services,
    service_order_id: o.serviceOrderId,
    amount_paid: o.amountPaid,
    total: o.total,
    status: o.status,
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
  if (b.client_name !== undefined) d.clientName = b.client_name ?? null;
  if (b.car_name !== undefined) d.carName = b.car_name || null;
  if (b.license_plate !== undefined) d.licensePlate = b.license_plate || null;
  if (b.platform !== undefined) d.platform = b.platform || null;
  if (b.operational_unit !== undefined) d.operationalUnit = b.operational_unit || null;
  if (b.group_id !== undefined) d.groupId = b.group_id || null;
  if (b.list_name !== undefined) d.listName = b.list_name || null;
  if (b.year_reference !== undefined) d.yearReference = b.year_reference ?? null;
  if (b.technician_id !== undefined) d.technicianId = b.technician_id || null;
  if (b.technician_name !== undefined) d.technicianName = b.technician_name ?? null;
  if (b.services !== undefined) d.services = b.services ?? null;
  if (b.service_order_id !== undefined) d.serviceOrderId = b.service_order_id || null;
  if (b.amount_paid !== undefined) d.amountPaid = b.amount_paid ?? 0;
  if (b.total !== undefined) d.total = b.total ?? null;
  if (b.status !== undefined) d.status = b.status ?? "pending";
  if (b.created_by !== undefined) d.createdBy = b.created_by || null;
  return d;
}

// GET /payment-orders?workspace_id=&client_id=&platform=&list_name=&assigned_user_id=
paymentOrdersRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { workspace_id, client_id, platform, list_name, assigned_user_id } = req.query as Record<string, string | undefined>;

  const orders = await prisma.paymentOrder.findMany({
    where: {
      deletedAt: null,
      ...(workspace_id ? { workspaceId: workspace_id } : {}),
      ...(client_id ? { clientId: client_id } : {}),
      ...(platform ? { platform } : {}),
      ...(list_name ? { listName: list_name } : {}),
      ...(assigned_user_id ? { assignedUserId: assigned_user_id } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json(orders.map(mapOrder));
});

// POST /payment-orders (single or batch)
paymentOrdersRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body;
  const items: any[] = Array.isArray(body) ? body : [body];

  if (items.length === 0) return res.status(400).json({ message: "Payload vazio." });

  const created = await Promise.all(
    items.map((b) => {
      const data = buildData(b);
      if (!data.userId) data.userId = req.auth?.userId ?? "";
      if (!data.assignedUserId) data.assignedUserId = req.auth?.userId ?? "";
      if (!data.status) data.status = "pending";
      return prisma.paymentOrder.create({
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

// PATCH /payment-orders/:id
paymentOrdersRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params["id"] as string;
  const data = buildData(req.body);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "Nenhum campo para atualizar." });
  }

  const order = await prisma.paymentOrder.update({ where: { id }, data });
  return res.json(mapOrder(order));
});

// DELETE /payment-orders/:id (soft delete)
paymentOrdersRouter.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params["id"] as string;
  await prisma.paymentOrder.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return res.json({ deleted: 1 });
});

// DELETE /payment-orders?year=2025&workspace_id=xxx (soft delete by year)
paymentOrdersRouter.delete("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { year, workspace_id } = req.query as Record<string, string | undefined>;
  if (!year) return res.status(400).json({ message: "year é obrigatório." });

  const y = parseInt(year, 10);
  if (!Number.isFinite(y)) return res.status(400).json({ message: "year inválido." });

  const start = new Date(Date.UTC(y, 0, 1));
  const end = new Date(Date.UTC(y + 1, 0, 1));

  const result = await prisma.paymentOrder.updateMany({
    where: {
      deletedAt: null,
      createdAt: { gte: start, lt: end },
      ...(workspace_id ? { workspaceId: workspace_id } : {}),
    },
    data: { deletedAt: new Date() },
  });
  return res.json({ deleted: result.count });
});
