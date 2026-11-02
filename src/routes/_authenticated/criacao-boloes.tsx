import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { listarEstoque } from "@/lib/estoque-boloes.functions";
import { brl, num } from "@/lib/fechamento-campos";
import { relatorioVendasBoloes } from "@/lib/lancamentos-simples.functions";
import { meuAcesso } from "@/lib/usuarios.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/criacao-boloes")({
  head: () => ({
    meta: [
      { title: "Criação de bolões | Brasil da Sorte" },
      {
        name: "description",
        content:
          "Conferência de criação de bolões: recibo TFL (custo + tarifa) × estoque criado × vendas lançadas (loja + MKP).",
      },
      { property: "og:title", content: "Criação de bolões | Brasil da Sorte" },
    ],
  }),
  component: CriacaoBoloes,
});

const hojeSp = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const primeiroDiaMes = (referencia = hojeSp()) => `${referencia.slice(0, 7)}-01`;
const ultimoDiaMes = (mes: string) => {
  const [ano, m] = mes.split("-").map(Number);
  const ultimo = new Date(ano!, (m ?? 1), 0).getDate();
  return `${mes}-${String(ultimo).padStart(2, "0")}`;
};
const dataBr = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

const nomeMes = (ref: string) => {
  const [ano, m] = ref.slice(0, 7).split("-");
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const idx = Number(m) - 1;
  return `${nomes[idx] ?? m} ${ano}`;
};

const input =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

type ReciboTfl = { id: string; data: string; custo: number; taxa: number };

type EstCriado = {
  id: string;
  nome: string | null;
  concurso: string | null;
  cotas: number | string;
  valorCota: number | string;
  taxa: number | string;
  situacao: string;
  created_at: string | null;
};

function CriacaoBoloes() {
  const [de, setDe] = useState(primeiroDiaMes());
  const [ate, setAte] = useState(ultimoDiaMes(hojeSp().slice(0, 7)));

  const acessoFn = useServerFn(meuAcesso);
  const listarEstoqueFn = useServerFn(listarEstoque);
  const relatorioFn = useServerFn(relatorioVendasBoloes);

  const [recibosTfl, setRecibosTfl] = useState<ReciboTfl[]>([]);
  const [reciboData, setReciboData] = useState(hojeSp());
  const [reciboCusto, setReciboCusto] = useState("");
  const [reciboTaxa, setReciboTaxa] = useState("");

  const chaveTfl = `boloes:tfl:${de}:${ate}`;

  useEffect(() => {
    try {
      const bruto = localStorage.getItem(chaveTfl);
      setRecibosTfl(bruto ? (JSON.parse(bruto) as ReciboTfl[]) : []);
    } catch {
      setRecibosTfl([]);
    }
  }, [chaveTfl]);

  useEffect(() => {
    try {
      localStorage.setItem(chaveTfl, JSON.stringify(recibosTfl));
    } catch {
      // armazenamento indisponível — segue só em memória
    }
  }, [chaveTfl, recibosTfl]);

  const acesso = useQuery({
    queryKey: ["meu-acesso"],
    queryFn: () => acessoFn({}),
    staleTime: 5 * 60 * 1000,
  });
  const admin = Boolean(acesso.data?.admin);

  const estoqueCriacaoQ = useQuery({
    queryKey: ["estoque-criacao", admin],
    queryFn: () => listarEstoqueFn({ data: { situacao: "todos" } }),
    enabled: admin,
    staleTime: 30_000,
  });

  const relatorioQ = useQuery({
    queryKey: ["relatorio-vendas-boloes", de, ate],
    queryFn: () => relatorioFn({ data: { de, ate } }),
    enabled: admin && !!de && !!ate,
    staleTime: 30_000,
  });

  const estoquesCriacao = useMemo(() => {
    const todos = (estoqueCriacaoQ.data?.estoques ?? []) as EstCriado[];
    return todos.filter((e) => {
      if (!e.created_at) return true;
      const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
        new Date(e.created_at),
      );
      return dia >= de && dia <= ate;
    });
  }, [estoqueCriacaoQ.data, de, ate]);

  const criacaoTotais = estoquesCriacao.reduce(
    (s, e) => {
      const cq = Number(e.cotas ?? 0);
      s.cotas += cq;
      s.custo += cq * Number(e.valorCota ?? 0);
      s.taxa += cq * Number(e.taxa ?? 0);
      s.lotes += 1;
      return s;
    },
    { cotas: 0, custo: 0, taxa: 0, lotes: 0 },
  );

  const reciboTotais = recibosTfl.reduce(
    (s, r) => {
      s.custo += r.custo;
      s.taxa += r.taxa;
      return s;
    },
    { custo: 0, taxa: 0 },
  );
  const temRecibo = recibosTfl.length > 0;
  const difCusto = reciboTotais.custo - criacaoTotais.custo;
  const difTaxa = reciboTotais.taxa - criacaoTotais.taxa;
  const difTotal =
    reciboTotais.custo + reciboTotais.taxa - (criacaoTotais.custo + criacaoTotais.taxa);
  const bateRecibo = temRecibo && Math.abs(difCusto) <= 0.01 && Math.abs(difTaxa) <= 0.01;

  const relTotal = relatorioQ.data?.total ?? {
    cotas: 0,
    valor: 0,
    taxa: 0,
    mkpCotas: 0,
    mkpValor: 0,
    mkpTaxa: 0,
  };
  const vendLojaCusto = Math.max(0, relTotal.valor - relTotal.mkpValor);
  const vendLojaTaxa = Math.max(0, relTotal.taxa - relTotal.mkpTaxa);
  const vendMkpCusto = relTotal.mkpValor;
  const vendMkpTaxa = relTotal.mkpTaxa;
  const vendCusto = vendLojaCusto + vendMkpCusto;
  const vendTaxa = vendLojaTaxa + vendMkpTaxa;
  const vendReceita = vendCusto + vendTaxa;
  const pctVendido = criacaoTotais.custo > 0 ? (vendCusto / criacaoTotais.custo) * 100 : 0;
  const sobraCusto = criacaoTotais.custo - vendCusto;
  const sobraTaxa = criacaoTotais.taxa - vendTaxa;

  const adicionarRecibo = () => {
    const custo = num(reciboCusto);
    const taxa = num(reciboTaxa);
    if (!reciboData || (custo <= 0 && taxa <= 0)) return;
    setRecibosTfl((rs) => [...rs, { id: crypto.randomUUID(), data: reciboData, custo, taxa }]);
    setReciboCusto("");
    setReciboTaxa("");
  };
  const removerRecibo = (id: string) => setRecibosTfl((rs) => rs.filter((r) => r.id !== id));

  if (acesso.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="min-h-screen bg-background px-4 pb-6 pt-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <AppNav />
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Acesso restrito — apenas administradores podem conferir a criação de bolões.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <AppNav />

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Criação de bolões</h1>
          <p className="text-sm text-muted-foreground">
            Três combinações para bater o cupom da Caixa: recibo TFL (custo + tarifa) → estoque
            criado no sistema → vendas lançadas (loja + MKP).
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Mês
              <input
                type="month"
                value={de.slice(0, 7)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setDe(primeiroDiaMes(`${e.target.value}-01`));
                  setAte(ultimoDiaMes(e.target.value));
                }}
                className={input}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setDe(primeiroDiaMes());
                setAte(ultimoDiaMes(hojeSp().slice(0, 7)));
              }}
              className="h-9 rounded-md border border-input px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              Este mês
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">Criação de bolões — {nomeMes(de)}</h2>

          <div className="mt-3 rounded-lg border border-border/60 bg-secondary/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              1. Recibo TFL — totais impressos no cupom
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Data
                <input
                  type="date"
                  value={reciboData}
                  onChange={(e) => setReciboData(e.target.value)}
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Custo dos bolões (V.BOLAO)
                <input
                  value={reciboCusto}
                  onChange={(e) => setReciboCusto(e.target.value)}
                  placeholder="6.247,50"
                  inputMode="decimal"
                  className={`${input} min-w-36`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Tarifa 35% (V.TARIFA)
                <input
                  value={reciboTaxa}
                  onChange={(e) => setReciboTaxa(e.target.value)}
                  placeholder="2.186,59"
                  inputMode="decimal"
                  className={`${input} min-w-36`}
                />
              </label>
              <button
                type="button"
                onClick={adicionarRecibo}
                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Lançar
              </button>
            </div>
            {recibosTfl.length > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-2 py-1.5">Data</th>
                      <th className="px-2 py-1.5 text-right">Custo</th>
                      <th className="px-2 py-1.5 text-right">Tarifa</th>
                      <th className="px-2 py-1.5 text-right">Total</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...recibosTfl]
                      .sort((a, b) => a.data.localeCompare(b.data))
                      .map((r) => (
                        <tr key={r.id} className="border-b border-border/50 last:border-0">
                          <td className="px-2 py-1.5">{dataBr(r.data)}</td>
                          <td className="px-2 py-1.5 text-right">{brl(r.custo)}</td>
                          <td className="px-2 py-1.5 text-right">{brl(r.taxa)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold">
                            {brl(r.custo + r.taxa)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => removerRecibo(r.id)}
                              className="text-xs font-medium text-destructive hover:underline"
                            >
                              remover
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/50 text-xs font-bold">
                      <td className="px-2 py-2">TOTAL RECIBO</td>
                      <td className="px-2 py-2 text-right">{brl(reciboTotais.custo)}</td>
                      <td className="px-2 py-2 text-right">{brl(reciboTotais.taxa)}</td>
                      <td className="px-2 py-2 text-right">
                        {brl(reciboTotais.custo + reciboTotais.taxa)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Nenhum recibo lançado neste mês — digite os totais do cupom (V.BOLAO e V.TARIFA).
              </p>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-border/60 bg-secondary/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                2. Estoque criado no sistema
              </p>
              <span className="ml-auto text-xs text-muted-foreground">
                {criacaoTotais.lotes} lote(s) · {criacaoTotais.cotas} cotas · custo{" "}
                {brl(criacaoTotais.custo)} · tarifa {brl(criacaoTotais.taxa)} ·{" "}
                <span className="font-semibold text-foreground">
                  total {brl(criacaoTotais.custo + criacaoTotais.taxa)}
                </span>
              </span>
            </div>
            {estoqueCriacaoQ.isPending ? (
              <div className="mt-2 h-16 animate-pulse rounded-lg bg-secondary" />
            ) : estoquesCriacao.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Nenhum bolão criado neste período.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-2 py-1.5">Bolão</th>
                      <th className="px-2 py-1.5 text-right">Cotas</th>
                      <th className="px-2 py-1.5 text-right">Custo (V.BOLAO)</th>
                      <th className="px-2 py-1.5 text-right">Tarifa</th>
                      <th className="px-2 py-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estoquesCriacao.map((e) => {
                      const cq = Number(e.cotas ?? 0);
                      const custo = cq * Number(e.valorCota ?? 0);
                      const taxa = cq * Number(e.taxa ?? 0);
                      return (
                        <tr key={e.id} className="border-b border-border/50 last:border-0">
                          <td className="px-2 py-1.5">
                            {e.nome}
                            {e.concurso ? ` — ${e.concurso}` : ""}
                            {e.situacao !== "ativo" && (
                              <span
                                className={`ml-1 text-[11px] font-semibold ${
                                  e.situacao === "finalizado"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {e.situacao === "finalizado" ? "finalizado" : "encerrado"}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right">{cq}</td>
                          <td className="px-2 py-1.5 text-right">{brl(custo)}</td>
                          <td className="px-2 py-1.5 text-right">{brl(taxa)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold">
                            {brl(custo + taxa)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/50 text-xs font-bold">
                      <td className="px-2 py-2">TOTAL ESTOQUE</td>
                      <td className="px-2 py-2 text-right">{criacaoTotais.cotas}</td>
                      <td className="px-2 py-2 text-right">{brl(criacaoTotais.custo)}</td>
                      <td className="px-2 py-2 text-right">{brl(criacaoTotais.taxa)}</td>
                      <td className="px-2 py-2 text-right">
                        {brl(criacaoTotais.custo + criacaoTotais.taxa)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {temRecibo && (
              <div
                className={`mt-2 rounded-md border px-3 py-2 text-xs ${
                  bateRecibo
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                    : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                }`}
              >
                <span className="font-semibold">Conferência recibo × estoque:</span> custo Δ{" "}
                {brl(difCusto)} · tarifa Δ {brl(difTaxa)} · total Δ {brl(difTotal)}{" "}
                {bateRecibo ? "— bateu!" : "— revisar"}
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-border/60 bg-secondary/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              3. Vendas lançadas — fechamento das operadoras + MKP
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-border/60 bg-card px-3 py-2">
                <p className="text-[11px] uppercase text-muted-foreground">Loja (fechamentos)</p>
                <p className="text-lg font-bold text-foreground">
                  {brl(vendLojaCusto + vendLojaTaxa)}
                </p>
                <p className="text-xs text-muted-foreground">
                  custo {brl(vendLojaCusto)} · tarifa {brl(vendLojaTaxa)}
                </p>
              </div>
              <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 dark:border-sky-800 dark:bg-sky-950/30">
                <p className="text-[11px] uppercase text-sky-700 dark:text-sky-300">
                  MKP (Marketplace)
                </p>
                <p className="text-lg font-bold text-sky-900 dark:text-sky-100">
                  {brl(vendMkpCusto + vendMkpTaxa)}
                </p>
                <p className="text-xs text-sky-700/80 dark:text-sky-300/80">
                  custo {brl(vendMkpCusto)} · tarifa {brl(vendMkpTaxa)}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-card px-3 py-2">
                <p className="text-[11px] uppercase text-muted-foreground">
                  Total vendido (receita)
                </p>
                <p className="text-lg font-bold text-foreground">{brl(vendReceita)}</p>
                <p className="text-xs text-muted-foreground">
                  custo {brl(vendCusto)} · tarifa {brl(vendTaxa)}
                </p>
              </div>
            </div>
            <div className="mt-2 rounded-md border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">
              Percentual vendido do custo criado:{" "}
              <span className="font-semibold text-foreground">{pctVendido.toFixed(1)}%</span> ·
              sobra: custo {brl(sobraCusto)} · tarifa {brl(sobraTaxa)} · total{" "}
              {brl(sobraCusto + sobraTaxa)}
              {criacaoTotais.custo <= 0 &&
                " · crie os bolões ou ajuste o período para conferir a sobra"}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
