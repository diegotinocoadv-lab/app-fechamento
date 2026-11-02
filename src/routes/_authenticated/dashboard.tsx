import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { meuAcesso } from "@/lib/usuarios.functions";
import { listarCaixas } from "@/lib/caixas.functions";
import { listarFechamentos } from "@/lib/fechamentos.functions";
import { listarLancamentosSimples } from "@/lib/lancamentos-simples.functions";
import { brl, classeDiferenca } from "@/lib/fechamento-campos";
import {
  Wallet,
  Users,
  ClipboardList,
  Banknote,
  ArrowRight,
  CircleDot,
  CheckCircle2,
  AlertTriangle,
  PenLine,
  History,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>) => ({
    data: typeof search["data"] === "string" ? search["data"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Dashboard — Brasil da Sorte" },
      { name: "description", content: "Resumo do dia da equipe da Lotérica Brasil da Sorte." },
      { property: "og:title", content: "Dashboard — Brasil da Sorte" },
    ],
  }),
  component: DashboardPage,
});

const hoje = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const hojeBR = () =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const dataBr = (d: string) => d.split("-").reverse().join("/");

function StatusBadge({ situacao }: { situacao: string | null }) {
  if (situacao === "aberto") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
        <CircleDot className="h-3 w-3 animate-pulse" />
        Aberto
      </span>
    );
  }
  if (situacao === "fechado") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
        <AlertTriangle className="h-3 w-3" />
        Fechado
      </span>
    );
  }
  if (situacao === "conferido") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
        <CheckCircle2 className="h-3 w-3" />
        Conferido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      Sem caixa
    </span>
  );
}

interface OpResumo {
  chave: string;
  nome: string;
  caixaNome: string | null;
  situacao: string | null;
  fechamentoId: string | null;
  fechTotal: number | null;
  fechDiferenca: number | null;
  fechRelatorio: number | null;
  fechou: boolean;
  lancQtd: number;
  lancTotal: number;
  bolaoCotas: number;
  bolaoValor: number;
}

function DashboardPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const busca = Route.useSearch();
  const [dia, setDia] = useState(busca.data);

  const trocarDia = (nova: string) => {
    setDia(nova);
    void navigate({ search: (s) => ({ ...s, data: nova }) });
  };

  const acessoFn = useServerFn(meuAcesso);
  const caixasFn = useServerFn(listarCaixas);
  const fechamentosFn = useServerFn(listarFechamentos);
  const lancFn = useServerFn(listarLancamentosSimples);

  const { data: acesso, isLoading: acessoLoading } = useQuery({
    queryKey: ["meu-acesso"],
    queryFn: () => acessoFn({}),
    staleTime: 5 * 60 * 1000,
  });
  const isAdmin = Boolean(acesso?.admin);

  const { data: caixasData, isLoading: caixasLoading } = useQuery({
    queryKey: ["caixas-dia", dia],
    queryFn: () => caixasFn({ data: { de: dia, ate: dia, situacao: "todos" } }),
    enabled: !!dia,
    staleTime: 30_000,
  });

  const { data: fechData, isLoading: fechLoading } = useQuery({
    queryKey: ["fechamentos-lista"],
    queryFn: () => fechamentosFn({}),
    staleTime: 30_000,
  });

  const { data: lancData, isLoading: lancLoading } = useQuery({
    queryKey: ["lancamentos-simples", dia],
    queryFn: () => lancFn({ data: { data: dia } }),
    enabled: !!dia,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!dia) setDia(hoje());
  }, [dia]);

  useEffect(() => {
    if (!acessoLoading && !isAdmin) {
      navigate({ to: "/inicio" });
    }
  }, [acessoLoading, isAdmin, navigate]);

  const resumo = useMemo(() => {
    const caixas = ((caixasData?.caixas ?? []) as Array<{
      id: string; nome: string; operador: string; data: string;
      situacao: string; fechamentoId: string | null;
    }>).filter((c) => c.data === dia);
    const fechs = ((fechData?.fechamentos ?? []) as Array<{
      id: string; data: string; funcionario: string; userId: string;
      relatorio: number; total: number; diferenca: number; totalBolaoQuant: number;
    }>).filter((f) => f.data === dia);
    const lancs = ((lancData?.lancamentos ?? []) as Array<{
      tipo: string; valor: number; quantidade: number; operador: string; operadorId: string;
    }>) ?? [];

    const mapa = new Map<string, OpResumo>();
    const chaveDe = (nome: string) =>
      nome
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .toLowerCase();
    const obter = (nome: string): OpResumo => {
      const chave = chaveDe(nome);
      let op = mapa.get(chave);
      if (!op) {
        op = {
          chave, nome: nome.trim(), caixaNome: null, situacao: null,
          fechamentoId: null, fechTotal: null, fechDiferenca: null, fechRelatorio: null,
          fechou: false, lancQtd: 0, lancTotal: 0, bolaoCotas: 0, bolaoValor: 0,
        };
        mapa.set(chave, op);
      }
      return op;
    };

    for (const c of caixas) {
      const op = obter(c.operador || "Sem operador");
      op.caixaNome = c.nome;
      op.situacao = c.situacao;
      if (c.fechamentoId) op.fechamentoId = c.fechamentoId;
    }

    const fechsPorId = new Map(fechs.map((f) => [f.id, f]));
    for (const op of mapa.values()) {
      if (op.fechamentoId) {
        const f = fechsPorId.get(op.fechamentoId);
        if (f) {
          op.fechTotal = f.total;
          op.fechDiferenca = f.diferenca;
          op.fechRelatorio = f.relatorio;
          op.fechou = true;
          op.bolaoCotas += Number(f.totalBolaoQuant ?? 0);
          fechsPorId.delete(f.id);
        }
      }
    }
    for (const f of fechsPorId.values()) {
      const op = obter(f.funcionario || "Sem operador");
      if (op.fechTotal === null) {
        op.fechamentoId = f.id;
        op.fechTotal = f.total;
        op.fechDiferenca = f.diferenca;
        op.fechRelatorio = f.relatorio;
        op.fechou = true;
        op.bolaoCotas += Number(f.totalBolaoQuant ?? 0);
      }
    }
    const fechadoIds = new Set(fechs.map((f) => f.userId).filter(Boolean));

    for (const l of lancs) {
      const op = obter(l.operador || "Sem operador");
      op.lancQtd += 1;
      if (l.tipo === "BOLAO") {
        // Quem já fechou: as cotas entram pelo fechamento (evita duplicar).
        if (op.fechou || fechadoIds.has(l.operadorId)) continue;
        op.bolaoCotas += l.quantidade || 0;
        op.bolaoValor += l.valor * (l.quantidade || 0);
      } else {
        op.lancTotal += l.valor;
      }
    }

    const ops = [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const comFech = ops.filter((o) => o.fechTotal !== null);
    const totalEntrado = comFech.reduce((s, o) => s + (o.fechTotal ?? 0), 0);
    const difLiquida = comFech.reduce((s, o) => s + (o.fechDiferenca ?? 0), 0);
    const sobras = comFech.filter((o) => (o.fechDiferenca ?? 0) > 0.005).length;
    const faltas = comFech.filter((o) => (o.fechDiferenca ?? 0) < -0.005).length;
    const caixasAbertos = caixas.filter((c) => c.situacao === "aberto").length;

    return {
      ops,
      totalCaixas: caixas.length,
      caixasAbertos,
      fechCount: comFech.length,
      totalEntrado,
      difLiquida,
      sobras,
      faltas,
      lancQtd: lancs.length,
      bolaoCotas: ops.reduce((s, o) => s + o.bolaoCotas, 0),
      carregando: caixasLoading || fechLoading || lancLoading,
    };
  }, [caixasData, fechData, lancData, dia, caixasLoading, fechLoading, lancLoading]);

  if (acessoLoading || !dia) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="min-h-screen bg-background px-4 pb-24 pt-4 md:pb-6">
      <div className="mx-auto max-w-4xl">
        <AppNav />

        {/* Header */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Resumo da equipe
            </h1>
            <p className="text-sm text-muted-foreground">
              O que os operadores fizeram em {dia ? dataBr(dia) : hojeBR()}
            </p>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Data
            <input
              type="date"
              value={dia}
              onChange={(e) => trocarDia(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
        </header>

        {/* Cards de resumo */}
        {resumo.carregando ? (
          <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
                <div className="mt-2 h-7 w-24 animate-pulse rounded bg-secondary" />
              </div>
            ))}
          </section>
        ) : (
          <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Caixas abertos</p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {resumo.caixasAbertos}<span className="text-sm font-medium text-muted-foreground">/{resumo.totalCaixas}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">no dia</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fechamentos</p>
              <p className="mt-1 text-xl font-bold text-foreground">{resumo.fechCount}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">salvos no dia</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total entrado</p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {resumo.fechCount > 0 ? brl(resumo.totalEntrado) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">soma dos fechamentos</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Diferença</p>
              <p className={`mt-1 text-xl font-bold ${resumo.fechCount > 0 ? classeDiferenca(resumo.difLiquida) : "text-foreground"}`}>
                {resumo.fechCount > 0 ? brl(resumo.difLiquida) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {resumo.sobras} sobra(s) • {resumo.faltas} falta(s)
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lançamentos</p>
              <p className="mt-1 text-xl font-bold text-foreground">{resumo.lancQtd}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">registros do /lancar</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bolões</p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {resumo.bolaoCotas > 0 ? `${resumo.bolaoCotas}` : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">cotas do dia (fechamento + /lancar)</p>
            </div>
          </section>
        )}

        {/* Por operador */}
        <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Por operador</h2>
          </div>

          {resumo.carregando ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-secondary" />
              ))}
            </div>
          ) : resumo.ops.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Wallet className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Nenhum movimento neste dia</p>
                <p className="text-xs text-muted-foreground">Nenhum operador abriu caixa ou lançou valores</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {resumo.ops.map((op) => (
                <div key={op.chave} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{op.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {op.caixaNome ?? "Sem caixa"}
                        {op.lancQtd > 0 && ` • ${op.lancQtd} lançamento(s)`}
                        {op.bolaoCotas > 0 && ` • ${op.bolaoCotas} cota(s)`}
                      </p>
                    </div>
                    <StatusBadge situacao={op.situacao} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {op.fechTotal !== null ? (
                      <>
                        <span className="text-muted-foreground">
                          Fechamento: <strong className="text-foreground">{brl(op.fechTotal)}</strong>
                        </span>
                        <span className={classeDiferenca(op.fechDiferenca ?? 0)}>
                          Dif. {brl(op.fechDiferenca ?? 0)}
                        </span>
                        {op.fechamentoId && (
                          <Link
                            to="/fechamentos/$id"
                            params={{ id: op.fechamentoId }}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            Ver <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </>
                    ) : (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        Fechamento pendente
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ações rápidas */}
        <section className="grid grid-cols-3 gap-3">
          <Link
            to="/fechamento"
            className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
              <ClipboardList className="h-6 w-6 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">Fechamento</span>
          </Link>

          <Link
            to="/caixas"
            className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">Caixas</span>
          </Link>

          <Link
            to="/fechamentos"
            search={{ filtroData: "", filtroOperador: "", filtroCaixa: "", filtroMes: "" }}
            className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
              <History className="h-6 w-6 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">Histórico</span>
          </Link>
        </section>

        {/* Atalhos extras */}
        <section className="mt-3 grid grid-cols-2 gap-3">
          <Link
            to="/lancar"
            search={{ tipo: "" }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
          >
            <PenLine className="h-4 w-4 text-muted-foreground" />
            Lançar
          </Link>
          <Link
            to="/fechamentos"
            search={{ filtroData: "", filtroOperador: "", filtroCaixa: "", filtroMes: "" }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
          >
            <Banknote className="h-4 w-4 text-muted-foreground" />
            Conferir valores
          </Link>
        </section>
      </div>
    </main>
  );
}
