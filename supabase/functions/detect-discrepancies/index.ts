import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");

    // Fetch service orders and payment orders
    const [soRes, poRes] = await Promise.all([
      supabase.from("service_orders").select("*"),
      supabase.from("payment_orders").select("*"),
    ]);

    const serviceOrders = soRes.data ?? [];
    const paymentOrders = poRes.data ?? [];

    const newDiscrepancies: any[] = [];

    // For each service order, try to find a matching payment order
    for (const so of serviceOrders) {
      const plate = so.license_plate?.trim().toLowerCase();
      const clientId = so.client_id;
      const platform = so.platform?.trim().toLowerCase();

      if (!plate) continue;

      // Find matching payment order by plate + client + platform
      const match = paymentOrders.find((po) => {
        const poPlate = po.license_plate?.trim().toLowerCase();
        const poPlatform = po.platform?.trim().toLowerCase();
        return poPlate === plate && po.client_id === clientId && poPlatform === platform;
      });

      if (!match) {
        // Missing payment
        newDiscrepancies.push({
          service_order_id: so.id,
          payment_order_id: null,
          issue_type: "missing",
          expected_value: so.total || 0,
          received_value: 0,
        });
      } else {
        // Check value mismatch
        const expected = Number(so.total || 0);
        const received = Number(match.total || 0);
        if (Math.abs(expected - received) > 0.01) {
          newDiscrepancies.push({
            service_order_id: so.id,
            payment_order_id: match.id,
            issue_type: "value_mismatch",
            expected_value: expected,
            received_value: received,
          });
        }
      }
    }

    // Check for payment orders without matching service orders (overpayments)
    for (const po of paymentOrders) {
      const plate = po.license_plate?.trim().toLowerCase();
      const clientId = po.client_id;
      const platform = po.platform?.trim().toLowerCase();

      if (!plate) continue;

      const match = serviceOrders.find((so) => {
        const soPlate = so.license_plate?.trim().toLowerCase();
        const soPlatform = so.platform?.trim().toLowerCase();
        return soPlate === plate && so.client_id === clientId && soPlatform === platform;
      });

      if (!match) {
        newDiscrepancies.push({
          service_order_id: null,
          payment_order_id: po.id,
          issue_type: "missing",
          expected_value: 0,
          received_value: po.total || 0,
        });
      }
    }

    // Clear old unresolved discrepancies and insert new ones
    await supabase.from("discrepancies").delete().eq("resolved", false);

    if (newDiscrepancies.length > 0) {
      const { error } = await supabase.from("discrepancies").insert(newDiscrepancies);
      if (error) throw error;
    }

    return new Response(JSON.stringify({
      total: newDiscrepancies.length,
      missing: newDiscrepancies.filter(d => d.issue_type === "missing").length,
      mismatches: newDiscrepancies.filter(d => d.issue_type === "value_mismatch").length,
      discrepancies: newDiscrepancies,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-discrepancies error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
