import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) console.error("[Auth] getUser error:", error);
  if (data.user?.id) {
    console.log("CURRENT AUTH USER:", data.user.id);
    return data.user;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) console.error("[Auth] getSession fallback error:", sessionError);
  console.log("CURRENT AUTH USER:", sessionData.session?.user?.id ?? null);
  return sessionData.session?.user ?? null;
}

export async function getCurrentUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("Usuário autenticado não encontrado. Faça login novamente antes de salvar.");
  }
  return user.id;
}

export function logSavePayload(scope: string, userId: string, payload: unknown) {
  console.log(`[${scope}] current user:`, userId);
  console.log(`[${scope}] payload:`, payload);
}

export function logSaveError(scope: string, error: unknown) {
  console.log(`[${scope}] error:`, error);
}