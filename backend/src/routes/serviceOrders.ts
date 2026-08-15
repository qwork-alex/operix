import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

// ---------------------------------------------------------------------------
// Helpers: merge profundo operational_document (para PATCH parcial não perder
// chaves irmãs como base/validation/retificativa).
// ---------------------------------------------------------------------------
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function deepMerge(a: unknown, b: unknown): unknown {
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out: Record<string, unknown> = { ...a };
  for (const k of Object.keys(b)) {
    const av = (a as any)[k]; const bv = (b as any)[k];
    if (isPlainObject(av) && isPlainObject(bv)) out[k] = deepMerge(av, bv);
    else out[k] = bv;
  }
  return out;
}
/** Merge do distributionSnapshot novo (payload) com o antigo do banco para não perder chaves irmãs. */
function mergeDistributionSnapshots(oldSnap: unknown, newSnap: unknown): any {
  const base = isPlainObject(oldSnap) ? oldSnap : {};
  const incoming = isPlainObject(newSnap) ? newSnap : {};
  // Trata operational_document como merge profundo (base/validation/retificativa).
  const opOld = (base as any).operational_document ?? null;
  const opNew = (incoming as any).operational_document ?? null;
  let opMerged = opOld && opNew ? deepMerge(opOld, opNew) : (opNew || opOld || null);
  // Segurança: arrays em validation como `historico`, `historico_validacoes` NUNCA sobrescrever com undefined/null/nao-presente no incoming.
  if (opMerged && isPlainObject(opMerged)) {
    const op = opMerged as Record<string, any>;
    if (op.validation && isPlainObject(op.validation) && isPlainObject(opOld?.validation)) {
      const valid = op.validation as Record<string, any>;
      for (const k of ["historico", "historico_validacoes"]) {
        if (valid[k] === undefined && Array.isArray((opOld as any).validation[k])) {
          valid[k] = (opOld as any).validation[k];
        }
      }
      // Também preserva se o novo validation TINHA historico mas incoming NÃO (garantir)
    }
    opMerged = op;
  }
  return {
    ...base,
    ...incoming,
    ...(opMerged ? { operational_document: opMerged } : {}),
  };
}

// ---------------------------------------------------------------------------
// Helpers: geração LISTA (padrão L010132) + criação Ordem Pagamento idempotente.
// Formato: L + id_tec(2d) + seq_por_tec_sem(2d) + semana(2d)
//   - id_tec 2 dígitos: ÍNDICE (1-based) do técnico na lista ordenada de técnicos
//     já existentes NESTE workspace (ou se assigned_user_id conhecido = busca por
//     user_id no histórico de payment/service orders; fallback hash mod).
//   - seq 2 dígitos: quantas listas já existem (contagem payment_orders.list_name
//     com o mesmo id_tec e mesma semana) + 1
//   - semana 2 dígitos: week_number
// ---------------------------------------------------------------------------
export const serviceOrdersRouter = Router();

function mapOrder(o: any) {
  // Extrai chave operational_document do distributionSnapshot JSON (campo legado, sem migration nova)
  const distSnap = o.distributionSnapshot && typeof o.distributionSnapshot === "object" ? o.distributionSnapshot : null;
  const operational_document = (distSnap && (distSnap as any).operational_document) || null;
  // Dados da Produção (vindos via JOIN production order ou da base operational_document)
  const opBase = (operational_document && (operational_document as any).base) || null;
  const prodJoin = o._productionOrder || null;
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
    distribution_snapshot: distSnap,
    operational_document,
    production_vin: prodJoin?.vin ?? opBase?.vin ?? null,
    production_insurer: prodJoin?.insurer ?? opBase?.insurer ?? null,
    production_delivered_at:
      prodJoin?.deliveredAt
        ? (typeof prodJoin.deliveredAt === "string" ? prodJoin.deliveredAt : (prodJoin.deliveredAt as Date)?.toISOString())
        : opBase?.delivered_at ?? null,
    production_code: prodJoin?.code ?? opBase?.production_code ?? null,
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
  // distribution_snapshot: preserva chaves antigas (JSON legado) e mescla novas.
  // Se chegar `operational_document` diretamente (como faz UI Dialog), mescla no distributionSnapshot.
  if (b.distribution_snapshot !== undefined || b.operational_document !== undefined) {
    // distribuição informada explicitamente? usar; senão null e depois mesclar operational
    const dist: Record<string, any> =
      b.distribution_snapshot && typeof b.distribution_snapshot === "object"
        ? { ...(b.distribution_snapshot as Record<string, unknown>) }
        : {};
    if (b.operational_document !== undefined) {
      dist.operational_document = b.operational_document;
    }
    d.distributionSnapshot = dist;
  }
  if (b.created_by !== undefined) d.createdBy = b.created_by || null;
  return d;
}

// ---------------------------------------------------------------------------
// Geração CÓDIGO LISTA padrão L010132 (id_tec(2) + seq(2) + semana(2)).
// Sempre determinístico por (workspace, user_id_tecnico, semana, ano).
// ---------------------------------------------------------------------------
async function getTechnicianIndex2Digit(workspaceId: string, userId: string | null): Promise<string> {
  if (!userId) return "01";
  // Buscar todos técnicos distintos por ordem de primeira aparição (mais cedo).
  const [serviceRows, payRows, prodRows] = await Promise.all([
    prisma.serviceOrder.findMany({
      where: { workspaceId, deletedAt: null },
      select: { assignedUserId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.paymentOrder.findMany({
      where: { workspaceId, deletedAt: null },
      select: { assignedUserId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.productionOrder.findMany({
      where: { workspaceId },
      select: { technicianUserId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const list: Array<{ uid: string; at: Date }> = [];
  for (const r of serviceRows) if (r.assignedUserId) list.push({ uid: r.assignedUserId, at: r.createdAt });
  for (const r of payRows) if (r.assignedUserId) list.push({ uid: r.assignedUserId, at: r.createdAt });
  for (const r of prodRows) if (r.technicianUserId) list.push({ uid: r.technicianUserId, at: r.createdAt });
  // Determinístico: ordenar por at crescente, pegar order distinct primeiros.
  list.sort((a, b) => a.at.getTime() - b.at.getTime());
  const distinct: string[] = [];
  for (const it of list) if (!distinct.includes(it.uid)) distinct.push(it.uid);
  if (!distinct.includes(userId)) distinct.push(userId);
  const idx = distinct.indexOf(userId) + 1; // 1-based
  return idx.toString().padStart(2, "0").slice(-2);
}
async function listCodeNextSequence(workspaceId: string, idTec2: string, week2: string, yearRef: number): Promise<string> {
  const prefix = `L${idTec2}`;
  const prefixWeek = `${prefix}__${week2}_${yearRef}`; // máscara apenas
  const rePattern = new RegExp(`^L${idTec2}(\\d{2})${week2}$`);
  const existing = await prisma.paymentOrder.findMany({
    where: { workspaceId, deletedAt: null, yearReference: yearRef },
    select: { listName: true },
  });
  let max = 0;
  for (const row of existing) {
    if (!row.listName) continue;
    const m = row.listName.match(rePattern);
    if (m && m[1]) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return (max + 1).toString().padStart(2, "0").slice(-2);
  // prefixWeek usamos para suppress unused warning
  void prefixWeek;
}

// Helper robusto: situation = validado? Case-insensitive + trim + booleanos.
// Evita inconsistências de UI (ex: "Sim" vs "sim", "OUI" vs "oui", "true" vs true).
function isSituationValidated(situ: unknown): boolean {
  if (situ === true) return true;
  if (typeof situ !== "string") return false;
  const s = situ.trim().toLowerCase();
  if (!s) return false;
  return s === "oui" || s === "sim" || s === "true" || s === "1" || s === "yes" || s === "validado" || s === "assinado";
}

// Cria PaymentOrder associado a um serviceOrder validado. Idempotente por payment_order_id salvo em validation.
async function createPaymentOrderFromValidatedWeeklog(
  ctx: { serviceOrderId: string; userId: string; workspaceId: string; },
  before: { distSnap: any; },
): Promise<{ listName: string; paymentOrderId: string; } | null> {
  const op = (before.distSnap && typeof before.distSnap === "object" && (before.distSnap as any).operational_document) || null;
  const validation = op?.validation || null;
  const base = op?.base || null;
  const situ = validation?.situation || validation?.validation_sit || null;
  const sim = isSituationValidated(situ);
  if (!sim) return null;
  if (validation?.payment_order_id) return null;
  const idempot = await prisma.paymentOrder.findFirst({ where: { workspaceId: ctx.workspaceId, serviceOrderId: ctx.serviceOrderId, deletedAt: null } });
  if (idempot) {
    return { listName: idempot.listName || "", paymentOrderId: idempot.id };
  }

  const so = await prisma.serviceOrder.findUnique({ where: { id: ctx.serviceOrderId } });
  if (!so) return null;
  const po = await prisma.productionOrder.findFirst({ where: { workspaceId: ctx.workspaceId, serviceOrderId: so.id }, orderBy: { createdAt: "desc" } });
  const weekStr = so.week ?? base?.week_display ?? "";
  const week2Clean = Number.isFinite(+weekStr.match(/W(\d+)/)?.[1])
    ? (+(weekStr.match(/W(\d+)/)?.[1])).toString().padStart(2, "0")
    : (+(base?.week_number ?? so.yearReference ?? 0)).toString().padStart(2, "0");
  const yearRef = so.yearReference ?? (base?.delivered_at ? new Date(base.delivered_at).getUTCFullYear() : new Date().getUTCFullYear());
  const idTec2 = await getTechnicianIndex2Digit(ctx.workspaceId, so.assignedUserId || po?.technicianUserId || ctx.userId);
  const seq2 = await listCodeNextSequence(ctx.workspaceId, idTec2, week2Clean, yearRef);
  const listName = `L${idTec2}${seq2}${week2Clean}`;

  const servicesArr: Array<any> = [];
  for (let i = 1; i <= 4; i++) {
    const n = (so as any)[`service${i}Name`];
    const p = (so as any)[`service${i}Price`];
    if (n && String(n).trim()) servicesArr.push({ idx: i, name: n, price: typeof p === "number" ? p : parseFloat(p) || 0 });
  }
  const totalFinal = typeof validation?.valor_final === "number" ? validation.valor_final
    : (typeof validation?.value === "number" ? validation.value : (typeof so.total === "number" ? so.total : 0));

  const techId = so.assignedUserId || po?.technicianUserId || ctx.userId || "";
  let paymentCreated;
  try {
    paymentCreated = await prisma.paymentOrder.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId || "",
        assignedUserId: techId || "",
        createdBy: ctx.userId || null,
        clientId: so.clientId || null,
        clientName: so.clientName || po?.clientName || null,
        carName: so.carName || (po?.brand && po?.model ? `${po.brand} ${po.model}` : null) || null,
        licensePlate: so.licensePlate || po?.licensePlate || null,
        platform: so.platform || po?.platform || null,
        operationalUnit: so.operationalUnit || null,
        groupId: so.groupId || null,
        listName,
        yearReference: yearRef,
        technicianId: techId || null,
        technicianName: so.technicianName || po?.technicianName || validation?.responsavel_nome || null,
        services: servicesArr.length ? servicesArr : undefined,
        serviceOrderId: so.id,
        amountPaid: 0,
        total: totalFinal || 0,
        status: "pending",
      },
    });
  } catch (e: any) {
    console.error(`[createPaymentOrderFromValidatedWeeklog] ERRO serviceOrder=${ctx.serviceOrderId}:`, e?.message || e);
    return null;
  }
  return { listName, paymentOrderId: paymentCreated.id };
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

  // ============================================================
  // CAUSA REAL DA DUPLICIDADE (corrigida AQUI)
  //
  // Antes: filtro usava APENAS validation.payment_order_id / list_name
  //       como prova de transferência.
  //
  // Problema: Se `createPaymentOrderFromValidatedWeeklog` criasse a
  //           PaymentOrder com sucesso (FK serviceOrderId) mas a
  //           etapa de INJECT-BACK de payment_order_id no
  //           ServiceOrder.distributionSnapshot falhasse, ficávamos
  //           com:
  //             - LISTA (payment_orders table) com o registro ✔️
  //             - WEEKLOG (service_orders filter) mostrava tb ❌
  //           = DUPLICIDADE.
  //
  // Correção:
  //   (a) Buscar TODOS payment_orders ligados por FK serviceOrderId
  //       → FONTE DA VERDADE é a tabela payment_orders
  //   (b) Para cada registro validado: se FK existe mas campos
  //       validation NÃO tem payment_order_id, ESCREVE DE VOLTA
  //       no banco (RECONCILIAÇÃO PERSISTENTE).
  //   (c) Filtrar SEMPRE baseado em (validation OU FK), não só um.
  // ============================================================
  const orderIds = orders.map(o => o.id);
  const linkedPayments = orderIds.length
    ? await prisma.paymentOrder.findMany({
        where: { workspaceId: workspace_id, deletedAt: null, serviceOrderId: { in: orderIds } },
        select: { id: true, serviceOrderId: true, listName: true },
      })
    : [];
  const transferredById = new Map<string, { paymentOrderId: string; listName: string }>();
  for (const p of linkedPayments) {
    if (p.serviceOrderId) transferredById.set(p.serviceOrderId, { paymentOrderId: p.id, listName: p.listName || "" });
  }

  // --- RECONCILIAÇÃO (persistência real, não só visual) ---
  // Garante que o banco reflete SEMPRE a transferência ocorrida por FK.
  // Processa INDIVIDUALMENTE por ID.
  const reconciliations: Array<Promise<unknown>> = [];
  for (const so of orders) {
    const ds = so.distributionSnapshot && typeof so.distributionSnapshot === "object" ? (so.distributionSnapshot as any) : null;
    const op = ds?.operational_document || null;
    const valid = op?.validation || null;
    const situ = valid?.situation || valid?.validation_sit || null;
    const sim = isSituationValidated(situ);
    const hasPayRef = !!valid?.payment_order_id || !!valid?.list_name || !!valid?.lista;
    const linked = transferredById.get(so.id);
    if (sim && linked && !hasPayRef) {
      // Já está na LISTA por FK, mas o ServiceOrder não tem payment_order_id salvo.
      // Escreve de volta para o banco → SEMPRE consistente.
      const inject = mergeDistributionSnapshots(ds ?? {}, {
        operational_document: {
          validation: {
            payment_order_id: linked.paymentOrderId,
            list_name: linked.listName,
            lista: linked.listName,
          },
        },
      });
      reconciliations.push(
        prisma.serviceOrder
          .update({ where: { id: so.id }, data: { distributionSnapshot: inject as any } })
          .catch(err => console.error(`[weeklog][reconcile] serviceOrder=${so.id}:`, err?.message || String(err))),
      );
    }
  }
  if (reconciliations.length) {
    await Promise.all(reconciliations);
  }

  // --- FILTRO DE TRANSFERÊNCIA: MOVER (não duplicar) → LISTA.
  // Usa validation.field OU FK cross-table como prova.
  // Processa cada registro INDIVIDUALMENTE (filter nativo, não break).
  const ordersForWeeklog = orders.filter((so) => {
    const ds = so.distributionSnapshot && typeof so.distributionSnapshot === "object" ? (so.distributionSnapshot as any) : null;
    const op = ds?.operational_document || null;
    const valid = op?.validation || null;
    const situ = valid?.situation || valid?.validation_sit || null;
    const sim = isSituationValidated(situ);
    const hasPayRef = !!valid?.payment_order_id || !!valid?.list_name || !!valid?.lista;
    const fkExists = transferredById.has(so.id);
    // Transferido = situação validada E (referência nos campos OU FK na tabela payment_orders)
    const transferido = sim && (hasPayRef || fkExists);
    if (transferido) return false; // NÃO aparece mais na WEEKLOG
    return true;
  });

  // Busca dados extras (VIN / insurer / deliveredAt / code) via production_orders.service_order_id
  const normalized = await Promise.all(
    ordersForWeeklog.map(async (so) => {
      try {
        const po = await prisma.productionOrder.findFirst({
          where: { workspaceId: workspace_id, serviceOrderId: so.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, vin: true, insurer: true, deliveredAt: true, code: true, brand: true, model: true, color: true },
        });
        return { ...so, _productionOrder: po || null };
      } catch {
        return { ...so, _productionOrder: null };
      }
    }),
  );
  return res.json(normalized.map(mapOrder));
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
  // Merge distributionSnapshot com o do banco (seja o que já existe) para PATCH/PUT parcial não perder base/validation/retificativa irmãs.
  const exists = await prisma.serviceOrder.findUnique({ where: { id }, select: { distributionSnapshot: true, workspaceId: true } });
  if (exists && data.distributionSnapshot !== undefined) {
    data.distributionSnapshot = mergeDistributionSnapshots(exists.distributionSnapshot, data.distributionSnapshot);
  }

  const order = await prisma.serviceOrder.upsert({
    where: { id },
    create: { id, ...(data as any), ...(b.created_at ? { createdAt: new Date(b.created_at) } : {}) },
    update: data,
  });
  // Hook pagamento idempotente.
  try {
    const after = await prisma.serviceOrder.findUnique({ where: { id: order.id }, select: { distributionSnapshot: true, workspaceId: true } });
    const workspaceId = after?.workspaceId || order.workspaceId || "";
    const userId = (req.auth?.userId ?? (typeof data.userId === "string" ? data.userId : "")) || "";
    if (!workspaceId) throw new Error("workspace ausente");
    const hook = await createPaymentOrderFromValidatedWeeklog({ serviceOrderId: order.id, userId, workspaceId }, { distSnap: after?.distributionSnapshot });
    if (hook) {
      const latest = await prisma.serviceOrder.findUnique({ where: { id: order.id }, select: { distributionSnapshot: true } });
      // Garantir deepMerge dentro de validation (preservar historico, situation, responsavel etc)
      const inject = mergeDistributionSnapshots(latest?.distributionSnapshot ?? {}, {
        operational_document: {
          validation: { payment_order_id: hook.paymentOrderId, list_name: hook.listName, lista: hook.listName },
        },
      });
      await prisma.serviceOrder.update({ where: { id: order.id }, data: { distributionSnapshot: inject as any } });
      const refreshed = await prisma.serviceOrder.findUnique({ where: { id: order.id } });
      return res.json(mapOrder(refreshed as any));
    }
  } catch (hookErr) {
    console.error("[weeklog][payment-hook][PUT] Falha hook ordem pagamento (não abortou validação):", hookErr instanceof Error ? hookErr.message : String(hookErr));
  }
  return res.json(mapOrder(order));
});

// PATCH /service-orders/:id
serviceOrdersRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params["id"] as string;
  const beforeOrder = await prisma.serviceOrder.findUnique({ where: { id }, select: { id: true, distributionSnapshot: true, workspaceId: true, userId: true } });
  if (!beforeOrder) return res.status(404).json({ message: "Ordem não encontrada." });

  const data = buildData(req.body);
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "Nenhum campo para atualizar." });
  }
  // Merge profundo distributionSnapshot com o atual do banco.
  if (data.distributionSnapshot !== undefined) {
    data.distributionSnapshot = mergeDistributionSnapshots(beforeOrder.distributionSnapshot, data.distributionSnapshot);
  }
  const updated = await prisma.serviceOrder.update({ where: { id }, data });
  // Hook pagamento idempotente (após atualizar dist com payload).
  try {
    const afterMerge = (data.distributionSnapshot ?? updated.distributionSnapshot) as any;
    const workspaceId = updated.workspaceId || "";
    const userId = ((req.auth?.userId ?? updated.userId) || "") as string;
    if (!workspaceId) throw new Error("workspace ausente");
    const hook = await createPaymentOrderFromValidatedWeeklog({ serviceOrderId: updated.id, userId, workspaceId }, { distSnap: afterMerge });
    if (hook) {
      const inject = mergeDistributionSnapshots(updated.distributionSnapshot ?? {}, {
        operational_document: {
          validation: { payment_order_id: hook.paymentOrderId, list_name: hook.listName, lista: hook.listName },
        },
      });
      const final = await prisma.serviceOrder.update({ where: { id: updated.id }, data: { distributionSnapshot: inject as any } });
      return res.json(mapOrder(final));
    }
  } catch (hookErr) {
    console.error("[weeklog][payment-hook][PATCH] Falha hook ordem pagamento (não abortou validação):", hookErr instanceof Error ? hookErr.message : String(hookErr));
  }
  return res.json(mapOrder(updated));
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
