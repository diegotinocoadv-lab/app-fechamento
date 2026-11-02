import { Fragment } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { meuAcesso, listarUsuarios } from "@/lib/usuarios.functions";
import { relatorioVendasBoloes } from "@/lib/lancamentos-simples.functions";
import { listarEstoque } from "@/lib/estoque-boloes.functions";
import { compararBoloes } from "@/lib/loterias-sorteio";
import { brl } from "@/lib/fechamento-campos";
import { Loader2, ChevronDown, ChevronRight, Ticket } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vendas-boloes")({
  // A página de vendas foi mesclada em "Bolões" (controle de bolões).
  beforeLoad: () => {
    throw redirect({
      to: "/controle-boloes",
      search: { de: "", ate: "", modalidade: "", situacao: "ativo" },
    });
  },
  head: () => ({
    meta: [
      { title: "Vendas de bolões | Brasil da Sorte" },
      {
        name: "description",
        content:
          "Relatório de vendas de bolões por operador: valor e taxa por dia e total do mês.",
      },
      { property: "og:title", content: "Vendas de bolões | Brasil da Sorte" },
      {
        property: "og:description",
        content: "Veja o que cada operador vendeu de bolões: valor, taxa, por dia e no mês.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendasBoloes,
});

const mesAtual = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

const dataBr = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

const inicioFimDoMes = (mes: string) => {
  const [ano, m] = mes.split("-").map(Number);
  const de = `${mes}-01`;
  const ultimo = new Date(ano!, (m ?? 1), 0).getDate();
  const ate = `${mes}-${String(ultimo).padStart(2, "0")}`;
  return { de, ate };
};

const nomeMes = (mes: string) => {
  const [ano, m] = mes.split("-");
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const idx = Number(m) - 1;
  return `${nomes[idx] ?? m} ${ano}`;
};

function VendasBoloes() {
  const acessoFn = useServerFn(meuAcesso);
  const relatorioFn = useServerFn(relatorioVendasBoloes);
  const usuariosFn = useServerFn(listarUsuarios);

  const [mes, setMes] = useState("");
  const [filtroOperador, setFiltroOperador] = useState("");
  const [abertoOp, setAbertoOp] = useState<string | null>(null);

  useEffect(() => setMes(mesAtual()), []);

  const { data: acesso } = useQuery({
    queryKey: ["meu-acesso"],
    queryFn: () => acessoFn({}),
    staleTime: 5 * 60 * 1000,
  });
  const isAdmin = Boolean(acesso?.admin);

  const { data: usuarios } = useQuery({
    queryKey: ["usuarios-vendas-boloes"],
    queryFn: () => usuariosFn({}),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const periodo = useMemo(() => (mes ? inicioFimDoMes(mes) : null), [mes]);

  const q = useQuery({
    queryKey: ["relatorio-vendas-boloes", mes, filtroOperador],
    queryFn: () =>
      relatorioFn({
        data: {
          de: periodo!.de,
          ate: periodo!.ate,
          ...(isAdmin && filtroOperador ? { operadorId: filtroOperador } : {}),
        },
      }),
    enabled: !!periodo,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const rel = q.data;
  const operadores = rel?.operadores ?? [];
  const total = rel?.total ?? { cotas: 0, valor: 0, taxa: 0 };

  // Estoque atual (para exibir o saldo ao lado de cada bolão do relatório).
  const estoqueFn = useServerFn(listarEstoque);
  const qEstoque = useQuery({
    queryKey: ["estoque-boloes", isAdmin ? "todos" : "ativo"],
    queryFn: () => estoqueFn({ data: { situacao: isAdmin ? "todos" : "ativo" } }),
    enabled: Boolean(isAdmin) || Boolean(acesso),
    staleTime: 60_000,
  });

  // Remove acentos/pontuação para comparar o rótulo do relatório com o estoque.
  const rotuloChave = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const porBolaoComSaldo = useMemo(() => {
    const linhas = (rel?.porBolao ?? []) as Array<{
      bolao: string;
      cotas: number;
      valor: number;
      taxa: number;
    }>;
    const mapa = new Map<string, number>();
    for (const e of (qEstoque.data?.estoques ?? []) as Array<{
      nome: string;
      concurso: string;
      situacao: string;
      disponiveis: number;
    }>) {
      if (e.situacao !== "ativo") continue;
      const k = rotuloChave(`${e.nome} ${e.concurso}`);
      mapa.set(k, (mapa.get(k) ?? 0) + Number(e.disponiveis ?? 0));
    }
    return linhas.map((b) => ({
      ...b,
      saldo: mapa.get(rotuloChave(b.bolao)) ?? null,
    }));
  }, [rel?.porBolao, qEstoque.data]);

  const totaisPorBolao = useMemo(
    () =>
      porBolaoComSaldo.reduce(
        (s, b) => ({ cotas: s.cotas + b.cotas, valor: s.valor + b.valor, taxa: s.taxa + b.taxa }),
        { cotas: 0, valor: 0, taxa: 0 },
      ),
    [porBolaoComSaldo],
  );

  // Relatório sempre na ordem oficial das modalidades.
  const porBolaoOrdenado = useMemo(
    () =>
      [...porBolaoComSaldo].sort((a, b) =>
        compararBoloes({ nome: a.bolao }, { nome: b.bolao }),
      ),
    [porBolaoComSaldo],
  );

  if (!mes) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <AppNav />

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Vendas de bolões
            </h1>
            <p className="text-sm text-muted-foreground">
              O que cada operador vendeu no Controle de Bolões: valor, taxa por dia e total do mês.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {isAdmin && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Operador
                <select
                  value={filtroOperador}
                  onChange={(e) => setFiltroOperador(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  <option value="">Todos</option>
                  {(usuarios ?? []).map((u: { id: string; nome: string | null; email: string | null }) => (
                    <option key={u.id} value={u.id}>
                      {u.nome || u.email}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Mês
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              />
            </label>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Valor vendido
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">{brl(total.valor)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Taxa total
            </p>
            <p className="mt-1 text-2xl font-bold text-violet-600 dark:text-violet-400">
              {brl(total.taxa)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Cotas
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">{total.cotas}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Por operador — {nomeMes(mes)}
              {rel && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({rel.lancamentos} lançamento{rel.lancamentos === 1 ? "" : "s"})
                </span>
              )}
            </h2>
          </div>

          {q.isPending ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-secondary" />
              ))}
            </div>
          ) : q.isError ? (
            <p className="p-4 text-sm text-destructive">
              {q.error instanceof Error ? q.error.message : "Falha ao carregar."}
            </p>
          ) : operadores.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Ticket className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Nenhuma venda de bolão neste período.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5" />
                    <th className="px-3 py-2.5">Operador</th>
                    <th className="px-3 py-2.5 text-right">Cotas</th>
                    <th className="px-3 py-2.5 text-right">Valor</th>
                    <th className="px-3 py-2.5 text-right">Taxa</th>
                    <th className="px-3 py-2.5 text-right">Dias</th>
                  </tr>
                </thead>
                <tbody>
                  {operadores.map((op) => {
                    const aberto = abertoOp === op.operadorId;
                    return (
                      <Fragment key={op.operadorId}>
                        <tr
                          className="cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/30"
                          onClick={() => setAbertoOp(aberto ? null : op.operadorId)}
                        >
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {aberto ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-foreground">
                            {op.operador}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium">{op.cotas}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                            {brl(op.valor)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-violet-600 dark:text-violet-400">
                            {brl(op.taxa)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">
                            {op.dias.length}
                          </td>
                        </tr>
                        {aberto && (
                          <tr>
                            <td colSpan={6} className="border-b border-border/60 bg-secondary/30 px-3 py-2">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Dia a dia — {op.operador}
                              </p>
                              <div className="overflow-x-auto rounded-md border border-border bg-card">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                                      <th className="px-3 py-2">Data</th>
                                      <th className="px-3 py-2 text-right">Cotas</th>
                                      <th className="px-3 py-2 text-right">Valor</th>
                                      <th className="px-3 py-2 text-right">Taxa</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {op.dias.map((d) => (
                                      <tr key={d.data} className="border-b border-border/50 last:border-0">
                                        <td className="px-3 py-1.5 text-foreground">{dataBr(d.data)}</td>
                                        <td className="px-3 py-1.5 text-right">{d.cotas}</td>
                                        <td className="px-3 py-1.5 text-right font-medium">
                                          {brl(d.valor)}
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-medium text-violet-600 dark:text-violet-400">
                                          {brl(d.taxa)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-border bg-secondary/50 text-xs font-bold">
                                      <td className="px-3 py-2">Total</td>
                                      <td className="px-3 py-2 text-right">{op.cotas}</td>
                                      <td className="px-3 py-2 text-right">{brl(op.valor)}</td>
                                      <td className="px-3 py-2 text-right">{brl(op.taxa)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/50 text-sm font-bold">
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-foreground">TOTAL DO MÊS</td>
                    <td className="px-3 py-2.5 text-right text-foreground">{total.cotas}</td>
                    <td className="px-3 py-2.5 text-right text-foreground">{brl(total.valor)}</td>
                    <td className="px-3 py-2.5 text-right text-violet-600 dark:text-violet-400">
                      {brl(total.taxa)}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {porBolaoComSaldo.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                Por bolão — {nomeMes(mes)}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5">Bolão</th>
                    <th className="px-3 py-2.5 text-right">Cotas</th>
                    <th className="px-3 py-2.5 text-right">Valor</th>
                    <th className="px-3 py-2.5 text-right">Taxa</th>
                    <th className="px-3 py-2.5 text-right">Saldo atual</th>
                  </tr>
                </thead>
                <tbody>
                  {porBolaoOrdenado.map((b) => (
                    <tr
                      key={b.bolao}
                      className="border-b border-border/60 last:border-0 hover:bg-secondary/30"
                    >
                      <td className="px-3 py-2 font-medium text-foreground">{b.bolao}</td>
                      <td className="px-3 py-2 text-right">{b.cotas}</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">
                        {brl(b.valor)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-violet-600 dark:text-violet-400">
                        {brl(b.taxa)}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {b.saldo === null ? "—" : b.saldo}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/50 text-sm font-bold">
                    <td className="px-3 py-2.5 text-foreground">TOTAL</td>
                    <td className="px-3 py-2.5 text-right text-foreground">{totaisPorBolao.cotas}</td>
                    <td className="px-3 py-2.5 text-right text-foreground">{brl(totaisPorBolao.valor)}</td>
                    <td className="px-3 py-2.5 text-right text-violet-600 dark:text-violet-400">
                      {brl(totaisPorBolao.taxa)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {rel && rel.dias.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Resumo por dia (todos)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5">Data</th>
                    <th className="px-3 py-2.5 text-right">Cotas</th>
                    <th className="px-3 py-2.5 text-right">Valor</th>
                    <th className="px-3 py-2.5 text-right">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {rel.dias.map((d) => (
                    <tr key={d.data} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                      <td className="px-3 py-2 text-foreground">{dataBr(d.data)}</td>
                      <td className="px-3 py-2 text-right">{d.cotas}</td>
                      <td className="px-3 py-2 text-right font-medium">{brl(d.valor)}</td>
                      <td className="px-3 py-2 text-right font-medium text-violet-600 dark:text-violet-400">
                        {brl(d.taxa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
