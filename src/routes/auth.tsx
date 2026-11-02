import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";

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
  const ehRecuperacao = () =>
    typeof window !== "undefined" && window.location.hash.includes("type=recovery");
  const [modo, setModo] = useState<"entrar" | "criar" | "recuperar" | "redefinir">(() =>
    ehRecuperacao() ? "redefinir" : "entrar",
  );
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // Link de redefinição válido: o Supabase avisa o evento PASSWORD_RECOVERY.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "PASSWORD_RECOVERY") setModo("redefinir");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (ehRecuperacao()) return; // redefinição em andamento: não redireciona
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inicio" });
    });
  }, [navigate]);

  const redefinirSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) {
      setErro("A nova senha precisa de pelo menos 6 caracteres.");
      return;
    }
    if (senha !== senha2) {
      setErro("As senhas não conferem. Digite as duas iguais.");
      return;
    }
    setCarregando(true);
    setErro(null);
    setAviso(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      setAviso("Senha alterada com sucesso! Entrando...");
      setTimeout(() => navigate({ to: "/inicio" }), 1200);
    } catch (err) {
      setErro(
        err instanceof Error
          ? `Não foi possível alterar a senha: ${err.message}. Peça um novo link.`
          : "Não foi possível alterar a senha. Peça um novo link.",
      );
    } finally {
      setCarregando(false);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    setAviso(null);
    try {
      if (modo === "recuperar") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        setAviso(
          "Se este e-mail estiver cadastrado, o link de redefinição foi enviado. Verifique também o spam.",
        );
        return;
      }
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        navigate({ to: "/inicio" });
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
        if (data.session) navigate({ to: "/inicio" });
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
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Lotérica Brasil da Sorte
          </p>
        </div>

        <h1 className="mt-4 text-center text-xl font-bold text-foreground">
          {modo === "entrar"
            ? "Entrar"
            : modo === "criar"
              ? "Criar conta"
              : modo === "recuperar"
                ? "Esqueci minha senha"
                : "Definir nova senha"}
        </h1>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {modo === "entrar"
            ? "Acesse seu painel de fechamento"
            : modo === "criar"
              ? "Preencha seus dados para se cadastrar"
              : modo === "recuperar"
                ? "Informe seu e-mail para receber o link de redefinição"
                : "Escolha uma nova senha de pelo menos 6 caracteres"}
        </p>

        {modo === "redefinir" ? (
          <form onSubmit={redefinirSenha} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Nova senha</span>
              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  required
                  minLength={6}
                  autoFocus
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Repita a nova senha</span>
              <input
                type={mostrarSenha ? "text" : "password"}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Digite de novo"
                value={senha2}
                onChange={(e) => setSenha2(e.target.value)}
                className={inputCls}
              />
            </label>

            {erro && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </div>
            )}
            {aviso && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                {aviso}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {carregando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aguarde...
                </>
              ) : (
                "Salvar nova senha"
              )}
            </button>
          </form>
        ) : (
        <form onSubmit={enviar} className="mt-5 flex flex-col gap-3">
          {modo === "criar" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                placeholder="Seu nome completo"
                className={inputCls}
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </label>
          {modo !== "recuperar" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">Senha</span>
            <div className="relative">
              <input
                type={mostrarSenha ? "text" : "password"}
                required
                minLength={6}
                autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                placeholder="Sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className={`${inputCls} pr-10`}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          )}

          {erro && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro}
            </div>
          )}
          {aviso && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              {aviso}
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {carregando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguarde...
              </>
            ) : modo === "entrar" ? (
              "Entrar"
            ) : (
              "Criar conta"
            )}
          </button>
        </form>
        )}

        {modo === "entrar" && (
          <button
            onClick={() => {
              setModo("recuperar");
              setErro(null);
              setAviso(null);
            }}
            className="mt-3 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Esqueci minha senha
          </button>
        )}

        <button
          onClick={() => {
            setModo(modo === "entrar" ? "criar" : "entrar");
            setErro(null);
            setAviso(null);
            setSenha("");
            setSenha2("");
          }}
          className="mt-3 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {modo === "entrar"
            ? "Não tenho conta — criar agora"
            : modo === "redefinir"
              ? "Voltar ao entrar"
              : "Já tenho conta — entrar"}
        </button>
      </div>
    </main>
  );
}
