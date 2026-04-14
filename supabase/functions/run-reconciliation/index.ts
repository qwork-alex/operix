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

function dateDistanceDays(a?: string | null, b?: string | null): number {
  if (!a || !b) return Infinity;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return Infinity;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

function extractServiceNames(so: any): string[] {
  const names: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const n = so[`service_${i}_name`];
    if (n) names.push(normLower(n));
  }
  return names;
}

function extractPOServiceNames(po: any): string[] {
  const services = po.services;
  if (!Array.isArray(services)) return [];
  return services
    .map((s: any) => (typeof s === "object" && s?.name ? normLower(s.name) : null))
    .filter(Boolean) as string[];
}

function serviceNamesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length / longer.length < 0.8) return false;
  return longer.includes(shorter);
}

function serviceOverlap(soNames: string[], poNames: string[]): { matched: number; total: number } {
  if (soNames.length === 0 && poNames.length === 0) return { matched: 0, total: 0 };
  const total = Math.max(soNames.length, poNames.length);
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
  return { matched, total };
}

// --- Match type determination ---
type MatchType = "exact_match" | "grouped_match" | "partial_match" | "mismatch" | "no_match";

interface MatchResult {
  score: number;
  reasons: string[];
  daysDiff: number | null;
  valueDiff: number;
  plateMatch: boolean;
  serviceMatch: boolean;
  platformMatch: boolean;
  clientMatch: boolean;
  blocked: boolean;
  matchType: MatchType;
}

// --- Scoring engine (upgraded with client dimension + fail-safe) ---

function calculateScore(so: any, po: any): MatchResult {
  let score = 0;
  const reasons: string[] = [];
  let blocked = false;

  const soPlate = normalizePlate(so.license_plate);
  const poPlate = normalizePlate(po.license_plate);
  const soTotal = Number(so.total || 0);
  const poTotal = Number(po.total || 0);
  const valueDiff = Math.abs(soTotal - poTotal);

  // --- PLATE (mandatory dimension) ---
  const plateMatch = !!(soPlate && poPlate && soPlate === poPlate);
  if (plateMatch) {
    score += 25;
    reasons.push("plate_exact");
  }

  // --- SERVICE (mandatory dimension — mismatch blocks) ---
  const soServices = extractServiceNames(so);
  const poServices = extractPOServiceNames(po);
  const overlap = serviceOverlap(soServices, poServices);
  let serviceMatch = false;

  if (overlap.total > 0) {
    if (overlap.matched === overlap.total) {
      score += 40;
      reasons.push("service_exact");
      serviceMatch = true;
    } else if (overlap.matched > 0) {
      score += Math.round((overlap.matched / overlap.total) * 25);
      reasons.push("service_partial");
      serviceMatch = true;
    } else {
      score -= 40;
      reasons.push("service_mismatch");
      blocked = true;
    }
  }

  // --- PLATFORM (mandatory dimension — mismatch blocks) ---
  const soPlatform = normalizePlatform(so.platform);
  const poPlatform = normalizePlatform(po.platform);
  let platformMatch = false;

  if (soPlatform && poPlatform) {
    if (soPlatform === poPlatform) {
      score += 30;
      reasons.push("platform_match");
      platformMatch = true;
    } else {
      score -= 30;
      reasons.push("platform_mismatch");
      blocked = true;
    }
  }

  // --- CLIENT (confidence dimension — not mandatory) ---
  const soClient = normLower(so.client_name);
  const poClient = normLower(po.client_name);
  let clientMatch = false;

  if (soClient && poClient) {
    if (soClient === poClient) {
      score += 20;
      reasons.push("client_exact");
      clientMatch = true;
    } else if (soClient.includes(poClient) || poClient.includes(soClient)) {
      score += 10;
      reasons.push("client_partial");
      clientMatch = true;
    } else {
      score -= 25;
      reasons.push("client_mismatch");
    }
  }

  // --- DIRECT LINK bonus ---
  if (po.service_order_id === so.id) {
    score += 30;
    reasons.push("direct_link");
    blocked = false; // direct link overrides blocks
  }

  // --- VALUE proximity ---
  if (valueDiff < 5) {
    score += 10;
    reasons.push("value_exact");
  } else if (valueDiff < 20) {
    score += 5;
    reasons.push("value_close");
  }

  // --- DATE proximity ---
  const daysDiff = dateDistanceDays(so.created_at, po.created_at);
  if (isFinite(daysDiff) && daysDiff < 7) {
    score += 5;
    reasons.push("date_close");
  }

  // --- TECHNICIAN ---
  if (so.technician_id && po.technician_id && so.technician_id === po.technician_id) {
    score += 3;
    reasons.push("technician_match");
  }

  // --- CAR NAME ---
  const soCar = normLower(so.car_name);
  const poCar = normLower(po.car_name);
  if (soCar && poCar && soCar === poCar) {
    score += 2;
    reasons.push("car_match");
  }

  // --- Determine match type ---
  let matchType: MatchType;
  if (blocked) {
    matchType = "mismatch";
  } else if (plateMatch && serviceMatch && platformMatch && valueDiff < 5) {
    matchType = "exact_match";
  } else if (plateMatch && serviceMatch && platformMatch) {
    matchType = "partial_match";
  } else if (serviceMatch && platformMatch) {
    matchType = "partial_match";
  } else {
    matchType = "no_match";
  }

  return {
    score,
    reasons,
    daysDiff: isFinite(daysDiff) ? Math.round(daysDiff * 10) / 10 : null,
    valueDiff,
    plateMatch,
    serviceMatch,
    platformMatch,
    clientMatch,
    blocked,
    matchType,
  };
}

// --- Many-to-many grouping ---

interface GroupKey {
  plate: string;
  platform: string;
  client: string;
}

function makeGroupKey(item: any, isService: boolean): string {
  const plate = normalizePlate(item.license_plate);
  const platform = normalizePlatform(item.platform) || "unknown_platform";
  const client = normLower(isService ? item.client_name : item.client_name) || "unknown_client";
  return `${plate}|${platform}|${client}`;
}

// --- Main handler ---

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const [soRes, poRes] = await Promise.all([
      supabase.from("service_orders").select("id, license_plate, car_name, total, week, technician_id, technician_name, client_id, client_name, platform, created_at, status, service_1_name, service_1_price, service_2_name, service_2_price, service_3_name, service_3_price, service_4_name, service_4_price"),
      supabase.from("payment_orders").select("id, license_plate, car_name, total, technician_id, technician_name, client_id, client_name, platform, service_order_id, created_at, status, services"),
    ]);

    const serviceOrders = soRes.data ?? [];
    const paymentOrders = poRes.data ?? [];

    console.log(`Reconciliation: ${serviceOrders.length} SOs, ${paymentOrders.length} POs`);

    // GUARD: If either side has no data, clear stale results and return empty
    if (serviceOrders.length === 0 || paymentOrders.length === 0) {
      await supabase.from("reconciliations").delete().eq("matched_by", "auto");
      const emptyResult = {
        total: 0, matched: 0, mismatched: 0, missing: 0, pending: 0,
        status: "no_data",
        message: serviceOrders.length === 0 && paymentOrders.length === 0
          ? "No service or payment orders found"
          : serviceOrders.length === 0
            ? "No service orders found — cannot reconcile"
            : "No payment orders found — cannot reconcile",
        debug: { so_count: serviceOrders.length, po_count: paymentOrders.length },
      };
      console.log("RECONCILIATION_EMPTY:", JSON.stringify(emptyResult));
      return new Response(JSON.stringify(emptyResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("reconciliations").delete().eq("matched_by", "auto");

    // --- PHASE 1: Group SOs and POs by plate+platform+client for many-to-many ---
    const soGroups = new Map<string, any[]>();
    const poGroups = new Map<string, any[]>();

    for (const so of serviceOrders) {
      const key = makeGroupKey(so, true);
      if (!soGroups.has(key)) soGroups.set(key, []);
      soGroups.get(key)!.push(so);
    }
    for (const po of paymentOrders) {
      const key = makeGroupKey(po, false);
      if (!poGroups.has(key)) poGroups.set(key, []);
      poGroups.get(key)!.push(po);
    }

    const results: any[] = [];
    const matchedSOIds = new Set<string>();
    const matchedPOIds = new Set<string>();
    const debugDecisions: any[] = [];

    // --- PHASE 2: Process grouped matches (same plate+platform+client) ---
    for (const [groupKey, groupSOs] of soGroups.entries()) {
      const groupPOs = poGroups.get(groupKey);
      if (!groupPOs || groupPOs.length === 0) continue;

      const soTotal = groupSOs.reduce((sum: number, so: any) => sum + Number(so.total || 0), 0);
      const poTotal = groupPOs.reduce((sum: number, po: any) => sum + Number(po.total || 0), 0);
      const groupDiff = soTotal - poTotal;

      // Check service compatibility within the group
      const allSOServices = groupSOs.flatMap((so: any) => extractServiceNames(so));
      const allPOServices = groupPOs.flatMap((po: any) => extractPOServiceNames(po));
      const groupOverlap = serviceOverlap(allSOServices, allPOServices);

      const serviceBlocked = groupOverlap.total > 0 && groupOverlap.matched === 0;
      if (serviceBlocked) continue; // Skip — services don't match at all

      const isGroupedMatch = groupSOs.length > 1 || groupPOs.length > 1;

      // For 1:1 within group, use standard scoring
      if (groupSOs.length === 1 && groupPOs.length === 1) {
        const so = groupSOs[0];
        const po = groupPOs[0];
        const result = calculateScore(so, po);

        const decision = {
          so_plate: so.license_plate,
          so_platform: so.platform,
          so_client: so.client_name,
          so_services: extractServiceNames(so),
          so_total: Number(so.total || 0),
          po_plate: po.license_plate,
          po_platform: po.platform,
          po_client: po.client_name,
          po_services: extractPOServiceNames(po),
          score: result.score,
          reasons: result.reasons,
          match_type: result.matchType,
          blocked: result.blocked,
        };
        debugDecisions.push(decision);
        console.log("MATCH_DECISION:", JSON.stringify(decision));

        if (result.blocked) continue;

        const roundedScore = Math.round(result.score * 10) / 10;
        if (roundedScore < 40) continue;

        const diff = Number(so.total || 0) - Number(po.total || 0);
        let status: string;
        if (roundedScore >= 70 && Math.abs(diff) < 0.01) {
          status = "matched";
        } else if (roundedScore >= 70) {
          status = "matched";
        } else if (roundedScore >= 40 && Math.abs(diff) >= 0.01) {
          status = "mismatch";
        } else {
          status = "pending";
        }

        results.push({
          service_order_id: so.id,
          payment_order_id: po.id,
          matched_by: "auto",
          confidence_score: roundedScore,
          difference_amount: diff,
          status,
          notes: JSON.stringify({
            match_reasons: result.reasons,
            match_type: result.matchType,
            explanation: buildExplanation(so, po, diff, status, result),
            so_plate: so.license_plate, po_plate: po.license_plate,
            so_platform: so.platform, po_platform: po.platform,
            so_client: so.client_name, po_client: po.client_name,
            so_total: Number(so.total || 0), po_total: Number(po.total || 0),
            so_date: so.created_at, po_date: po.created_at,
            days_diff: result.daysDiff, value_diff: result.valueDiff,
          }),
        });
        matchedSOIds.add(so.id);
        matchedPOIds.add(po.id);
        continue;
      }

      // Many-to-many: create grouped match entries
      const groupMatchType: MatchType = Math.abs(groupDiff) < 5 ? "grouped_match" : "partial_match";
      const groupScore = groupOverlap.total > 0
        ? Math.round(40 * (groupOverlap.matched / groupOverlap.total)) + 30 + 20 // service + platform + client (all same group)
        : 50;

      const groupStatus = groupMatchType === "grouped_match" && Math.abs(groupDiff) < 0.01
        ? "matched"
        : Math.abs(groupDiff) >= 0.01 ? "mismatch" : "matched";

      const groupExplanation = `Grouped match: ${groupSOs.length} SO(s) ↔ ${groupPOs.length} PO(s) for plate ${normalizePlate(groupSOs[0].license_plate)}, platform ${normalizePlatform(groupSOs[0].platform) || 'N/A'}, client ${groupSOs[0].client_name || 'N/A'}. SO total: €${soTotal.toFixed(2)}, PO total: €${poTotal.toFixed(2)}, diff: €${Math.abs(groupDiff).toFixed(2)}.`;

      console.log("GROUPED_MATCH:", JSON.stringify({
        group_key: groupKey,
        so_count: groupSOs.length,
        po_count: groupPOs.length,
        so_total: soTotal,
        po_total: poTotal,
        diff: groupDiff,
        match_type: groupMatchType,
      }));

      // Link first SO to first PO for the reconciliation record, note all IDs
      for (const so of groupSOs) {
        const bestPO = groupPOs.find(po => !matchedPOIds.has(po.id)) || groupPOs[0];
        results.push({
          service_order_id: so.id,
          payment_order_id: bestPO.id,
          matched_by: "auto",
          confidence_score: groupScore,
          difference_amount: Number(so.total || 0) - Number(bestPO.total || 0),
          status: groupStatus,
          notes: JSON.stringify({
            match_reasons: ["grouped_match", "plate_exact", "platform_match", "client_exact"],
            match_type: groupMatchType,
            explanation: groupExplanation,
            so_plate: so.license_plate, po_plate: bestPO.license_plate,
            so_platform: so.platform, po_platform: bestPO.platform,
            so_client: so.client_name, po_client: bestPO.client_name,
            so_total: Number(so.total || 0), po_total: Number(bestPO.total || 0),
            group_so_ids: groupSOs.map((s: any) => s.id),
            group_po_ids: groupPOs.map((p: any) => p.id),
            group_so_total: soTotal, group_po_total: poTotal,
          }),
        });
        matchedSOIds.add(so.id);
      }
      for (const po of groupPOs) {
        matchedPOIds.add(po.id);
      }
    }

    // --- PHASE 3: Fallback 1:1 matching for unmatched SOs (cross-group, best score) ---
    const unmatchedSOs = serviceOrders.filter(so => !matchedSOIds.has(so.id));
    const unmatchedPOs = paymentOrders.filter(po => !matchedPOIds.has(po.id));

    for (const so of unmatchedSOs) {
      let bestMatch: any = null;
      let bestResult: MatchResult | null = null;

      for (const po of unmatchedPOs) {
        if (matchedPOIds.has(po.id)) continue;
        const result = calculateScore(so, po);
        if (result.blocked) continue;
        if (!bestResult || result.score > bestResult.score) {
          bestResult = result;
          bestMatch = po;
        }
      }

      const soTotal = Number(so.total || 0);
      const roundedScore = bestResult ? Math.round(bestResult.score * 10) / 10 : 0;

      if (bestMatch && bestResult && !bestResult.blocked && roundedScore >= 40) {
        const poTotal = Number(bestMatch.total || 0);
        const diff = soTotal - poTotal;

        let status: string;
        if (roundedScore >= 70 && Math.abs(diff) < 0.01) status = "matched";
        else if (roundedScore >= 70) status = "matched";
        else if (roundedScore >= 40 && Math.abs(diff) >= 0.01) status = "mismatch";
        else status = "pending";

        const decision = {
          so_plate: so.license_plate, so_platform: so.platform, so_client: so.client_name,
          so_services: extractServiceNames(so), so_total: soTotal,
          po_plate: bestMatch.license_plate, po_platform: bestMatch.platform, po_client: bestMatch.client_name,
          score: roundedScore, reasons: bestResult.reasons, match_type: bestResult.matchType,
          phase: "fallback_1to1",
        };
        debugDecisions.push(decision);
        console.log("FALLBACK_MATCH:", JSON.stringify(decision));

        results.push({
          service_order_id: so.id,
          payment_order_id: bestMatch.id,
          matched_by: "auto",
          confidence_score: roundedScore,
          difference_amount: diff,
          status,
          notes: JSON.stringify({
            match_reasons: bestResult.reasons,
            match_type: bestResult.matchType,
            explanation: buildExplanation(so, bestMatch, diff, status, bestResult),
            so_plate: so.license_plate, po_plate: bestMatch.license_plate,
            so_platform: so.platform, po_platform: bestMatch.platform,
            so_client: so.client_name, po_client: bestMatch.client_name,
            so_total: soTotal, po_total: poTotal,
            so_date: so.created_at, po_date: bestMatch.created_at,
            days_diff: bestResult.daysDiff, value_diff: bestResult.valueDiff,
          }),
        });
        matchedPOIds.add(bestMatch.id);
        matchedSOIds.add(so.id);
      } else {
        results.push({
          service_order_id: so.id,
          payment_order_id: null,
          matched_by: "auto",
          confidence_score: 0,
          difference_amount: soTotal,
          status: "missing",
          notes: JSON.stringify({
            match_reasons: ["no_match"],
            match_type: "no_match",
            explanation: `Service order (${so.license_plate || 'N/A'}, ${so.client_name || 'N/A'}, ${formatMoney(soTotal)}, platform: ${so.platform || 'N/A'}) has no corresponding payment order.`,
            so_plate: so.license_plate, so_platform: so.platform,
            so_client: so.client_name, so_total: soTotal,
            so_date: so.created_at, best_score: roundedScore,
          }),
        });
      }
    }

    // --- PHASE 4: Unmatched POs ---
    for (const po of paymentOrders) {
      if (matchedPOIds.has(po.id)) continue;
      const poTotal = Number(po.total || 0);
      results.push({
        service_order_id: null,
        payment_order_id: po.id,
        matched_by: "auto",
        confidence_score: 0,
        difference_amount: -poTotal,
        status: "missing",
        notes: JSON.stringify({
          match_reasons: ["no_match"],
          match_type: "no_match",
          explanation: `Payment order (${po.license_plate || 'N/A'}, ${po.client_name || 'N/A'}, ${formatMoney(poTotal)}, platform: ${po.platform || 'N/A'}) has no corresponding service order.`,
          po_plate: po.license_plate, po_platform: po.platform,
          po_client: po.client_name, po_total: poTotal,
          po_date: po.created_at, type: "missing_service",
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

    const summary = {
      total: results.length,
      inserted: insertedCount,
      matched: results.filter(r => r.status === "matched").length,
      mismatched: results.filter(r => r.status === "mismatch").length,
      missing: results.filter(r => r.status === "missing").length,
      pending: results.filter(r => r.status === "pending").length,
      grouped: results.filter(r => {
        try { return JSON.parse(r.notes)?.match_type === "grouped_match"; } catch { return false; }
      }).length,
      debug_sample: debugDecisions.slice(0, 10),
    };

    console.log("Reconciliation complete:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
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

function formatMoney(v: number): string {
  return `€${v.toFixed(2)}`;
}

function buildExplanation(so: any, po: any, diff: number, status: string, result: MatchResult): string {
  const parts: string[] = [];
  const soPlat = so.platform || 'N/A';
  const poPlat = po.platform || 'N/A';
  const soClient = so.client_name || 'N/A';
  const poClient = po.client_name || 'N/A';

  if (status === "matched") {
    parts.push(`Matched [${result.matchType}]: ${so.license_plate || 'N/A'} (${soClient}, ${soPlat}) — values match at ${formatMoney(Number(so.total || 0))}.`);
  } else if (status === "mismatch") {
    parts.push(`Value mismatch for ${so.license_plate || 'N/A'} (${soClient}, ${soPlat}): expected ${formatMoney(Number(so.total || 0))}, received ${formatMoney(Number(po.total || 0))}. Diff: ${formatMoney(Math.abs(diff))}.`);
  } else {
    parts.push(`Low confidence match for ${so.license_plate || 'N/A'} (${soPlat} vs ${poPlat}, ${soClient} vs ${poClient}): ${result.reasons.join(', ')}.`);
  }

  if (result.reasons.includes("platform_mismatch")) {
    parts.push(`Platform mismatch: SO=${soPlat}, PO=${poPlat}.`);
  }
  if (result.reasons.includes("service_mismatch")) {
    parts.push(`Services do not match — match blocked.`);
  }
  if (result.reasons.includes("client_mismatch")) {
    parts.push(`Client mismatch: SO=${soClient}, PO=${poClient}.`);
  }
  if (result.daysDiff !== null && result.daysDiff > 0) {
    parts.push(`Date gap: ${result.daysDiff} days.`);
  }

  return parts.join(' ');
}
