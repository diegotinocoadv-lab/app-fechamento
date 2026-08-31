import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import {
  criarUsuario,
  definirPapel,
  listarUsuarios,
  removerUsuario,
} from "@/lib/usuarios.functions";

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

  const { data, isLoading, error } = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => listar({}),
  });

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [admin, setAdmin] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["usuarios"] });

  const adicionar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    try {
      await criar({ data: { email, senha, nome, admin } });
      setEmail("");
      setSenha("");
      setNome("");
      setAdmin(false);
      setMsg("Usuário criado.");
      recarregar();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao criar usuário.");
    } finally {
      setSalvando(false);
    }
  };

  const inputCls =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <AppNav />

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre operadores e defina quem é administrador.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
            <div className="flex items-center justify-between gap-3">
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
                {salvando ? "Criando..." : "Adicionar"}
              </button>
            </div>
          </form>
          {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <h2 className="border-b border-border bg-secondary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
            Acessos
          </h2>
          {isLoading && <p className="px-4 py-3 text-sm text-muted-foreground">Carregando...</p>}
          {error && (
            <p className="px-4 py-3 text-sm text-destructive">
              {error instanceof Error ? error.message : "Falha ao carregar."}
            </p>
          )}
          <div className="divide-y divide-border">
            {data?.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{u.nome || "(sem nome)"}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    disabled={u.eu}
                    onChange={async (e) => {
                      setMsg(null);
                      try {
                        await papel({
                          data: { userId: u.id, role: e.target.value as "admin" | "operador" },
                        });
                        recarregar();
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : "Falha ao alterar.");
                      }
                    }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60"
                  >
                    <option value="operador">Operador</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <button
                    disabled={u.eu}
                    onClick={async () => {
                      if (!confirm(`Remover ${u.email}?`)) return;
                      setMsg(null);
                      try {
                        await remover({ data: { userId: u.id } });
                        recarregar();
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : "Falha ao remover.");
                      }
                    }}
                    className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-destructive transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
