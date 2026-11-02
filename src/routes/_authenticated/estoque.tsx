import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { listarEstoqueBoloes } from "@/lib/boloes.functions";
import { buscarProximoConcurso, dataDoConcurso } from "@/lib/caixa-loterias.functions";
import { getLoteriaRowStyle } from "@/lib/loteria-colors";
import {
  ajustarCotasEstoque,
  criarEstoque,
  definirSituacaoEstoque,
  editarEstoque,
  finalizarEstoque,
  listarEstoque,
  listarVendasEstoque,
  registrarVendaEstoque,
  removerEstoque,
  removerVendaEstoque,
  rolarEstoqueProximaRodada,
} from "@/lib/estoque-boloes.functions";
import { padronizarBoloes } from "@/lib/boloes-padronizar.functions";
import { brl, num } from "@/lib/fechamento-campos";
import {
  MODALIDADES_LOTERIA,
  achaModalidade,
  compararBoloes,
  diaSorteioDepoisDe,
  diasTexto,
  getModalidade,
  proximaDataSorteioISO,
  validarDataSorteio,
} from "@/lib/loterias-sorteio";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estoque")({
  // A página de estoque foi mesclada em "Bolões" (controle de bolões).
  beforeLoad: () => {
    throw redirect({
      to: "/controle-boloes",
      search: { de: "", ate: "", modalidade: "", situacao: "ativo" },
    });
  },
  head: () => ({
    meta: [
      { title: "Estoque de bolões | Lotérica Brasil da Sorte" },
      {
        name: "description",
        content:
          "Crie o estoque de bolões a partir dos modelos cadastrados ou de um modelo novo e controle as vendas por canal com saldo de cotas.",
      },
      { property: "og:title", content: "Estoque de bolões | Brasil da Sorte" },
      {
        property: "og:description",
        content: "Controle de estoque e vendas de cotas de bolões por canal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Estoque,
});

const hojeBr = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dataBr = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

/** Normaliza para comparar nomes de modalidade (acentos/caixa). */
const norm = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/** Chave de agrupamento de lotes iguais (mesma lógica da baixa). */
const chaveGrupo = (nome: string, concurso: string, valorCota: number, taxa: number) =>
  `${norm(nome)}|${String(concurso ?? "").trim()}|${valorCota}|${taxa}`;

/** Chave de identificação do bolão para filtrar vendas. */
const chaveBolao = (nome: string, concurso: string) => `${norm(nome)}|${norm(concurso)}`;

type ItemEstoque = {
  id: string;
  nome: string;
  concurso: string;
  cotas: number;
  valorCota: number;
  taxa: number;
  data: string;
  situacao: string;
  observacoes: string;
  vendidasLoja: number;
  vendidasMkp: number;
  vendidas: number;
  disponiveis: number;
};

type GrupoEstoque = {
  key: string;
  nome: string;
  concurso: string;
  valorCota: number;
  taxa: number;
  cotas: number;
  vendidasLoja: number;
  vendidasMkp: number;
  vendidas: number;
  disponiveis: number;
  data: string;
  situacao: string;
  rows: ItemEstoque[];
  ids: string[];
};

const input = "h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const btn =
  "h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";

function Estoque() {
  const qc = useQueryClient();
  const estoqueFn = useServerFn(listarEstoque);
  const modelosFn = useServerFn(listarEstoqueBoloes);
  const vendasFn = useServerFn(listarVendasEstoque);
  const criarFn = useServerFn(criarEstoque);
  const situacaoFn = useServerFn(definirSituacaoEstoque);
  const finalizarFn = useServerFn(finalizarEstoque);
  const cotasFn = useServerFn(ajustarCotasEstoque);
  const editarFn = useServerFn(editarEstoque);
  const removerFn = useServerFn(removerEstoque);
  const venderFn = useServerFn(registrarVendaEstoque);
  const removerVendaFn = useServerFn(removerVendaEstoque);
  const proxiFn = useServerFn(buscarProximoConcurso);
  const dataDoConcursoFn = useServerFn(dataDoConcurso);
  const rolarFn = useServerFn(rolarEstoqueProximaRodada);
  const padronizarFn = useServerFn(padronizarBoloes);

  const [situacao, setSituacao] = useState<"todos" | "ativo" | "encerrado" | "finalizado">("ativo");
  const [alerta, setAlerta] = useState<"todos" | "esgotados" | "vencidos">("todos");
  const [expandido, setExpandido] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const [modeloId, setModeloId] = useState("");
  const [nome, setNome] = useState("");
  const [concurso, setConcurso] = useState("");
  const [cotas, setCotas] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [valorCota, setValorCota] = useState("");
  const [taxa, setTaxa] = useState("");
  const [data, setData] = useState("");
  const [modalidade, setModalidade] = useState("");
  const [concursoAuto, setConcursoAuto] = useState(true);
  const [dataAuto, setDataAuto] = useState(true);
  const [fonteConcurso, setFonteConcurso] = useState("");

  const [vendaEstoque, setVendaEstoque] = useState("");
  const [vendaQtd, setVendaQtd] = useState("1");
  const [vendaCanal, setVendaCanal] = useState<"LOJA" | "MARKETPLACE">("LOJA");
  const [vendaData, setVendaData] = useState("");

  useEffect(() => { setData(hojeBr()); setVendaData(hojeBr()); setVgData(hojeBr()); }, []);

  const [vendasDe, setVendasDe] = useState("");
  const [vendasAte, setVendasAte] = useState("");
  const [vendaBolao, setVendaBolao] = useState("");
  const [cotasModal, setCotasModal] = useState<{ nome: string; concurso: string; total: number; vendidas: number; ids: string[] } | null>(null);
  const [cotasValor, setCotasValor] = useState("");
  const [editarModal, setEditarModal] = useState<{ nome: string; concurso: string; valorCota: string; taxa: string; data: string; ids: string[] } | null>(null);
  const [editConcurso, setEditConcurso] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editTaxa, setEditTaxa] = useState("");
  const [editData, setEditData] = useState("");
  const [excluirEstoque, setExcluirEstoque] = useState<{ nome: string; ids: string[]; lotes: number } | null>(null);
  const [excluirVenda, setExcluirVenda] = useState<{ id: string } | null>(null);
  const [vendaGrupo, setVendaGrupo] = useState<GrupoEstoque | null>(null);
  const [vgQtd, setVgQtd] = useState("1");
  const [vgCanal, setVgCanal] = useState<"LOJA" | "MARKETPLACE">("LOJA");
  const [vgData, setVgData] = useState("");
  const [vgErro, setVgErro] = useState("");
  const [relatorioFinal, setRelatorioFinal] = useState<GrupoEstoque | null>(null);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const [padPlano, setPadPlano] = useState<{
    renomearModelos: Array<{ id: string; de: string; para: string }>;
    renomearEstoques: Array<{ de: string; para: string; lotes: number }>;
    fusoes: Array<{
      nome: string;
      manter: string;
      apagar: Array<{ id: string; nome: string }>;
      estoques: number;
    }>;
    resumo: {
      modelosRenomeados: number;
      estoquesRenomeados: number;
      modelosUnidos: number;
      modelosRestantes: number;
    };
  } | null>(null);
  const [padOcupado, setPadOcupado] = useState(false);
  const [padErro, setPadErro] = useState("");
  const criarRef = useRef<HTMLDivElement>(null);

  const tentarDeNovo = { retry: 3, retryDelay: 1500 } as const;

  const lista = useQuery({
    queryKey: ["estoque-boloes", situacao],
    queryFn: () => estoqueFn({ data: { situacao } }),
    ...tentarDeNovo,
  });
  const todos = useQuery({
    queryKey: ["estoque-boloes", "todos"],
    queryFn: () => estoqueFn({ data: { situacao: "todos" } }),
    enabled: Boolean(lista.data?.admin),
    ...tentarDeNovo,
  });
  const proximo = useQuery({
    queryKey: ["proximo-concurso", modalidade],
    queryFn: () => proxiFn({ data: { modalidade } }),
    enabled: Boolean(lista.data?.admin) && Boolean(modalidade) && modalidade !== "outro",
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 1500,
  });
  const modelos = useQuery({
    queryKey: ["boloes-estoque", "ativo"],
    queryFn: () => modelosFn({ data: { situacao: "ativo" } }),
    ...tentarDeNovo,
  });
  const vendas = useQuery({
    queryKey: ["estoque-vendas", vendasDe, vendasAte],
    queryFn: () => vendasFn({ data: { estoqueId: null, de: vendasDe, ate: vendasAte } }),
    ...tentarDeNovo,
  });

  /** Maior concurso da modalidade no estoque + 1 (fallback sem API). */
  const proximoLocal = (modId: string) => {
    let max = 0;
    for (const e of ((todos.data?.estoques ?? []) as ItemEstoque[])) {
      if (achaModalidade(e.nome)?.id !== modId) continue;
      const n = Number(String(e.concurso).trim());
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max > 0 ? max + 1 : 0;
  };

  // Preenche concurso/data com o próximo concurso oficial da Caixa
  // (fallback: último estoque + 1). Nunca sobrescreve o que o usuário digitou.
  useEffect(() => {
    const f = proximo.data;
    if (f?.ok) {
      if (concursoAuto && f.concurso) {
        setConcurso(String(f.concurso));
        setFonteConcurso("oficial");
      }
      if (dataAuto && f.data) setData(f.data);
    } else if (f && !f.ok && modalidade) {
      const n = proximoLocal(modalidade);
      if (concursoAuto && n) {
        setConcurso(String(n));
        setFonteConcurso("estoque");
      }
    }
  }, [proximo.data, concursoAuto, dataAuto, modalidade, todos.data]);

  const atualizarConcurso = async () => {
    if (!modalidade || modalidade === "outro") return;
    try {
      const r = await proxiFn({ data: { modalidade, forcar: true } });
      qc.setQueryData(["proximo-concurso", modalidade], r);
    } catch {
      setErro("Não foi possível consultar a Caixa agora.");
    }
  };

  const caixaErro = proximo.data && !proximo.data.ok ? proximo.data.erro : "";

  const admin = Boolean(lista.data?.admin);
  const estoques = (lista.data?.estoques ?? []) as ItemEstoque[];
  /** Pode receber venda: ativo ou encerrado (vendas atrasadas); nunca finalizado. */
  const vendaveis = useMemo(
    () => estoques.filter((e) => e.situacao === "ativo" || e.situacao === "encerrado"),
    [estoques],
  );

  // Agrupa lotes iguais (mesmo nome+concurso+valor+taxa) em uma linha só.
  const grupos = useMemo(() => {
    const map = new Map<string, GrupoEstoque>();
    for (const e of estoques) {
      const key = chaveGrupo(e.nome, e.concurso, e.valorCota, e.taxa);
      const g = map.get(key);
      if (g) {
        g.rows.push(e);
        g.ids.push(e.id);
        g.cotas += e.cotas;
        g.vendidasLoja += e.vendidasLoja;
        g.vendidasMkp += e.vendidasMkp;
        g.vendidas += e.vendidas;
        g.disponiveis += e.disponiveis;
        if (e.data && (!g.data || e.data < g.data)) g.data = e.data;
        if (g.situacao !== e.situacao) g.situacao = "mistura";
      } else {
        map.set(key, {
          key,
          nome: e.nome,
          concurso: e.concurso,
          valorCota: e.valorCota,
          taxa: e.taxa,
          cotas: e.cotas,
          vendidasLoja: e.vendidasLoja,
          vendidasMkp: e.vendidasMkp,
          vendidas: e.vendidas,
          disponiveis: e.disponiveis,
          data: e.data,
          situacao: e.situacao,
          rows: [e],
          ids: [e.id],
        });
      }
    }
    // Sempre na ordem oficial das modalidades (Mega-Sena, Lotofácil, Quina...),
    // depois pelo número do concurso.
    return [...map.values()].sort(compararBoloes);
  }, [estoques]);

  const vencido = (g: GrupoEstoque) =>
    g.rows.some((r) => r.situacao === "ativo" && r.data && r.data < hojeBr());

  const gruposFiltrados = useMemo(
    () =>
      grupos.filter((g) =>
        alerta === "esgotados" ? g.disponiveis === 0 : alerta === "vencidos" ? vencido(g) : true,
      ),
    [grupos, alerta],
  );

  const resumo = useMemo(() => {
    // Sempre o estoque ATIVO completo (não a aba visualizada).
    const todas = ((todos.data?.estoques ?? estoques) as ItemEstoque[]).filter(
      (e) => e.situacao === "ativo",
    );
    const t = { cotas: 0, vendidas: 0, disp: 0, loja: 0, mkp: 0, faturamento: 0 };
    for (const e of todas) {
      t.cotas += e.cotas;
      t.vendidas += e.vendidas;
      t.disp += e.disponiveis;
      t.loja += e.vendidasLoja;
      t.mkp += e.vendidasMkp;
      t.faturamento += e.vendidas * e.valorCota;
    }
    return t;
  }, [todos.data, estoques]);

  const esgotados = useMemo(() => grupos.filter((g) => g.disponiveis === 0).length, [grupos]);
  const vencidos = useMemo(() => grupos.filter(vencido).length, [grupos]);

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ["estoque-boloes"] });
    void qc.invalidateQueries({ queryKey: ["estoque-vendas"] });
    void qc.invalidateQueries({ queryKey: ["boloes-estoque"] });
    void qc.invalidateQueries({ queryKey: ["lancamentos-simples"] });
    void qc.invalidateQueries({ queryKey: ["modelos-bolao-lancar"] });
  };

  const criarMut = useMutation({
    mutationFn: () =>
      criarFn({
        data: {
          modeloId: modeloId || null,
          nome: nome.trim() || getModalidade(modalidade)?.nome || "",
          concurso: concurso.trim(),
          cotas: Math.round(num(cotas)),
          quantidade: Math.max(1, Math.round(num(quantidade))),
          valorCota: num(valorCota),
          taxa: num(taxa),
          data,
          modalidade,
          observacoes: "",
          salvarModelo: true,
        },
      }),
    onSuccess: (r) => {
      if (!r?.ok) return setErro(r?.erro || "Falha ao criar o estoque.");
      setErro("");
      setAviso(
        `Estoque aberto com ${r.cotas} cota(s).` +
          (r.modeloCriado ? " O modelo novo foi salvo em Modelos." : ""),
      );
      setModeloId("");
      setNome("");
      // Abre o próximo concurso com a data certa DELE: se a Caixa já anunciou
      // o próximo (número + data), usa a data oficial; senão, o próximo dia de
      // sorteio DEPOIS da data do concurso criado (não "a partir de hoje" —
      // isso casava concurso e data errados, ex.: Dupla 3023 com a data 19/10
      // da própria 3022). Auto fica desligado nos dois campos para a dupla
      // não ser sobrescrita enquanto o formulário ainda reflete a criação.
      const criado = Number(concurso.trim());
      const f = proximo.data;
      if (Number.isFinite(criado) && criado > 0) {
        const m = getModalidade(modalidade);
        const dataProx =
          f?.ok && f.concurso === criado + 1 && f.data
            ? f.data
            : (diaSorteioDepoisDe(m, data) ?? proximaDataSorteioISO(m, hojeBr()));
        setConcurso(String(criado + 1));
        setConcursoAuto(false);
        setFonteConcurso("estoque");
        setData(dataProx);
        setDataAuto(false);
      } else {
        setConcurso("");
        setConcursoAuto(true);
        setFonteConcurso("");
        setData(proximaDataSorteioISO(getModalidade(modalidade), hojeBr()));
        setDataAuto(true);
      }
      setCotas("");
      setQuantidade("1");
      setValorCota("");
      setTaxa("");
      invalidar();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao criar o estoque."),
  });

  const modAtual = getModalidade(modalidade);
  const erroDataSorteio = modalidade ? validarDataSorteio(modAtual, data) : null;
  const diasModAtual = diasTexto(modAtual?.dias ?? null);
  const totalPrevisto =
    Math.max(0, Math.round(num(cotas))) * Math.max(1, Math.round(num(quantidade)));

  const trataAcao = {
    onSuccess: (r: { ok: boolean; erro: string }) => {
      if (!r?.ok) return setErro(r?.erro || "Não foi possível concluir a ação.");
      setErro("");
      invalidar();
    },
    onError: (e: unknown) =>
      setErro(e instanceof Error ? e.message : "Não foi possível concluir a ação."),
  };

  const situacaoMut = useMutation({
    mutationFn: (v: { ids: string[]; situacao: "ativo" | "encerrado" }) => situacaoFn({ data: v }),
    ...trataAcao,
  });
  /** Trava o bolão de vez (vendas atrasadas já incluídas) — situação "finalizado". */
  const finalizarMut = useMutation({
    mutationFn: (ids: string[]) => finalizarFn({ data: { ids } }),
    onSuccess: (r) => {
      if (!r?.ok) return setErro(r?.erro || "Não foi possível finalizar.");
      setErro("");
      setAviso(r.finalizados > 0 ? `Bolão finalizado (${r.finalizados} lote(s)).` : "Nada a finalizar.");
      invalidar();
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível finalizar."),
  });
  /** Rola lotes vencidos para o próximo concurso oficial da Caixa. */
  const rolarMut = useMutation({
    mutationFn: (ids: string[]) => rolarFn({ data: { ids } }),
    onSuccess: (r) => {
      if (!r?.ok) return setErro(r?.erro || "Não foi possível atualizar o estoque.");
      setErro("");
      setAviso(
        r.atualizados > 0
          ? `Estoque atualizado: ${r.atualizados} lote(s) na rodada atual` +
              (r.pulados > 0 ? ` · ${r.pulados} mantido(s)` : "") + "."
          : r.detalhes?.[0] || "Nada a atualizar.",
      );
      invalidar();
    },
    onError: (e: unknown) =>
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar o estoque."),
  });
  const cotasMut = useMutation({
    mutationFn: (v: { ids: string[]; total: number }) => cotasFn({ data: v }),
    ...trataAcao,
  });
  const editarMut = useMutation({
    mutationFn: (v: { ids: string[]; concurso: string; valorCota: number; taxa: number; data: string }) =>
      editarFn({ data: v }),
    ...trataAcao,
  });
  const removerMut = useMutation({
    mutationFn: (ids: string[]) => removerFn({ data: { ids } }),
    ...trataAcao,
  });
  const removerVendaMut = useMutation({
    mutationFn: (id: string) => removerVendaFn({ data: { id } }),
    ...trataAcao,
  });

  const venderMut = useMutation({
    mutationFn: () =>
      venderFn({
        data: {
          estoqueId: vendaEstoque,
          quantidade: Math.round(num(vendaQtd)),
          canal: vendaCanal,
          data: vendaData,
          observacoes: "",
        },
      }),
    onSuccess: (r) => {
      if (!r?.ok) return setErro(r?.erro || "Falha ao registrar a venda.");
      setErro("");
      setAviso(`Venda registrada. Restam ${r.disponiveis} cota(s).`);
      setVendaQtd("1");
      invalidar();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao registrar a venda."),
  });

  /** Venda rápida pela linha do grupo: distribui entre os lotes (mais antigos primeiro). */
  const venderGrupoMut = useMutation({
    mutationFn: async (v: { g: GrupoEstoque; qtd: number; canal: "LOJA" | "MARKETPLACE"; data: string }) => {
      const lotes = [...v.g.rows]
        .filter((l) => l.situacao !== "finalizado")
        .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
      let restante = v.qtd;
      for (const l of lotes) {
        if (restante <= 0) break;
        const n = Math.min(restante, l.disponiveis);
        if (n <= 0) continue;
        const r = await venderFn({
          data: { estoqueId: l.id, quantidade: n, canal: v.canal, data: v.data, observacoes: "" },
        });
        if (!r?.ok) throw new Error(r?.erro || "Falha ao registrar a venda.");
        restante -= n;
      }
      if (restante > 0) {
        throw new Error(`Estoque insuficiente: restam ${v.qtd - restante} cota(s).`);
      }
    },
    onSuccess: () => {
      setVendaGrupo(null);
      setVgQtd("1");
      setVgErro("");
      setAviso("Venda registrada.");
      invalidar();
    },
    onError: (e) => setVgErro(e instanceof Error ? e.message : "Falha ao registrar a venda."),
  });

  const abrirVendaGrupo = (g: GrupoEstoque) => {
    setVendaGrupo(g);
    setVgQtd("1");
    setVgCanal("LOJA");
    setVgData(hojeBr());
    setVgErro("");
  };

  const modeloSelecionado = (modelos.data?.boloes ?? []).find((m) => m.id === modeloId);

  // Modelos da modalidade selecionada primeiro (mas os demais continuam visíveis,
  // para produtos próprios como "Mega" que não têm modalidade oficial).
  const modelosVisiveis = useMemo(() => {
    const lista = [...(modelos.data?.boloes ?? [])];
    if (!modalidade) {
      return lista.sort((a, b) =>
        compararBoloes({ nome: a.concurso ?? "" }, { nome: b.concurso ?? "" }),
      );
    }
    return lista.sort((a, b) => {
      const ma = achaModalidade(a.concurso ?? "")?.id === modalidade ? 0 : 1;
      const mb = achaModalidade(b.concurso ?? "")?.id === modalidade ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return compararBoloes({ nome: a.concurso ?? "" }, { nome: b.concurso ?? "" });
    });
  }, [modelos.data, modalidade]);

  // --- Padronização de nomes dos bolões (somente admin) ---
  const verPlanoPadronizar = async () => {
    setPadErro("");
    setPadOcupado(true);
    try {
      const r = await padronizarFn({ data: { aplicar: false } });
      if (!r?.ok) {
        setPadErro(r?.erro || "Falha ao analisar os nomes.");
        return;
      }
      setPadPlano({ ...r.plano, resumo: r.resumo });
    } catch (e) {
      setPadErro(e instanceof Error ? e.message : "Falha ao analisar os nomes.");
    } finally {
      setPadOcupado(false);
    }
  };

  const aplicarPadronizar = async () => {
    setPadErro("");
    setPadOcupado(true);
    try {
      const r = await padronizarFn({ data: { aplicar: true } });
      if (!r?.ok) {
        setPadErro(r?.erro || "Falha ao padronizar.");
        return;
      }
      setPadPlano(null);
      setAviso("Nomes padronizados e modelos duplicados unidos.");
      invalidar();
    } catch (e) {
      setPadErro(e instanceof Error ? e.message : "Falha ao padronizar.");
    } finally {
      setPadOcupado(false);
    }
  };

  /** Último estoque aberto de uma modalidade (para copiar valores). */
  const ultimoDeModalidade = (id: string) => {
    const rows = ((todos.data?.estoques ?? []) as ItemEstoque[]).filter(
      (e) => achaModalidade(e.nome)?.id === id,
    );
    rows.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
    return rows[0];
  };

  /**
   * Abertura rápida: ao trocar a modalidade, ajusta a data para o próximo
   * sorteio (se a atual não for dia válido) e copia valor/taxa/nome/cotas do
   * último estoque daquela modalidade quando os campos estiverem vazios.
   */
  const aplicaModalidade = (novoId: string, forcar = false) => {
    const mudou = novoId !== modalidade;
    setModalidade(novoId);
    if (mudou) {
      setConcurso("");
      setConcursoAuto(true);
      setFonteConcurso("");
    }
    const m = getModalidade(novoId);
    const dataAtual = data || hojeBr();
    if (validarDataSorteio(m, dataAtual)) {
      setData(proximaDataSorteioISO(m, hojeBr()));
      setDataAuto(true);
    }
    if (!novoId || modeloId) return;
    const ult = ultimoDeModalidade(novoId);
    if (!ult) return;
    if (forcar || !valorCota.trim()) setValorCota(String(ult.valorCota).replace(".", ","));
    if (forcar || !taxa.trim()) setTaxa(String(ult.taxa).replace(".", ","));
    if (forcar || !nome.trim()) setNome(ult.nome);
    if (forcar || !cotas.trim()) setCotas(String(ult.cotas));
  };

  /** Preenche o formulário para abrir um novo concurso a partir de um grupo. */
  const novoConcurso = (g: GrupoEstoque) => {
    const m = achaModalidade(g.nome);
    setModeloId("");
    setNome(g.nome);
    setConcurso("");
    setConcursoAuto(true);
    setFonteConcurso("");
    setModalidade(m?.id ?? "");
    setValorCota(String(g.valorCota).replace(".", ","));
    setTaxa(String(g.taxa).replace(".", ","));
    setCotas(String(g.rows[0]?.cotas ?? ""));
    setQuantidade("1");
    setData(proximaDataSorteioISO(m, hojeBr()));
    setDataAuto(true);
    setErro("");
    criarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const abrirEditar = (g: GrupoEstoque) => {
    setEditConcurso(g.concurso);
    setEditValor(String(g.valorCota).replace(".", ","));
    setEditTaxa(String(g.taxa).replace(".", ","));
    setEditData(g.data || hojeBr());
    setEditarModal({
      nome: g.nome,
      concurso: g.concurso,
      valorCota: String(g.valorCota),
      taxa: String(g.taxa),
      data: g.data,
      ids: g.ids,
    });
  };

  const erroEditData = editarModal
    ? validarDataSorteio(achaModalidade(editarModal.nome), editData)
    : null;

  // Vendas filtradas pelo bolão escolhido (rodapé com totais do período).
  const opcoesBolao = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of estoques) {
      const k = chaveBolao(e.nome, e.concurso);
      if (!m.has(k)) m.set(k, `${e.nome}${e.concurso ? ` — ${e.concurso}` : ""}`);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [estoques]);
  const vendasFiltradas = useMemo(
    () =>
      (vendas.data ?? []).filter(
        (v) => !vendaBolao || chaveBolao(v.nome, v.concurso) === vendaBolao,
      ),
    [vendas.data, vendaBolao],
  );
  const totaisVendas = useMemo(
    () =>
      vendasFiltradas.reduce(
        (s, v) => ({ cotas: s.cotas + v.quantidade, valor: s.valor + v.valorTotal, taxa: s.taxa + v.taxaTotal }),
        { cotas: 0, valor: 0, taxa: 0 },
      ),
    [vendasFiltradas],
  );

  // Vendas de hoje em bolões ativos (loja · marketplace), para o resumo do topo.
  const vendasHoje = useMemo(() => {
    const hj = hojeBr();
    const base = ((todos.data?.estoques ?? estoques) as ItemEstoque[]).filter(
      (e) => e.situacao === "ativo",
    );
    const ids = new Set(base.map((e) => e.id));
    let loja = 0;
    let mkp = 0;
    let valor = 0;
    for (const v of (vendas.data ?? [])) {
      if (v.data !== hj || !ids.has(v.estoqueId)) continue;
      if (v.canal === "LOJA") loja += v.quantidade;
      else mkp += v.quantidade;
      valor += v.valorTotal;
    }
    return { loja, mkp, total: loja + mkp, valor: Math.round(valor * 100) / 100 };
  }, [vendas.data, todos.data, estoques]);

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <AppNav />

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Estoque de bolões</h1>
            <p className="text-sm text-muted-foreground">
              Crie o estoque com um modelo já cadastrado ou com um modelo novo — o modelo novo entra
              automaticamente na lista de modelos — e controle as vendas de cotas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-muted no-print"
          >
            Imprimir
          </button>
        </header>

        <section className="order-1 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              { rotulo: "Cotas abertas", valor: String(resumo.cotas) },
              { rotulo: "Vendidas", valor: String(resumo.vendidas) },
              { rotulo: "Saldo", valor: String(resumo.disp) },
              {
                rotulo: "Vendidas hoje",
                valor: String(vendasHoje.total),
                nota: `loja ${vendasHoje.loja} · mkp ${vendasHoje.mkp} · ${brl(vendasHoje.valor)}`,
              },
              ...(admin
                ? [
                    { rotulo: "Loja", valor: String(resumo.loja) },
                    { rotulo: "Mkp", valor: String(resumo.mkp) },
                    { rotulo: "Faturamento", valor: brl(resumo.faturamento) },
                  ]
                : []),
            ] as Array<{ rotulo: string; valor: string; nota?: string }>).map((c) => (
              <div key={c.rotulo} className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
                <p className="text-[11px] uppercase text-muted-foreground">{c.rotulo}</p>
                <p className="text-lg font-semibold text-foreground">{c.valor}</p>
                {c.nota && <p className="text-[11px] text-muted-foreground">{c.nota}</p>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            <strong className="text-foreground">Cotas abertas</strong>: total criado ·{" "}
            <strong className="text-foreground">Vendidas</strong>: já vendidas (loja + marketplace) ·{" "}
            <strong className="text-foreground">Saldo</strong>: ainda dá para vender ·{" "}
            <strong className="text-foreground">Disponíveis</strong>: o mesmo que saldo, por bolão
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["todos", "esgotados", "vencidos"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAlerta(a)}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  alerta === a
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {a} ({a === "todos" ? grupos.length : a === "esgotados" ? esgotados : vencidos})
              </button>
            ))}
            {admin && vencidos > 0 && (
              <>
                <button
                  type="button"
                  disabled={rolarMut.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Atualizar ${vencidos} grupo(s) vencido(s) para o próximo concurso oficial da Caixa? O número do concurso e a data do sorteio passam a ser os da rodada em vigência — cotas e preços ficam iguais.`,
                      )
                    )
                      return;
                    rolarMut.mutate([]);
                  }}
                  className="ml-auto rounded-md border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  {rolarMut.isPending ? "Atualizando..." : "Atualizar para próxima rodada"}
                </button>
                <button
                  type="button"
                  disabled={situacaoMut.isPending}
                  onClick={() =>
                    situacaoMut.mutate({
                      ids: grupos.filter(vencido).flatMap((g) => g.ids),
                      situacao: "encerrado",
                    })
                  }
                  className="rounded-md border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Encerrar vencidos
                </button>
              </>
            )}
          </div>
        </section>

        <details className="order-4 rounded-xl border border-border bg-card p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Vender avulso — escolher o bolão na lista (opcional; também dá para usar o botão
            <span className="text-primary"> Vender </span>
            na linha de cada bolão)
          </summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!vendaEstoque) return setErro("Escolha o bolão do estoque.");
              if (Math.round(num(vendaQtd)) < 1) return setErro("Informe a quantidade de cotas.");
              venderMut.mutate();
            }}
            className="grid gap-3 sm:grid-cols-4 pt-4"
          >
            <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
              Bolão
              <select
                value={vendaEstoque}
                onChange={(e) => setVendaEstoque(e.target.value)}
                className={input}
              >
                <option value="">Selecione</option>
                {[...vendaveis].sort(compararBoloes).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                    {e.concurso ? ` — ${e.concurso}` : ""} ({e.disponiveis} disp.)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Cotas
              <input
                value={vendaQtd}
                onChange={(e) => setVendaQtd(e.target.value)}
                inputMode="numeric"
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Canal
              <select
                value={vendaCanal}
                onChange={(e) => setVendaCanal(e.target.value as "LOJA" | "MARKETPLACE")}
                className={input}
              >
                <option value="LOJA">Loja</option>
                <option value="MARKETPLACE">Marketplace</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Data
              <input
                type="date"
                value={vendaData}
                onChange={(e) => setVendaData(e.target.value)}
                className={input}
              />
            </label>
            <div className="sm:col-span-4">
              <button type="submit" disabled={venderMut.isPending} className={btn}>
                {venderMut.isPending ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Registrando...</span>
                ) : (
                  "Registrar venda"
                )}
              </button>
            </div>
          </form>
        </details>

        {admin && (
          <section ref={criarRef} className="order-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Criar estoque
                </h2>
                <button
                  type="button"
                  onClick={() => void verPlanoPadronizar()}
                  disabled={padOcupado}
                  className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {padOcupado ? "Analisando..." : "Padronizar nomes dos bolões"}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Escolha a modalidade, o modelo salvo e as cotas — concurso e datas ficam em Mais opções.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!modalidade) return setErro("Escolha a modalidade do bolão.");
                if (!modeloId && !nome.trim() && !getModalidade(modalidade)?.nome)
                  return setErro("Escolha um modelo ou informe o nome.");
                if (Math.round(num(cotas)) < 1) return setErro("Informe a quantidade de cotas.");
                if (erroDataSorteio) return setErro(erroDataSorteio);
                setErro("");
                criarMut.mutate();
              }}
              className="grid gap-3 sm:grid-cols-3 pt-4"
            >
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Modalidade
                <select
                  value={modalidade}
                  onChange={(e) => aplicaModalidade(e.target.value)}
                  className={input}
                >
                  <option value="">Selecione</option>
                  {MODALIDADES_LOTERIA.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Cotas
                <input
                  value={cotas}
                  onChange={(e) => setCotas(e.target.value)}
                  inputMode="numeric"
                  placeholder="20"
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Modelo
                <select
                  value={modeloId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const m = (modelos.data?.boloes ?? []).find((x) => x.id === id);
                    if (m) {
                      const achada = achaModalidade(m.concurso ?? "");
                      if (achada) aplicaModalidade(achada.id);
                      setModeloId(id);
                      setValorCota(String(m.valorCota).replace(".", ","));
                      setTaxa(String(m.taxa).replace(".", ","));
                    } else {
                      setModeloId("");
                    }
                  }}
                  className={input}
                >
                  <option value="">Novo modelo (informar abaixo)</option>
                  {modelosVisiveis.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.concurso} — {brl(m.valorCota)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Nome do bolão novo
                <input
                  value={modeloId ? (modeloSelecionado?.concurso ?? "") : nome}
                  onChange={(e) => setNome(e.target.value)}
                  disabled={Boolean(modeloId)}
                  placeholder="Bolão Mega-Sena 10 cotas"
                  className={`${input} disabled:opacity-60`}
                  onBlur={() => {
                    if (!nome.trim()) return;
                    const achada = achaModalidade(nome);
                    if (achada && !modalidade) aplicaModalidade(achada.id);
                  }}
                />
              </label>
              {maisOpcoes && (
                <>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Concurso
                <input
                  value={concurso}
                  onChange={(e) => {
                    setConcurso(e.target.value);
                    setConcursoAuto(false);
                    setFonteConcurso("");
                  }}
                  onBlur={() => {
                    // Concurso digitado na mão: a data automática passa a
                    // valer para ELE (ex.: digitar 3073 na data da 3072).
                    // Se o usuário já mexeu na data, não sobrescreve.
                    if (!dataAuto || !modalidade || modalidade === "outro") return;
                    const n = Number(concurso.replace(/\D+/g, ""));
                    if (!Number.isFinite(n) || n <= 0) return;
                    const dataNoMomento = data;
                    dataDoConcursoFn({ data: { modalidade, concurso: n } })
                      .then((r) => {
                        if (!r?.ok) return;
                        setData((d) => (d === dataNoMomento ? r.data : d));
                      })
                      .catch(() => {});
                  }}
                  placeholder="2820"
                  className={input}
                />
                <span className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-muted-foreground">
                    {proximo.isFetching
                      ? "Buscando concurso..."
                      : fonteConcurso === "oficial"
                        ? "Próximo concurso oficial (Caixa)"
                        : fonteConcurso === "estoque"
                          ? `Estimado pelo último estoque${caixaErro ? ` — Caixa: ${caixaErro}` : ""}`
                          : ""}
                  </span>
                  {modalidade && modalidade !== "outro" && (
                    <button
                      type="button"
                      onClick={() => void atualizarConcurso()}
                      className="shrink-0 text-primary hover:underline"
                    >
                      Atualizar
                    </button>
                  )}
                </span>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Quantidade de bolões
                <input
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  inputMode="numeric"
                  placeholder="1"
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Data do sorteio
                <input
                  type="date"
                  value={data}
                  onChange={(e) => {
                    setData(e.target.value);
                    setDataAuto(false);
                  }}
                  className={`${input} ${erroDataSorteio ? "border-destructive" : ""}`}
                />
                {diasModAtual && (
                  <span className={`text-[11px] ${erroDataSorteio ? "text-destructive" : "text-muted-foreground"}`}>
                    {erroDataSorteio ?? `Sorteios: ${diasModAtual}`}
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Valor da cota
                <input
                  value={valorCota}
                  onChange={(e) => setValorCota(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Taxa por cota
                <input
                  value={taxa}
                  onChange={(e) => setTaxa(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className={input}
                />
              </label>
                </>
              )}
              <div className="flex flex-col gap-1 sm:col-span-3">
                {totalPrevisto > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Total de cotas: <strong className="text-foreground">{totalPrevisto}</strong>
                    {" · "}
                    Faturamento potencial:{" "}
                    <strong className="text-foreground">{brl(totalPrevisto * num(valorCota))}</strong>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" disabled={criarMut.isPending} className={btn}>
                    {criarMut.isPending ? (
                      <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Criando...</span>
                    ) : (
                      "Criar estoque"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaisOpcoes((v) => !v)}
                    className="h-10 rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    {maisOpcoes ? "Menos opções ▴" : "Mais opções ▾"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {erro && (
          <p className="order-first rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {erro}
          </p>
        )}
        {aviso && !erro && (
          <p className="order-first rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            {aviso}
          </p>
        )}

        <section className="order-2 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Estoque
              </h2>
              {admin && (
                <div className="ml-auto inline-flex rounded-md border border-input p-0.5">
                  {(["ativo", "encerrado", "finalizado", "todos"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSituacao(s)}
                      className={`rounded px-2 py-1 text-xs font-medium capitalize transition-colors ${
                        situacao === s
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cada linha é um bolão (nome + concurso); lotes iguais ficam juntos. Clique no nome
              para ver os lotes, ou em <span className="text-primary">Vender</span> para registrar
              uma venda.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-2">Data</th>
                  <th className="py-2 pr-2">Bolão</th>
                  <th className="py-2 pr-2 hidden sm:table-cell">Concurso</th>
                  <th className="py-2 pr-2 text-right hidden sm:table-cell">Cotas totais</th>
                  {admin && <th className="py-2 pr-2 text-right hidden sm:table-cell">Loja</th>}
                  {admin && <th className="py-2 pr-2 text-right hidden sm:table-cell">Mkp</th>}
                  <th className="py-2 pr-2 text-right">Disponíveis</th>
                  <th className="py-2 pr-2 text-right hidden sm:table-cell">Progresso</th>
                  <th className="py-2 pr-2 text-right hidden sm:table-cell">Valor da cota</th>
                  <th className="py-2 pr-2" />
                </tr>
              </thead>
              <tbody>
                {gruposFiltrados.map((g) => {
                  const pct = g.cotas > 0 ? Math.round((g.vendidas / g.cotas) * 100) : 0;
                  const encerrado = g.situacao === "encerrado";
                  const finalizado = g.situacao === "finalizado";
                  const temFinalizado = g.rows.some((r) => r.situacao === "finalizado");
                  const mistura = g.situacao === "mistura";
                  const aberto = expandido === g.key;
                  return (
                    <GrupoLinha
                      key={g.key}
                      g={g}
                      admin={admin}
                      pct={pct}
                      encerrado={encerrado}
                      finalizado={finalizado}
                      temFinalizado={temFinalizado}
                      mistura={mistura}
                      aberto={aberto}
                      onExpandir={() => setExpandido(aberto ? "" : g.key)}
                      onVender={() => abrirVendaGrupo(g)}
                      onNovoConcurso={() => novoConcurso(g)}
                      onFinalizar={() => {
                        const sobra = Math.max(0, g.disponiveis);
                        const perda = sobra * g.valorCota;
                        const okFinalizar = window.confirm(
                          `Finalizar ${g.nome}${g.concurso ? ` — concurso ${g.concurso}` : ""}?` +
                            "\n\nDepois de finalizado o bolão não aceita mais vendas nem reativação." +
                            `\nSobra atual: ${sobra} cota(s) · Perda: ${brl(perda)}`,
                        );
                        if (okFinalizar) finalizarMut.mutate(g.ids);
                      }}
                      onRelatorio={() => setRelatorioFinal(g)}
                      onCotas={() => {
                        setCotasValor(String(g.cotas));
                        setCotasModal({
                          nome: g.nome,
                          concurso: g.concurso,
                          total: g.cotas,
                          vendidas: g.vendidas,
                          ids: g.ids,
                        });
                      }}
                      onSituacao={() =>
                        situacaoMut.mutate({
                          ids: g.ids,
                          situacao: encerrado ? "ativo" : "encerrado",
                        })
                      }
                      onEditar={() => abrirEditar(g)}
                      onExcluir={() =>
                        setExcluirEstoque({
                          nome: `${g.nome}${g.concurso ? ` — ${g.concurso}` : ""}`,
                          ids: g.ids,
                          lotes: g.rows.length,
                        })
                      }
                    />
                  );
                })}
                {gruposFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={admin ? 10 : 8} className="py-8 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="h-8 w-8 opacity-40" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        {alerta !== "todos" ? "Nenhum item neste filtro." : "Nenhum estoque cadastrado."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="order-5 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                Vendas registradas
              </h2>
              <div className="ml-auto flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Bolão
                  <select
                    value={vendaBolao}
                    onChange={(e) => setVendaBolao(e.target.value)}
                    className={`${input} min-w-40`}
                  >
                    <option value="">Todos</option>
                    {opcoesBolao.map(([k, rotulo]) => (
                      <option key={k} value={k}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  De
                  <input
                    type="date"
                    value={vendasDe}
                    onChange={(e) => setVendasDe(e.target.value)}
                    className={input}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Até
                  <input
                    type="date"
                    value={vendasAte}
                    onChange={(e) => setVendasAte(e.target.value)}
                    className={input}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setVendasDe("");
                    setVendasAte("");
                  }}
                  className="h-10 rounded-md border border-input px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-2">Data</th>
                  <th className="py-2 pr-2">Bolão</th>
                  <th className="py-2 pr-2">Canal</th>
                  <th className="py-2 pr-2">Operador</th>
                  <th className="py-2 pr-2 text-right">Cotas</th>
                  <th className="py-2 pr-2 text-right">Valor</th>
                  <th className="py-2 pr-2 text-right">Taxa</th>
                  {admin && <th className="py-2 pr-2" />}
                </tr>
              </thead>
              <tbody>
                {vendasFiltradas.map((v) => (
                  <tr key={v.id} className="border-b border-border/60 transition-colors hover:bg-secondary/30">
                    <td className="py-2 pr-2">{dataBr(v.data)}</td>
                    <td className="py-2 pr-2">
                      {v.nome}
                      {v.concurso ? ` — ${v.concurso}` : ""}
                    </td>
                    <td className="py-2 pr-2">{v.canal === "LOJA" ? "Loja" : "Marketplace"}</td>
                    <td className="py-2 pr-2">{v.operador}</td>
                    <td className="py-2 pr-2 text-right font-medium">{v.quantidade}</td>
                    <td className="py-2 pr-2 text-right font-medium">{brl(v.valorTotal)}</td>
                    <td className="py-2 pr-2 text-right font-medium">{brl(v.taxaTotal)}</td>
                    {admin && (
                      <td className="py-2 pr-2 text-right">
                        <button
                          type="button"
                          className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => setExcluirVenda({ id: v.id })}
                        >
                          Excluir
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {vendasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={admin ? 8 : 7} className="py-8 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="h-8 w-8 opacity-40" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                        </svg>
                        Nenhuma venda registrada.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              {vendasFiltradas.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border text-sm font-semibold text-foreground">
                    <td className="py-2 pr-2" colSpan={4}>
                      Total — {vendasFiltradas.length} venda(s)
                    </td>
                    <td className="py-2 pr-2 text-right">{totaisVendas.cotas}</td>
                    <td className="py-2 pr-2 text-right">{brl(totaisVendas.valor)}</td>
                    <td className="py-2 pr-2 text-right">{brl(totaisVendas.taxa)}</td>
                    {admin && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>

      {padPlano && (() => {
        const r = padPlano.resumo;
        const linhas: Array<{ de: string; para: string; extra?: string }> = [];
        for (const x of padPlano.renomearModelos) {
          linhas.push({ de: x.de, para: x.para, extra: "modelo" });
        }
        for (const x of padPlano.renomearEstoques) {
          linhas.push({ de: x.de, para: x.para, extra: `${x.lotes} lote(s)` });
        }
        for (const f of padPlano.fusoes) {
          for (const a of f.apagar) {
            linhas.push({ de: a.nome, para: f.nome, extra: "modelo duplicado — será unido" });
          }
        }
        const totalMudancas =
          r.modelosRenomeados + r.estoquesRenomeados + r.modelosUnidos;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
              <h3 className="text-base font-semibold text-foreground">
                Padronizar nomes dos bolões
              </h3>
              {padErro && (
                <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {padErro}
                </div>
              )}
              {totalMudancas === 0 ? (
                <>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Tudo já está padronizado: nenhum nome fora do padrão e nenhum
                    modelo duplicado.
                  </p>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setPadPlano(null)}
                      className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
                    >
                      Fechar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Serão ajustados {r.modelosRenomeados + r.modelosUnidos} modelo(s) e{" "}
                    {r.estoquesRenomeados} lote(s) de estoque, restando {r.modelosRestantes}{" "}
                    modelo(s). Os nomes servem só para exibição e agrupamento — nenhum valor
                    de venda é alterado.
                  </p>
                  <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto text-sm">
                    {linhas.slice(0, 15).map((l, i) => (
                      <li key={`${l.de}-${i}`} className="rounded-md border border-border/60 bg-secondary/30 px-2 py-1">
                        <span className="text-muted-foreground line-through">{l.de}</span>
                        {" → "}
                        <span className="font-medium text-foreground">{l.para}</span>
                        {l.extra && (
                          <span className="ml-1 text-xs text-muted-foreground">({l.extra})</span>
                        )}
                      </li>
                    ))}
                    {linhas.length > 15 && (
                      <li className="px-2 py-1 text-xs text-muted-foreground">
                        + {linhas.length - 15} alteração(ões) ainda
                      </li>
                    )}
                  </ul>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPadPlano(null)}
                      className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void aplicarPadronizar()}
                      disabled={padOcupado}
                      className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {padOcupado ? "Aplicando..." : "Aplicar"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {vendaGrupo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Vender cotas</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {vendaGrupo.nome}
              {vendaGrupo.concurso ? ` — ${vendaGrupo.concurso}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {vendaGrupo.disponiveis} cota(s) disponível(is) · Cota {brl(vendaGrupo.valorCota)}
              {vendaGrupo.taxa > 0 ? ` · Taxa ${brl(vendaGrupo.taxa)}` : ""}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                Quantidade de cotas
                <input
                  autoFocus
                  inputMode="numeric"
                  value={vgQtd}
                  onChange={(e) => setVgQtd(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-center text-xl font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Canal
                <select
                  value={vgCanal}
                  onChange={(e) => setVgCanal(e.target.value as "LOJA" | "MARKETPLACE")}
                  className={input}
                >
                  <option value="LOJA">Loja</option>
                  <option value="MARKETPLACE">Marketplace</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Data
                <input
                  type="date"
                  value={vgData}
                  onChange={(e) => setVgData(e.target.value)}
                  className={input}
                />
              </label>
            </div>
            {vgErro && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {vgErro}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setVendaGrupo(null)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const qtd = Math.round(num(vgQtd));
                  if (qtd < 1) return setVgErro("Informe a quantidade de cotas.");
                  if (qtd > vendaGrupo.disponiveis)
                    return setVgErro(`Estoque insuficiente: restam ${vendaGrupo.disponiveis} cota(s).`);
                  setVgErro("");
                  venderGrupoMut.mutate({ g: vendaGrupo, qtd, canal: vgCanal, data: vgData || hojeBr() });
                }}
                disabled={venderGrupoMut.isPending}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {venderGrupoMut.isPending ? "Registrando..." : "Registrar venda"}
              </button>
            </div>
          </div>
        </div>
      )}

      {relatorioFinal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Relatório final do bolão</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {relatorioFinal.nome}
              {relatorioFinal.concurso ? ` — ${relatorioFinal.concurso}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Cota {brl(relatorioFinal.valorCota)}
              {relatorioFinal.taxa > 0 ? ` · Taxa ${brl(relatorioFinal.taxa)}` : ""}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Cotas totais</dt>
              <dd className="text-right font-medium text-foreground">{relatorioFinal.cotas}</dd>
              <dt className="text-muted-foreground">Vendidas (loja)</dt>
              <dd className="text-right font-medium text-foreground">{relatorioFinal.vendidasLoja}</dd>
              <dt className="text-muted-foreground">Vendidas (marketplace)</dt>
              <dd className="text-right font-medium text-foreground">{relatorioFinal.vendidasMkp}</dd>
              <dt className="text-muted-foreground">Vendidas (total)</dt>
              <dd className="text-right font-medium text-foreground">{relatorioFinal.vendidas}</dd>
              <dt className="text-muted-foreground">Sobra (não vendidas)</dt>
              <dd className="text-right font-medium text-foreground">
                {Math.max(0, relatorioFinal.disponiveis)} cota(s)
              </dd>
              <dt className="font-semibold text-foreground">Perda (sobra × cota)</dt>
              <dd className="text-right font-semibold text-destructive">
                {brl(Math.max(0, relatorioFinal.disponiveis) * relatorioFinal.valorCota)}
              </dd>
            </dl>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setRelatorioFinal(null)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {cotasModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Editar cotas do grupo</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {cotasModal.nome}
              {cotasModal.concurso ? ` — ${cotasModal.concurso}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Total atual: {cotasModal.total} cotas em {cotasModal.ids.length} lote(s) ·{" "}
              {cotasModal.vendidas} já vendidas
            </p>
            <label className="mt-3 block text-xs text-muted-foreground">
              Novo total de cotas
              <input
                type="number"
                value={cotasValor}
                onChange={(e) => setCotasValor(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cada lote mantém o que já foi vendido; a diferença entra no primeiro lote. Não pode
              ficar abaixo de {cotasModal.vendidas}.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setCotasModal(null)} className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent">Cancelar</button>
              <button
                onClick={() => { cotasMut.mutate({ ids: cotasModal.ids, total: Math.round(num(cotasValor)) }); setCotasModal(null); }}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >Salvar</button>
            </div>
          </div>
        </div>
      )}

      {editarModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Editar estoque</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {editarModal.nome} — {editarModal.ids.length} lote(s)
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                Concurso
                <input value={editConcurso} onChange={(e) => setEditConcurso(e.target.value)} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Valor da cota
                <input value={editValor} onChange={(e) => setEditValor(e.target.value)} inputMode="decimal" className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Taxa por cota
                <input value={editTaxa} onChange={(e) => setEditTaxa(e.target.value)} inputMode="decimal" className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                Data do sorteio
                <input
                  type="date"
                  value={editData}
                  onChange={(e) => setEditData(e.target.value)}
                  className={`${input} ${erroEditData ? "border-destructive" : ""}`}
                />
                {erroEditData && <span className="text-[11px] text-destructive">{erroEditData}</span>}
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditarModal(null)} className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent">Cancelar</button>
              <button
                disabled={editarMut.isPending || Boolean(erroEditData)}
                onClick={() => {
                  editarMut.mutate({
                    ids: editarModal.ids,
                    concurso: editConcurso.trim(),
                    valorCota: num(editValor),
                    taxa: num(editTaxa),
                    data: editData,
                  });
                  setEditarModal(null);
                }}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >Salvar</button>
            </div>
          </div>
        </div>
      )}

      {excluirEstoque && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Excluir estoque</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Excluir <strong>{excluirEstoque.nome}</strong> e seus {excluirEstoque.lotes} lote(s)?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setExcluirEstoque(null)} className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent">Cancelar</button>
              <button
                onClick={() => { removerMut.mutate(excluirEstoque.ids); setExcluirEstoque(null); }}
                className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:opacity-90"
              >Excluir</button>
            </div>
          </div>
        </div>
      )}

      {excluirVenda && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Excluir venda</h3>
            <p className="mt-2 text-sm text-muted-foreground">Tem certeza que deseja excluir esta venda?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setExcluirVenda(null)} className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent">Cancelar</button>
              <button
                onClick={() => { removerVendaMut.mutate(excluirVenda.id); setExcluirVenda(null); }}
                className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:opacity-90"
              >Excluir</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

type PropsGrupo = {
  g: GrupoEstoque;
  admin: boolean;
  pct: number;
  encerrado: boolean;
  finalizado: boolean;
  temFinalizado: boolean;
  mistura: boolean;
  aberto: boolean;
  onExpandir: () => void;
  onVender: () => void;
  onNovoConcurso: () => void;
  onFinalizar: () => void;
  onRelatorio: () => void;
  onCotas: () => void;
  onSituacao: () => void;
  onEditar: () => void;
  onExcluir: () => void;
};

function GrupoLinha({
  g,
  admin,
  pct,
  encerrado,
  finalizado,
  temFinalizado,
  mistura,
  aberto,
  onExpandir,
  onVender,
  onNovoConcurso,
  onFinalizar,
  onRelatorio,
  onCotas,
  onSituacao,
  onEditar,
  onExcluir,
}: PropsGrupo) {
  const colSpan = admin ? 10 : 8;
  const acaoBtn =
    "rounded border border-input px-2 py-1 text-xs text-foreground hover:bg-accent";
  return (
    <>
      <tr
        style={getLoteriaRowStyle(g.nome)}
        className="border-b border-border/60 transition-colors hover:bg-secondary/30"
      >
        <td className="py-2 pr-2 align-top">{dataBr(g.data)}</td>
        <td className="py-2 pr-2 align-top">
          <button
            type="button"
            onClick={onExpandir}
            className="flex items-center gap-1 text-left hover:underline"
          >
            <span className="font-medium text-foreground">{g.nome}</span>
            <span className="text-xs text-muted-foreground">{aberto ? "▾" : "▸"}</span>
          </button>
          {/* No celular as colunas de concurso/valor ficam escondidas: mostram aqui. */}
          <span className="block text-xs text-muted-foreground sm:hidden">
            {g.concurso || "—"} · {g.disponiveis} disponíveis
          </span>
          {g.rows.length > 1 && (
            <span className="block text-xs text-muted-foreground">{g.rows.length} lotes</span>
          )}
          {finalizado && <span className="block text-xs font-medium text-muted-foreground">Finalizado</span>}
          {!finalizado && encerrado && <span className="block text-xs text-muted-foreground">Encerrado</span>}
          {!finalizado && !encerrado && mistura && (
            <span className="block text-xs text-muted-foreground">Parcial</span>
          )}
        </td>
        <td className="py-2 pr-2 align-top hidden sm:table-cell">{g.concurso || "—"}</td>
        <td className="py-2 pr-2 text-right align-top font-medium hidden sm:table-cell">{g.cotas}</td>
        {admin && (
          <td className="py-2 pr-2 text-right align-top font-medium hidden sm:table-cell">{g.vendidasLoja}</td>
        )}
        {admin && (
          <td className="py-2 pr-2 text-right align-top font-medium hidden sm:table-cell">{g.vendidasMkp}</td>
        )}
        <td className="py-2 pr-2 text-right align-top font-medium">{g.disponiveis}</td>
        <td className="py-2 pr-2 align-top hidden sm:table-cell">
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span className="w-9 text-right text-xs text-muted-foreground">{pct}%</span>
          </div>
        </td>
        <td className="py-2 pr-2 text-right align-top font-medium hidden sm:table-cell">{brl(g.valorCota)}</td>
        <td className="py-2 pr-2 align-top">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onVender}
              disabled={finalizado || g.disponiveis === 0}
              title={
                finalizado
                  ? "Bolão finalizado — não aceita mais vendas"
                  : g.disponiveis === 0
                    ? "Esgotado"
                    : encerrado
                      ? "Registrar venda atrasada (bolão encerrado)"
                      : "Registrar venda rápida"
              }
              className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
            >
              Vender
            </button>
            {admin && (
              <>
              <button
                type="button"
                onClick={onNovoConcurso}
                title="Preencher o formulário para o próximo concurso"
                className={acaoBtn}
              >
                Próximo concurso
              </button>
                <button type="button" onClick={onEditar} className={acaoBtn}>
                  Editar
                </button>
                <button type="button" onClick={onCotas} className={acaoBtn}>
                  Cotas
                </button>
                {!temFinalizado && (
                  <button type="button" onClick={onSituacao} className={acaoBtn}>
                    {encerrado ? "Reativar" : "Encerrar"}
                  </button>
                )}
                {encerrado && (
                  <button
                    type="button"
                    onClick={onFinalizar}
                    title="Travar o bolão de vez e ver a sobra/perda"
                    className={acaoBtn}
                  >
                    Finalizar
                  </button>
                )}
                {finalizado && (
                  <button
                    type="button"
                    onClick={onRelatorio}
                    title="Vendidas, sobra e perda"
                    className={acaoBtn}
                  >
                    Relatório
                  </button>
                )}
                <button
                  type="button"
                  onClick={onExcluir}
                  className="rounded border border-input px-2 py-1 text-xs text-destructive hover:bg-accent"
                >
                  Excluir
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {aberto && (
        <tr className="border-b border-border/60 bg-secondary/20">
          <td colSpan={colSpan} className="px-4 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {g.rows.map((r, i) => (
                <span
                  key={r.id}
                  className="rounded border border-border bg-background px-2 py-1 text-muted-foreground"
                >
                  Lote {i + 1} · {dataBr(r.data)} · {r.cotas} cotas · {r.vendidas} vend. ·{" "}
                  {r.disponiveis} disp.
                </span>
              ))}
              {admin && (
                <button
                  type="button"
                  onClick={onNovoConcurso}
                  className="rounded border border-dashed border-input px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
                >
                  + Próximo concurso
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
