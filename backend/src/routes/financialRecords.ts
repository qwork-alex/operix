import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const financialRecordsRouter = Router();

export function mapFinancialRecord(r: any) {
  return {
    id: r.id,
    workspace_id: r.workspaceId,
    type: r.type,
    source: r.source,
    origin: r.origin,
    category: r.category,
    label: r.label,
    amount: r.amount,
    status: r.status,
    notes: r.notes,
    reference_id: r.referenceId,
    service_order_id: r.serviceOrderId,
    payment_order_id: r.paymentOrderId,
    assigned_user_id: r.assignedUserId,
    vehicle_id: r.vehicleId,
    year_reference: r.yearReference,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

function buildWhere(query: Record<string, string | undefined>) {
  const where: Record<string, unknown> = {};
  if (query.workspace_id) where.workspaceId = query.workspace_id;
  if (query.type) {
    const types = query.type.split(",").map((t) => t.trim()).filter(Boolean);
    where.type = types.length > 1 ? { in: types } : types[0];
  }
  if (query.source) {
    const sources = query.source.split(",").map((s) => s.trim()).filter(Boolean);
    where.source = sources.length > 1 ? { in: sources } : sources[0];
  }
  if (query.category) where.category = query.category;
  if (query.status) where.status = query.status;
  if (query.assigned_user_id) where.assignedUserId = query.assigned_user_id;
  if (query.year_reference) where.yearReference = Number(query.year_reference);
  if (query.notes_like) where.notes = { contains: query.notes_like };
  if (query.created_from || query.created_to) {
    const createdAt: Record<string, Date> = {};
    if (query.created_from) createdAt.gte = new Date(query.created_from);
    if (query.created_to) createdAt.lte = new Date(query.created_to);
    where.createdAt = createdAt;
  }
  return where;
}

// GET /financial-records?workspace_id=&type=a,b&category=&year_reference=&assigned_user_id=&notes_like=
financialRecordsRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const where = buildWhere(req.query as Record<string, string | undefined>);
  const records = await prisma.financialRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  return res.json(records.map(mapFinancialRecord));
});

// POST /financial-records
financialRecordsRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const b = req.body ?? {};
  if (!b.type) return res.status(400).json({ message: "type é obrigatório." });
  const record = await prisma.financialRecord.create({
    data: {
      workspaceId: b.workspace_id ?? null,
      type: String(b.type),
      source: b.source ? String(b.source) : "manual",
      origin: b.origin ?? null,
      category: b.category ?? null,
      label: b.label ?? null,
      amount: Number(b.amount ?? 0),
      status: b.status ? String(b.status) : "pending",
      notes: b.notes ?? null,
      referenceId: b.reference_id ?? null,
      serviceOrderId: b.service_order_id ?? null,
      paymentOrderId: b.payment_order_id ?? null,
      assignedUserId: b.assigned_user_id ?? null,
      vehicleId: b.vehicle_id ?? null,
      yearReference: b.year_reference != null ? Number(b.year_reference) : null,
      ...(b.created_at ? { createdAt: new Date(b.created_at) } : {}),
    },
  });
  return res.status(201).json(mapFinancialRecord(record));
});

// PATCH /financial-records/:id
financialRecordsRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.label !== undefined) data.label = b.label;
  if (b.amount !== undefined) data.amount = Number(b.amount);
  if (b.notes !== undefined) data.notes = b.notes;
  if (b.status !== undefined) data.status = b.status;
  if (b.category !== undefined) data.category = b.category;
  if (b.type !== undefined) data.type = b.type;
  if (b.assigned_user_id !== undefined) data.assignedUserId = b.assigned_user_id;
  if (b.year_reference !== undefined) data.yearReference = b.year_reference != null ? Number(b.year_reference) : null;
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "Nenhum campo para atualizar." });
  }
  const record = await prisma.financialRecord.update({ where: { id: req.params["id"] as string }, data });
  return res.json(mapFinancialRecord(record));
});

// DELETE /financial-records/:id
financialRecordsRouter.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  await prisma.financialRecord.delete({ where: { id: req.params["id"] as string } });
  return res.status(204).end();
});

// POST /financial-records/delete-by — bulk delete by filters (type, notes_like, assigned_user_id, source)
financialRecordsRouter.post("/delete-by", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const b = req.body ?? {};
  const where: Record<string, unknown> = {};
  if (b.type) where.type = Array.isArray(b.type) ? { in: b.type } : b.type;
  if (b.source) where.source = Array.isArray(b.source) ? { in: b.source } : b.source;
  if (b.assigned_user_id) where.assignedUserId = b.assigned_user_id;
  if (b.notes_like) where.notes = { contains: String(b.notes_like) };
  if (b.ids && Array.isArray(b.ids) && b.ids.length > 0) where.id = { in: b.ids };
  if (Object.keys(where).length === 0) {
    return res.status(400).json({ message: "Nenhum filtro informado — recusado por segurança." });
  }
  const result = await prisma.financialRecord.deleteMany({ where });
  return res.json({ deleted: result.count });
});
