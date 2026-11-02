import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { controleBoloes } from "@/lib/controle-boloes.functions";
import {
  ajustarCotasEstoque,
  criarEstoque,
  definirSituacaoEstoque,
  finalizarEstoque,
  listarVendasEstoque,
  registrarVendaLinha,
  removerVendaEstoque,
} from "@/lib/estoque-boloes.functions";
import { brl, num } from "@/lib/fechamento-campos";
import { MODALIDADES_LOTERIA } from "@/lib/loterias-sorteio";
import { relatorioVendasBoloes } from "@/lib/lancamentos-simples.functions";
import { listarUsuarios, meuAcesso } from "@/lib/usuarios.functions";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/controle-boloes")({
  validateSearch: (search: Record<string, unknown>) => ({
    de: typeof search["de"] === "string" ? search["de"] : "",
    ate: typeof search["ate"] === "string" ? search["ate"] : "",
    modalidade: typeof search["modalidade"] === "string" ? search["modalidade"] : "",
    situacao: typeof search["situacao"] === "string" ? search["situacao"] : "ativo",
  }),
  head: () => ({
    meta: [
      { title: "Bolões | Brasil da Sorte" },
      {
        name: "description",
        content:
          "Quadro de bolões: vendas por funcionária, canal e dia — com venda, encerramento, finalização e relatório na mesma tela.",
      },
      { property: "og:title", content: "Bolões | Brasil da Sorte" },
    ],
  }),
  component: ControleBoloes,
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

type Linha = {
  nome: string;
  concurso: string;
  valorCota: number;
  taxa: number;
  data: string;
  observacoes: string;
  cotas: number;
  vendidas: number;
  disponiveis: number;
  situacao: string;
  finalizado: boolean;
  ids: string[];
  vendidasLoja: number;
  vendidasMkp: number;
  ultimaVenda: string;
  celulas: Record<string, number>;
  porDia: Array<{ data: string; coluna: string; cotas: number; operador: string; canal: string }>;
};

type Aviso = { tipo: "ok" | "erro"; texto: string };

function ControleBoloes() {
  const navigate = useNavigate({ from: Route.fullPath });
  const busca = Route.useSearch();
  const controleFn = useServerFn(controleBoloes);
  const acessoFn = useServerFn(meuAcesso);
  const qc = useQueryClient();

  const [de, setDe] = useState(busca.de || primeiroDiaMes());
  const [ate, setAte] = useState(busca.ate || hojeSp());
  const [modalidade, setModalidade] = useState(busca.modalidade);
  const [situacao, setSituacao] = useState<"ativo" | "todos">(
    busca.situacao === "todos" ? "todos" : "ativo",
  );
  const [periodoAberto, setPeriodoAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<Linha | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const [vendaLinha, setVendaLinha] = useState<Linha | null>(null);
  const [vendaQtd, setVendaQtd] = useState("1");
  const [vendaCanal, setVendaCanal] = useState<"LOJA" | "MARKETPLACE">("LOJA");
  const [vendaData, setVendaData] = useState(hojeSp());

  const [novoAberto, setNovoAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoConcurso, setNovoConcurso] = useState("");
  const [novoData, setNovoData] = useState(hojeSp());
  const [novoValor, setNovoValor] = useState("");
  const [novoTaxa, setNovoTaxa] = useState("");
  const [novoCotas, setNovoCotas] = useState("");
  const [novoModalidade, setNovoModalidade] = useState("");
  const [novoObs, setNovoObs] = useState("");

  const [cotasLinha, setCotasLinha] = useState<Linha | null>(null);
  const [cotasTotal, setCotasTotal] = useState("");

  const [vendasAberto, setVendasAberto] = useState(false);
  const [vendaFiltro, setVendaFiltro] = useState("");

  const [relatorioAberto, setRelatorioAberto] = useState(true);
  const [filtroOperador, setFiltroOperador] = useState("");
  const [abertoOp, setAbertoOp] = useState<string | null>(null);

  useEffect(() => {
    void navigate({
      search: (s) => ({ ...s, de, ate, modalidade, situacao }),
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, modalidade, situacao]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const acesso = useQuery({
    queryKey: ["meu-acesso"],
    queryFn: () => acessoFn({}),
    staleTime: 5 * 60 * 1000,
  });
  const admin = Boolean(acesso.data?.admin);

  const q = useQuery({
    queryKey: ["controle-boloes", de, ate, modalidade, situacao],
    queryFn: () => controleFn({ data: { de, ate, modalidade, situacao } }),
    enabled: !!de && !!ate,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const listarVendasFn = useServerFn(listarVendasEstoque);
  const relatorioFn = useServerFn(relatorioVendasBoloes);
  const usuariosFn = useServerFn(listarUsuarios);

  const vendasQ = useQuery({
    queryKey: ["vendas-estoque", de, ate],
    queryFn: () => listarVendasFn({ data: { de, ate } }),
    enabled: vendasAberto && !!de && !!ate,
    staleTime: 30_000,
  });

  const usuariosQ = useQuery({
    queryKey: ["usuarios-boloes"],
    queryFn: () => usuariosFn({}),
    enabled: admin,
    staleTime: 5 * 60 * 1000,
  });

  const relatorioQ = useQuery({
    queryKey: ["relatorio-vendas-boloes", de, ate, filtroOperador],
    queryFn: () =>
      relatorioFn({
        data: {
          de,
          ate,
          ...(admin && filtroOperador ? { operadorId: filtroOperador } : {}),
        },
      }),
    enabled: relatorioAberto && !!de && !!ate,
    staleTime: 30_000,
  });

  const venderFn = useServerFn(registrarVendaLinha);
  const situacaoFn = useServerFn(definirSituacaoEstoque);
  const finalizarFn = useServerFn(finalizarEstoque);
  const cotasFn = useServerFn(ajustarCotasEstoque);
  const criarFn = useServerFn(criarEstoque);
  const removerVendaFn = useServerFn(removerVendaEstoque);

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ["controle-boloes"] });
    void qc.invalidateQueries({ queryKey: ["vendas-estoque"] });
    void qc.invalidateQueries({ queryKey: ["relatorio-vendas-boloes"] });
  };

  const venderMut = useMutation({
    mutationFn: () => {
      const l = vendaLinha;
      if (!l) throw new Error("Sem bolão selecionado.");
      return venderFn({
        data: {
          ids: l.ids,
          quantidade: Math.round(num(vendaQtd)),
          canal: vendaCanal,
          data: vendaData,
        },
      });
    },
    onSuccess: (r) => {
      if (r.ok) {
        setAviso({ tipo: "ok", texto: `Venda registrada. Restam ${r.disponiveis} cota(s).` });
        setVendaLinha(null);
      } else {
        setAviso({ tipo: "erro", texto: r.erro });
      }
      invalidar();
    },
    onError: (e) => setAviso({ tipo: "erro", texto: e.message }),
  });

  const situacaoMut = useMutation({
    mutationFn: (args: { l: Linha; para: "ativo" | "encerrado" }) =>
      situacaoFn({ data: { ids: args.l.ids, situacao: args.para } }),
    onSuccess: (r) => {
      if (!r.ok) setAviso({ tipo: "erro", texto: r.erro });
      setDetalhe(null);
      invalidar();
    },
    onError: (e) => setAviso({ tipo: "erro", texto: e.message }),
  });

  const finalizarMut = useMutation({
    mutationFn: (l: Linha) => finalizarFn({ data: { ids: l.ids } }),
    onSuccess: (r) => {
      if (r.ok) {
        setAviso({ tipo: "ok", texto: "Bolão finalizado. Venda, reativação e edição ficam bloqueadas." });
        setDetalhe(null);
      } else {
        setAviso({ tipo: "erro", texto: r.erro });
      }
      invalidar();
    },
    onError: (e) => setAviso({ tipo: "erro", texto: e.message }),
  });

  const cotasMut = useMutation({
    mutationFn: () => {
      const l = cotasLinha;
      if (!l) throw new Error("Sem bolão selecionado.");
      return cotasFn({ data: { ids: l.ids, total: Math.round(num(cotasTotal)) } });
    },
    onSuccess: (r) => {
      if (r.ok) {
        setAviso({ tipo: "ok", texto: "Cotas ajustadas." });
        setCotasLinha(null);
      } else {
        setAviso({ tipo: "erro", texto: r.erro });
      }
      invalidar();
    },
    onError: (e) => setAviso({ tipo: "erro", texto: e.message }),
  });

  const criarMut = useMutation({
    mutationFn: () =>
      criarFn({
        data: {
          nome: novoNome.trim(),
          concurso: novoConcurso.trim(),
          cotas: Math.round(num(novoCotas)),
          quantidade: 1,
          valorCota: num(novoValor),
          taxa: num(novoTaxa),
          data: novoData,
          modalidade: novoModalidade,
          observacoes: novoObs.trim(),
          salvarModelo: true,
        },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        setAviso({ tipo: "ok", texto: "Bolão criado." });
        setNovoAberto(false);
        setNovoNome("");
        setNovoConcurso("");
        setNovoValor("");
        setNovoTaxa("");
        setNovoCotas("");
        setNovoObs("");
      } else {
        setAviso({ tipo: "erro", texto: r.erro });
      }
      invalidar();
    },
    onError: (e) => setAviso({ tipo: "erro", texto: e.message }),
  });

  const estornoMut = useMutation({
    mutationFn: (id: string) => removerVendaFn({ data: { id } }),
    onSuccess: (r) => {
      if (r.ok) setAviso({ tipo: "ok", texto: "Venda excluída e cotas devolvidas." });
      else setAviso({ tipo: "erro", texto: r.erro });
      invalidar();
    },
    onError: (e) => setAviso({ tipo: "erro", texto: e.message }),
  });

  const colunas = q.data?.colunas ?? [];
  const linhas = (q.data?.linhas ?? []) as Linha[];
  const totais = q.data?.totais ?? { cotas: {}, valor: {} };
  const resumo = q.data?.resumo ?? {
    cotasVendidas: 0,
    cotasDisponiveis: 0,
    cotasAbertas: 0,
    valorVendido: 0,
    taxaVendida: 0,
    finalizados: 0,
  };

  const nomeColuna = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of colunas) m.set(c.id, c.rotulo);
    return m;
  }, [colunas]);

  const totalPorColuna = (id: string) => totais.cotas?.[id] ?? 0;

  /** Bolões agrupados por concurso — um quadro por concurso, como na planilha. */
  const porConcurso = useMemo(() => {
    const map = new Map<string, { chave: string; titulo: string; sorteio: string; bolões: Linha[] }>();
    for (const l of linhas) {
      const chave = `${l.nome}|${l.concurso}`;
      const g = map.get(chave) ?? {
        chave,
        titulo: `${l.nome}${l.concurso ? ` · concurso ${l.concurso}` : ""}`,
        sorteio: l.data,
        bolões: [],
      };
      if (l.data && (!g.sorteio || l.data < g.sorteio)) g.sorteio = l.data;
      g.bolões.push(l);
      map.set(chave, g);
    }
    for (const g of map.values()) {
      g.bolões.sort(
        (a, b) =>
          Number(a.finalizado) - Number(b.finalizado) ||
          b.vendidas - a.vendidas ||
          a.valorCota - b.valorCota,
      );
    }
    return [...map.values()];
  }, [linhas]);

  const diasDoDetalhe = useMemo(() => {
    if (!detalhe) return [];
    const porData = new Map<string, Array<{ coluna: string; cotas: number }>>();
    for (const d of detalhe.porDia) {
      const arr = porData.get(d.data) ?? [];
      arr.push({ coluna: d.coluna, cotas: d.cotas });
      porData.set(d.data, arr);
    }
    return [...porData.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [detalhe]);

  const vendasListadas = useMemo(() => {
    const vs = (vendasQ.data ?? []) as Array<{
      id: string;
      nome: string;
      concurso: string;
      quantidade: number;
      canal: "LOJA" | "MARKETPLACE";
      data: string;
      operador: string;
      valorTotal: number;
    }>;
    if (!vendaFiltro) return vs;
    const [nome, concurso] = vendaFiltro.split("|");
    return vs.filter((v) => v.nome === nome && (v.concurso ?? "") === (concurso ?? ""));
  }, [vendasQ.data, vendaFiltro]);

  const totalVendasListadas = vendasListadas.reduce((s, v) => s + v.quantidade, 0);
  const valorVendasListadas = vendasListadas.reduce((s, v) => s + v.valorTotal, 0);

  type RelDia = {
    data: string;
    cotas: number;
    valor: number;
    taxa: number;
    mkpCotas: number;
    mkpValor: number;
  };
  type RelOp = {
    operadorId: string;
    operador: string;
    cotas: number;
    valor: number;
    taxa: number;
    dias: RelDia[];
  };
  const relOps = (relatorioQ.data?.operadores ?? []) as RelOp[];
  const relTotal = relatorioQ.data?.total ?? {
    cotas: 0,
    valor: 0,
    taxa: 0,
    mkpCotas: 0,
    mkpValor: 0,
    mkpTaxa: 0,
  };
  const relLojas = relOps.filter((op) => op.operadorId !== "__mkp__");
  const relMkp = relOps.find((op) => op.operadorId === "__mkp__") ?? null;
  const relTaxaLojas = Math.max(0, relTotal.taxa - relTotal.mkpTaxa);
  const relDias = useMemo(() => {
    let acc = 0;
    return ((relatorioQ.data?.dias ?? []) as RelDia[]).map((d) => {
      acc += Number(d.valor ?? 0);
      return { ...d, acumulado: acc };
    });
  }, [relatorioQ.data]);

  const abrirVenda = (l: Linha) => {
    setDetalhe(null);
    setVendaQtd("1");
    setVendaCanal("LOJA");
    setVendaData(hojeSp());
    setVendaLinha(l);
  };

  const abrirCotas = (l: Linha) => {
    setDetalhe(null);
    setCotasTotal(String(l.cotas));
    setCotasLinha(l);
  };

  const confirmarFinalizar = (l: Linha) => {
    const sobra = Math.max(0, l.cotas - l.vendidas);
    const perda = sobra * l.valorCota;
    const texto =
      sobra > 0
        ? `Finalizar "${l.nome}${l.concurso ? ` · concurso ${l.concurso}` : ""}"?\n\n` +
          `Restam ${sobra} cota(s) sem vender — perda de ${brl(perda)}.\n` +
          `Depois de finalizar não dá para vender nem reativar.`
        : `Finalizar "${l.nome}${l.concurso ? ` · concurso ${l.concurso}` : ""}"?\n\n` +
          `Todas as cotas foram vendidas. Depois de finalizar não dá para vender nem reativar.`;
    if (window.confirm(texto)) finalizarMut.mutate(l);
  };

  const rotuloSituacao = (l: { situacao: string }) =>
    l.situacao === "finalizado" ? "Finalizado" : l.situacao === "encerrado" ? "Encerrado" : "Em aberto";

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <AppNav />

        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Bolões</h1>
            <p className="text-sm text-muted-foreground">
              Quadro de vendas por bolão: toque na linha para ver o dia a dia, vender, encerrar
              ou finalizar. Abre nos bolões em aberto.
            </p>
          </div>
          {admin && (
            <button
              type="button"
              onClick={() => setNovoAberto(true)}
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Novo bolão
            </button>
          )}
        </header>

        {aviso && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              aviso.tipo === "ok"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {aviso.texto}
          </div>
        )}

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
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Modalidade
              <select
                value={modalidade}
                onChange={(e) => setModalidade(e.target.value)}
                className={`${input} min-w-36`}
              >
                <option value="">Todas</option>
                {MODALIDADES_LOTERIA.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Situação
              <select
                value={situacao}
                onChange={(e) => setSituacao(e.target.value as "ativo" | "todos")}
                className={input}
              >
                <option value="ativo">Em aberto</option>
                <option value="todos">Todos</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPeriodoAberto((v) => !v)}
              className="h-9 rounded-md border border-input px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              {periodoAberto ? "Fechar período" : "Período detalhado"}
            </button>
            <button
              type="button"
              onClick={() => setVendasAberto((v) => !v)}
              className="h-9 rounded-md border border-input px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              {vendasAberto ? "Fechar vendas" : "Vendas do período"}
            </button>
            <button
              type="button"
              onClick={() => setRelatorioAberto((v) => !v)}
              className="h-9 rounded-md border border-input px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              {relatorioAberto ? "Fechar relatório" : "Relatório do mês"}
            </button>
          </div>

          {periodoAberto && (
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                De
                <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Até
                <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={input} />
              </label>
              <button
                type="button"
                onClick={() => {
                  setDe(primeiroDiaMes());
                  setAte(hojeSp());
                  setModalidade("");
                  setSituacao("ativo");
                }}
                className="h-9 rounded-md border border-input px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </section>

        {vendasAberto && (
          <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">Vendas do período</h2>
              <select
                value={vendaFiltro}
                onChange={(e) => setVendaFiltro(e.target.value)}
                className={`${input} min-w-52`}
              >
                <option value="">Todos os bolões</option>
                {porConcurso.map((g) => (
                  <option key={g.chave} value={g.chave}>
                    {g.titulo}
                  </option>
                ))}
              </select>
              <span className="ml-auto text-xs text-muted-foreground">
                {vendasListadas.length} venda(s) · {totalVendasListadas} cota(s) ·{" "}
                {brl(valorVendasListadas)}
              </span>
            </div>
            {vendasQ.isPending ? (
              <div className="mt-3 h-20 animate-pulse rounded-lg bg-secondary" />
            ) : vendasListadas.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhuma venda no período.</p>
            ) : (
              <div className="mt-3 max-h-80 overflow-y-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-1.5 text-left text-[11px] uppercase text-muted-foreground">Data</th>
                      <th className="px-2 py-1.5 text-left text-[11px] uppercase text-muted-foreground">Bolão</th>
                      <th className="px-2 py-1.5 text-left text-[11px] uppercase text-muted-foreground">Operadora</th>
                      <th className="px-2 py-1.5 text-left text-[11px] uppercase text-muted-foreground">Canal</th>
                      <th className="px-2 py-1.5 text-right text-[11px] uppercase text-muted-foreground">Qtd</th>
                      <th className="px-2 py-1.5 text-right text-[11px] uppercase text-muted-foreground">R$</th>
                      {admin && <th className="px-2 py-1.5 text-right text-[11px] uppercase text-muted-foreground">—</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {vendasListadas.map((v) => (
                      <tr key={v.id} className="border-b border-border/50">
                        <td className="px-2 py-1.5">{dataBr(v.data)}</td>
                        <td className="px-2 py-1.5">
                          {v.nome}
                          {v.concurso ? ` · ${v.concurso}` : ""}
                        </td>
                        <td className="px-2 py-1.5">{v.operador}</td>
                        <td className="px-2 py-1.5">{v.canal === "MARKETPLACE" ? "MKP" : "Loja"}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{v.quantidade}</td>
                        <td className="px-2 py-1.5 text-right">{brl(v.valorTotal)}</td>
                        {admin && (
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Excluir venda de ${v.quantidade} cota(s) de ${v.nome}? O lançamento vinculado é ajustado junto.`)) {
                                  estornoMut.mutate(v.id);
                                }
                              }}
                              className="text-xs font-medium text-destructive hover:underline"
                            >
                              Excluir
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {relatorioAberto && (
          <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">
                Relatório por operadora — {nomeMes(de)}
              </h2>
              {admin && (
                <select
                  value={filtroOperador}
                  onChange={(e) => setFiltroOperador(e.target.value)}
                  className={`${input} min-w-40`}
                >
                  <option value="">Todas</option>
                  {(usuariosQ.data ?? []).map(
                    (u: { id: string; nome: string | null; email: string | null }) => (
                      <option key={u.id} value={u.id}>
                        {u.nome || u.email}
                      </option>
                    ),
                  )}
                </select>
              )}
              {relatorioQ.data && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {(relatorioQ.data as { lancamentos?: number }).lancamentos ?? 0} lançamento(s)
                </span>
              )}
            </div>

            {relatorioQ.isPending ? (
              <div className="mt-3 h-20 animate-pulse rounded-lg bg-secondary" />
            ) : relatorioQ.isError ? (
              <p className="mt-3 text-sm text-destructive">
                {relatorioQ.error instanceof Error
                  ? relatorioQ.error.message
                  : "Falha ao carregar o relatório."}
              </p>
            ) : relOps.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma venda de bolão neste período.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Total de taxas no mês:{" "}
                  <span className="font-semibold text-foreground">{brl(relTotal.taxa)}</span>
                  {" "}· operadoras {brl(relTaxaLojas)} · MKP {brl(relTotal.mkpTaxa)}{" "}
                  <span className="text-muted-foreground/70">
                    (MKP é operadora à parte e não soma nas de loja)
                  </span>
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {relLojas.map((op) => {
                    const ativo = admin && filtroOperador === op.operadorId;
                    return (
                      <button
                        key={op.operadorId}
                        type="button"
                        onClick={() => {
                          if (!admin) return;
                          setFiltroOperador(ativo ? "" : op.operadorId);
                          setAbertoOp(null);
                        }}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                          ativo
                            ? "border-primary bg-primary/5"
                            : "border-border/60 bg-secondary/30 hover:bg-secondary/60"
                        }`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {op.operador}
                        </p>
                        <p className="text-lg font-bold text-foreground">{brl(op.valor)}</p>
                        <p className="text-xs text-muted-foreground">
                          {op.cotas} cota(s) · taxas {brl(op.taxa)}
                        </p>
                      </button>
                    );
                  })}
                  {relMkp && (
                    <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-left dark:border-sky-800 dark:bg-sky-950/30">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                        MKP (Marketplace)
                      </p>
                      <p className="text-lg font-bold text-sky-900 dark:text-sky-100">
                        {brl(relMkp.valor)}
                      </p>
                      <p className="text-xs text-sky-700/80 dark:text-sky-300/80">
                        {relMkp.cotas} cota(s) · taxas {brl(relMkp.taxa)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5" />
                      <th className="px-3 py-2.5">Operadora</th>
                      <th className="px-3 py-2.5 text-right">Cotas</th>
                      <th className="px-3 py-2.5 text-right">Valor</th>
                      <th className="px-3 py-2.5 text-right">Taxa</th>
                      <th className="px-3 py-2.5 text-right">Dias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relOps.map((op) => {
                      const aberto = abertoOp === op.operadorId;
                      const ehMkp = op.operadorId === "__mkp__";
                      return (
                        <Fragment key={op.operadorId}>
                          <tr
                            className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/30 ${
                              ehMkp ? "bg-sky-50/60 dark:bg-sky-950/20" : ""
                            }`}
                            onClick={() => setAbertoOp(aberto ? null : op.operadorId)}
                          >
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {aberto ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </td>
                            <td
                              className={`px-3 py-2.5 font-medium ${
                                ehMkp
                                  ? "text-sky-700 dark:text-sky-300"
                                  : "text-foreground"
                              }`}
                            >
                              {ehMkp ? "MKP (Marketplace)" : op.operador}
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
                                  Dia a dia — {ehMkp ? "MKP (Marketplace)" : op.operador}
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
                      <td className="px-3 py-2.5 text-right text-foreground">{relTotal.cotas}</td>
                      <td className="px-3 py-2.5 text-right text-foreground">{brl(relTotal.valor)}</td>
                      <td className="px-3 py-2.5 text-right text-violet-600 dark:text-violet-400">
                        {brl(relTotal.taxa)}
                      </td>
                      <td className="px-3 py-2.5" />
                    </tr>
                  </tfoot>
                </table>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Listagem por dia — total acumulado no mês
                  </p>
                  <div className="mt-1 overflow-x-auto rounded-md border border-border bg-card">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                          <th className="px-3 py-2">Data</th>
                          <th className="px-3 py-2 text-right">Cotas</th>
                          <th className="px-3 py-2 text-right">Valor do dia</th>
                          <th className="px-3 py-2 text-right">MKP</th>
                          <th className="px-3 py-2 text-right">Taxa</th>
                          <th className="px-3 py-2 text-right">Acumulado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relDias.map((d) => (
                          <tr key={d.data} className="border-b border-border/50 last:border-0">
                            <td className="px-3 py-1.5 text-foreground">{dataBr(d.data)}</td>
                            <td className="px-3 py-1.5 text-right">{d.cotas}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{brl(d.valor)}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-sky-600 dark:text-sky-400">
                              {brl(d.mkpValor)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-medium text-violet-600 dark:text-violet-400">
                              {brl(d.taxa)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold text-foreground">
                              {brl(d.acumulado)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-secondary/50 text-xs font-bold">
                          <td className="px-3 py-2">TOTAL DO MÊS</td>
                          <td className="px-3 py-2 text-right">{relTotal.cotas}</td>
                          <td className="px-3 py-2 text-right">{brl(relTotal.valor)}</td>
                          <td className="px-3 py-2 text-right">{brl(relTotal.mkpValor)}</td>
                          <td className="px-3 py-2 text-right">{brl(relTotal.taxa)}</td>
                          <td className="px-3 py-2 text-right">{brl(relTotal.valor)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { rotulo: "Cotas vendidas", valor: String(resumo.cotasVendidas) },
            { rotulo: "Valor vendido", valor: brl(resumo.valorVendido) },
            { rotulo: "Ainda têm", valor: String(resumo.cotasDisponiveis) },
            { rotulo: "Finalizados", valor: String(resumo.finalizados) },
          ].map((c) => (
            <div key={c.rotulo} className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
              <p className="text-[11px] uppercase text-muted-foreground">{c.rotulo}</p>
              <p className="text-lg font-semibold text-foreground">{c.valor}</p>
            </div>
          ))}
        </section>

        {q.isPending ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        ) : q.isError ? (
          <p className="text-sm text-destructive">
            {q.error instanceof Error ? q.error.message : "Falha ao carregar o controle."}
          </p>
        ) : porConcurso.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum bolão encontrado com esses filtros.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {porConcurso.map((grupo) => {
              const cotasGrupo = grupo.bolões.reduce((s, b) => s + b.cotas, 0);
              const vendidasGrupo = grupo.bolões.reduce((s, b) => s + b.vendidas, 0);
              return (
                <section
                  key={grupo.chave}
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                >
                  {/* Cabeçalho do concurso, como o título da planilha */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-secondary/40 px-3 py-2">
                    <h2 className="text-sm font-bold text-foreground">{grupo.titulo}</h2>
                    {grupo.sorteio && (
                      <span className="text-xs text-muted-foreground">
                        sorteio {dataBr(grupo.sorteio)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {grupo.bolões.length} bolão(ões)
                    </span>
                    <span className="ml-auto text-xs font-medium text-foreground">
                      {vendidasGrupo}/{cotasGrupo} cotas vendidas
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="sticky left-0 z-10 min-w-[170px] border-r border-border bg-card px-3 py-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            Bolão
                          </th>
                          {colunas.map((c) => (
                            <th
                              key={c.id}
                              className="min-w-[74px] border-r border-border px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-foreground last:border-r-0"
                            >
                              {c.rotulo}
                            </th>
                          ))}
                          <th className="min-w-[70px] border-r border-border px-2 py-2 text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                            Vendidas
                          </th>
                          <th className="min-w-[64px] px-2 py-2 text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                            Faltam
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.bolões.map((l) => (
                          <tr
                            key={`${l.nome}-${l.concurso}-${l.valorCota}-${l.taxa}`}
                            className="cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/20"
                            onClick={() => setDetalhe(l)}
                          >
                            <td className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2 align-top">
                              <span className="block text-sm font-bold text-foreground">
                                {l.cotas} cotas de {brl(l.valorCota)}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {l.observacoes || l.nome}
                                {l.taxa > 0 ? ` · taxa ${brl(l.taxa)}` : ""}
                              </span>
                              {l.situacao !== "ativo" && (
                                <span
                                  className={`mt-0.5 block text-[11px] font-semibold ${
                                    l.situacao === "finalizado"
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-amber-600 dark:text-amber-400"
                                  }`}
                                >
                                  {rotuloSituacao(l)}
                                </span>
                              )}
                              {l.disponiveis > 0 && l.situacao !== "finalizado" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    abrirVenda(l);
                                  }}
                                  className="mt-1 h-7 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground hover:bg-accent"
                                >
                                  Vender
                                </button>
                              )}
                            </td>
                            {colunas.map((c) => {
                              const n = l.celulas[c.id] ?? 0;
                              return (
                                <td
                                  key={c.id}
                                  className="border-r border-border px-1 py-1 text-center last:border-r-0"
                                >
                                  {n > 0 ? (
                                    <span className="flex h-9 items-center justify-center rounded bg-emerald-500/25 text-sm font-bold text-emerald-800 dark:text-emerald-200">
                                      {n}
                                    </span>
                                  ) : (
                                    <span className="block h-9 rounded bg-secondary/30" />
                                  )}
                                </td>
                              );
                            })}
                            <td className="border-r border-border px-2 py-2 text-right align-top">
                              <span className="font-semibold text-foreground">{l.vendidas}</span>
                              <span className="text-xs text-muted-foreground">/{l.cotas}</span>
                            </td>
                            <td className="px-2 py-2 text-right align-top font-medium">
                              {l.situacao === "finalizado" ? (
                                <span className="text-emerald-600 dark:text-emerald-400">0</span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {l.disponiveis}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-secondary/30">
                          <td className="sticky left-0 z-10 border-r border-border bg-secondary/30 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            Total
                          </td>
                          {colunas.map((c) => (
                            <td
                              key={c.id}
                              className="border-r border-border px-2 py-2 text-center text-sm font-bold text-foreground"
                            >
                              {totalPorColuna(c.id) || ""}
                            </td>
                          ))}
                          <td className="border-r border-border px-2 py-2 text-right text-sm font-bold text-foreground">
                            {vendidasGrupo}
                          </td>
                          <td className="px-2 py-2 text-right text-sm font-bold text-foreground">
                            {Math.max(0, cotasGrupo - vendidasGrupo)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {detalhe && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-foreground">
                {detalhe.cotas} cotas de {brl(detalhe.valorCota)}
              </h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  detalhe.situacao === "finalizado"
                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : detalhe.situacao === "encerrado"
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {rotuloSituacao(detalhe)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {detalhe.nome}
              {detalhe.concurso ? ` · concurso ${detalhe.concurso}` : ""} · {detalhe.vendidas}{" "}
              vendida(s) · {Math.max(0, detalhe.cotas - detalhe.vendidas)} disponível(is)
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Loja: {detalhe.vendidasLoja} · Marketplace: {detalhe.vendidasMkp}
            </p>

            {(detalhe.situacao === "encerrado" || detalhe.situacao === "finalizado") && (
              <div className="mt-3 rounded-md border border-border/60 bg-secondary/20 p-2 text-sm">
                <p className="font-semibold text-foreground">Resultado</p>
                <p className="text-muted-foreground">
                  Vendidas: {detalhe.vendidas} (Loja {detalhe.vendidasLoja} · MKP{" "}
                  {detalhe.vendidasMkp}) · Sobra: {Math.max(0, detalhe.cotas - detalhe.vendidas)}{" "}
                  cota(s) · Perda:{" "}
                  {brl(Math.max(0, detalhe.cotas - detalhe.vendidas) * detalhe.valorCota)}
                </p>
              </div>
            )}

            {detalhe.porDia.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nenhuma venda registrada neste período.
              </p>
            ) : (
              <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">
                {diasDoDetalhe.map(([dia, itens]) => (
                  <div key={dia} className="rounded-md border border-border/60 bg-secondary/20 p-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {dataBr(dia)}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {itens.map((i, idx) => (
                        <li
                          key={`${i.coluna}-${idx}`}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="text-foreground">
                            {nomeColuna.get(i.coluna) ?? i.coluna}
                          </span>
                          <span className="font-semibold text-foreground">{i.cotas} cota(s)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {detalhe.situacao !== "finalizado" && detalhe.disponiveis > 0 && (
                <button
                  type="button"
                  onClick={() => abrirVenda(detalhe)}
                  className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Vender
                </button>
              )}
              {admin && (
                <>
                  {detalhe.situacao === "ativo" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Encerrar este bolão? Vendas continuam aceitas (ex.: marketplace).")) {
                          situacaoMut.mutate({ l: detalhe, para: "encerrado" });
                        }
                      }}
                      className="h-9 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent"
                    >
                      Encerrar
                    </button>
                  )}
                  {detalhe.situacao === "encerrado" && (
                    <>
                      <button
                        type="button"
                        onClick={() => situacaoMut.mutate({ l: detalhe, para: "ativo" })}
                        className="h-9 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent"
                      >
                        Reativar
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmarFinalizar(detalhe)}
                        className="h-9 rounded-md border border-emerald-600 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      >
                        Finalizar
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => abrirCotas(detalhe)}
                    className="h-9 rounded-md border border-input px-3 text-sm font-medium text-muted-foreground hover:bg-accent"
                  >
                    Ajustar cotas
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setDetalhe(null)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {vendaLinha && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Vender cotas</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {vendaLinha.nome}
              {vendaLinha.concurso ? ` · concurso ${vendaLinha.concurso}` : ""} ·{" "}
              {brl(vendaLinha.valorCota)} a cota
            </p>
            <div className="mt-3 space-y-3">
              <label className="block text-xs text-muted-foreground">
                Quantidade de cotas
                <input
                  type="text"
                  inputMode="numeric"
                  value={vendaQtd}
                  onChange={(e) => setVendaQtd(e.target.value)}
                  className={`${input} mt-1 w-full`}
                  autoFocus
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Canal
                <select
                  value={vendaCanal}
                  onChange={(e) => setVendaCanal(e.target.value as "LOJA" | "MARKETPLACE")}
                  className={`${input} mt-1 w-full`}
                >
                  <option value="LOJA">Loja</option>
                  <option value="MARKETPLACE">Marketplace</option>
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Data da venda
                <input
                  type="date"
                  value={vendaData}
                  onChange={(e) => setVendaData(e.target.value)}
                  className={`${input} mt-1 w-full`}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVendaLinha(null)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={venderMut.isPending || Math.round(num(vendaQtd)) < 1}
                onClick={() => venderMut.mutate()}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {venderMut.isPending ? "Registrando…" : "Confirmar venda"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cotasLinha && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Ajustar cotas</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {cotasLinha.nome}
              {cotasLinha.concurso ? ` · concurso ${cotasLinha.concurso}` : ""} · hoje{" "}
              {cotasLinha.cotas} cotas · {cotasLinha.vendidas} vendida(s)
            </p>
            <label className="mt-3 block text-xs text-muted-foreground">
              Total de cotas do bolão
              <input
                type="text"
                inputMode="numeric"
                value={cotasTotal}
                onChange={(e) => setCotasTotal(e.target.value)}
                className={`${input} mt-1 w-full`}
                autoFocus
              />
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              O total é dividido entre os lotes; nunca pode ficar abaixo das cotas já vendidas.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCotasLinha(null)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={cotasMut.isPending}
                onClick={() => cotasMut.mutate()}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {cotasMut.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {novoAberto && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Novo bolão</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="col-span-2 block text-xs text-muted-foreground">
                Modalidade
                <select
                  value={novoModalidade}
                  onChange={(e) => setNovoModalidade(e.target.value)}
                  className={`${input} mt-1 w-full`}
                >
                  <option value="">Outro / personalizado</option>
                  {MODALIDADES_LOTERIA.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 block text-xs text-muted-foreground">
                Nome do bolão
                <input
                  type="text"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder={
                    novoModalidade
                      ? MODALIDADES_LOTERIA.find((m) => m.id === novoModalidade)?.nome
                      : "Ex.: Dupla Sena"
                  }
                  className={`${input} mt-1 w-full`}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Concurso
                <input
                  type="text"
                  value={novoConcurso}
                  onChange={(e) => setNovoConcurso(e.target.value)}
                  className={`${input} mt-1 w-full`}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Data do sorteio
                <input
                  type="date"
                  value={novoData}
                  onChange={(e) => setNovoData(e.target.value)}
                  className={`${input} mt-1 w-full`}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Valor da cota
                <input
                  type="text"
                  inputMode="decimal"
                  value={novoValor}
                  onChange={(e) => setNovoValor(e.target.value)}
                  placeholder="2,00"
                  className={`${input} mt-1 w-full`}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Taxa
                <input
                  type="text"
                  inputMode="decimal"
                  value={novoTaxa}
                  onChange={(e) => setNovoTaxa(e.target.value)}
                  placeholder="0,00"
                  className={`${input} mt-1 w-full`}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Total de cotas
                <input
                  type="text"
                  inputMode="numeric"
                  value={novoCotas}
                  onChange={(e) => setNovoCotas(e.target.value)}
                  className={`${input} mt-1 w-full`}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Observação (opcional)
                <input
                  type="text"
                  value={novoObs}
                  onChange={(e) => setNovoObs(e.target.value)}
                  className={`${input} mt-1 w-full`}
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Cria um lote com o total de cotas. Para vender no bolão, use o botão Vender da
              linha — as cotas saem do lote mais antigo.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNovoAberto(false)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={criarMut.isPending || Math.round(num(novoCotas)) < 1}
                onClick={() => criarMut.mutate()}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {criarMut.isPending ? "Criando…" : "Criar bolão"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(q.isFetching || vendasQ.isFetching) && !q.isPending && (
        <div className="fixed bottom-20 right-4 rounded-full bg-card p-2 shadow-lg md:bottom-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </main>
  );
}
