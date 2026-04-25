import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves an assigned_user_id (auth.users.id) to use for a financial_records insert.
 * - If the current user is logged in, returns their auth uid.
 * - Otherwise (rare), falls back to the first user with the "technician" role.
 * Throws if no technician user exists at all.
 *
 * NOTE: function name is kept for backward compatibility, but it now returns an
 * auth user id (assigned_user_id), no longer a technicians.id.
 */
export async function resolveTechnicianIdForFinancialRecord(): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (auth?.user?.id) return auth.user.id;

  const { data: first, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "technician")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!first?.user_id) {
    throw new Error("Nenhum utilizador técnico disponível. Crie um técnico antes de registar lançamentos financeiros.");
  }
  return first.user_id as string;
}
