import { readStoredAuthSession, type AuthUser } from "@/lib/authSession";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = readStoredAuthSession();
  console.log("CURRENT AUTH USER:", session?.user?.id ?? null);
  return session?.user ?? null;
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
