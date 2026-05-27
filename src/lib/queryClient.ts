import { QueryClient } from "@tanstack/react-query";

/**
 * Global QueryClient singleton.
 *
 * Stored on globalThis so HMR reloads of App.tsx (or any consumer) reuse
 * the SAME instance. Without this guard, Vite HMR would instantiate a new
 * QueryClient on every edit, dropping the cache and forcing every active
 * query to refetch — which looks identical to an auth/session remount.
 */
declare global {
  // eslint-disable-next-line no-var
  var __QUERY_CLIENT__: QueryClient | undefined;
}

function createQueryClient(): QueryClient {
  console.log("[BOOT] QueryClient singleton created (should appear ONCE)");
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      mutations: {
        onError: (error) => {
          console.error("[Mutation Error]", error);
        },
      },
    },
  });
}

export const queryClient: QueryClient =
  globalThis.__QUERY_CLIENT__ ?? (globalThis.__QUERY_CLIENT__ = createQueryClient());
