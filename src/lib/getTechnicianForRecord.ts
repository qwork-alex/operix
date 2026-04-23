import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a technician_id to use for a financial_records insert.
 * - If the current user has a technician profile, returns it.
 * - Otherwise (typical admin), falls back to the first technician in the system.
 * Throws if no technician exists at all.
 */
export async function resolveTechnicianIdForFinancialRecord(): Promise<string> {
  const { data: mine } = await supabase.rpc("get_my_technician_id");
  if (mine) return mine as string;

  const { data: first, error } = await supabase
    .from("technicians")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!first?.id) {
    throw new Error("Nenhum técnico cadastrado. Crie um técnico antes de registrar lançamentos financeiros.");
  }
  return first.id;
}
