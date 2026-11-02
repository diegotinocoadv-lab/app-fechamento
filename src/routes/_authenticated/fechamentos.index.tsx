import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { listarFechamentos, removerFechamento } from "@/lib/fechamentos.functions";
import { definirSituacaoCaixa } from "@/lib/caixas.functions";
import { meuAcesso } from "@/lib/usuarios.functions";
import { brl, brlSinal, classeDiferenca } from "@/lib/fechamento-campos";
import { FileText, FileCheck, Trash2, ExternalLink, X, PenLine, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/fechamentos/")({
  validateSearch: (search: Record<string, unknown>) => ({
    filtroData: typeof search["filtroData"] === "string" ? search["filtroData"] : "",
    filtroOperador: typeof search["filtroOperador"] === "string" ? search["filtroOperador"] : "",
    filtroCaixa: typeof search["filtroCaixa"] === "string" ? search["filtroCaixa"] : "",
    filtroMes: typeof search["filtroMes"] === "string" ? search["filtroMes"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Histórico de fechamentos | Brasil da Sorte" },
      {
        name: "description",
        content:
          "Consulte os fechamentos de caixa salvos, veja totais e diferenças e baixe o PDF de cada dia.",
      },
      { property: "og:title", content: "Histórico de fechamentos" },
      {
        property: "og:description",
        content: "Fechamentos de caixa salvos com totais, diferenças e PDF por dia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Historico,
});

function Historico() {
  const qc = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const filtroDataInit = search.filtroData ?? "";
  const filtroOperadorInit = search.filtroOperador ?? "";
  const filtroCaixaInit = search.filtroCaixa ?? "";
  const filtroMesInit = search.filtroMes ?? "";
  const listar = useServerFn(listarFechamentos);
  const removerFn = useServerFn(removerFechamento);
  const definirSituacaoFn = useServerFn(definirSituacaoCaixa);
  const acessoFn = useServerFn(meuAcesso);

  const [erro, setErro] = useState("");
  const [exclusao, setExclusao] = useState<{
    fechamentoId: string;
    rotulo: string;
    motivo: string;
    conferido: boolean;
  } | null>(null);
  const [fechamento, setFechamento] = useState<{
    caixaId: string;
    rotulo: string;
  } | null>(null);

  const acesso = useQuery({ queryKey: ["meu-acesso"], queryFn: () => acessoFn({}), staleTime: 5 * 60 * 1000 });
  const admin = Boolean(acesso.data?.admin);

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["fechamentos"],
    queryFn: () => listar({ data: { limite: 1000 } }),
    staleTime: 30_000,
  });

  const removerMut = useMutation({
    mutationFn: (v: { id: string; motivo: string }) => removerFn({ data: v }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["fechamentos"] });
      void qc.invalidateQueries({ queryKey: ["caixas"] });
      void qc.invalidateQueries({ queryKey: ["contas-loterica"] });
      void qc.invalidateQueries({ queryKey: ["lancamentos-simples"] });
      void qc.invalidateQueries({ queryKey: ["fiados"] });
      void qc.invalidateQueries({ queryKey: ["baixas-pendentes"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-ultimos"] });
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      void qc.invalidateQueries({ queryKey: ["clientes-saldos"] });
      if (!res?.ok) {
        setErro(res?.erro || "Falha ao excluir o fechamento.");
        setExclusao(null);
        return;
      }
      setExclusao(null);
      setErro("");
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao excluir o fechamento."),
  });

  const fecharMut = useMutation({
    mutationFn: (caixaId: string) =>
      definirSituacaoFn({ data: { id: caixaId, situacao: "conferido" as const } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fechamentos"] });
      void qc.invalidateQueries({ queryKey: ["caixas"] });
      setFechamento(null);
      setErro("");
    },
    onError: (e) => {
      setErro(e instanceof Error ? e.message : "Falha ao fechar o caixa.");
      setFechamento(null);
    },
  });

  const linhas = data?.fechamentos ?? [];

  const [filtroData, setFiltroDataState] = useState(filtroDataInit);
  const [filtroOperador, setFiltroOperadorState] = useState(filtroOperadorInit);
  const [filtroCaixa, setFiltroCaixaState] = useState(filtroCaixaInit);
  const [filtroMes, setFiltroMesState] = useState(filtroMesInit);

  const setFiltroData = (v: string) => { setFiltroDataState(v); navigate({ search: (s) => ({ ...s, filtroData: v }) }); };
  const setFiltroOperador = (v: string) => { setFiltroOperadorState(v); navigate({ search: (s) => ({ ...s, filtroOperador: v }) }); };
  const setFiltroCaixa = (v: string) => { setFiltroCaixaState(v); navigate({ search: (s) => ({ ...s, filtroCaixa: v }) }); };
  const setFiltroMes = (v: string) => { setFiltroMesState(v); navigate({ search: (s) => ({ ...s, filtroMes: v }) }); };

  const limparFiltros = () => {
    setFiltroData("");
    setFiltroOperador("");
    setFiltroCaixa("");
    setFiltroMes("");
  };

  const linhasFiltradas = useMemo(() => {
    return linhas.filter((f) => {
      if (filtroData && f.data !== filtroData) return false;
      if (filtroMes && f.data.slice(0, 7) !== filtroMes) return false;
      if (filtroOperador && !(f.funcionario || "").toLowerCase().includes(filtroOperador.toLowerCase())) return false;
      if (filtroCaixa && !(f.caixaNumero || "").toLowerCase().includes(filtroCaixa.toLowerCase())) return false;
      return true;
    });
  }, [linhas, filtroData, filtroMes, filtroOperador, filtroCaixa]);

  /**
   * Fechamentos agrupados por funcionário: quantos fechamentos, soma das
   * sobras (diferença positiva), soma das faltas (negativa) e a diferença
   * líquida. Nomes são comparados sem acentos/caixa para não separar
   * "JOÃO" de "João". Respeita os filtros aplicados na lista.
   */
  const porFuncionario = useMemo(() => {
    const chaveNome = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    const map = new Map<
      string,
      { nome: string; qtd: number; sobras: number; faltas: number; saldo: number }
    >();
    for (const f of linhasFiltradas) {
      const nome = (f.funcionario || "").trim() || "Sem nome";
      const chave = chaveNome(nome);
      const g =
        map.get(chave) ?? { nome, qtd: 0, sobras: 0, faltas: 0, saldo: 0 };
      g.qtd += 1;
      const d = Number(f.diferenca ?? 0);
      if (d > 0.004) g.sobras += d;
      else if (d < -0.004) g.faltas += d;
      g.saldo += d;
      map.set(chave, g);
    }
    const duas = (n: number) => Math.round(n * 100) / 100;
    return [...map.values()]
      .map((g) => ({ ...g, sobras: duas(g.sobras), faltas: duas(g.faltas), saldo: duas(g.saldo) }))
      .sort(
        (a, b) =>
          Math.abs(b.saldo) - Math.abs(a.saldo) || a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [linhasFiltradas]);

  const totaisFuncionario = useMemo(
    () =>
      porFuncionario.reduce(
        (s, g) => ({
          qtd: s.qtd + g.qtd,
          sobras: s.sobras + g.sobras,
          faltas: s.faltas + g.faltas,
          saldo: s.saldo + g.saldo,
        }),
        { qtd: 0, sobras: 0, faltas: 0, saldo: 0 },
      ),
    [porFuncionario],
  );

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <AppNav />

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Histórico de fechamentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Você vê apenas os fechamentos que salvou; administradores veem todos.
          </p>
        </header>

        {erro && (
          <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>{erro}</span>
              <button onClick={() => setErro("")} className="rounded p-1 hover:bg-destructive/20">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          {isPending && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-secondary" />
              ))}
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Falha ao carregar o histórico."}
              </p>
              <button
                onClick={() => void refetch()}
                className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-accent"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!isPending && !isError && linhas.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Nenhum fechamento salvo ainda. Gere um em{" "}
                <Link to="/fechamento" className="font-medium text-primary underline">
                  Fechamento
                </Link>
                .
              </p>
            </div>
          )}

          {linhas.length > 0 && (
            <>
              <div className="flex flex-wrap items-end gap-3 border-b border-border pb-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Data
                  <input
                    type="date"
                    value={filtroData}
                    onChange={(e) => setFiltroData(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Mês
                  <input
                    type="month"
                    value={filtroMes}
                    onChange={(e) => setFiltroMes(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Funcionário
                  <input
                    value={filtroOperador}
                    onChange={(e) => setFiltroOperador(e.target.value)}
                    placeholder="Buscar..."
                    className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Caixa
                  <input
                    value={filtroCaixa}
                    onChange={(e) => setFiltroCaixa(e.target.value)}
                    placeholder="Buscar..."
                    className="h-9 w-32 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                {(filtroData || filtroMes || filtroOperador || filtroCaixa) && (
                  <button
                    onClick={limparFiltros}
                    className="h-9 rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-accent"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>

              {porFuncionario.length > 0 && (
                <div className="mt-4 rounded-lg border border-border bg-secondary/20 p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Diferença por funcionário
                    {filtroMes
                      ? ` — ${filtroMes.split("-").reverse().join("/")}`
                      : filtroData
                        ? ` — ${filtroData.split("-").reverse().join("/")}`
                        : ""}
                    <span className="ml-1 font-normal normal-case text-muted-foreground/80">
                      (clique no nome para filtrar a lista)
                    </span>
                  </h3>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-1.5 pr-3">Funcionário</th>
                          <th className="py-1.5 pr-3 text-right">Fecham.</th>
                          <th className="py-1.5 pr-3 text-right">Sobras</th>
                          <th className="py-1.5 pr-3 text-right">Faltas</th>
                          <th className="py-1.5 pr-3 text-right">Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {porFuncionario.map((g) => (
                          <tr key={g.nome} className="border-t border-border/60">
                            <td className="py-1.5 pr-3 font-medium text-foreground">
                              {g.nome === "Sem nome" ? (
                                <span className="text-muted-foreground">{g.nome}</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setFiltroOperador(g.nome)}
                                  title="Filtrar a lista por este funcionário"
                                  className="hover:underline"
                                >
                                  {g.nome}
                                </button>
                              )}
                            </td>
                            <td className="py-1.5 pr-3 text-right text-muted-foreground">{g.qtd}</td>
                            <td className="py-1.5 pr-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                              {g.sobras > 0 ? brl(g.sobras) : "—"}
                            </td>
                            <td className="py-1.5 pr-3 text-right font-medium text-destructive">
                              {g.faltas < 0 ? brl(g.faltas) : "—"}
                            </td>
                            <td className={`py-1.5 pr-3 text-right font-bold ${classeDiferenca(g.saldo)}`}>
                              {brlSinal(g.saldo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {porFuncionario.length > 1 && (
                        <tfoot>
                          <tr className="border-t-2 border-border">
                            <td className="py-1.5 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Total
                            </td>
                            <td className="py-1.5 pr-3 text-right font-semibold text-foreground">
                              {totaisFuncionario.qtd}
                            </td>
                            <td className="py-1.5 pr-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                              {brl(totaisFuncionario.sobras)}
                            </td>
                            <td className="py-1.5 pr-3 text-right font-semibold text-destructive">
                              {brl(totaisFuncionario.faltas)}
                            </td>
                            <td className={`py-1.5 pr-3 text-right font-bold ${classeDiferenca(totaisFuncionario.saldo)}`}>
                              {brlSinal(totaisFuncionario.saldo)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Data</th>
                      <th className="py-2 pr-3">Caixa</th>
                      <th className="py-2 pr-3 hidden sm:table-cell">Funcionário</th>
                      <th className="py-2 pr-3 text-right">Total</th>
                      <th className="py-2 pr-3 text-right">Diferença</th>
                      <th className="py-2 pr-3 text-center">PDF</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {linhasFiltradas.map((f) => (
                    <tr key={f.id} className="border-t border-border transition-colors hover:bg-secondary/30">
                      <td className="py-2.5 pr-3 font-medium text-foreground">
                        {f.data.split("-").reverse().join("/")}
                      </td>
                      <td className="py-2.5 pr-3 text-foreground">{f.caixaNumero || "—"}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground hidden sm:table-cell">{f.funcionario || "—"}</td>
                      <td className="py-2.5 pr-3 text-right font-medium text-foreground">{brl(f.total)}</td>
                      <td
                        className={`py-2.5 pr-3 text-right font-medium ${classeDiferenca(f.diferenca)}`}
                      >
                        {brlSinal(f.diferenca)}
                      </td>
                      <td className="py-2.5 pr-3 text-center">
                        {f.temPdf ? (
                          <FileCheck className="mx-auto h-4 w-4 text-emerald-500" />
                        ) : (
                          <FileText className="mx-auto h-4 w-4 text-muted-foreground/30" />
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {admin && f.caixaSituacao !== "conferido" && (
                            <Link
                              to="/fechamento"
                              search={{ fechamentoId: f.id }}
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-500/20"
                              title="Corrigir este fechamento"
                            >
                              <PenLine className="h-3.5 w-3.5" />
                              Corrigir
                            </Link>
                          )}
                          {admin && f.caixaSituacao !== "conferido" && f.caixaId && (
                            <button
                              onClick={() =>
                                setFechamento({
                                  caixaId: f.caixaId!,
                                  rotulo: `${f.caixaNome || f.caixaNumero || "Caixa"} — ${f.data
                                    .split("-")
                                    .reverse()
                                    .join("/")}`,
                                })
                              }
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-700 dark:text-amber-400 transition-colors hover:bg-amber-500/20"
                              title="Fechar definitivamente — não poderá mais ser modificado"
                            >
                              <Lock className="h-3.5 w-3.5" />
                              Fechar
                            </button>
                          )}
                          {admin && f.caixaSituacao === "conferido" && (
                            <span className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              <Lock className="h-3.5 w-3.5" />
                              Fechado
                            </span>
                          )}
                          <Link
                            to="/fechamentos/$id"
                            params={{ id: f.id }}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Abrir
                          </Link>
                          {admin && (
                            <button
                              onClick={() =>
                                setExclusao({
                                  fechamentoId: f.id,
                                  rotulo: `${f.caixaNome || f.caixaNumero || "Caixa"} — ${f.data
                                    .split("-")
                                    .reverse()
                                    .join("/")}`,
                                  motivo: "",
                                  conferido: f.caixaSituacao === "conferido",
                                })
                              }
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-destructive/30 bg-background px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                              disabled={f.caixaSituacao === "conferido"}
                              title={
                                f.caixaSituacao === "conferido"
                                  ? "Caixa conferido não pode ser excluído"
                                  : "Excluir este fechamento e o caixa vinculado"
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isFetching && (
                <p className="mt-2 text-xs text-muted-foreground">Atualizando...</p>
              )}
            </div>
            </>
          )}
        </section>
      </div>

      {exclusao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Excluir fechamento
                </h2>
                <p className="text-xs text-muted-foreground">{exclusao.rotulo}</p>
              </div>
            </div>
            {exclusao.conferido ? (
              <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                Este caixa já foi conferido e não pode ser excluído.
              </p>
            ) : (
              <>
                <label className="mt-4 block text-sm font-medium text-foreground">
                  Justificativa <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={exclusao.motivo}
                  onChange={(e) => setExclusao({ ...exclusao, motivo: e.target.value })}
                  rows={3}
                  placeholder="Descreva o motivo da exclusão (mínimo 3 caracteres)"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setExclusao(null)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              {!exclusao.conferido && (
                <button
                  onClick={() =>
                    removerMut.mutate({
                      id: exclusao.fechamentoId,
                      motivo: exclusao.motivo.trim(),
                    })
                  }
                  disabled={removerMut.isPending || exclusao.motivo.trim().length < 3}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {removerMut.isPending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Confirmar exclusão
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {fecharMut.isError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <p className="text-sm text-destructive">
              {fecharMut.failureReason instanceof Error
                ? fecharMut.failureReason.message
                : "Erro ao fechar caixa."}
            </p>
            <button
              onClick={() => fecharMut.reset()}
              className="mt-4 h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {fechamento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Fechar definitivamente
                </h2>
                <p className="text-xs text-muted-foreground">{fechamento.rotulo}</p>
              </div>
            </div>
            <p className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              Após confirmar, este fechamento <strong>não poderá mais ser modificado ou excluído</strong>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setFechamento(null)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={() => fecharMut.mutate(fechamento.caixaId)}
                disabled={fecharMut.isPending}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {fecharMut.isPending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
