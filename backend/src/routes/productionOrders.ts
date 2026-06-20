import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const productionOrdersRouter = Router();

function genCode(): string {
  return `PO-${Date.now().toString(36).toUpperCase()}`;
}

function mapOrder(o: any) {
  return {
    id: o.id,
    workspace_id: o.workspaceId,
    code: o.code,
    client_id: o.clientId,
    client_name: o.clientName,
    technician_user_id: o.technicianUserId,
    technician_name: o.technicianName,
    platform: o.platform,
    insurer: o.insurer,
    license_plate: o.licensePlate,
    vin: o.vin,
    brand: o.brand,
    model: o.model,
    color: o.color,
    notes: o.notes,
    priority: o.priority,
    status: o.status,
    commercial_status: o.commercialStatus,
    service_order_id: o.serviceOrderId,
    due_at: o.dueAt?.toISOString() ?? null,
    started_at: o.startedAt?.toISOString() ?? null,
    finished_at: o.finishedAt?.toISOString() ?? null,
    delivered_at: o.deliveredAt?.toISOString() ?? null,
    created_by: o.createdBy,
    created_at: o.createdAt.toISOString(),
    updated_at: o.updatedAt.toISOString(),
  };
}

function parseDate(v: unknown): Date | null {
  if (!v || v === "") return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

// GET /production-orders?workspace_id=&status=&technician_user_id=
productionOrdersRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { workspace_id, status, technician_user_id } = req.query as Record<string, string | undefined>;
  if (!workspace_id) return res.status(400).json({ message: "workspace_id é obrigatório." });

  const orders = await prisma.productionOrder.findMany({
    where: {
      workspaceId: workspace_id,
      ...(status ? { status } : {}),
      ...(technician_user_id ? { technicianUserId: technician_user_id } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json(orders.map(mapOrder));
});

// POST /production-orders
productionOrdersRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const b = req.body;
  if (!b.workspace_id) return res.status(400).json({ message: "workspace_id é obrigatório." });

  const order = await prisma.productionOrder.create({
    data: {
      workspaceId: b.workspace_id,
      code: b.code || genCode(),
      clientId: b.client_id ?? null,
      clientName: b.client_name ?? null,
      technicianUserId: b.technician_user_id ?? null,
      technicianName: b.technician_name ?? null,
      platform: b.platform ?? null,
      insurer: b.insurer ?? null,
      licensePlate: b.license_plate ?? null,
      vin: b.vin ?? null,
      brand: b.brand ?? null,
      model: b.model ?? null,
      color: b.color ?? null,
      notes: b.notes ?? null,
      priority: b.priority ?? "normal",
      status: b.status ?? "new_vehicle",
      commercialStatus: b.commercial_status ?? null,
      serviceOrderId: b.service_order_id ?? null,
      dueAt: parseDate(b.due_at),
      startedAt: parseDate(b.started_at),
      finishedAt: parseDate(b.finished_at),
      deliveredAt: parseDate(b.delivered_at),
      createdBy: b.created_by ?? req.auth?.userId ?? "",
    },
  });
  return res.status(201).json(mapOrder(order));
});

// PATCH /production-orders/:id
productionOrdersRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params["id"] as string;
  const b = req.body;

  const data: Record<string, unknown> = {};
  if (b.client_id !== undefined) data.clientId = b.client_id || null;
  if (b.client_name !== undefined) data.clientName = b.client_name || null;
  if (b.technician_user_id !== undefined) data.technicianUserId = b.technician_user_id || null;
  if (b.technician_name !== undefined) data.technicianName = b.technician_name || null;
  if (b.platform !== undefined) data.platform = b.platform || null;
  if (b.insurer !== undefined) data.insurer = b.insurer || null;
  if (b.license_plate !== undefined) data.licensePlate = b.license_plate || null;
  if (b.vin !== undefined) data.vin = b.vin || null;
  if (b.brand !== undefined) data.brand = b.brand || null;
  if (b.model !== undefined) data.model = b.model || null;
  if (b.color !== undefined) data.color = b.color || null;
  if (b.notes !== undefined) data.notes = b.notes || null;
  if (b.priority !== undefined) data.priority = b.priority;
  if (b.status !== undefined) data.status = b.status;
  if (b.commercial_status !== undefined) data.commercialStatus = b.commercial_status || null;
  if (b.service_order_id !== undefined) data.serviceOrderId = b.service_order_id || null;
  if (b.due_at !== undefined) data.dueAt = parseDate(b.due_at);
  if (b.started_at !== undefined) data.startedAt = parseDate(b.started_at);
  if (b.finished_at !== undefined) data.finishedAt = parseDate(b.finished_at);
  if (b.delivered_at !== undefined) data.deliveredAt = parseDate(b.delivered_at);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "Nenhum campo para atualizar." });
  }

  const order = await prisma.productionOrder.update({ where: { id }, data });
  return res.json(mapOrder(order));
});

// DELETE /production-orders/:id
productionOrdersRouter.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params["id"] as string;
  await prisma.productionOrder.delete({ where: { id } });
  return res.json({ deleted: 1 });
});
