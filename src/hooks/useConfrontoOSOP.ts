import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Normalize plate for comparison
function normPlate(s: string | null | undefined): string {
  return (s || "").toUpperCase().replace(/[\s\-]/g, "");
}

function normStr(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase();
}

export interface SORecord {
  id: string;
  license_plate: string | null;
  car_name: string | null;
  client_name: string;
  client_id: string | null;
  technician_name: string;
  assigned_user_id: string | null;
  platform: string | null;
  total: number | null;
  service_1_name: string | null;
  service_1_price: number | null;
  service_2_name: string | null;
  service_2_price: number | null;
  service_3_name: string | null;
  service_3_price: number | null;
  service_4_name: string | null;
  service_4_price: number | null;
  created_at: string;
  status: string;
}

export interface PORecord {
  id: string;
  license_plate: string | null;
  car_name: string | null;
  client_name: string | null;
  client_id: string | null;
  technician_name: string | null;
  assigned_user_id: string | null;
  platform: string | null;
  total: number | null;
  services: any;
  created_at: string;
  status: string;
}

export interface MatchCandidate {
  so: SORecord;
  po: PORecord;
  score: number;
  reasons: string[];
  soServices: { name: string; price: number }[];
  poServices: { name: string; price: number }[];
}

export interface PendingItem {
  id: string; // reconciliation id
  so: SORecord;
  po: PORecord;
  soServices: { name: string; price: number }[];
  poServices: { name: string; price: number }[];
  totalSO: number;
  totalPO: number;
  difference: number;
  created_at: string;
  aging_level: "normal" | "warning" | "critical";
}

export interface HistoryItem {
  id: string;
  so_plate: string;
  po_plate: string;
  so_client: string;
  po_client: string;
  totalSO: number;
  totalPO: number;
  difference: number;
  resolved_at: string;
  action: string; // "validated" | "cleared"
  created_at: string;
}

function extractSOServices(so: SORecord): { name: string; price: number }[] {
  const services: { name: string; price: number }[] = [];
  if (so.service_1_name) services.push({ name: so.service_1_name, price: Number(so.service_1_price || 0) });
  if (so.service_2_name) services.push({ name: so.service_2_name, price: Number(so.service_2_price || 0) });
  if (so.service_3_name) services.push({ name: so.service_3_name, price: Number(so.service_3_price || 0) });
  if (so.service_4_name) services.push({ name: so.service_4_name, price: Number(so.service_4_price || 0) });
  return services;
}

function extractPOServices(po: PORecord): { name: string; price: number }[] {
  if (!po.services) return [];
  if (Array.isArray(po.services)) {
    return po.services.map((s: any) => ({
      name: s.name || s.service_name || "—",
      price: Number(s.price || s.value || 0),
    }));
  }
  return [];
}

function computeScore(so: SORecord, po: PORecord): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Client match (highest priority)
  if (normStr(so.client_name) && normStr(po.client_name) && normStr(so.client_name) === normStr(po.client_name)) {
    score += 30;
    reasons.push("cliente");
  } else if (so.client_id && po.client_id && so.client_id === po.client_id) {
    score += 30;
    reasons.push("cliente_id");
  }

  // Platform match
  if (normStr(so.platform) && normStr(po.platform) && normStr(so.platform) === normStr(po.platform)) {
    score += 25;
    reasons.push("plataforma");
  }

  // Technician match
  if (normStr(so.technician_name) && normStr(po.technician_name) && normStr(so.technician_name) === normStr(po.technician_name)) {
    score += 20;
    reasons.push("técnico");
  } else if (so.assigned_user_id && po.assigned_user_id && so.assigned_user_id === po.assigned_user_id) {
    score += 20;
    reasons.push("assigned_user");
  }

  // Vehicle/plate match
  const soPlate = normPlate(so.license_plate);
  const poPlate = normPlate(po.license_plate);
  if (soPlate && poPlate && soPlate === poPlate) {
    score += 15;
    reasons.push("placa");
  }

  // Service structure similarity
  const soSvcs = extractSOServices(so).map(s => normStr(s.name));
  const poSvcs = extractPOServices(po).map(s => normStr(s.name));
  if (soSvcs.length > 0 && poSvcs.length > 0) {
    const overlap = soSvcs.filter(s => poSvcs.some(p => p.includes(s) || s.includes(p))).length;
    const ratio = overlap / Math.max(soSvcs.length, poSvcs.length);
    if (ratio >= 0.5) {
      score += 10;
      reasons.push("serviços");
    }
  }

  return { score, reasons };
}

function getAgingLevel(createdAt: string): "normal" | "warning" | "critical" {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days >= 7) return "critical";
  if (days >= 3) return "warning";
  return "normal";
}

/** Get potential matches for Fusão Manual - only SO+OP pairs with score >= 40 */
export function useMatchCandidates() {
  return useQuery({
    queryKey: ["match-candidates"],
    queryFn: async () => {
      // Get IDs already reconciled
      const { data: reconData } = await (supabase as any)
        .from("reconciliations")
        .select("service_order_id, payment_order_id");
      const reconSOIds = new Set((reconData || []).map((r: any) => r.service_order_id).filter(Boolean));
      const reconPOIds = new Set((reconData || []).map((r: any) => r.payment_order_id).filter(Boolean));

      const [soRes, poRes] = await Promise.all([
        supabase.from("service_orders").select("*").order("created_at", { ascending: false }),
        supabase.from("payment_orders").select("*").order("created_at", { ascending: false }),
      ]);

      const allSO = (soRes.data || []) as SORecord[];
      const allPO = (poRes.data || []) as PORecord[];

      // Filter out already reconciled
      const freeSO = allSO.filter(so => !reconSOIds.has(so.id));
      const freePO = allPO.filter(po => !reconPOIds.has(po.id));

      const candidates: MatchCandidate[] = [];
      const usedPO = new Set<string>();

      for (const so of freeSO) {
        let bestMatch: MatchCandidate | null = null;

        for (const po of freePO) {
          if (usedPO.has(po.id)) continue;
          const { score, reasons } = computeScore(so, po);
          if (score >= 40) {
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = {
                so,
                po,
                score,
                reasons,
                soServices: extractSOServices(so),
                poServices: extractPOServices(po),
              };
            }
          }
        }

        if (bestMatch) {
          candidates.push(bestMatch);
          usedPO.add(bestMatch.po.id);
        }
      }

      return candidates.sort((a, b) => b.score - a.score);
    },
  });
}

/** Merge (Fundir) a match - creates reconciliation record */
export function useMergeMatch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ soId, poId }: { soId: string; poId: string }) => {
      const [soRes, poRes] = await Promise.all([
        supabase.from("service_orders").select("total, license_plate, client_name, platform, technician_name").eq("id", soId).single(),
        supabase.from("payment_orders").select("total, license_plate, client_name, platform, technician_name").eq("id", poId).single(),
      ]);

      const soTotal = Number(soRes.data?.total || 0);
      const poTotal = Number(poRes.data?.total || 0);
      const diff = soTotal - poTotal;
      const isExact = Math.abs(diff) < 0.01;

      const notes = JSON.stringify({
        match_type: isExact ? "exact_match" : "value_discrepancy",
        so_total: soTotal,
        po_total: poTotal,
        so_plate: soRes.data?.license_plate,
        po_plate: poRes.data?.license_plate,
        so_client: soRes.data?.client_name,
        po_client: poRes.data?.client_name,
        merged_at: new Date().toISOString(),
        // If exact match, auto-clear to history
        ...(isExact ? { cleared: true, cleared_at: new Date().toISOString(), validated: true, validated_at: new Date().toISOString() } : {}),
      });

      const { error } = await (supabase as any).from("reconciliations").insert({
        service_order_id: soId,
        payment_order_id: poId,
        matched_by: "manual",
        confidence_score: 100,
        difference_amount: diff,
        status: isExact ? "matched" : "mismatch",
        notes,
      });

      if (error) throw error;
      return { isExact, diff };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["match-candidates"] });
      qc.invalidateQueries({ queryKey: ["confronto-pending"] });
      qc.invalidateQueries({ queryKey: ["confronto-history"] });
      qc.invalidateQueries({ queryKey: ["reconciliation-summary"] });
      if (result.isExact) {
        toast.success("Valores iguais — enviado para Histórico");
      } else {
        toast.info(`Diferença de €${Math.abs(result.diff).toFixed(2)} — enviado para Pendentes`);
      }
    },
    onError: (err) => toast.error("Erro ao fundir: " + (err as Error).message),
  });
}

/** Reject match - permanently mark as not-a-match */
export function useRejectMatch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ soId, poId }: { soId: string; poId: string }) => {
      // Create a "rejected" reconciliation to prevent re-suggesting
      const { error } = await (supabase as any).from("reconciliations").insert({
        service_order_id: soId,
        payment_order_id: poId,
        matched_by: "rejected",
        confidence_score: 0,
        difference_amount: 0,
        status: "rejected",
        notes: JSON.stringify({ rejected: true, rejected_at: new Date().toISOString() }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["match-candidates"] });
      toast.success("Correspondência rejeitada");
    },
    onError: (err) => toast.error("Erro: " + (err as Error).message),
  });
}

/** Get pending items (matched with value discrepancies) */
export function useConfrontoPending() {
  return useQuery({
    queryKey: ["confronto-pending"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reconciliations")
        .select("*, service_orders(*), payment_orders(*)")
        .eq("status", "mismatch")
        .in("matched_by", ["manual", "auto"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || [])
        .filter((r: any) => {
          const notes = r.notes ? (() => { try { return JSON.parse(r.notes); } catch { return {}; } })() : {};
          return !notes.cleared && !notes.validated && r.service_orders && r.payment_orders;
        })
        .map((r: any): PendingItem => {
          const so = r.service_orders as SORecord;
          const po = r.payment_orders as PORecord;
          const soServices = extractSOServices(so);
          const poServices = extractPOServices(po);
          const totalSO = Number(so.total || 0);
          const totalPO = Number(po.total || 0);

          return {
            id: r.id,
            so,
            po,
            soServices,
            poServices,
            totalSO,
            totalPO,
            difference: totalSO - totalPO,
            created_at: r.created_at,
            aging_level: getAgingLevel(r.created_at),
          };
        });
    },
  });
}

/** Validate all - mark as resolved and record financial adjustment */
export function useValidatePending() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, difference }: { id: string; difference: number }) => {
      const { data: current } = await (supabase as any)
        .from("reconciliations")
        .select("notes")
        .eq("id", id)
        .single();

      const existingNotes = current?.notes ? JSON.parse(current.notes) : {};
      const updatedNotes = JSON.stringify({
        ...existingNotes,
        validated: true,
        validated_at: new Date().toISOString(),
        cleared: true,
        cleared_at: new Date().toISOString(),
        financial_adjustment: difference,
        adjustment_reason: "Divergência validada e aceite como paga",
      });

      const { error } = await (supabase as any)
        .from("reconciliations")
        .update({
          notes: updatedNotes,
          status: "matched",
          matched_by: "validated",
        })
        .eq("id", id);

      if (error) throw error;

      // Record financial adjustment internally (DO NOT change SO/PO status)
      if (Math.abs(difference) > 0.01) {
        await supabase.from("financial_records").insert({
          type: "adjustment",
          source: "reconciliation",
          amount: Math.abs(difference),
          status: "resolved",
          notes: `Ajuste financeiro interno: divergência de €${Math.abs(difference).toFixed(2)} validada`,
          category: "adjustment",
        } as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["confronto-pending"] });
      qc.invalidateQueries({ queryKey: ["confronto-history"] });
      qc.invalidateQueries({ queryKey: ["reconciliation-summary"] });
      toast.success("Divergência validada e movida para Histórico");
    },
    onError: (err) => toast.error("Erro: " + (err as Error).message),
  });
}

/** Get history items */
export function useConfrontoHistory() {
  return useQuery({
    queryKey: ["confronto-history"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reconciliations")
        .select("*, service_orders(license_plate, client_name, total), payment_orders(license_plate, client_name, total)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;

      return (data || [])
        .filter((r: any) => {
          const notes = r.notes ? (() => { try { return JSON.parse(r.notes); } catch { return {}; } })() : {};
          return (notes.cleared || notes.validated) && r.service_orders && r.payment_orders;
        })
        .filter((r: any) => {
          // Auto-delete after 15 days
          const notes = r.notes ? (() => { try { return JSON.parse(r.notes); } catch { return {}; } })() : {};
          const resolvedAt = notes.cleared_at || notes.validated_at || r.created_at;
          return new Date(resolvedAt).getTime() > fifteenDaysAgo;
        })
        .map((r: any): HistoryItem => {
          const notes = r.notes ? (() => { try { return JSON.parse(r.notes); } catch { return {}; } })() : {};
          return {
            id: r.id,
            so_plate: r.service_orders?.license_plate || "—",
            po_plate: r.payment_orders?.license_plate || "—",
            so_client: r.service_orders?.client_name || "—",
            po_client: r.payment_orders?.client_name || "—",
            totalSO: Number(r.service_orders?.total || 0),
            totalPO: Number(r.payment_orders?.total || 0),
            difference: Number(r.difference_amount || 0),
            resolved_at: notes.cleared_at || notes.validated_at || r.created_at,
            action: notes.validated ? "validated" : "cleared",
            created_at: r.created_at,
          };
        });
    },
  });
}
