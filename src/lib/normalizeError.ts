import { toast } from "sonner";

/**
 * Centralized error normalizer. Maps backend / network / auth errors into
 * a single user-facing shape — never exposes internal IDs, stack traces,
 * or raw database error codes.
 */
export interface NormalizedError {
  title: string;
  message: string;
  category: "network" | "auth" | "permission" | "validation" | "conflict" | "database" | "unknown";
  recoverable: boolean;
}

const PATTERNS: Array<{
  match: RegExp;
  result: Omit<NormalizedError, "message"> & { message?: string };
}> = [
  { match: /failed to fetch|network|err_internet/i, result: { title: "Sem ligação", category: "network", recoverable: true, message: "Verifique a sua ligação à internet." } },
  { match: /jwt|session|not authenticated|invalid token/i, result: { title: "Sessão expirada", category: "auth", recoverable: true, message: "Inicie sessão novamente para continuar." } },
  { match: /permission denied|insufficient privileges|42501|admin only/i, result: { title: "Sem permissão", category: "permission", recoverable: false, message: "Não tem permissões para esta acção." } },
  { match: /duplicate key|23505|already exists/i, result: { title: "Já existe", category: "conflict", recoverable: false, message: "Este registo já existe." } },
  { match: /violates foreign key|23503/i, result: { title: "Relação inválida", category: "conflict", recoverable: false, message: "Este registo está ligado a outros dados e não pode ser modificado." } },
  { match: /violates check|23514|invalid input/i, result: { title: "Dados inválidos", category: "validation", recoverable: true, message: "Verifique os dados introduzidos." } },
  { match: /pgrst|postgres|database/i, result: { title: "Erro no servidor", category: "database", recoverable: true, message: "Tente novamente em instantes." } },
];

export function normalizeError(err: unknown): NormalizedError {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : String((err as any)?.message || err || "");
  for (const p of PATTERNS) {
    if (p.match.test(raw)) {
      return {
        title: p.result.title,
        message: p.result.message ?? "Ocorreu um erro inesperado.",
        category: p.result.category,
        recoverable: p.result.recoverable,
      };
    }
  }
  return {
    title: "Erro inesperado",
    message: "Tente novamente. Se o problema persistir, contacte o suporte.",
    category: "unknown",
    recoverable: true,
  };
}

/** Show a normalized error toast. Safe to call with any thrown value. */
export function toastError(err: unknown) {
  const n = normalizeError(err);
  toast.error(n.title, { description: n.message });
  if (import.meta.env.DEV) console.error("[normalized]", n, err);
  return n;
}
