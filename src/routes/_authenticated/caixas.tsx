import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import {
  criarCaixa,
  definirSituacaoCaixa,
  editarCaixa,
  listarCaixas,
  removerCaixa,
} from "@/lib/caixas.functions";
import { listarUsuarios, meuAcesso } from "@/lib/usuarios.functions";

export const Route = createFileRoute("/_authenticated/caixas")({
  head: () => ({
    meta: [
      { title: "Caixas | Lotérica Brasil da Sorte" },
      {
        name: "description",
        content:
          "Cadastre caixas com operador e data antes do fechamento e acompanhe quais caixas estão abertos ou já fechados.",
      },
      { property: "og:title", content: "Cadastro de caixas | Brasil da Sorte" },
      {
        property: "og:description",
        content: "Crie caixas por operador e data antes de registrar o fechamento do dia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Caixas,
});

const dataBr = (d: string) => d.split("-").reverse().join("/");
const hojeSp = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const input =
  "h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

function Caixas() {
  const qc = useQueryClient();
  const listarFn = useServerFn(listarCaixas);
  const usuariosFn = useServerFn(listarUsuarios);
  const acessoFn = useServerFn(meuAcesso);
  const criarFn = useServerFn(criarCaixa);
  const situacaoFn = useServerFn(definirSituacaoCaixa);
  const removerFn = useServerFn(removerCaixa);
  const editarFn = useServerFn(editarCaixa);

  const [situacao, setSituacao] = useState<"todos" | "aberto" | "fechado" | "conferido">("todos");
  const [nome, setNome] = useState("");
  const [operadorId, setOperadorId] = useState("");
  const [data, setData] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");
  const [edicao, setEdicao] = useState<{
    id: string;
    nome: string;
    operadorId: string;
    data: string;
    observacoes: string;
    situacao: "aberto" | "fechado" | "conferido";
  } | null>(null);
  const [exclusao, setExclusao] = useState<{ id: string; rotulo: string; motivo: string } | null>(
    null,
  );

  useEffect(() => { setData(hojeSp()); }, []);


  const acesso = useQuery({ queryKey: ["meu-acesso"], queryFn: () => acessoFn({}), staleTime: 5 * 60 * 1000 });
  const admin = Boolean(acesso.data?.admin);

  const caixas = useQuery({
    queryKey: ["caixas", situacao],
    queryFn: () => listarFn({ data: { de: "", ate: "", situacao } }),
  });

  const usuarios = useQuery({
    queryKey: ["usuarios-caixas"],
    queryFn: () => usuariosFn({}),
    enabled: admin,
  });

  const criarMut = useMutation({
    mutationFn: () =>
      criarFn({
        data: {
          nome: nome.trim(),
          operadorId: operadorId || null,
          data,
          observacoes: observacoes.trim(),
        },
      }),
    onSuccess: () => {
      setNome("");
      setObservacoes("");
      setErro("");
      void qc.invalidateQueries({ queryKey: ["caixas"] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao cadastrar o caixa."),
  });

  const situacaoMut = useMutation({
    mutationFn: (v: { id: string; situacao: "aberto" | "fechado" | "conferido" }) => situacaoFn({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["caixas"] }),
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao atualizar o caixa."),
  });

  const removerMut = useMutation({
    mutationFn: (v: { id: string; motivo: string }) => removerFn({ data: v }),
    onSuccess: () => {
      setExclusao(null);
      setErro("");
      void qc.invalidateQueries({ queryKey: ["caixas"] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao remover o caixa."),
  });


  const editarMut = useMutation({
    mutationFn: () =>
      editarFn({
        data: {
          id: edicao!.id,
          nome: edicao!.nome.trim(),
          operadorId: edicao!.operadorId || null,
          data: edicao!.data,
          observacoes: edicao!.observacoes.trim(),
          situacao: edicao!.situacao,
        },
      }),
    onSuccess: () => {
      setEdicao(null);
      setErro("");
      void qc.invalidateQueries({ queryKey: ["caixas"] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao corrigir o caixa."),
  });


  const lista = caixas.data?.caixas ?? [];

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <AppNav />

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Caixas</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre o caixa com operador e data antes de fechar. Depois basta registrar o
            fechamento e marcar o caixa como fechado.
          </p>
        </header>

        {admin && (
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 border-b border-border pb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Plus className="h-4 w-4" />
              Cadastrar caixa
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!nome.trim()) {
                  setErro("Informe o nome ou número do caixa.");
                  return;
                }
                criarMut.mutate();
              }}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Caixa
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Caixa 1"
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Operador
                <select
                  value={operadorId}
                  onChange={(e) => setOperadorId(e.target.value)}
                  className={input}
                >
                  <option value="">Sem operador</option>
                  {(usuarios.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome || u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Data
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Observações
                <input
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Opcional"
                  className={input}
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={criarMut.isPending}
                  className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {criarMut.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cadastrando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Cadastrar caixa
                    </span>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        {erro && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {erro}
          </div>
        )}

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 border-b border-border pb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <RefreshCw className="h-4 w-4" />
              Caixas cadastrados
            </h2>
            <div className="ml-auto inline-flex rounded-md border border-input p-0.5">
              {(
                [
                  { v: "todos", r: "Todos" },
                  { v: "aberto", r: "Abertos" },
                  { v: "fechado", r: "Fechados" },
                  { v: "conferido", r: "Conferidos" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setSituacao(o.v)}
                  className={`h-8 rounded px-3 text-sm font-medium ${
                    situacao === o.v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {o.r}
                </button>
              ))}
            </div>
          </div>

          {caixas.isPending && (
            <div className="space-y-3" role="status">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex animate-pulse items-center gap-4">
                  <div className="h-4 w-20 rounded bg-muted" />
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-4 w-16 rounded bg-muted" />
                  <div className="h-4 w-20 rounded bg-muted" />
                </div>
              ))}
            </div>
          )}
          {caixas.isError && (
            <p className="text-sm text-destructive">
              {caixas.error instanceof Error ? caixas.error.message : "Falha ao carregar caixas."}
            </p>
          )}
          {!caixas.isPending && !caixas.isError && lista.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <XCircle className="h-8 w-8" />
              <p className="text-sm">Nenhum caixa cadastrado.</p>
            </div>
          )}

          {lista.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Caixa</th>
                    <th className="py-2 pr-3">Operador</th>
                    <th className="py-2 pr-3">Situação</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) =>
                    edicao?.id === c.id ? (
                      <tr key={c.id} className="border-t border-border bg-accent/40">
                        <td className="py-2 pr-3">
                          <input
                            type="date"
                            value={edicao.data}
                            onChange={(e) => setEdicao({ ...edicao, data: e.target.value })}
                            className={input}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            value={edicao.nome}
                            onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                            placeholder="Caixa 1"
                            className={`${input} w-full`}
                          />
                          <input
                            value={edicao.observacoes}
                            onChange={(e) =>
                              setEdicao({ ...edicao, observacoes: e.target.value })
                            }
                            placeholder="Observações"
                            className={`${input} mt-1 w-full`}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <select
                            value={edicao.operadorId}
                            onChange={(e) => setEdicao({ ...edicao, operadorId: e.target.value })}
                            className={`${input} w-full`}
                          >
                            <option value="">Sem operador</option>
                            {(usuarios.data ?? []).map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.nome || u.email}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3">
                          <select
                            value={edicao.situacao}
                            onChange={(e) =>
                              setEdicao({
                                ...edicao,
                                situacao: e.target.value as "aberto" | "fechado" | "conferido",
                              })
                            }
                            disabled={edicao.situacao === "conferido"}
                            className={`${input} w-full disabled:opacity-60`}
                          >
                            <option value="aberto">Aberto</option>
                            <option value="fechado">Fechado</option>
                            <option value="conferido">Conferido</option>
                          </select>
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                if (!edicao.nome.trim()) {
                                  setErro("Informe o nome ou número do caixa.");
                                  return;
                                }
                                editarMut.mutate();
                              }}
                              disabled={editarMut.isPending}
                              className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            >
                              {editarMut.isPending ? (
                                <span className="flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Salvando...
                                </span>
                              ) : (
                                "Salvar"
                              )}
                            </button>
                            <button
                              onClick={() => setEdicao(null)}
                              className="h-8 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={c.id} className="border-t border-border transition-colors hover:bg-secondary/30">
                        <td className="py-2 pr-3 text-foreground">{dataBr(c.data)}</td>
                        <td className="py-2 pr-3 text-foreground">
                          {c.nome}
                          {c.observacoes && (
                            <span className="block text-xs text-muted-foreground">
                              {c.observacoes}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{c.operador}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              c.situacao === "conferido"
                                ? "bg-primary/10 text-primary"
                                : c.situacao === "fechado"
                                  ? "bg-secondary text-muted-foreground"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {c.situacao === "conferido"
                              ? "Conferido"
                              : c.situacao === "fechado"
                                ? "Fechado"
                                : "Aberto"}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-2">
                            {c.situacao !== "conferido" && (
                              <button
                                onClick={() =>
                                  situacaoMut.mutate({
                                    id: c.id,
                                    situacao: c.situacao === "fechado" ? "aberto" : "fechado",
                                  })
                                }
                                disabled={situacaoMut.isPending}
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                              >
                                {situacaoMut.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  c.situacao === "fechado" ? "Reabrir" : "Marcar fechado"
                                )}
                              </button>
                            )}
                            {admin && c.fechamentoId && (
                              <Link
                                to="/fechamento"
                                search={{ fechamentoId: c.fechamentoId }}
                                className="flex h-8 items-center rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent"
                              >
                                Corrigir fechamento
                              </Link>
                            )}

                            {admin && c.situacao === "fechado" && (
                              <button
                                onClick={() => {
                                  if (
                                    !confirm(
                                      "Confirmar conferência? Depois disso o caixa não poderá mais ser reaberto.",
                                    )
                                  )
                                    return;
                                  situacaoMut.mutate({ id: c.id, situacao: "conferido" });
                                }}
                                disabled={situacaoMut.isPending}
                                className="h-8 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                              >
                                {situacaoMut.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3" />
                                    Conferir
                                  </span>
                                )}
                              </button>
                            )}
                            {admin && (
                              <>
                                <button
                                  onClick={() => {
                                    setErro("");
                                    setEdicao({
                                      id: c.id,
                                      nome: c.nome,
                                      operadorId: c.operadorId ?? "",
                                      data: c.data,
                                      observacoes: c.observacoes,
                                      situacao: c.situacao as "aberto" | "fechado" | "conferido",
                                    });
                                  }}
                                  className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
{admin && c.situacao !== "conferido" && (
                                <button
                                  onClick={() => {
                                    setErro("");
                                    setExclusao({
                                      id: c.id,
                                      rotulo: `${c.nome} — ${c.data}`,
                                      motivo: "",
                                    });
                                  }}
                                  className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-destructive hover:bg-accent disabled:opacity-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}

                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  )}

                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {exclusao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-destructive/10 p-2">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Excluir caixa</h2>
                <p className="text-xs text-muted-foreground">{exclusao.rotulo}</p>
              </div>
            </div>
            <label className="mt-4 block text-xs font-medium text-foreground">
              Justificativa (obrigatória)
            </label>
            <textarea
              value={exclusao.motivo}
              onChange={(e) => setExclusao({ ...exclusao, motivo: e.target.value })}
              rows={3}
              placeholder="Descreva o motivo da exclusão"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setExclusao(null)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  removerMut.mutate({ id: exclusao.id, motivo: exclusao.motivo.trim() })
                }
                disabled={removerMut.isPending || exclusao.motivo.trim().length < 5}
                className="h-9 rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {removerMut.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Excluindo...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Confirmar exclusão
                  </span>
                )}
              </button>
            </div>
            {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
          </div>
        </div>
      )}
    </main>

  );
}
