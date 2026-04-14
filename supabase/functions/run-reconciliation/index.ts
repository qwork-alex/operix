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

function serviceOverlap(soNames: string[], poNames: string[]): { matched: number; total: number } {
  if (soNames.length === 0 && poNames.length === 0) return { matched: 0, total: 0 };
  const total = Math.max(soNames.length, poNames.length);
  let matched = 0;
  const used = new Set<number>();
  for (const sn of soNames) {
    for (let i = 0; i < poNames.length; i++) {
      if (!used.has(i) && (sn === poNames[i] || sn.includes(poNames[i]) || poNames[i].includes(sn))) {
        matched++;
        used.add(i);
        break;
      }
    }
  }
  return { matched, total };
}

// --- Scoring engine ---

interface MatchResult {
  score: number;
  reasons: string[];
  daysDiff: number | null;
  valueDiff: number;
}

function calculateScore(so: any, po: any): MatchResult {
  let score = 0;
  const reasons: string[] = [];

  const soPlate = normalizePlate(so.license_plate);
  const poPlate = normalizePlate(po.license_plate);
  const soTotal = Number(so.total || 0);
  const poTotal = Number(po.total || 0);
  const valueDiff = Math.abs(soTotal - poTotal);

  // 1. Direct link (bonus 30 pts)
  if (po.service_order_id === so.id) {
    score += 30;
    reasons.push("direct_link");
  }

  // 2. Plate match (25 pts)
  if (soPlate && poPlate && soPlate === poPlate) {
    score += 25;
    reasons.push("plate_exact");
  }

  // 3. Service match (30 pts match / -40 pts mismatch)
  const soServices = extractServiceNames(so);
  const poServices = extractPOServiceNames(po);
  const overlap = serviceOverlap(soServices, poServices);
  if (overlap.total > 0) {
    if (overlap.matched === overlap.total) {
      score += 30;
      reasons.push("service_exact");
    } else if (overlap.matched > 0) {
      score += Math.round((overlap.matched / overlap.total) * 20);
      reasons.push("service_partial");
    } else {
      score -= 40;
      reasons.push("service_mismatch");
    }
  }

  // 4. Platform match (20 pts match / -15 pts mismatch)
  const soPlatform = normalizePlatform(so.platform);
  const poPlatform = normalizePlatform(po.platform);
  if (soPlatform && poPlatform) {
    if (soPlatform === poPlatform) {
      score += 20;
      reasons.push("platform_match");
    } else {
      score -= 15;
      reasons.push("platform_mismatch");
    }
  }

  // 5. Value proximity (10 pts)
  if (valueDiff < 5) {
    score += 10;
    reasons.push("value_exact");
  } else if (valueDiff < 20) {
    score += 5;
    reasons.push("value_close");
  }

  // 6. Client match (5 pts)
  const soClient = normLower(so.client_name);
  const poClient = normLower(po.client_name);
  if (soClient && poClient && soClient === poClient) {
    score += 5;
    reasons.push("client_exact");
  } else if (soClient && poClient && (soClient.includes(poClient) || poClient.includes(soClient))) {
    score += 3;
    reasons.push("client_partial");
  }

  // 7. Date proximity (5 pts)
  const daysDiff = dateDistanceDays(so.created_at, po.created_at);
  if (isFinite(daysDiff) && daysDiff < 7) {
    score += 5;
    reasons.push("date_close");
  }

  // 8. Technician match (3 pts)
  if (so.technician_id && po.technician_id && so.technician_id === po.technician_id) {
    score += 3;
    reasons.push("technician_match");
  }

  // 9. Car name match (2 pts)
  const soCar = normLower(so.car_name);
  const poCar = normLower(po.car_name);
  if (soCar && poCar && soCar === poCar) {
    score += 2;
    reasons.push("car_match");
  }

  return {
    score,
    reasons,
    daysDiff: isFinite(daysDiff) ? Math.round(daysDiff * 10) / 10 : null,
    valueDiff,
  };
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

    if (serviceOrders.length === 0 && paymentOrders.length === 0) {
      await supabase.from("reconciliations").delete().eq("matched_by", "auto");
      return new Response(JSON.stringify({
        total: 0, matched: 0, mismatched: 0, missing: 0, pending: 0,
        message: "No service or payment orders found"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("reconciliations").delete().eq("matched_by", "auto");

    const results: any[] = [];
    const matchedPOIds = new Set<string>();

    for (const so of serviceOrders) {
      const soTotal = Number(so.total || 0);
      let bestMatch: any = null;
      let bestResult: MatchResult | null = null;

      for (const po of paymentOrders) {
        if (matchedPOIds.has(po.id)) continue;

        const result = calculateScore(so, po);
        if (!bestResult || result.score > bestResult.score) {
          bestResult = result;
          bestMatch = po;
        }
      }

      const roundedScore = bestResult ? Math.round(bestResult.score * 10) / 10 : 0;

      if (bestMatch && bestResult && roundedScore >= 40) {
        const poTotal = Number(bestMatch.total || 0);
        const diff = soTotal - poTotal;

        let status: string;
        if (roundedScore >= 70 && Math.abs(diff) < 0.01) {
          status = "matched";
        } else if (roundedScore >= 40 && Math.abs(diff) >= 0.01) {
          status = "mismatch";
        } else if (roundedScore >= 70) {
          status = "matched";
        } else {
          status = "pending";
        }

        const explanation = buildExplanation(so, bestMatch, diff, status, bestResult);

        results.push({
          service_order_id: so.id,
          payment_order_id: bestMatch.id,
          matched_by: "auto",
          confidence_score: roundedScore,
          difference_amount: diff,
          status,
          notes: JSON.stringify({
            match_reasons: bestResult.reasons,
            explanation,
            so_plate: so.license_plate,
            po_plate: bestMatch.license_plate,
            so_platform: so.platform,
            po_platform: bestMatch.platform,
            so_client: so.client_name,
            po_client: bestMatch.client_name,
            so_total: soTotal,
            po_total: poTotal,
            so_date: so.created_at,
            po_date: bestMatch.created_at,
            days_diff: bestResult.daysDiff,
            value_diff: bestResult.valueDiff,
          }),
        });
        matchedPOIds.add(bestMatch.id);
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
            explanation: `Service order (${so.license_plate || 'N/A'}, ${so.client_name || 'N/A'}, ${formatMoney(soTotal)}, platform: ${so.platform || 'N/A'}) has no corresponding payment order.`,
            so_plate: so.license_plate,
            so_platform: so.platform,
            so_client: so.client_name,
            so_total: soTotal,
            so_date: so.created_at,
            best_score: roundedScore,
          }),
        });
      }
    }

    // Unmatched POs
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
          explanation: `Payment order (${po.license_plate || 'N/A'}, ${po.client_name || 'N/A'}, ${formatMoney(poTotal)}, platform: ${po.platform || 'N/A'}) has no corresponding service order.`,
          po_plate: po.license_plate,
          po_platform: po.platform,
          po_client: po.client_name,
          po_total: poTotal,
          po_date: po.created_at,
          type: "missing_service",
        }),
      });
    }

    // Insert results
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

  if (status === "matched") {
    parts.push(`Matched: ${so.license_plate || 'N/A'} (${so.client_name || 'N/A'}, ${soPlat}) — values match at ${formatMoney(Number(so.total || 0))}.`);
  } else if (status === "mismatch") {
    parts.push(`Value mismatch for ${so.license_plate || 'N/A'} (${so.client_name || 'N/A'}, ${soPlat}): expected ${formatMoney(Number(so.total || 0))}, received ${formatMoney(Number(po.total || 0))}. Diff: ${formatMoney(Math.abs(diff))}.`);
  } else {
    parts.push(`Low confidence match for ${so.license_plate || 'N/A'} (${soPlat} vs ${poPlat}): ${result.reasons.join(', ')}.`);
  }

  if (result.reasons.includes("platform_mismatch")) {
    parts.push(`Platform mismatch: SO=${soPlat}, PO=${poPlat}.`);
  }
  if (result.reasons.includes("service_mismatch")) {
    parts.push(`Services do not match.`);
  }
  if (result.daysDiff !== null && result.daysDiff > 0) {
    parts.push(`Date gap: ${result.daysDiff} days.`);
  }

  return parts.join(' ');
}
