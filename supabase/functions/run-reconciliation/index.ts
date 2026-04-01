import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalize(s?: string | null): string {
  return (s ?? "").trim().toLowerCase().replace(/[\s\-]/g, "");
}

function similarity(a: number, b: number): number {
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
      supabase.from("service_orders").select("id, license_plate, car_name, total, week, technician_id, client_id, platform"),
      supabase.from("payment_orders").select("id, license_plate, car_name, total, technician_id, client_id, platform, service_order_id"),
    ]);

    const serviceOrders = soRes.data ?? [];
    const paymentOrders = poRes.data ?? [];

    // Clear old auto reconciliations
    await supabase.from("reconciliations").delete().eq("matched_by", "auto");

    const results: any[] = [];
    const matchedPOIds = new Set<string>();

    for (const so of serviceOrders) {
      let bestMatch: any = null;
      let bestScore = 0;

      for (const po of paymentOrders) {
        if (matchedPOIds.has(po.id)) continue;

        let score = 0;

        // Plate match (50%)
        const soPlate = normalize(so.license_plate);
        const poPlate = normalize(po.license_plate);
        if (soPlate && poPlate && soPlate === poPlate) score += 50;

        // Car model match (20%)
        const soCar = normalize(so.car_name);
        const poCar = normalize(po.car_name);
        if (soCar && poCar && soCar === poCar) score += 20;
        else if (soCar && poCar && (soCar.includes(poCar) || poCar.includes(soCar))) score += 10;

        // Total value similarity (15%)
        const soTotal = Number(so.total || 0);
        const poTotal = Number(po.total || 0);
        score += similarity(soTotal, poTotal) * 15;

        // Week (10%) - compare via platform as proxy if no week on PO
        if (so.platform && po.platform && normalize(so.platform) === normalize(po.platform)) score += 5;
        if (so.client_id && po.client_id && so.client_id === po.client_id) score += 5;

        // Technician (5%)
        if (so.technician_id && po.technician_id && so.technician_id === po.technician_id) score += 5;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = po;
        }
      }

      const roundedScore = Math.round(bestScore * 10) / 10;

      if (bestMatch && roundedScore >= 50) {
        const soTotal = Number(so.total || 0);
        const poTotal = Number(bestMatch.total || 0);
        const diff = soTotal - poTotal;
        const status = roundedScore >= 80
          ? (Math.abs(diff) < 0.01 ? "matched" : "mismatch")
          : "pending";

        results.push({
          service_order_id: so.id,
          payment_order_id: bestMatch.id,
          matched_by: "auto",
          confidence_score: roundedScore,
          difference_amount: diff,
          status,
        });
        matchedPOIds.add(bestMatch.id);
      } else {
        // No match found — missing payment
        results.push({
          service_order_id: so.id,
          payment_order_id: null,
          matched_by: "auto",
          confidence_score: 0,
          difference_amount: Number(so.total || 0),
          status: "missing",
        });
      }
    }

    // Unmatched POs (overpayments)
    for (const po of paymentOrders) {
      if (!matchedPOIds.has(po.id)) {
        const alreadyRecorded = results.some(r => r.payment_order_id === po.id);
        if (!alreadyRecorded) {
          results.push({
            service_order_id: null,
            payment_order_id: po.id,
            matched_by: "auto",
            confidence_score: 0,
            difference_amount: -Number(po.total || 0),
            status: "missing",
          });
        }
      }
    }

    if (results.length > 0) {
      const { error } = await supabase.from("reconciliations").upsert(results, {
        onConflict: "service_order_id,payment_order_id",
        ignoreDuplicates: false,
      });
      if (error) {
        console.error("Upsert error, inserting individually:", error);
        // Fallback: insert one by one, skip conflicts
        for (const r of results) {
          await supabase.from("reconciliations").insert(r).select();
        }
      }
    }

    const summary = {
      total: results.length,
      matched: results.filter(r => r.status === "matched").length,
      mismatched: results.filter(r => r.status === "mismatch").length,
      missing: results.filter(r => r.status === "missing").length,
      pending: results.filter(r => r.status === "pending").length,
    };

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
