import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fechamento de Caixa | Lotérica Brasil da Sorte" },
      {
        name: "description",
        content:
          "Sistema de fechamento de caixa da Lotérica Brasil da Sorte: saldo inicial e final, bolões, importação por foto e PDF em uma página.",
      },
      { property: "og:title", content: "Fechamento de Caixa | Brasil da Sorte" },
      {
        property: "og:description",
        content:
          "Registre o caixa do dia, importe o fechamento por foto e gere o PDF automaticamente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/fechamento" : "/auth" });
    });
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          Lotérica Brasil da Sorte
        </p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Fechamento de Caixa</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Entre com sua conta para registrar o caixa do dia.
        </p>
        <Link
          to="/auth"
          className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Entrar
        </Link>
      </div>
    </main>
  );
}
