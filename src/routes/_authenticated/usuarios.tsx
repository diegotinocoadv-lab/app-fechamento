import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useCallback } from "react";
import { UserPlus, Users, Shield, ShieldOff, Trash2, Loader2 } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { Toast } from "@/components/Toast";
import { supabase } from "@/integrations/supabase/client";
import {
  criarUsuario,
  definirPapel,
  listarUsuarios,
  removerUsuario,
  atualizarPerfil,
} from "@/lib/usuarios.functions";
import { listarOperadoresAtivos } from "@/lib/operadores.functions";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários | Fechamento de Caixa Brasil da Sorte" },
      {
        name: "description",
        content: "Cadastre operadores, defina administradores e remova acessos do sistema de caixa.",
      },
      { property: "og:title", content: "Usuários | Fechamento de Caixa" },
      {
        property: "og:description",
        content: "Gestão de acessos dos operadores da Lotérica Brasil da Sorte.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Usuarios,
});

function Usuarios() {
  const qc = useQueryClient();
  const listar = useServerFn(listarUsuarios);
  const criar = useServerFn(criarUsuario);
  const papel = useServerFn(definirPapel);
  const remover = useServerFn(removerUsuario);
  const editar = useServerFn(atualizarPerfil);

  const { data, isLoading, error } = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => listar({}),
  });

  const listarOperadoresFn = useServerFn(listarOperadoresAtivos);
  const { data: operadores } = useQuery({
    queryKey: ["operadores"],
    queryFn: () => listarOperadoresFn({}),
    staleTime: 5 * 60 * 1000,
  });

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [admin, setAdmin] = useState(false);
  const [operadorId, setOperadorId] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<{ mensagem: string; tipo: "sucesso" | "erro" } | null>(null);
  const [confirmarPapel, setConfirmarPapel] = useState<{
    id: string;
    nome: string;
    role: "admin" | "operador";
  } | null>(null);

  const fecharToast = useCallback(() => setToast(null), []);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["usuarios"] });

  const mostrarToast = (mensagem: string, tipo: "sucesso" | "erro") => {
    setToast({ mensagem, tipo });
  };

  const alterarPapel = async (userId: string, role: "admin" | "operador") => {
    try {
      await papel({ data: { userId, role } });
      mostrarToast(
        role === "admin" ? "Papel alterado para administrador." : "Papel alterado para operador.",
        "sucesso",
      );
      recarregar();
    } catch (err) {
      mostrarToast(err instanceof Error ? err.message : "Falha ao alterar papel.", "erro");
    }
  };

  const adicionar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await criar({ data: { email, senha, nome, admin, operadorId: operadorId || null } });
      setEmail("");
      setSenha("");
      setNome("");
      setAdmin(false);
      setOperadorId("");
      mostrarToast("Usuário criado com sucesso.", "sucesso");
      recarregar();
    } catch (err) {
      mostrarToast(err instanceof Error ? err.message : "Falha ao criar usuário.", "erro");
    } finally {
      setSalvando(false);
    }
  };

  const inputCls =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <AppNav />

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre operadores e defina quem é administrador.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <UserPlus className="h-4 w-4" />
            Novo usuário
          </h2>
          <form onSubmit={adicionar} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={inputCls}
            />
            <input
              type="email"
              required
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Senha (mín. 6)"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={inputCls}
            />
            <select
              value={operadorId}
              onChange={(e) => setOperadorId(e.target.value)}
              className={inputCls}
            >
              <option value="">Sem operador vinculado</option>
              {(operadores ?? []).map((op) => (
                <option key={op.id} value={op.id}>{op.nome}</option>
              ))}
            </select>
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={admin}
                  onChange={(e) => setAdmin(e.target.checked)}
                  className="size-4"
                />
                Administrador
              </label>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {salvando ? "Criando..." : "Adicionar"}
              </button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <h2 className="flex items-center gap-2 border-b border-border bg-secondary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
            <Users className="h-4 w-4" />
            Acessos
          </h2>

          {isLoading && (
            <div className="divide-y divide-border">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-56 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
                    <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="px-4 py-3 text-sm text-destructive">
              {error instanceof Error ? error.message : "Falha ao carregar."}
            </p>
          )}

          {!isLoading && data && data.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-muted-foreground">
              <Shield className="h-8 w-8" />
              <p className="text-sm">Nenhum usuário cadastrado.</p>
            </div>
          )}

          <div className="divide-y divide-border">
            {data?.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 transition-colors hover:bg-secondary/30"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{u.nome || "(sem nome)"}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  {(u as any).operador_id && (
                    <p className="text-xs text-info">
                      Operador: {operadores?.find((o) => o.id === (u as any).operador_id)?.nome ?? "—"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    disabled={u.eu}
                    onChange={(e) => {
                      const novo = e.target.value as "admin" | "operador";
                      // Promover a administrador é ação sensível: pede confirmação.
                      if (novo === "admin" && u.role !== "admin") {
                        setConfirmarPapel({ id: u.id, nome: u.nome || u.email || "", role: novo });
                        return;
                      }
                      void alterarPapel(u.id, novo);
                    }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-ring disabled:opacity-60"
                  >
                    <option value="operador">Operador</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <button
                    disabled={u.eu}
                    onClick={async () => {
                      if (!confirm(`Remover ${u.email}?`)) return;
                      try {
                        await remover({ data: { userId: u.id } });
                        mostrarToast("Usuário removido.", "sucesso");
                        recarregar();
                      } catch (err) {
                        mostrarToast(
                          err instanceof Error ? err.message : "Falha ao remover.",
                          "erro"
                        );
                      }
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {toast && (
        <Toast mensagem={toast.mensagem} tipo={toast.tipo} onFechar={fecharToast} />
      )}

      {confirmarPapel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">
              Dar acesso de administrador?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirmarPapel.nome} vai poder ver e corrigir fechamentos de todos os
              operadores, excluir caixas, alterar contas e gerenciar usuários.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmarPapel(null)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void alterarPapel(confirmarPapel.id, confirmarPapel.role);
                  setConfirmarPapel(null);
                }}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Sim, tornar administrador
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
