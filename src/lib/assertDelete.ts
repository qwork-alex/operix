import { supabase } from "@/integrations/supabase/client";

/**
 * Performs a DELETE that returns the deleted rows so we can verify RLS did not
 * silently drop the operation. If `expected` is provided, mismatched count is
 * treated as a permission error. Otherwise, any zero-row delete on a non-empty
 * input throws "permission_denied_or_not_found".
 *
 * Usage:
 *   await assertedDelete("service_orders", q => q.eq("id", id));
 *   await assertedDelete("payment_orders", q => q.in("id", ids), ids.length);
 */
export async function assertedDelete<T extends string>(
  table: T,
  filter: (q: any) => any,
  expected?: number,
): Promise<{ deleted: number }> {
  const base = (supabase.from as any)(table).delete().select("id");
  const { data, error } = await filter(base);
  if (error) throw error;
  const count = Array.isArray(data) ? data.length : 0;
  if (count === 0 || (expected !== undefined && count !== expected)) {
    const err = new Error(
      expected !== undefined && count !== expected
        ? `Apenas ${count}/${expected} registros foram removidos. Sem permissão para os demais.`
        : "Sem permissão para excluir este registro.",
    );
    (err as any).code = "permission_denied_or_not_found";
    throw err;
  }
  return { deleted: count };
}
