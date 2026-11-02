import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

let redirecionandoAuth = false;

const ehUnauthorized = (error: unknown) => {
  const msg = error instanceof Error ? error.message : "";
  if (!msg.includes("Unauthorized")) return false;
  // Sessão inválida/expirada: sai e volta para o login (mesmo com token
  // inválido o signOut limpa a sessão local — o servidor responde 401 e é ignorado).
  if (redirecionandoAuth) return true;
  redirecionandoAuth = true;
  import("@/integrations/supabase/client").then(({ supabase }) =>
    supabase.auth.signOut().finally(() => {
      window.location.href = "/auth";
    }),
  );
  return true;
};

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => ehUnauthorized(error),
    }),
    mutationCache: new MutationCache({
      onError: (error) => ehUnauthorized(error),
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (ehUnauthorized(error)) return false;
          return failureCount < 2;
        },
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
