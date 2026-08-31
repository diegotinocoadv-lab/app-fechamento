import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | Fechamento de Caixa Brasil da Sorte" },
      {
        name: "description",
        content:
          "Acesse com sua conta para registrar o fechamento de caixa da Lotérica Brasil da Sorte.",
      },
      { property: "og:title", content: "Entrar | Fechamento de Caixa" },
      {
        property: "og:description",
        content: "Área restrita aos operadores da Lotérica Brasil da Sorte.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/fechamento" });
    });
  }, [navigate]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    setAviso(null);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        navigate({ to: "/fechamento" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            data: { nome },
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/fechamento" });
        else setAviso("Conta criada. Confirme o e-mail para entrar.");
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível continuar.");
    } finally {
      setCarregando(false);
    }
  };

  const inputCls =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          Lotérica Brasil da Sorte
        </p>
        <h1 className="mt-2 text-center text-xl font-bold text-foreground">
          {modo === "entrar" ? "Entrar" : "Criar conta"}
        </h1>

        <form onSubmit={enviar} className="mt-5 flex flex-col gap-3">
          {modo === "criar" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">Nome</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">Senha</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={modo === "entrar" ? "current-password" : "new-password"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={inputCls}
            />
          </label>

          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}

          <button
            type="submit"
            disabled={carregando}
            className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {carregando ? "Aguarde..." : modo === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          onClick={() => {
            setModo(modo === "entrar" ? "criar" : "entrar");
            setErro(null);
            setAviso(null);
          }}
          className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {modo === "entrar" ? "Não tenho conta — criar agora" : "Já tenho conta — entrar"}
        </button>
      </div>
    </main>
  );
}
