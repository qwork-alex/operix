import { Prisma, type PrismaClient } from "@prisma/client";
import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { isEmailConfigured, sendEmail } from "../lib/email/resend.js";

export const operationalBillingRouter = Router();

const invoiceStatusSchema = z.enum(["draft", "pending", "partial", "paid", "overdue", "cancelled"]);
const invoiceTypeSchema = z.enum(["incoming", "outgoing"]);

const customerSnapshotSchema = z.object({
  billing_client_id: z.string().uuid().nullable().optional(),
  name: z.string(),
  kind: z.string().nullable().optional(),
  tax_id: z.string().nullable().optional(),
  siren: z.string().nullable().optional(),
  siret: z.string().nullable().optional(),
  tva_intracom: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  address_complement: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  bic: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  payment_terms: z.string().nullable().optional(),
  captured_at: z.string().nullable().optional(),
});

const operationalInvoiceSchema = z.object({
  workspace_id: z.string().uuid().nullable().optional(),
  invoice_number: z.string().min(1).max(120),
  type: invoiceTypeSchema.default("outgoing"),
  supplier_id: z.string().uuid().nullable().optional(),
  billing_client_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().max(200).nullable().optional(),
  customer_snapshot: customerSnapshotSchema.nullable().optional(),
  vehicle_id: z.string().max(120).nullable().optional(),
  fleet_id: z.string().max(120).nullable().optional(),
  service_order_id: z.string().max(120).nullable().optional(),
  issue_date: z.string().min(10).max(40),
  due_date: z.string().min(10).max(40).nullable().optional(),
  total_amount: z.number(),
  paid_amount: z.number().nullable().optional(),
  status: invoiceStatusSchema.default("pending"),
  notes: z.string().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
  source: z.string().max(50).nullable().optional(),
});

const importInvoiceSchema = operationalInvoiceSchema.extend({
  attachment: z.object({
    file_name: z.string().min(1).max(255),
    mime_type: z.string().max(120).nullable().optional(),
    size_bytes: z.number().int().nonnegative().nullable().optional(),
    data_url: z.string().min(1),
  }),
});

const sendInvoiceSchema = z.object({
  recipient: z.string().email(),
  cc: z.string().max(500).nullable().optional(),
  subject: z.string().min(1).max(300),
  message: z.string().max(10000).nullable().optional(),
  pdf_base64: z.string().nullable().optional(),
  pdf_file_name: z.string().max(255).nullable().optional(),
  idempotency_key: z.string().max(255).nullable().optional(),
  kind: z.enum(["initial", "reminder"]).default("initial"),
});

const clientKindSchema = z.enum(["professional", "particular"]);

const clientContactSchema = z.object({
  first_name: z.string().max(120).optional().default(""),
  last_name: z.string().max(120).optional().default(""),
  role: z.string().max(120).optional().default(""),
  email: z.string().max(160).optional().default(""),
  phone: z.string().max(40).optional().default(""),
});

const operationalClientSchema = z.object({
  workspace_id: z.string().uuid().nullable().optional(),
  kind: clientKindSchema.default("professional"),
  name: z.string().min(1).max(160),
  siren: z.string().max(32).nullable().optional(),
  siret: z.string().max(32).nullable().optional(),
  tva_intracom: z.string().max(32).nullable().optional(),
  tax_id: z.string().max(64).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  address_complement: z.string().max(200).nullable().optional(),
  postal_code: z.string().max(20).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
  iban: z.string().max(40).nullable().optional(),
  bic: z.string().max(20).nullable().optional(),
  contacts: z.array(clientContactSchema).optional().default([]),
  notes: z.string().max(4000).nullable().optional(),
  is_active: z.boolean().default(true),
});

const clientAttachmentSchema = z.object({
  file_name: z.string().min(1).max(255),
  mime_type: z.string().max(120).nullable().optional(),
  size_bytes: z.number().int().nonnegative().nullable().optional(),
  data_url: z.string().min(1),
});

function requireAdmin(req: AuthenticatedRequest, res: Response) {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ message: "Forbidden." });
    return false;
  }
  return true;
}

function parseDateInput(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00.000Z`);
  }
  return new Date(value);
}

function toDateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function normalizeContacts(value: Prisma.JsonValue | null) {
  return Array.isArray(value) ? value : [];
}

function normalizeNullableString(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveInvoiceStatus(status: string, dueDate: Date | null, remainingAmount: number) {
  if (status === "cancelled" || status === "draft") return status;
  if (remainingAmount <= 0) return "paid";
  if (!dueDate) return status;
  const today = new Date().toISOString().slice(0, 10);
  const due = toDateOnly(dueDate);
  if ((status === "pending" || status === "partial") && due && due < today) {
    return "overdue";
  }
  return status;
}

function mapBillingClient(client: {
  id: string;
  kind: string;
  name: string;
  siren: string | null;
  siret: string | null;
  tvaIntracom: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  addressComplement: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  iban: string | null;
  bic: string | null;
  contacts: Prisma.JsonValue | null;
  notes: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: client.id,
    kind: client.kind,
    name: client.name,
    siren: client.siren,
    siret: client.siret,
    tva_intracom: client.tvaIntracom,
    tax_id: client.taxId,
    email: client.email,
    phone: client.phone,
    address: client.address,
    address_complement: client.addressComplement,
    postal_code: client.postalCode,
    city: client.city,
    country: client.country,
    iban: client.iban,
    bic: client.bic,
    contacts: normalizeContacts(client.contacts),
    notes: client.notes,
    is_active: client.isActive,
    created_by: client.createdBy,
    created_at: client.createdAt.toISOString(),
    updated_at: client.updatedAt.toISOString(),
  };
}

function mapBillingSupplier(supplier: {
  id: string;
  name: string;
}) {
  return {
    id: supplier.id,
    name: supplier.name,
  };
}

function mapBillingInvoice(invoice: {
  id: string;
  workspaceId: string | null;
  invoiceNumber: string;
  type: string;
  supplierId: string | null;
  billingClientId: string | null;
  customerName: string | null;
  customerSnapshot: Prisma.JsonValue | null;
  vehicleId: string | null;
  fleetId: string | null;
  serviceOrderId: string | null;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number | null;
  status: string;
  notes: string | null;
  createdBy: string | null;
  source: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const totalAmount = Number(invoice.totalAmount ?? 0);
  const paidAmount = Number(invoice.paidAmount ?? 0);
  const remainingAmount =
    invoice.remainingAmount != null
      ? Number(invoice.remainingAmount)
      : Math.max(0, totalAmount - paidAmount);

  return {
    id: invoice.id,
    workspace_id: invoice.workspaceId,
    invoice_number: invoice.invoiceNumber,
    type: invoice.type,
    supplier_id: invoice.supplierId,
    billing_client_id: invoice.billingClientId,
    customer_name: invoice.customerName,
    customer_snapshot: invoice.customerSnapshot,
    vehicle_id: invoice.vehicleId,
    fleet_id: invoice.fleetId,
    service_order_id: invoice.serviceOrderId,
    issue_date: toDateOnly(invoice.issueDate),
    due_date: toDateOnly(invoice.dueDate),
    total_amount: totalAmount,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    status: resolveInvoiceStatus(invoice.status, invoice.dueDate, remainingAmount),
    notes: invoice.notes,
    created_by: invoice.createdBy,
    source: invoice.source,
    metadata: invoice.metadata,
    created_at: invoice.createdAt.toISOString(),
    updated_at: invoice.updatedAt.toISOString(),
  };
}

function mapSendLog(log: {
  id: string;
  recipient: string;
  cc: string | null;
  subject: string;
  body: string | null;
  provider: string;
  status: string;
  error: string | null;
  idempotencyKey: string | null;
  pdfPath: string | null;
  kind: string;
  sentBy: string | null;
  sentAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: log.id,
    recipient: log.recipient,
    cc: log.cc,
    subject: log.subject,
    body: log.body,
    provider: log.provider,
    status: log.status,
    error: log.error,
    idempotency_key: log.idempotencyKey,
    pdf_path: log.pdfPath,
    kind: log.kind,
    sent_by: log.sentBy,
    sent_at: log.sentAt?.toISOString() ?? null,
    created_at: log.createdAt.toISOString(),
  };
}

function mapBillingAttachment(attachment: {
  id: string;
  workspaceId: string | null;
  invoiceId: string | null;
  billingClientId: string | null;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  createdAt: Date;
}) {
  return {
    id: attachment.id,
    workspace_id: attachment.workspaceId,
    invoice_id: attachment.invoiceId,
    billing_client_id: attachment.billingClientId,
    file_name: attachment.fileName,
    storage_path: attachment.storagePath,
    mime_type: attachment.mimeType,
    size_bytes: attachment.sizeBytes,
    uploaded_by: attachment.uploadedBy,
    signed_url: attachment.storagePath,
    created_at: attachment.createdAt.toISOString(),
  };
}

async function logBackendEvent(
  db: PrismaClient | Prisma.TransactionClient,
  args: {
    tableName: string;
    rowId?: string | null;
    action: string;
    payload?: Prisma.InputJsonValue;
    actorUserId?: string | null;
    workspaceId?: string | null;
  },
) {
  await db.backendEventLog.create({
    data: {
      tableName: args.tableName,
      rowId: args.rowId ?? null,
      action: args.action,
      payload: args.payload,
      actorUserId: args.actorUserId ?? null,
      workspaceId: args.workspaceId ?? null,
    },
  });
}

async function ensureWorkspaceExists(workspaceId: string | null | undefined) {
  if (!workspaceId) return null;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    throw new Error("Workspace not found.");
  }
  return workspace.id;
}

function sumClientBalances(
  invoices: Array<{
    billingClientId: string | null;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number | null;
  }>,
) {
  const balances: Record<string, number> = {};

  for (const invoice of invoices) {
    if (!invoice.billingClientId) continue;
    const openAmount =
      invoice.remainingAmount != null
        ? Number(invoice.remainingAmount)
        : Math.max(0, Number(invoice.totalAmount ?? 0) - Number(invoice.paidAmount ?? 0));

    balances[invoice.billingClientId] = (balances[invoice.billingClientId] ?? 0) + openAmount;
  }

  return balances;
}

operationalBillingRouter.get("/admin/ops/clients", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const querySchema = z.object({
      active_only: z.coerce.boolean().optional().default(false),
    });
    const { active_only } = querySchema.parse((req as AuthenticatedRequest & { query: unknown }).query);

    const clients = await prisma.billingClient.findMany({
      where: active_only ? { isActive: true } : undefined,
      orderBy: { name: "asc" },
      take: 500,
    });

    const balances = sumClientBalances(
      await prisma.billingInvoice.findMany({
        where: {
          deletedAt: null,
          billingClientId: {
            in: clients.map((client: (typeof clients)[number]) => client.id),
          },
        },
        select: {
          billingClientId: true,
          totalAmount: true,
          paidAmount: true,
          remainingAmount: true,
        },
      }),
    );

    return res.json({
      clients: clients.map(mapBillingClient),
      balances,
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.post("/admin/ops/clients", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const input = operationalClientSchema.parse((req as AuthenticatedRequest & { body: unknown }).body);
    const workspaceId = await ensureWorkspaceExists(input.workspace_id);

    const client = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.billingClient.create({
        data: {
          workspaceId,
          kind: input.kind,
          name: input.name.trim(),
          siren: input.kind === "professional" ? normalizeNullableString(input.siren) : null,
          siret: input.kind === "professional" ? normalizeNullableString(input.siret) : null,
          tvaIntracom: input.kind === "professional" ? normalizeNullableString(input.tva_intracom) : null,
          taxId: normalizeNullableString(input.tax_id),
          email: normalizeNullableString(input.email),
          phone: normalizeNullableString(input.phone),
          address: normalizeNullableString(input.address),
          addressComplement: normalizeNullableString(input.address_complement),
          postalCode: normalizeNullableString(input.postal_code),
          city: normalizeNullableString(input.city),
          country: normalizeNullableString(input.country),
          iban: normalizeNullableString(input.iban),
          bic: normalizeNullableString(input.bic),
          contacts: input.contacts as Prisma.InputJsonValue,
          notes: normalizeNullableString(input.notes),
          isActive: input.is_active,
          createdBy: req.auth?.userId ?? null,
        },
      });

      await logBackendEvent(tx, {
        tableName: "billing_clients",
        rowId: created.id,
        action: "client.created",
        actorUserId: req.auth?.userId ?? null,
        workspaceId,
        payload: {
          name: created.name,
          kind: created.kind,
          is_active: created.isActive,
        } as Prisma.InputJsonValue,
      });

      return created;
    });

    return res.status(201).json({
      client: mapBillingClient(client),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.patch("/admin/ops/clients/:clientId", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const paramsSchema = z.object({ clientId: z.string().uuid() });
    const { clientId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);
    const input = operationalClientSchema.parse((req as AuthenticatedRequest & { body: unknown }).body);
    const workspaceId = await ensureWorkspaceExists(input.workspace_id);

    const client = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.billingClient.update({
        where: { id: clientId },
        data: {
          workspaceId,
          kind: input.kind,
          name: input.name.trim(),
          siren: input.kind === "professional" ? normalizeNullableString(input.siren) : null,
          siret: input.kind === "professional" ? normalizeNullableString(input.siret) : null,
          tvaIntracom: input.kind === "professional" ? normalizeNullableString(input.tva_intracom) : null,
          taxId: normalizeNullableString(input.tax_id),
          email: normalizeNullableString(input.email),
          phone: normalizeNullableString(input.phone),
          address: normalizeNullableString(input.address),
          addressComplement: normalizeNullableString(input.address_complement),
          postalCode: normalizeNullableString(input.postal_code),
          city: normalizeNullableString(input.city),
          country: normalizeNullableString(input.country),
          iban: normalizeNullableString(input.iban),
          bic: normalizeNullableString(input.bic),
          contacts: input.contacts as Prisma.InputJsonValue,
          notes: normalizeNullableString(input.notes),
          isActive: input.is_active,
        },
      });

      await logBackendEvent(tx, {
        tableName: "billing_clients",
        rowId: updated.id,
        action: "client.updated",
        actorUserId: req.auth?.userId ?? null,
        workspaceId: updated.workspaceId,
        payload: {
          name: updated.name,
          kind: updated.kind,
          is_active: updated.isActive,
        } as Prisma.InputJsonValue,
      });

      return updated;
    });

    return res.json({
      client: mapBillingClient(client),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.delete("/admin/ops/clients/:clientId", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const paramsSchema = z.object({ clientId: z.string().uuid() });
    const { clientId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.billingClient.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          workspaceId: true,
          name: true,
        },
      });

      if (!existing) {
        return;
      }

      await logBackendEvent(tx, {
        tableName: "billing_clients",
        rowId: existing.id,
        action: "client.deleted",
        actorUserId: req.auth?.userId ?? null,
        workspaceId: existing.workspaceId,
        payload: {
          name: existing.name,
        } as Prisma.InputJsonValue,
      });

      await tx.billingClient.delete({
        where: { id: clientId },
      });
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.get("/admin/ops/clients/:clientId", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const paramsSchema = z.object({ clientId: z.string().uuid() });
    const { clientId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);

    const client = await prisma.billingClient.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found." });
    }

    const [invoices, attachments] = await Promise.all([
      prisma.billingInvoice.findMany({
        where: {
          billingClientId: clientId,
          deletedAt: null,
        },
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.billingAttachment.findMany({
        where: { billingClientId: clientId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totals = invoices.reduce<{ total: number; paid: number; remaining: number }>(
      (acc: { total: number; paid: number; remaining: number }, invoice: (typeof invoices)[number]) => {
        const totalAmount = Number(invoice.totalAmount ?? 0);
        const paidAmount = Number(invoice.paidAmount ?? 0);
        const remainingAmount =
          invoice.remainingAmount != null
            ? Number(invoice.remainingAmount)
            : Math.max(0, totalAmount - paidAmount);

        return {
          total: acc.total + totalAmount,
          paid: acc.paid + paidAmount,
          remaining: acc.remaining + remainingAmount,
        };
      },
      { total: 0, paid: 0, remaining: 0 },
    );

    return res.json({
      client: mapBillingClient(client),
      invoices: invoices.map(mapBillingInvoice),
      payments: [],
      attachments: attachments.map(mapBillingAttachment),
      totals,
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.post("/admin/ops/clients/:clientId/attachments", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const paramsSchema = z.object({ clientId: z.string().uuid() });
    const { clientId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);
    const input = clientAttachmentSchema.parse((req as AuthenticatedRequest & { body: unknown }).body);

    const client = await prisma.billingClient.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        workspaceId: true,
        name: true,
      },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found." });
    }

    const attachment = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.billingAttachment.create({
        data: {
          workspaceId: client.workspaceId,
          billingClientId: client.id,
          fileName: input.file_name,
          storagePath: input.data_url,
          mimeType: input.mime_type ?? null,
          sizeBytes: input.size_bytes ?? null,
          uploadedBy: req.auth?.userId ?? null,
        },
      });

      await logBackendEvent(tx, {
        tableName: "billing_clients",
        rowId: client.id,
        action: "client.attachment.created",
        actorUserId: req.auth?.userId ?? null,
        workspaceId: client.workspaceId,
        payload: {
          file_name: created.fileName,
        } as Prisma.InputJsonValue,
      });

      return created;
    });

    return res.status(201).json({
      attachment: mapBillingAttachment(attachment),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.delete("/admin/ops/clients/:clientId/attachments/:attachmentId", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const paramsSchema = z.object({
      clientId: z.string().uuid(),
      attachmentId: z.string().uuid(),
    });
    const { clientId, attachmentId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.billingAttachment.findFirst({
        where: {
          id: attachmentId,
          billingClientId: clientId,
        },
        select: {
          id: true,
          billingClientId: true,
          workspaceId: true,
          fileName: true,
        },
      });

      if (!existing) {
        return;
      }

      await logBackendEvent(tx, {
        tableName: "billing_clients",
        rowId: clientId,
        action: "client.attachment.deleted",
        actorUserId: req.auth?.userId ?? null,
        workspaceId: existing.workspaceId,
        payload: {
          attachment_id: existing.id,
          file_name: existing.fileName,
        } as Prisma.InputJsonValue,
      });

      await tx.billingAttachment.delete({
        where: { id: attachmentId },
      });
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.get("/admin/ops/suppliers", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const suppliers = await prisma.billingSupplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
      },
    });

    return res.json({
      suppliers: suppliers.map(mapBillingSupplier),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.get("/admin/ops/invoices", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const invoices = await prisma.billingInvoice.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { issueDate: "desc" }],
      take: 500,
    });

    return res.json({
      invoices: invoices.map(mapBillingInvoice),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.post("/admin/ops/invoices", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const input = operationalInvoiceSchema.parse((req as AuthenticatedRequest & { body: unknown }).body);
    const workspaceId = await ensureWorkspaceExists(input.workspace_id);
    const issueDate = parseDateInput(input.issue_date);
    const dueDate = parseDateInput(input.due_date);
    const paidAmount = Number(input.paid_amount ?? 0);
    const totalAmount = Number(input.total_amount ?? 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    const invoice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.billingInvoice.create({
        data: {
          workspaceId,
          invoiceNumber: input.invoice_number.trim(),
          type: input.type,
          supplierId: input.supplier_id ?? null,
          billingClientId: input.billing_client_id ?? null,
          customerName: input.customer_name?.trim() || null,
          customerSnapshot: (input.customer_snapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          vehicleId: input.vehicle_id ?? null,
          fleetId: input.fleet_id ?? null,
          serviceOrderId: input.service_order_id ?? null,
          issueDate: issueDate ?? new Date(),
          dueDate,
          totalAmount,
          paidAmount,
          remainingAmount,
          status: input.status,
          notes: input.notes?.trim() || null,
          metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          source: input.source?.trim() || "manual",
          createdBy: req.auth?.userId ?? null,
          yearReference: (issueDate ?? new Date()).getUTCFullYear(),
        },
      });

      await logBackendEvent(tx, {
        tableName: "billing_invoices",
        rowId: created.id,
        action: "invoice.created",
        actorUserId: req.auth?.userId ?? null,
        workspaceId,
        payload: {
          invoice_number: created.invoiceNumber,
          total_amount: created.totalAmount,
          type: created.type,
        } as Prisma.InputJsonValue,
      });

      return created;
    });

    return res.status(201).json({
      invoice: mapBillingInvoice(invoice),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.patch("/admin/ops/invoices/:invoiceId", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const paramsSchema = z.object({ invoiceId: z.string().uuid() });
    const { invoiceId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);
    const input = operationalInvoiceSchema.parse((req as AuthenticatedRequest & { body: unknown }).body);
    const workspaceId = await ensureWorkspaceExists(input.workspace_id);
    const issueDate = parseDateInput(input.issue_date);
    const dueDate = parseDateInput(input.due_date);
    const paidAmount = Number(input.paid_amount ?? 0);
    const totalAmount = Number(input.total_amount ?? 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    const invoice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.billingInvoice.update({
        where: { id: invoiceId },
        data: {
          workspaceId,
          invoiceNumber: input.invoice_number.trim(),
          type: input.type,
          supplierId: input.supplier_id ?? null,
          billingClientId: input.billing_client_id ?? null,
          customerName: input.customer_name?.trim() || null,
          customerSnapshot: (input.customer_snapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          vehicleId: input.vehicle_id ?? null,
          fleetId: input.fleet_id ?? null,
          serviceOrderId: input.service_order_id ?? null,
          issueDate: issueDate ?? new Date(),
          dueDate,
          totalAmount,
          paidAmount,
          remainingAmount,
          status: input.status,
          notes: input.notes?.trim() || null,
          metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          source: input.source?.trim() || "manual",
          yearReference: (issueDate ?? new Date()).getUTCFullYear(),
        },
      });

      await logBackendEvent(tx, {
        tableName: "billing_invoices",
        rowId: updated.id,
        action: "invoice.updated",
        actorUserId: req.auth?.userId ?? null,
        workspaceId,
        payload: {
          invoice_number: updated.invoiceNumber,
          total_amount: updated.totalAmount,
          status: updated.status,
        } as Prisma.InputJsonValue,
      });

      return updated;
    });

    return res.json({
      invoice: mapBillingInvoice(invoice),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.delete("/admin/ops/invoices/:invoiceId", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const paramsSchema = z.object({ invoiceId: z.string().uuid() });
    const { invoiceId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.billingInvoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          workspaceId: true,
          invoiceNumber: true,
        },
      });

      if (!existing) {
        return;
      }

      await logBackendEvent(tx, {
        tableName: "billing_invoices",
        rowId: existing.id,
        action: "invoice.deleted",
        actorUserId: req.auth?.userId ?? null,
        workspaceId: existing.workspaceId,
        payload: {
          invoice_number: existing.invoiceNumber,
        } as Prisma.InputJsonValue,
      });

      await tx.billingInvoice.delete({
        where: { id: invoiceId },
      });
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.get("/admin/ops/invoices/:invoiceId/audit", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const paramsSchema = z.object({ invoiceId: z.string().uuid() });
    const { invoiceId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);

    const logs = await prisma.backendEventLog.findMany({
      where: {
        tableName: "billing_invoices",
        rowId: invoiceId,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return res.json({
      logs: logs.map((log: {
        id: string;
        action: string;
        createdAt: Date;
        payload: Prisma.JsonValue | null;
        actorUserId: string | null;
      }) => ({
        id: log.id,
        action: log.action,
        created_at: log.createdAt.toISOString(),
        payload: log.payload,
        actor_user_id: log.actorUserId,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.post("/admin/ops/invoices/import", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const input = importInvoiceSchema.parse((req as AuthenticatedRequest & { body: unknown }).body);
    const workspaceId = await ensureWorkspaceExists(input.workspace_id);
    const issueDate = parseDateInput(input.issue_date);
    const dueDate = parseDateInput(input.due_date);
    const paidAmount = Number(input.paid_amount ?? 0);
    const totalAmount = Number(input.total_amount ?? 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    const invoice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.billingInvoice.create({
        data: {
          workspaceId,
          invoiceNumber: input.invoice_number.trim(),
          type: input.type,
          supplierId: input.supplier_id ?? null,
          billingClientId: input.billing_client_id ?? null,
          customerName: input.customer_name?.trim() || null,
          customerSnapshot: (input.customer_snapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          vehicleId: input.vehicle_id ?? null,
          fleetId: input.fleet_id ?? null,
          serviceOrderId: input.service_order_id ?? null,
          issueDate: issueDate ?? new Date(),
          dueDate,
          totalAmount,
          paidAmount,
          remainingAmount,
          status: input.status,
          notes: input.notes?.trim() || null,
          metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          source: input.source?.trim() || "imported",
          createdBy: req.auth?.userId ?? null,
          yearReference: (issueDate ?? new Date()).getUTCFullYear(),
        },
      });

      await tx.billingAttachment.create({
        data: {
          workspaceId,
          invoiceId: created.id,
          fileName: input.attachment.file_name,
          storagePath: input.attachment.data_url,
          mimeType: input.attachment.mime_type ?? null,
          sizeBytes: input.attachment.size_bytes ?? null,
          uploadedBy: req.auth?.userId ?? null,
        },
      });

      await logBackendEvent(tx, {
        tableName: "billing_invoices",
        rowId: created.id,
        action: "invoice.imported",
        actorUserId: req.auth?.userId ?? null,
        workspaceId,
        payload: {
          invoice_number: created.invoiceNumber,
          file_name: input.attachment.file_name,
        } as Prisma.InputJsonValue,
      });

      return created;
    });

    return res.status(201).json({
      invoice: mapBillingInvoice(invoice),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.get("/admin/ops/invoices/:invoiceId/send-log", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const paramsSchema = z.object({ invoiceId: z.string().uuid() });
    const { invoiceId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);

    const logs = await prisma.invoiceSendLog.findMany({
      where: { invoiceId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return res.json({
      logs: logs.map(mapSendLog),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.post("/admin/ops/invoices/:invoiceId/send", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    const paramsSchema = z.object({ invoiceId: z.string().uuid() });
    const { invoiceId } = paramsSchema.parse((req as AuthenticatedRequest & { params: unknown }).params);
    const input = sendInvoiceSchema.parse((req as AuthenticatedRequest & { body: unknown }).body);

    const invoice = await prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        workspaceId: true,
        invoiceNumber: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    if (input.idempotency_key) {
      const existing = await prisma.invoiceSendLog.findFirst({
        where: {
          invoiceId,
          idempotencyKey: input.idempotency_key,
        },
      });

      if (existing) {
        return res.json({
          ok: true,
          provider: existing.provider,
          simulated: existing.provider === "simulated",
          log: mapSendLog(existing),
        });
      }
    }

    const pdfPath =
      input.pdf_base64 && input.pdf_file_name
        ? `data:application/pdf;base64,${input.pdf_base64}`
        : null;

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const recipient = input.recipient.trim().toLowerCase();
    const cc = input.cc?.trim() || null;
    const subject = input.subject.trim();
    const body = input.message?.trim() || null;

    let provider: string = "simulated";
    let status: string = "sent";
    let errorText: string | null = null;
    let providerMessageId: string | null = null;
    let sentAt: Date | null = new Date();

    if (isEmailConfigured()) {
      provider = "smtp";
      const html = `<!doctype html><html><body style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827">
<h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2>
${body ? `<p style="margin:0 0 12px;white-space:pre-wrap">${escapeHtml(body)}</p>` : ""}
<p style="margin:12px 0 0;font-size:12px;color:#6b7280">QWork Nexus · Fatura ${escapeHtml(invoice.invoiceNumber)}</p>
</body></html>`;

      const attachments =
        input.pdf_base64 && input.pdf_file_name
          ? [{ filename: input.pdf_file_name, contentBase64: input.pdf_base64 }]
          : null;

      const sendResult = await sendEmail({
        to: recipient,
        cc,
        subject,
        html,
        text: body ?? undefined,
        attachments,
      });

      if (!sendResult.ok) {
        status = "failed";
        errorText = sendResult.error;
        sentAt = null;
      } else {
        providerMessageId = sendResult.id;
      }
    }

    const log = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.invoiceSendLog.create({
        data: {
          invoiceId,
          recipient,
          cc,
          subject,
          body,
          provider,
          status,
          error: errorText,
          idempotencyKey: input.idempotency_key?.trim() || null,
          pdfPath,
          kind: input.kind,
          sentBy: req.auth?.userId ?? null,
          sentAt,
        },
      });

      await logBackendEvent(tx, {
        tableName: "billing_invoices",
        rowId: invoiceId,
        action: input.kind === "reminder" ? "invoice.reminder.sent" : "invoice.sent",
        actorUserId: req.auth?.userId ?? null,
        workspaceId: invoice.workspaceId,
        payload: {
          invoice_number: invoice.invoiceNumber,
          recipient: created.recipient,
          provider: created.provider,
          kind: created.kind,
          provider_message_id: providerMessageId,
        } as Prisma.InputJsonValue,
      });

      return created;
    });

    if (log.status !== "sent") {
      return res.status(502).json({
        ok: false,
        provider: log.provider,
        simulated: false,
        message: "Falha ao enviar email.",
        error: log.error,
        log: mapSendLog(log),
      });
    }

    return res.json({
      ok: true,
      provider: log.provider,
      simulated: log.provider === "simulated",
      log: mapSendLog(log),
    });
  } catch (error) {
    return next(error);
  }
});

operationalBillingRouter.get("/admin/ops/payments", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;
    // Return empty array for now — billing_payments table not yet migrated
    return res.json({ payments: [] });
  } catch (error) {
    return next(error);
  }
});
