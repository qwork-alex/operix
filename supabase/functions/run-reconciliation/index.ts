import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Normalization helpers ---

function normalizePlate(s?: string | null): string {
  return (s ?? "").trim().toUpperCase().replace(/[\s\-\.]/g, "");
}

function normLower(s?: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

const PLATFORM_ALIASES: Record<string, string> = {
  "st romain": "St Romain",
  "saint romain": "St Romain",
  "stromain": "St Romain",
  "saint-romain": "St Romain",
  "andrezieux": "Andrezieux",
  "andrézieux": "Andrezieux",
  "andrezieux-boutheon": "Andrezieux",
};

function normalizePlatform(name?: string | null): string | null {
  if (!name) return null;
  const clean = name.toLowerCase().trim();
  return PLATFORM_ALIASES[clean] || name.trim();
}

function extractServiceNames(so: any): string[] {
  const names: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const n = so[`service_${i}_name`];
    if (n) names.push(normLower(n));
  }
  return names.sort();
}

function extractPOServiceNames(po: any): string[] {
  const services = po.services;
  if (!Array.isArray(services)) return [];
  return services
    .map((s: any) => (typeof s === "object" && s?.name ? normLower(s.name) : null))
    .filter(Boolean)
    .sort() as string[];
}

function serviceNamesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length / longer.length < 0.8) return false;
  return longer.includes(shorter);
}

function servicesCompatible(soNames: string[], poNames: string[]): boolean {
  if (soNames.length === 0 && poNames.length === 0) return true;
  if (soNames.length === 0 || poNames.length === 0) return false;
  // At least one service must match
  for (const sn of soNames) {
    for (const pn of poNames) {
      if (serviceNamesMatch(sn, pn)) return true;
    }
  }
  return false;
}

function serviceOverlapRatio(soNames: string[], poNames: string[]): number {
  if (soNames.length === 0 && poNames.length === 0) return 1;
  const total = Math.max(soNames.length, poNames.length);
  if (total === 0) return 1;
  let matched = 0;
  const used = new Set<number>();
  for (const sn of soNames) {
    for (let i = 0; i < poNames.length; i++) {
      if (!used.has(i) && serviceNamesMatch(sn, poNames[i])) {
        matched++;
        used.add(i);
        break;
      }
    }
  }
  return matched / total;
}

// Canonical service key for grouping (sorted, joined)
function serviceKey(names: string[]): string {
  return names.length > 0 ? names.join("|") : "unknown_service";
}

function formatMoney(v: number): string {
  return `€${v.toFixed(2)}`;
}

// --- Group key: plate + platform + client + service ---
function makeGroupKey(plate: string, platform: string, client: string, services: string): string {
  return `${plate}|${platform}|${client}|${services}`;
}

// --- Match types ---
type MatchType = "exact_match" | "grouped_match" | "partial_match" | "mismatch" | "no_match";

// --- Main handler ---

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey_ = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey_);

    // STEP 0: HARD RESET — clear ALL previous auto results
    await supabase.from("reconciliations").delete().eq("matched_by", "auto");
    console.log("HARD_RESET: cleared all auto reconciliation results");

    const [soRes, poRes] = await Promise.all([
      supabase.from("service_orders").select("id, license_plate, car_name, total, week, assigned_user_id, technician_name, client_id, client_name, platform, created_at, status, service_1_name, service_1_price, service_2_name, service_2_price, service_3_name, service_3_price, service_4_name, service_4_price"),
      supabase.from("payment_orders").select("id, license_plate, car_name, total, assigned_user_id, technician_name, client_id, client_name, platform, service_order_id, created_at, status, services"),
    ]);

    const serviceOrders = soRes.data ?? [];
    const paymentOrders = poRes.data ?? [];

    console.log(`Reconciliation: ${serviceOrders.length} SOs, ${paymentOrders.length} POs`);

    // GUARD: If either side has no data, return empty
    if (serviceOrders.length === 0 || paymentOrders.length === 0) {
      return new Response(JSON.stringify({
        total: 0, matched: 0, mismatched: 0, missing: 0, pending: 0,
        status: "no_data",
        message: serviceOrders.length === 0 && paymentOrders.length === 0
          ? "No service or payment orders found"
          : serviceOrders.length === 0
            ? "No service orders found — cannot reconcile"
            : "No payment orders found — cannot reconcile",
        debug: { so_count: serviceOrders.length, po_count: paymentOrders.length },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Normalize all items ---
    interface NormalizedItem {
      id: string;
      plate: string;
      platform: string;
      client: string;
      services: string[];
      serviceKey: string;
      total: number;
      raw: any;
      source: "so" | "po";
    }

    const normalizedSOs: NormalizedItem[] = serviceOrders.map((so: any) => {
      const svcs = extractServiceNames(so);
      return {
        id: so.id,
        plate: normalizePlate(so.license_plate),
        platform: normalizePlatform(so.platform) || "unknown_platform",
        client: normLower(so.client_name) || "unknown_client",
        services: svcs,
        serviceKey: serviceKey(svcs),
        total: Number(so.total || 0),
        raw: so,
        source: "so" as const,
      };
    });

    const normalizedPOs: NormalizedItem[] = paymentOrders.map((po: any) => {
      const svcs = extractPOServiceNames(po);
      return {
        id: po.id,
        plate: normalizePlate(po.license_plate),
        platform: normalizePlatform(po.platform) || "unknown_platform",
        client: normLower(po.client_name) || "unknown_client",
        services: svcs,
        serviceKey: serviceKey(svcs),
        total: Number(po.total || 0),
        raw: po,
        source: "po" as const,
      };
    });

    // --- STEP 2: GROUP by plate + platform + client ---
    // Service is checked within groups, not as part of the group key,
    // because SO and PO may have slightly different service names
    const soGroups = new Map<string, NormalizedItem[]>();
    const poGroups = new Map<string, NormalizedItem[]>();

    for (const so of normalizedSOs) {
      const key = `${so.plate}|${so.platform}|${so.client}`;
      if (!soGroups.has(key)) soGroups.set(key, []);
      soGroups.get(key)!.push(so);
    }
    for (const po of normalizedPOs) {
      const key = `${po.plate}|${po.platform}|${po.client}`;
      if (!poGroups.has(key)) poGroups.set(key, []);
      poGroups.get(key)!.push(po);
    }

    const results: any[] = [];
    const matchedSOIds = new Set<string>();
    const matchedPOIds = new Set<string>();
    const debugDecisions: any[] = [];

    // --- PHASE 1: Strict grouped matching (plate + platform + client must match) ---
    for (const [groupKey, groupSOs] of soGroups.entries()) {
      const groupPOs = poGroups.get(groupKey);
      if (!groupPOs || groupPOs.length === 0) continue;

      // HARD VALIDATION: plate, platform, client already match by group key
      // Now validate services within the group
      const allSOServices = groupSOs.flatMap(so => so.services);
      const allPOServices = groupPOs.flatMap(po => po.services);

      if (!servicesCompatible(allSOServices, allPOServices)) {
        console.log(`GROUP_SERVICE_BLOCK: ${groupKey} — services incompatible`);
        continue; // BLOCK — services don't match at all
      }

      const soTotal = groupSOs.reduce((sum, so) => sum + so.total, 0);
      const poTotal = groupPOs.reduce((sum, po) => sum + po.total, 0);
      const groupDiff = soTotal - poTotal;
      const overlapRatio = serviceOverlapRatio(allSOServices, allPOServices);

      // Determine match type
      let matchType: MatchType;
      let status: string;

      if (groupSOs.length === 1 && groupPOs.length === 1 && Math.abs(groupDiff) < 0.01 && overlapRatio >= 0.8) {
        matchType = "exact_match";
        status = "matched";
      } else if (groupSOs.length === 1 && groupPOs.length === 1 && overlapRatio >= 0.5) {
        matchType = Math.abs(groupDiff) < 5 ? "exact_match" : "partial_match";
        status = Math.abs(groupDiff) < 5 ? "matched" : "mismatch";
      } else if (Math.abs(groupDiff) < 5) {
        matchType = "grouped_match";
        status = "matched";
      } else if (poTotal < soTotal && poTotal > 0) {
        matchType = "partial_match";
        status = "mismatch";
      } else {
        matchType = "partial_match";
        status = "mismatch";
      }

      // Confidence score based on match quality
      let confidence = 0;
      confidence += 25; // plate exact (guaranteed by group)
      confidence += 30; // platform exact (guaranteed by group)
      confidence += 20; // client exact (guaranteed by group)
      confidence += Math.round(overlapRatio * 40); // service overlap (0-40)
      if (Math.abs(groupDiff) < 0.01) confidence += 10; // value exact
      else if (Math.abs(groupDiff) < 5) confidence += 5;

      const reasons: string[] = ["plate_exact", "platform_match", "client_exact"];
      if (overlapRatio >= 0.8) reasons.push("service_exact");
      else if (overlapRatio > 0) reasons.push("service_partial");
      if (Math.abs(groupDiff) < 0.01) reasons.push("value_exact");
      else if (Math.abs(groupDiff) < 5) reasons.push("value_close");
      if (groupSOs.length > 1 || groupPOs.length > 1) reasons.push("grouped_match");

      const groupExplanation = matchType === "grouped_match" || groupSOs.length > 1 || groupPOs.length > 1
        ? `Grupo conciliado: ${groupSOs.length} OS ↔ ${groupPOs.length} OP para placa ${groupSOs[0].plate}, plataforma ${groupSOs[0].platform}, cliente ${groupSOs[0].client}. Total OS: ${formatMoney(soTotal)}, Total OP: ${formatMoney(poTotal)}, diff: ${formatMoney(Math.abs(groupDiff))}.`
        : `Conciliação exacta: ${groupSOs[0].plate} (${groupSOs[0].platform}, ${groupSOs[0].client}). OS: ${formatMoney(soTotal)}, OP: ${formatMoney(poTotal)}.`;

      const decision = {
        group_key: groupKey,
        so_count: groupSOs.length,
        po_count: groupPOs.length,
        so_total: soTotal,
        po_total: poTotal,
        diff: groupDiff,
        match_type: matchType,
        status,
        confidence,
        reasons,
        service_overlap: overlapRatio,
      };
      debugDecisions.push(decision);
      console.log("GROUP_MATCH:", JSON.stringify(decision));

      // Create reconciliation records — pair SOs with POs
      const sortedSOs = [...groupSOs].sort((a, b) => a.total - b.total);
      const sortedPOs = [...groupPOs].sort((a, b) => a.total - b.total);

      for (let i = 0; i < sortedSOs.length; i++) {
        const so = sortedSOs[i];
        const po = sortedPOs[Math.min(i, sortedPOs.length - 1)]; // pair or reuse last PO

        results.push({
          service_order_id: so.id,
          payment_order_id: po.id,
          matched_by: "auto",
          confidence_score: confidence,
          difference_amount: so.total - po.total,
          status,
          notes: JSON.stringify({
            match_reasons: reasons,
            match_type: matchType,
            explanation: groupExplanation,
            so_plate: so.raw.license_plate, po_plate: po.raw.license_plate,
            so_platform: so.raw.platform, po_platform: po.raw.platform,
            so_client: so.raw.client_name, po_client: po.raw.client_name,
            so_total: so.total, po_total: po.total,
            so_date: so.raw.created_at, po_date: po.raw.created_at,
            group_so_total: soTotal, group_po_total: poTotal,
            group_so_count: groupSOs.length, group_po_count: groupPOs.length,
          }),
        });
        matchedSOIds.add(so.id);
      }
      for (const po of groupPOs) {
        matchedPOIds.add(po.id);
      }
    }

    // --- PHASE 2: Direct-link fallback (service_order_id on PO) ---
    // Only for items not yet matched, respects hard validation
    for (const po of normalizedPOs) {
      if (matchedPOIds.has(po.id)) continue;
      if (!po.raw.service_order_id) continue;

      const so = normalizedSOs.find(s => s.id === po.raw.service_order_id);
      if (!so || matchedSOIds.has(so.id)) continue;

      // HARD VALIDATION even for direct links
      const plateOk = so.plate === po.plate || !so.plate || !po.plate;
      const platformOk = so.platform === po.platform || so.platform === "unknown_platform" || po.platform === "unknown_platform";
      const serviceOk = servicesCompatible(so.services, po.services) || so.services.length === 0 || po.services.length === 0;

      if (!plateOk || !platformOk) {
        console.log(`DIRECT_LINK_BLOCKED: SO ${so.id} ↔ PO ${po.id} — plate or platform mismatch`);
        continue;
      }

      if (!serviceOk) {
        console.log(`DIRECT_LINK_BLOCKED: SO ${so.id} ↔ PO ${po.id} — service mismatch`);
        continue;
      }

      const diff = so.total - po.total;
      const status = Math.abs(diff) < 0.01 ? "matched" : "mismatch";
      const overlapRatio = serviceOverlapRatio(so.services, po.services);
      let confidence = 30; // direct_link bonus
      if (plateOk && so.plate) confidence += 25;
      if (platformOk) confidence += 30;
      confidence += Math.round(overlapRatio * 40);
      if (Math.abs(diff) < 0.01) confidence += 10;

      const reasons = ["direct_link"];
      if (so.plate && so.plate === po.plate) reasons.push("plate_exact");
      if (platformOk) reasons.push("platform_match");
      if (overlapRatio >= 0.8) reasons.push("service_exact");

      const decision = {
        so_plate: so.raw.license_plate, po_plate: po.raw.license_plate,
        so_platform: so.raw.platform, po_platform: po.raw.platform,
        so_client: so.raw.client_name, po_client: po.raw.client_name,
        diff, status, confidence, reasons, phase: "direct_link",
      };
      debugDecisions.push(decision);
      console.log("DIRECT_LINK_MATCH:", JSON.stringify(decision));

      results.push({
        service_order_id: so.id,
        payment_order_id: po.id,
        matched_by: "auto",
        confidence_score: confidence,
        difference_amount: diff,
        status,
        notes: JSON.stringify({
          match_reasons: reasons,
          match_type: status === "matched" ? "exact_match" : "partial_match",
          explanation: `Link direto: ${so.raw.license_plate || 'N/A'} (${so.raw.platform || 'N/A'}, ${so.raw.client_name || 'N/A'}). OS: ${formatMoney(so.total)}, OP: ${formatMoney(po.total)}.`,
          so_plate: so.raw.license_plate, po_plate: po.raw.license_plate,
          so_platform: so.raw.platform, po_platform: po.raw.platform,
          so_client: so.raw.client_name, po_client: po.raw.client_name,
          so_total: so.total, po_total: po.total,
        }),
      });
      matchedSOIds.add(so.id);
      matchedPOIds.add(po.id);
    }

    // --- PHASE 3: Unmatched SOs → missing ---
    for (const so of normalizedSOs) {
      if (matchedSOIds.has(so.id)) continue;
      results.push({
        service_order_id: so.id,
        payment_order_id: null,
        matched_by: "auto",
        confidence_score: 0,
        difference_amount: so.total,
        status: "missing",
        notes: JSON.stringify({
          match_reasons: ["no_match"],
          match_type: "no_match",
          explanation: `Sem correspondência: OS ${so.raw.license_plate || 'N/A'} (${so.raw.platform || 'N/A'}, ${so.raw.client_name || 'N/A'}, ${formatMoney(so.total)}).`,
          so_plate: so.raw.license_plate, so_platform: so.raw.platform,
          so_client: so.raw.client_name, so_total: so.total,
        }),
      });
    }

    // --- PHASE 4: Unmatched POs → missing ---
    for (const po of normalizedPOs) {
      if (matchedPOIds.has(po.id)) continue;
      results.push({
        service_order_id: null,
        payment_order_id: po.id,
        matched_by: "auto",
        confidence_score: 0,
        difference_amount: -po.total,
        status: "missing",
        notes: JSON.stringify({
          match_reasons: ["no_match"],
          match_type: "no_match",
          explanation: `Sem correspondência: OP ${po.raw.license_plate || 'N/A'} (${po.raw.platform || 'N/A'}, ${po.raw.client_name || 'N/A'}, ${formatMoney(po.total)}).`,
          po_plate: po.raw.license_plate, po_platform: po.raw.platform,
          po_client: po.raw.client_name, po_total: po.total,
        }),
      });
    }

    // --- Insert results ---
    let insertedCount = 0;
    for (const r of results) {
      const { error } = await supabase.from("reconciliations").insert(r);
      if (error) {
        console.warn("Insert skip:", error.message);
      } else {
        insertedCount++;
      }
    }

    const summaryResult = {
      total: results.length,
      inserted: insertedCount,
      matched: results.filter(r => r.status === "matched").length,
      mismatched: results.filter(r => r.status === "mismatch").length,
      missing: results.filter(r => r.status === "missing").length,
      pending: 0,
      grouped: results.filter(r => {
        try { return JSON.parse(r.notes)?.match_type === "grouped_match"; } catch { return false; }
      }).length,
      debug: { so_count: serviceOrders.length, po_count: paymentOrders.length },
      debug_sample: debugDecisions.slice(0, 10),
    };

    console.log("Reconciliation complete:", JSON.stringify(summaryResult));

    return new Response(JSON.stringify(summaryResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("run-reconciliation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
