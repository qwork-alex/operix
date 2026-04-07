import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalize(s?: string | null): string {
  return (s ?? "").trim().toUpperCase().replace(/[\s\-\.]/g, "");
}

function normLower(s?: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

function dateDistance(a?: string | null, b?: string | null): number {
  if (!a || !b) return Infinity;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return Infinity;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

function valueSimilarity(a: number, b: number): number {
  if (a === 0 && b === 0) return 1;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 1;
  return 1 - Math.abs(a - b) / max;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const [soRes, poRes] = await Promise.all([
      supabase.from("service_orders").select("id, license_plate, car_name, total, week, technician_id, technician_name, client_id, client_name, platform, created_at, status"),
      supabase.from("payment_orders").select("id, license_plate, car_name, total, technician_id, technician_name, client_id, client_name, platform, service_order_id, created_at, status"),
    ]);

    const serviceOrders = soRes.data ?? [];
    const paymentOrders = poRes.data ?? [];

    console.log(`Reconciliation: ${serviceOrders.length} SOs, ${paymentOrders.length} POs`);

    // If no data exists, clear reconciliations and return empty
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

    // Clear old auto reconciliations
    await supabase.from("reconciliations").delete().eq("matched_by", "auto");

    const results: any[] = [];
    const matchedPOIds = new Set<string>();

    // Smart matching algorithm
    for (const so of serviceOrders) {
      const soPlate = normalize(so.license_plate);
      const soClient = normLower(so.client_name);
      const soTotal = Number(so.total || 0);

      let bestMatch: any = null;
      let bestScore = 0;
      let bestDetails: any = {};

      for (const po of paymentOrders) {
        if (matchedPOIds.has(po.id)) continue;

        const poPlate = normalize(po.license_plate);
        const poClient = normLower(po.client_name);
        const poTotal = Number(po.total || 0);

        let score = 0;
        const matchReasons: string[] = [];

        // 1. Plate match (50 pts) - highest priority
        if (soPlate && poPlate && soPlate === poPlate) {
          score += 50;
          matchReasons.push("plate_exact");
        }

        // 2. Client match (20 pts)
        if (soClient && poClient && soClient === poClient) {
          score += 20;
          matchReasons.push("client_exact");
        } else if (soClient && poClient && (soClient.includes(poClient) || poClient.includes(soClient))) {
          score += 10;
          matchReasons.push("client_partial");
        }

        // 3. Date proximity (10 pts) - ±3 days
        const daysDiff = dateDistance(so.created_at, po.created_at);
        if (daysDiff <= 1) {
          score += 10;
          matchReasons.push("date_same_day");
        } else if (daysDiff <= 3) {
          score += 7;
          matchReasons.push("date_close");
        } else if (daysDiff <= 7) {
          score += 3;
          matchReasons.push("date_week");
        }

        // 4. Value similarity (15 pts) - within 10%
        const valSim = valueSimilarity(soTotal, poTotal);
        score += valSim * 15;
        if (valSim >= 0.99) matchReasons.push("value_exact");
        else if (valSim >= 0.9) matchReasons.push("value_close");

        // 5. Platform match (5 pts)
        if (so.platform && po.platform && normLower(so.platform) === normLower(po.platform)) {
          score += 5;
          matchReasons.push("platform_match");
        }

        // 6. Car name match (5 pts)
        const soCar = normLower(so.car_name);
        const poCar = normLower(po.car_name);
        if (soCar && poCar && soCar === poCar) {
          score += 5;
          matchReasons.push("car_match");
        }

        // 7. Technician match (5 pts)
        if (so.technician_id && po.technician_id && so.technician_id === po.technician_id) {
          score += 5;
          matchReasons.push("technician_match");
        }

        // 8. Direct link via service_order_id (bonus 30 pts)
        if (po.service_order_id === so.id) {
          score += 30;
          matchReasons.push("direct_link");
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = po;
          bestDetails = {
            matchReasons,
            daysDiff: isFinite(daysDiff) ? Math.round(daysDiff * 10) / 10 : null,
            valueSimilarity: Math.round(valSim * 100),
          };
        }
      }

      const roundedScore = Math.round(bestScore * 10) / 10;

      if (bestMatch && roundedScore >= 40) {
        const poTotal = Number(bestMatch.total || 0);
        const diff = soTotal - poTotal;
        
        // Classification
        let status: string;
        if (roundedScore >= 70 && Math.abs(diff) < 0.01) {
          status = "matched";
        } else if (roundedScore >= 50 && Math.abs(diff) >= 0.01) {
          status = "mismatch";
        } else {
          status = "pending";
        }

        // Build explanation
        const explanation = buildExplanation(so, bestMatch, diff, status, bestDetails);

        results.push({
          service_order_id: so.id,
          payment_order_id: bestMatch.id,
          matched_by: "auto",
          confidence_score: roundedScore,
          difference_amount: diff,
          status,
          notes: JSON.stringify({
            match_reasons: bestDetails.matchReasons,
            explanation,
            so_plate: so.license_plate,
            po_plate: bestMatch.license_plate,
            so_client: so.client_name,
            po_client: bestMatch.client_name,
            so_total: soTotal,
            po_total: poTotal,
            so_date: so.created_at,
            po_date: bestMatch.created_at,
            days_diff: bestDetails.daysDiff,
            value_similarity: bestDetails.valueSimilarity,
          }),
        });
        matchedPOIds.add(bestMatch.id);
      } else {
        // Missing payment for this SO
        results.push({
          service_order_id: so.id,
          payment_order_id: null,
          matched_by: "auto",
          confidence_score: 0,
          difference_amount: soTotal,
          status: "missing",
          notes: JSON.stringify({
            match_reasons: ["no_match"],
            explanation: `Service order (${so.license_plate || 'N/A'}, ${so.client_name || 'N/A'}, ${formatMoney(soTotal)}) has no corresponding payment order.`,
            so_plate: so.license_plate,
            so_client: so.client_name,
            so_total: soTotal,
            so_date: so.created_at,
            best_score: roundedScore,
          }),
        });
      }
    }

    // Unmatched POs (overpayments / missing service orders)
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
          explanation: `Payment order (${po.license_plate || 'N/A'}, ${po.client_name || 'N/A'}, ${formatMoney(poTotal)}) has no corresponding service order.`,
          po_plate: po.license_plate,
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

function buildExplanation(so: any, po: any, diff: number, status: string, details: any): string {
  const parts: string[] = [];
  
  if (status === "matched") {
    parts.push(`Matched: ${so.license_plate || 'N/A'} (${so.client_name || 'N/A'}) — values match exactly at ${formatMoney(Number(so.total || 0))}.`);
  } else if (status === "mismatch") {
    parts.push(`Value mismatch for ${so.license_plate || 'N/A'} (${so.client_name || 'N/A'}): expected ${formatMoney(Number(so.total || 0))}, received ${formatMoney(Number(po.total || 0))}. Difference: ${formatMoney(Math.abs(diff))}.`);
  } else {
    parts.push(`Low confidence match for ${so.license_plate || 'N/A'}: score ${details.matchReasons?.join(', ')}.`);
  }

  if (details.daysDiff !== null && details.daysDiff > 0) {
    parts.push(`Date gap: ${details.daysDiff} days.`);
  }

  return parts.join(' ');
}
