// Financial AI Assistant — non-destructive analysis layer.
// Reads financial_records + fleet_fuel_logs for a workspace, computes
// heuristic insights/warnings, then asks Lovable AI for a short narrative.
// NEVER mutates data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Insight = {
  level: "info" | "warning" | "critical";
  category: string;
  title: string;
  detail: string;
  refs?: string[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace("Bearer ", "");
    if (!token) return j({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return j({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const workspaceId: string | undefined = body.workspaceId;
    const year: number | undefined = body.year;
    if (!workspaceId) return j({ error: "workspaceId required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Pull recent financial data (scoped + workspace-isolated)
    const yr = year || new Date().getFullYear();
    const [frRes, fuelRes] = await Promise.all([
      admin
        .from("financial_records")
        .select("id, type, category, amount, label, notes, status, origin, reference_id, assigned_user_id, vehicle_id, created_at, year_reference")
        .eq("workspace_id", workspaceId)
        .eq("year_reference", yr)
        .limit(2000),
      admin
        .from("fleet_fuel_logs")
        .select("id, date, liters, total_cost, price_per_liter, km_at_fuel, vehicle_id, driver_id, receipt_storage_path")
        .eq("workspace_id", workspaceId)
        .gte("date", `${yr}-01-01`)
        .lte("date", `${yr}-12-31`)
        .limit(2000),
    ]);

    const records = frRes.data || [];
    const fuel = fuelRes.data || [];
    const insights: Insight[] = [];

    // 1) Duplicate detection (same amount + label + date day)
    const dupMap = new Map<string, number>();
    for (const r of records) {
      const day = (r.created_at || "").slice(0, 10);
      const key = `${r.type}|${(r.label || "").trim().toLowerCase()}|${Number(r.amount).toFixed(2)}|${day}`;
      dupMap.set(key, (dupMap.get(key) || 0) + 1);
    }
    for (const [key, count] of dupMap) {
      if (count >= 2) {
        insights.push({
          level: "warning",
          category: "duplicates",
          title: "Possível lançamento duplicado",
          detail: `${count}× lançamentos idênticos: ${key.split("|")[1] || "(sem descrição)"} — €${key.split("|")[2]}`,
        });
      }
    }

    // 2) Abnormal expenses (z-score by category)
    const byCat = new Map<string, number[]>();
    for (const r of records) {
      if (r.type !== "expense") continue;
      const c = r.category || "other";
      const arr = byCat.get(c) || [];
      arr.push(Number(r.amount) || 0);
      byCat.set(c, arr);
    }
    for (const [cat, arr] of byCat) {
      if (arr.length < 5) continue;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
      const threshold = mean + 2.5 * sd;
      const outliers = arr.filter((v) => v > threshold && v > mean * 1.8);
      if (outliers.length) {
        insights.push({
          level: "warning",
          category: "anomaly",
          title: `Despesas anormais em "${cat}"`,
          detail: `${outliers.length} valor(es) acima de €${threshold.toFixed(2)} (média: €${mean.toFixed(2)})`,
        });
      }
    }

    // 3) Fuel anomalies — duplicates, missing receipts, abnormal price/liter
    const fuelByVehicleDay = new Map<string, number>();
    let missingReceipts = 0;
    const pricesPerL: number[] = [];
    for (const f of fuel) {
      const k = `${f.vehicle_id}|${f.date}`;
      fuelByVehicleDay.set(k, (fuelByVehicleDay.get(k) || 0) + 1);
      if (!f.receipt_storage_path) missingReceipts++;
      if (f.price_per_liter) pricesPerL.push(Number(f.price_per_liter));
    }
    const dupFuel = Array.from(fuelByVehicleDay.values()).filter((c) => c > 1).length;
    if (dupFuel) {
      insights.push({
        level: "warning",
        category: "fuel",
        title: "Possíveis abastecimentos duplicados",
        detail: `${dupFuel} dia(s) com mais de um abastecimento para o mesmo veículo`,
      });
    }
    if (missingReceipts > 0) {
      insights.push({
        level: "info",
        category: "documents",
        title: "Abastecimentos sem comprovativo",
        detail: `${missingReceipts} registo(s) de combustível sem talão anexado`,
      });
    }
    if (pricesPerL.length >= 5) {
      const m = pricesPerL.reduce((a, b) => a + b, 0) / pricesPerL.length;
      const sd = Math.sqrt(pricesPerL.reduce((a, b) => a + (b - m) ** 2, 0) / pricesPerL.length);
      const outl = pricesPerL.filter((v) => Math.abs(v - m) > 2 * sd && Math.abs(v - m) > 0.3);
      if (outl.length) {
        insights.push({
          level: "info",
          category: "fuel",
          title: "Preço por litro fora do padrão",
          detail: `${outl.length} abastecimento(s) com €/L afastado da média (€${m.toFixed(3)})`,
        });
      }
    }

    // 4) Imported documents without amount/receipt link
    const importedNoRef = records.filter(
      (r) => r.origin === "imported_document" && !r.reference_id,
    ).length;
    if (importedNoRef > 0) {
      insights.push({
        level: "warning",
        category: "documents",
        title: "Lançamentos importados sem documento",
        detail: `${importedNoRef} lançamento(s) marcados como importados mas sem ficheiro vinculado`,
      });
    }

    // 5) Profitability — compare income vs expense
    const totalIncome = records.filter((r) => r.type === "income").reduce((a, r) => a + Number(r.amount || 0), 0);
    const totalExpense = records.filter((r) => r.type === "expense").reduce((a, r) => a + Number(r.amount || 0), 0);
    const margin = totalIncome - totalExpense;
    if (totalIncome > 0 && margin < 0) {
      insights.push({
        level: "critical",
        category: "profitability",
        title: "Margem operacional negativa",
        detail: `Despesas (€${totalExpense.toFixed(2)}) superam receitas (€${totalIncome.toFixed(2)}) em €${Math.abs(margin).toFixed(2)}`,
      });
    }

    // 6) Excessive withdrawals (top technician share)
    const wdByTech = new Map<string, number>();
    for (const r of records) {
      if (r.category !== "salary" && r.type !== "withdrawal") continue;
      const k = r.assigned_user_id || "—";
      wdByTech.set(k, (wdByTech.get(k) || 0) + Number(r.amount || 0));
    }
    const wdTotal = Array.from(wdByTech.values()).reduce((a, b) => a + b, 0);
    for (const [tech, v] of wdByTech) {
      if (wdTotal > 0 && v / wdTotal > 0.55 && tech !== "—") {
        insights.push({
          level: "warning",
          category: "withdrawals",
          title: "Concentração de retiradas",
          detail: `Um técnico concentra ${((v / wdTotal) * 100).toFixed(0)}% das retiradas (€${v.toFixed(2)})`,
        });
      }
    }

    // KPIs
    const kpis = {
      totalIncome,
      totalExpense,
      margin,
      records: records.length,
      fuelEntries: fuel.length,
      missingReceipts,
      duplicates: Array.from(dupMap.values()).filter((c) => c >= 2).length,
    };

    // 7) AI narrative summary (best-effort)
    let narrative = "";
    if (LOVABLE_API_KEY && insights.length) {
      try {
        const prompt = `Resume em 3-4 frases curtas, em português europeu, o estado financeiro do workspace deste ano com base nos indicadores e alertas seguintes. Tom direto, sem floreios.\n\nKPIs: ${JSON.stringify(kpis)}\n\nAlertas: ${JSON.stringify(insights.slice(0, 12))}`;
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "És um analista financeiro conciso. Nunca inventas dados." },
              { role: "user", content: prompt },
            ],
          }),
        });
        if (aiResp.ok) {
          const data = await aiResp.json();
          narrative = data?.choices?.[0]?.message?.content || "";
        }
      } catch (e) {
        console.error("AI narrative failed", e);
      }
    }

    return j({ kpis, insights, narrative, generatedAt: new Date().toISOString() }, 200);
  } catch (e) {
    console.error("financial-ai-insights error", e);
    return j({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function j(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
