import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { DetalheBolao } from "@/components/boloes/DetalheBolao";
import { RelatorioOperadoras } from "@/components/boloes/RelatorioOperadoras";
import { VendasPeriodo } from "@/components/boloes/VendasPeriodo";
import {
  dataBr,
  input,
  rotuloSituacao,
  type Linha,
  type RelDia,
  type RelOperador,
  type RelTotal,
  type VendaEstoque,
} from "@/components/boloes/comum";
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
import { Loader2 } from "lucide-react";


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

const nomeMes = (ref: string) => {
  const [ano, m] = ref.slice(0, 7).split("-");
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const idx = Number(m) - 1;
  return `${nomes[idx] ?? m} ${ano}`;
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
    const vs = (vendasQ.data ?? []) as VendaEstoque[];
    if (!vendaFiltro) return vs;
    const [nome, concurso] = vendaFiltro.split("|");
    return vs.filter((v) => v.nome === nome && (v.concurso ?? "") === (concurso ?? ""));
  }, [vendasQ.data, vendaFiltro]);

  const totalVendasListadas = vendasListadas.reduce((s, v) => s + v.quantidade, 0);
  const valorVendasListadas = vendasListadas.reduce((s, v) => s + v.valorTotal, 0);

  const relOps = (relatorioQ.data?.operadores ?? []) as RelOperador[];
  const relTotal: RelTotal = relatorioQ.data?.total ?? {
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
          <VendasPeriodo
            admin={admin}
            filtro={vendaFiltro}
            onFiltro={setVendaFiltro}
            opcoes={porConcurso}
            vendas={vendasListadas}
            carregando={vendasQ.isPending}
            totalCotas={totalVendasListadas}
            totalValor={valorVendasListadas}
            onExcluir={(id) => estornoMut.mutate(id)}
          />
        )}

        {relatorioAberto && (
          <RelatorioOperadoras
            admin={admin}
            titulo={nomeMes(de)}
            usuarios={
              (usuariosQ.data ?? []) as Array<{
                id: string;
                nome: string | null;
                email: string | null;
              }>
            }
            filtro={filtroOperador}
            onFiltro={setFiltroOperador}
            carregando={relatorioQ.isPending}
            erro={
              relatorioQ.isError
                ? relatorioQ.error instanceof Error
                  ? relatorioQ.error.message
                  : "Falha ao carregar o relatório."
                : null
            }
            lancamentos={
              (relatorioQ.data as { lancamentos?: number } | undefined)?.lancamentos ?? null
            }
            ops={relOps}
            lojas={relLojas}
            mkp={relMkp}
            total={relTotal}
            taxaOperadoras={relTaxaLojas}
            dias={relDias}
            abertoOp={abertoOp}
            onAbertoOp={setAbertoOp}
          />
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
        <DetalheBolao
          detalhe={detalhe}
          admin={admin}
          dias={diasDoDetalhe}
          nomeColuna={nomeColuna}
          onFechar={() => setDetalhe(null)}
          onVender={() => abrirVenda(detalhe)}
          onEncerrar={() => {
            if (window.confirm("Encerrar este bolão? Vendas continuam aceitas (ex.: marketplace).")) {
              situacaoMut.mutate({ l: detalhe, para: "encerrado" });
            }
          }}
          onReativar={() => situacaoMut.mutate({ l: detalhe, para: "ativo" })}
          onFinalizar={() => confirmarFinalizar(detalhe)}
          onAjustarCotas={() => abrirCotas(detalhe)}
        />
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
