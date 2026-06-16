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
  var __QUERY_CLIENT__: QueryClient | undefined;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      mutations: {
        onError: () => {},
      },
    },
  });
}

export const queryClient: QueryClient =
  globalThis.__QUERY_CLIENT__ ?? (globalThis.__QUERY_CLIENT__ = createQueryClient());
