import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  operationalWeekOf,
  flattenServicesFromBudgetNotes,
  isWeekClosed,
} from "../lib/weekUtils.js";

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

// ---------------------------------------------------------------------------
// Helpers: Pastas semana + veículo no WEEKLOG (Document.type="folder" nativo)
// e link de fotos da Produção para o veículo (mesmo storage_path → NÃO duplica
// bytes no storage). ZERO migrations, tudo sobre tabela `documents` existente.
// ---------------------------------------------------------------------------
const DOC_ENTITY_TYPE_WEEKLOG = "service_order";
const DOC_MODULE_WEEKLOG = "orders"; // compatível com HierarchyExplorer do WEEKLOG

function sanitizeFolderName(raw: string | null | undefined): string {
  if (!raw) return "UNTITLED";
  return String(raw)
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase() || "UNTITLED";
}

function vehicleFolderName(
  brand: string | null | undefined,
  model: string | null | undefined,
  licensePlate: string | null | undefined,
): string {
  const vehicle = sanitizeFolderName([brand, model].filter(Boolean).join(" "));
  const plate = sanitizeFolderName(licensePlate || "SEM-MATRICULA");
  return `${vehicle} - ${plate}`;
}

async function upsertWeekFolder(
  workspaceId: string,
  userId: string,
  weekNumber: number,
  yearReference: number,
  retificacao: boolean = false,
): Promise<{ id: string; created: boolean }> {
  const name = retificacao
    ? `Week ${String(weekNumber).padStart(2, "0")} — Retificação`
    : `Week ${String(weekNumber).padStart(2, "0")}`;
  try {
    const found = await prisma.document.findFirst({
      where: {
        workspaceId,
        entityType: DOC_ENTITY_TYPE_WEEKLOG,
        module: DOC_MODULE_WEEKLOG,
        type: "folder",
        parentId: null,
        name,
      },
      select: { id: true },
    });
    if (found) return { id: found.id, created: false };

    const created = await prisma.document.create({
      data: {
        workspaceId,
        entityType: DOC_ENTITY_TYPE_WEEKLOG,
        module: DOC_MODULE_WEEKLOG,
        type: "folder",
        parentId: null,
        name,
        displayName: `${name} · ${yearReference}${retificacao ? " · Atrasado" : ""}`,
        uploadedBy: userId || null,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (err) {
    console.error("[weeklog][folders] Falha upsertWeekFolder:", err);
    throw err;
  }
}

async function upsertVehicleFolder(
  workspaceId: string,
  userId: string,
  weekFolderId: string,
  brand: string | null | undefined,
  model: string | null | undefined,
  licensePlate: string | null | undefined,
): Promise<{ id: string; created: boolean }> {
  const name = vehicleFolderName(brand, model, licensePlate);
  try {
    const found = await prisma.document.findFirst({
      where: {
        workspaceId,
        entityType: DOC_ENTITY_TYPE_WEEKLOG,
        module: DOC_MODULE_WEEKLOG,
        type: "folder",
        parentId: weekFolderId,
        name,
      },
      select: { id: true },
    });
    if (found) return { id: found.id, created: false };

    const created = await prisma.document.create({
      data: {
        workspaceId,
        entityType: DOC_ENTITY_TYPE_WEEKLOG,
        module: DOC_MODULE_WEEKLOG,
        type: "folder",
        parentId: weekFolderId,
        name,
        uploadedBy: userId || null,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (err) {
    console.error("[weeklog][folders] Falha upsertVehicleFolder:", err);
    throw err;
  }
}

async function ensureWeekVehicleFoldersAndLinkPhotos(
  po: {
    id: string;
    workspaceId: string;
    brand: string | null;
    model: string | null;
    licensePlate: string | null;
    photos?: Array<{ id: string; storagePath: string; category: string; caption: string | null; sizeBytes: number | null; uploadedBy: string }>;
  },
  userId: string,
  weekNumber: number,
  yearReference: number,
  _serviceOrderId: string,
  retificacao: boolean = false,
): Promise<{
  week_folder_id: string | null;
  vehicle_folder_id: string | null;
  week_folder_created: boolean;
  vehicle_folder_created: boolean;
  linked_photos_count: number;
  skipped_photos_count: number;
  errors: string[];
}> {
  const result = {
    week_folder_id: null as string | null,
    vehicle_folder_id: null as string | null,
    week_folder_created: false,
    vehicle_folder_created: false,
    linked_photos_count: 0,
    skipped_photos_count: 0,
    errors: [] as string[],
  };
  try {
    const photos = po.photos || [];

    // 1) Criar/buscar Week XX folder (raiz) — com ou sem retificação
    const wk = await upsertWeekFolder(po.workspaceId, userId, weekNumber, yearReference, retificacao);
    result.week_folder_id = wk.id;
    result.week_folder_created = wk.created;

    // 2) Criar/buscar Veículo folder filho
    const vh = await upsertVehicleFolder(po.workspaceId, userId, wk.id, po.brand, po.model, po.licensePlate);
    result.vehicle_folder_id = vh.id;
    result.vehicle_folder_created = vh.created;

    // 3) Linkar cada ProductionPhoto como Document(type=file) filho do veículo
    //    (reusa storage_path da foto — NÃO duplica binário no storage)
    for (const photo of photos) {
      try {
        if (!photo.storagePath) {
          result.skipped_photos_count += 1;
          continue;
        }
        // idempotência: já existe Document com este storagePath sob este vehicleFolder?
        const already = await prisma.document.findFirst({
          where: {
            workspaceId: po.workspaceId,
            parentId: vh.id,
            storagePath: photo.storagePath,
          },
          select: { id: true },
        });
        if (already) {
          result.skipped_photos_count += 1;
          continue;
        }

        const ext = photo.storagePath.split(".").pop() || "";
        const safeCaption = photo.caption && photo.caption.trim().length > 0 ? photo.caption : `${photo.category || "photo"}_${photo.id.slice(0, 8)}`;
        const name = ext ? `${safeCaption}.${ext}` : safeCaption;

        await prisma.document.create({
          data: {
            workspaceId: po.workspaceId,
            entityType: DOC_ENTITY_TYPE_WEEKLOG,
            module: DOC_MODULE_WEEKLOG,
            type: "file",
            parentId: vh.id,
            name,
            displayName: photo.caption || null,
            storagePath: photo.storagePath,
            sizeBytes: photo.sizeBytes ?? null,
            uploadedBy: photo.uploadedBy || userId || null,
          },
        });
        result.linked_photos_count += 1;
      } catch (pErr) {
        result.skipped_photos_count += 1;
        result.errors.push(`photo ${photo.id}: ${pErr instanceof Error ? pErr.message : String(pErr)}`);
      }
    }

    return result;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
}

// ---------------------------------------------------------------------------
// Hook: Produção → WEEKLOG automático.
// Regra: Quando ProductionOrder status = "delivered" (Finalizado), cria OU
// atualiza uma entrada ServiceOrder (WEEKLOG) com a semana operacional correta
// (domingo a sábado). Usa production_orders.service_order_id como chave
// idempotente — NÃO duplica, sempre atualiza se já houver vínculo.
// NÃO quebra lógica atual: ordens de pagamento continuam independentes.
// Cria também a hierarquia de pastas Week XX / Veículo e linka as fotos.
// ---------------------------------------------------------------------------
async function upsertWeeklogFromProduction(
  poId: string,
  userId: string,
): Promise<{ weeklog?: any; action?: "created" | "updated" | "skipped"; reason?: string; folders?: any }> {
  try {
    const po = await prisma.productionOrder.findUnique({ where: { id: poId }, include: { photos: true } });
    if (!po) return { action: "skipped", reason: "production_order_not_found" };
    if (po.status !== "delivered") return { action: "skipped", reason: "not_finalized" };

    const refDate = po.deliveredAt ?? po.finishedAt ?? new Date();
    const weekInfo = operationalWeekOf(refDate);

    // --- PROMPT 5: RETIFICAÇÃO (semana original vs semana finalização real) ---
    // Semana original esperada (de entrada/criação/início de produção) como referência.
    const originalDate = po.startedAt ?? po.dueAt ?? po.createdAt ?? refDate;
    const originalWeekInfo = operationalWeekOf(originalDate);
    const isRetificacao =
      originalWeekInfo.weekNumber !== weekInfo.weekNumber ||
      originalWeekInfo.yearReference !== weekInfo.yearReference;

    // Efetivo (se retificação → usar a ORIGINAL com sufixo A: W26A / pasta "Week 26 — Retificação").
    // Semana finalizada (data real entrega continua salva como meta-info em operational.base).
    let effective = isRetificacao
      ? {
          week: `${originalWeekInfo.yearReference}-W${String(originalWeekInfo.weekNumber).padStart(2, "0")}A`, // 2026-W26A
          yearReference: originalWeekInfo.yearReference,
          weekNumber: originalWeekInfo.weekNumber,
          weekDisplay: `Week ${String(originalWeekInfo.weekNumber).padStart(2, "0")} — Retificação`,
          weekShortDisplay: `${String(originalWeekInfo.weekNumber).padStart(2, "0")}A · Retificação`,
        }
      : {
          week: weekInfo.week,
          yearReference: weekInfo.yearReference,
          weekNumber: weekInfo.weekNumber,
          weekDisplay: weekInfo.displayShort,
          weekShortDisplay: weekInfo.displayShort,
        };

    // -----------------------------------------------------------------------
    // PROMPT 6: Regra de FECHAMENTO SEMANAL
    // - Se NÃO é retificação (registro NORMAL) e a semana do delivery está
    //   FECHADA (hoje > sábado fim da semana) → NÃO cria/atualiza na semana
    //   antiga (REGRA 2). Automaticamente encaixa na SEMANA ATUAL (REGRA 3).
    // - Retificações NÃO são bloqueadas (REGRA 4): elas sempre podem entrar
    //   mesmo após fechamento, com o sufixo A apontando para semana original.
    // -----------------------------------------------------------------------
    if (!isRetificacao && isWeekClosed(effective.week)) {
      const todayWeek = operationalWeekOf(new Date());
      effective = {
        week: todayWeek.week,
        yearReference: todayWeek.yearReference,
        weekNumber: todayWeek.weekNumber,
        weekDisplay: todayWeek.displayShort,
        weekShortDisplay: todayWeek.displayShort,
      };
    }

    const { items: svc, total: budgetTotal } = flattenServicesFromBudgetNotes(po.notes ?? null);
    const s1 = svc[0] ?? null;
    const s2 = svc[1] ?? null;
    const s3 = svc[2] ?? null;
    const s4 = svc[3] ?? null;

    const carNameParts = [po.brand, po.model, po.color].filter(Boolean).join(" ") || null;
    // Carrega distributionSnapshot existente (com validações salvas anteriormente, se existir)
    // — declarado ANTES de usar no operational_document merge.
    const existingDistributionSnapshot = po.serviceOrderId
      ? (await prisma.serviceOrder.findUnique({ where: { id: po.serviceOrderId }, select: { distributionSnapshot: true } }))?.distributionSnapshot ?? null
      : null;
    const existingDist = existingDistributionSnapshot || null;
    const existingOperational = (existingDist && typeof existingDist === "object" && (existingDist as any).operational_document) || {};
    // ---------------------------------------------------------------------
    // PROMPT 6 REGRA 9: Validação já registrada PRESERVADA e NÃO SOBRESCRITA
    // por nova execução automática do hook de produção.
    // - Se existir validation.xxx com situation=oui ou historico preenchido,
    //   mantemos o validation intacto sem nenhum spread/merge perigoso.
    // - O mesmo para retificativa já salva pelo Dialog.
    // ---------------------------------------------------------------------
    const preserved: Record<string, unknown> = {};
    for (const k of ["validation", "retificativa", "historico", "historico_validacoes"] as const) {
      const v = (existingOperational as any)?.[k];
      if (v !== undefined && v !== null) {
        if (typeof v !== "object" || Array.isArray(v)) {
          if (Array.isArray(v) ? v.length > 0 : true) preserved[k] = v;
        } else if (Object.keys(v as any).length > 0) {
          preserved[k] = v;
        }
      }
    }
    const distributionSnapshot = {
      ...(existingDist && typeof existingDist === "object" ? (existingDist as Record<string, unknown>) : {}),
      operational_document: {
        ...(existingOperational as Record<string, unknown>),
        ...preserved,
        base: {
          ...((existingOperational as any)?.base && typeof (existingOperational as any).base === "object"
            ? ((existingOperational as any).base as Record<string, unknown>)
            : {}),
          vin: po.vin ?? null,
          insurer: po.insurer ?? null,
          delivered_at: (po.deliveredAt ?? refDate).toISOString(),
          brand: po.brand ?? null,
          model: po.model ?? null,
          color: po.color ?? null,
          production_order_id: po.id,
          production_code: po.code ?? null,
          week_number: effective.weekNumber,
          week_display: effective.weekShortDisplay,
          photos_count: (po.photos ?? []).length,
          retificacao: isRetificacao,
          semana_original: {
            week: originalWeekInfo.week,
            week_number: originalWeekInfo.weekNumber,
            display: originalWeekInfo.displayShort,
            year_reference: originalWeekInfo.yearReference,
            data_referencia: originalDate.toISOString(),
          },
          semana_finalizacao: {
            week: weekInfo.week,
            week_number: weekInfo.weekNumber,
            display: weekInfo.displayShort,
            year_reference: weekInfo.yearReference,
            data_real: refDate.toISOString(),
          },
          data_entrega_real: refDate.toISOString(),
        },
      },
    };
    const weeklogData = {
      workspaceId: po.workspaceId,
      visibilityScope: "workspace" as const,
      userId: userId || po.createdBy || "",
      assignedUserId: po.technicianUserId || userId || po.createdBy || "",
      clientId: po.clientId ?? null,
      clientName: po.clientName ?? "",
      carName: carNameParts ? String(carNameParts) : null,
      licensePlate: po.licensePlate ?? null,
      platform: po.platform ?? null,
      operationalUnit: null,
      groupId: null,
      week: effective.week,
      yearReference: effective.yearReference,
      technicianName: po.technicianName ?? "",
      technicianEarning: null,
      technicianPercentage: null,
      service1Name: s1 ? s1.desc : null,
      service1Price: s1 ? (isFinite(s1.price) ? s1.price : null) : null,
      service2Name: s2 ? s2.desc : null,
      service2Price: s2 ? (isFinite(s2.price) ? s2.price : null) : null,
      service3Name: s3 ? s3.desc : null,
      service3Price: s3 ? (isFinite(s3.price) ? s3.price : null) : null,
      service4Name: s4 ? s4.desc : null,
      service4Price: s4 ? (isFinite(s4.price) ? s4.price : null) : null,
      total: budgetTotal > 0 ? budgetTotal : null,
      status: "confirmed" as const,
      distributionSnapshot,
    };

    // Helper local: cria/atualiza pastas e linka fotos (NUNCA quebra o fluxo weeklog)
    const attachFolders = async (serviceOrderId: string) => {
      try {
        return await ensureWeekVehicleFoldersAndLinkPhotos(
          po as any,
          userId,
          effective.weekNumber,
          effective.yearReference,
          serviceOrderId,
          isRetificacao, // criar pasta "Week XX — Retificação"
        );
      } catch (foldersErr) {
        console.error("[weeklog][folders] Falha anexar pastas/fotos:", foldersErr);
        return { errors: [foldersErr instanceof Error ? foldersErr.message : String(foldersErr)] };
      }
    };

    // 1) Idempotência: já existe vínculo por serviceOrderId → atualiza a existente
    if (po.serviceOrderId) {
      const existing = await prisma.serviceOrder.findUnique({ where: { id: po.serviceOrderId } });
      if (existing) {
        const updated = await prisma.serviceOrder.update({
          where: { id: po.serviceOrderId },
          data: weeklogData,
        });
        const folders = await attachFolders(updated.id);
        return { weeklog: updated, action: "updated", folders };
      }
    }

    // 2) Idempotência 2: já existe outra entrada WEEKLOG com semana +
    //    (licensePlate OU cliente+vin) — impede duplicação de veículo (REGRA 6).
    //    Inclui SEMANA RETIFICADA WXXA se for o caso.
    const baseFilter: any = {
      workspaceId: po.workspaceId,
      deletedAt: null,
      week: effective.week,
      yearReference: effective.yearReference,
    };
    const vinFilter = po.vin ? { distributionSnapshot: { path: ["operational_document", "base", "vin"], equals: po.vin } } : null;
    const plateFilter = po.licensePlate ? { licensePlate: po.licensePlate } : null;
    const clientFilter = po.clientId
      ? { clientId: po.clientId }
      : po.clientName
        ? { clientName: po.clientName }
        : null;
    const whereClauses: any[] = [];
    if (plateFilter) {
      if (clientFilter) whereClauses.push({ ...baseFilter, ...plateFilter, ...clientFilter });
      whereClauses.push({ ...baseFilter, ...plateFilter });
    }
    if (vinFilter) {
      whereClauses.push({ ...baseFilter, ...vinFilter });
      if (clientFilter) whereClauses.push({ ...baseFilter, ...vinFilter, ...clientFilter });
    }
    // NÃO incluir clientFilter SOZINHO (sem placa / sem VIN): mesmo cliente pode
    // ter vários veículos diferentes na mesma semana, e isso causava duplicação
    // indevida (REGRA 6: "Não permitir duplicação de veículos.").
    const similar = whereClauses.length > 0
      ? await prisma.serviceOrder.findFirst({
          where: { OR: whereClauses },
          orderBy: { createdAt: "desc" },
        })
      : null;

    if (similar) {
      // Garante que o productionOrder aponte para esta weeklog (se ainda não estiver atrelado)
      if (!po.serviceOrderId || po.serviceOrderId !== similar.id) {
        await prisma.productionOrder.update({
          where: { id: po.id },
          data: { serviceOrderId: similar.id },
        });
      }
      const updated = await prisma.serviceOrder.update({
        where: { id: similar.id },
        data: weeklogData,
      });
      const folders = await attachFolders(updated.id);
      return { weeklog: updated, action: "updated", folders };
    }

    // 3) Nenhuma entrada encontrada → cria NOVA entrada WEEKLOG + vincula id
    const created = await prisma.serviceOrder.create({
      data: weeklogData,
    });
    await prisma.productionOrder.update({
      where: { id: po.id },
      data: { serviceOrderId: created.id },
    });
    const folders = await attachFolders(created.id);
    return { weeklog: created, action: "created", folders };
  } catch (err) {
    // NÃO interromper fluxo principal de salvar Produção caso algo falhe no WEEKLOG.
    // Registra e segue (o usuário pode resolver depois manualmente).
    console.error("[weeklog] Falha ao gerar/atualizar entrada automática:", err);
    return { action: "skipped", reason: err instanceof Error ? err.message : String(err) };
  }
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

  // Hook automático: WEEKLOG se foi criado já como "Finalizado" (delivered)
  let weeklog: any = undefined;
  if (order.status === "delivered") {
    weeklog = await upsertWeeklogFromProduction(order.id, req.auth?.userId ?? order.createdBy ?? "");
  }
  return res.status(201).json({ ...mapOrder(order), weeklog });
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

  // Hook automático: WEEKLOG (Produção → Finalizado)
  // Sempre que status = delivered (finalizado), geramos/atualizamos a entrada do WEEKLOG
  let weeklog: any = undefined;
  if (order.status === "delivered") {
    weeklog = await upsertWeeklogFromProduction(order.id, req.auth?.userId ?? order.createdBy ?? "");
  }
  return res.json({ ...mapOrder(order), weeklog });
});

// DELETE /production-orders/:id
productionOrdersRouter.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params["id"] as string;
  await prisma.productionOrder.delete({ where: { id } });
  return res.json({ deleted: 1 });
});
