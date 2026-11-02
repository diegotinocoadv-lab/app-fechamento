import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { getLoteriaDotColor, getLoteriaRowStyle } from "@/lib/loteria-colors";
import { X } from "lucide-react";
import { toast } from "sonner";

import {
  IMPORT_STORAGE_KEY, brlSinal, classeDiferenca, type FechamentoImportado,
  VALOR_CAMPOS, type ValorKey, SALDO_ITENS, type SaldoKey, type Saldo,
  saldoVazio, valoresVazios, brl, num, agruparBoloesLanc, type Bolao as BaseBolao
} from "@/lib/fechamento-campos";
import { gerarDocFechamento } from "@/lib/fechamento-pdf";
import { salvarFechamento } from "@/lib/fechamento.functions";
import { obterFechamento } from "@/lib/fechamentos.functions";
import { caixaDoOperador, meuCaixa } from "@/lib/caixas.functions";
import { Loader2 } from "lucide-react";
import { resumoBoloesDia } from "@/lib/boloes.functions";
import { listarEstoque } from "@/lib/estoque-boloes.functions";
import {
  compararBoloes, achaModalidade, getModalidade,
} from "@/lib/loterias-sorteio";
import { concursoPorData } from "@/lib/caixa-loterias.functions";
import { listarLancamentosSimples } from "@/lib/lancamentos-simples.functions";
import { listarOperadoresAtivos } from "@/lib/operadores.functions";
import { meuAcesso } from "@/lib/usuarios.functions";


export const Route = createFileRoute("/_authenticated/fechamento")({
  validateSearch: (search: Record<string, unknown>): { fechamentoId?: string } =>
    typeof search["fechamentoId"] === "string" && search["fechamentoId"]
      ? { fechamentoId: search["fechamentoId"] }
      : {},
  head: () => ({
    meta: [
      { title: "Fechamento de Caixa | Lotérica Brasil da Sorte" },
      {
        name: "description",
        content:
          "Planilha digital de fechamento de caixa da Lotérica Brasil da Sorte: saldo inicial, saldo final, depósitos, cartão, Pix, prêmios e cálculo automático de total e diferença.",
      },
      { property: "og:title", content: "Fechamento de Caixa | Brasil da Sorte" },
      {
        property: "og:description",
        content: "Registre saldo inicial, saldo final e o fechamento diário com total e diferença automáticos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Fechamento,
});

type Bolao = BaseBolao & {
  numero?: string;
  lanc?: string;
  /** Id da modalidade quando a linha veio do seletor de modalidades (sem estoque). */
  mod?: string;
  /** Nº preenchido pelo sistema (vigente da data do fechamento) — recalcula ao mudar a data. */
  numeroAuto?: boolean;
};

const bolaoVazio = (): Bolao => ({
  concurso: "",
  numero: "",
  valor: "",
  taxa: "",
  quant: "",
});

const hojeBR = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function Fechamento() {
  const navigateFn = useNavigate();
  const { fechamentoId } = Route.useSearch();
  const meuCaixaFn = useServerFn(meuCaixa);
  const acessoFn = useServerFn(meuAcesso);

  const { data: caixaData, isLoading: caixaLoading } = useQuery({
    queryKey: ["meu-caixa"],
    queryFn: () => meuCaixaFn({}),
    staleTime: 30_000,
  });

  const { data: acesso, isLoading: acessoLoading } = useQuery({
    queryKey: ["meu-acesso"],
    queryFn: () => acessoFn({}),
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin = Boolean(acesso?.admin);
  const caixaAberto = caixaData?.caixaHoje?.situacao === "aberto";

  const [data, setData] = useState("");
  const [funcionario, setFuncionario] = useState("");
  const [caixaNumero, setCaixaNumero] = useState("");
  const [relatorio, setRelatorio] = useState("");
  const [valores, setValores] = useState<Record<ValorKey, string>>(
    () =>
      Object.fromEntries(VALOR_CAMPOS.map((c) => [c.key, ""])) as Record<ValorKey, string>,
  );
  const [saldoInicial, setSaldoInicial] = useState<Saldo>(() => {
    const s = saldoVazio();
    s.cedulas = "500";
    return s;
  });
  const [saldoFinal, setSaldoFinal] = useState<Saldo>(saldoVazio);
  const [boloes, setBoloes] = useState<Bolao[]>(() =>
    Array.from({ length: 8 }, bolaoVazio),
  );
  useEffect(() => {
    setData(hojeBR());
  }, []);

  const salvarFechamentoFn = useServerFn(salvarFechamento);
  // Concurso oficial em vigência na data do fechamento, para prefill do
  // "Nº do concurso" no Controle de Bolões. Deve ficar antes de qualquer
  // return condicional (regra de hooks).
  const concursoPorDataFn = useServerFn(concursoPorData);
  const navigate = useNavigate();

  const listarOperadoresFn = useServerFn(listarOperadoresAtivos);
  const { data: operadores } = useQuery({
    queryKey: ["operadores-fechamento"],
    queryFn: () => listarOperadoresFn({}),
    staleTime: 5 * 60 * 1000,
  });

  // Saldo de bolões do dia (vendas por canal e cotas que sobraram no estoque).
  const resumoBoloesFn = useServerFn(resumoBoloesDia);
  const { data: saldoBoloes } = useQuery({
    queryKey: ["resumo-boloes-dia", data],
    queryFn: () => resumoBoloesFn({ data: { data } }),
    enabled: !!data,
    staleTime: 30_000,
  });

  // Bolões cadastrados no estoque (estoque_boloes), para escolher na tabela de Controle de Bolões.
  const listarEstoqueNovoFn = useServerFn(listarEstoque);
  const { data: estoqueBoloes } = useQuery({
    queryKey: ["estoque-boloes-fechamento"],
    queryFn: async () => {
      const resNovo = await listarEstoqueNovoFn({ data: { situacao: "ativo" } });
      const novos = (resNovo.estoques ?? []).map((e: any) => ({
        id: e.id,
        concurso: `${e.nome ?? ""}${e.concurso ? ` ${e.concurso}` : ""}`.trim() || e.concurso || e.nome || "",
        nome: e.nome || "",
        valorCota: e.valorCota,
        taxa: e.taxa,
      }));
      // Ordem oficial das modalidades (Mega-Sena, Lotofácil, Quina...).
      return novos.sort((a, b) =>
        compararBoloes(
          { nome: a.nome, concurso: a.concurso },
          { nome: b.nome, concurso: b.concurso },
        ),
      );
    },
    staleTime: 30_000,
  });
  const opcoesBoloes = estoqueBoloes ?? [];

  // Caixa aberto do operador na data selecionada: preenche Funcionário e Nº do caixa.
  // Desabilitado ao editar fechamento existente: os valores vêm do registro salvo.
  const caixaDoOperadorFn = useServerFn(caixaDoOperador);
  const { data: caixaOperador } = useQuery({
    queryKey: ["caixa-operador", data],
    queryFn: () => caixaDoOperadorFn({ data: { data } }),
    enabled: !!data && !fechamentoId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (fechamentoId) return;
    if (!caixaOperador?.operador) return;
    if (operadores && operadores.length > 0) {
      const match = operadores.find(
        (op) => op.nome?.toLowerCase() === caixaOperador.operador?.toLowerCase(),
      );
      if (match) {
        setFuncionario(match.nome);
      } else if (!funcionario) {
        setFuncionario(caixaOperador.operador);
      }
    } else if (!funcionario) {
      setFuncionario(caixaOperador.operador);
    }
    if (!caixaNumero && caixaOperador.caixa) setCaixaNumero(caixaOperador.caixa.nome);
  }, [caixaOperador, fechamentoId, operadores]);

  // Lançamentos rápidos do dia: somados por campo e aplicados ao fechamento.
  // Ao editar fechamento salvo, não busca: os valores carregados são a fonte da verdade.
  const listarLancamentosFn = useServerFn(listarLancamentosSimples);
  const { data: lancamentosDia } = useQuery({
    queryKey: ["lancamentos-simples", data],
    queryFn: () => listarLancamentosFn({ data: { data } }),
    enabled: !!data && !fechamentoId,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const somaLancamentos = useMemo(() => {
    const valoresSoma: Partial<Record<ValorKey, number>> = {};
    const saldoSoma: Partial<Record<SaldoKey, number>> = {};
    let relatorioSoma: number | undefined;
    for (const l of lancamentosDia?.lancamentos ?? []) {
      if (!l.meu) continue; // ignora lançamentos de outros operadores
      if (l.tipo === "RELATORIO" || l.campo === "relatorio") {
        relatorioSoma = (relatorioSoma ?? 0) + l.valor;
        continue;
      }
      if (l.campo.startsWith("saldo:")) {
        const chave = l.campo.slice(6) as SaldoKey;
        if (!SALDO_ITENS.some((i) => i.key === chave)) continue;
        saldoSoma[chave] = (saldoSoma[chave] ?? 0) + l.valor;
        continue;
      }
      if (l.campo.startsWith("bolao:")) continue; // tratado em boloesLanc
      const chave = l.campo as ValorKey;
      if (!VALOR_CAMPOS.some((c) => c.key === chave)) continue;
      valoresSoma[chave] = (valoresSoma[chave] ?? 0) + l.valor;
    }
    return { valores: valoresSoma, saldo: saldoSoma, relatorio: relatorioSoma };
  }, [lancamentosDia]);

  // Lançamentos rápidos de bolão (campo bolao:<modeloId>): viram linhas da tabela.
  // Manuais agrupam por nome+valor+taxa — preços diferentes são vendas distintas.
  const boloesLanc = useMemo(() => {
    const meus = (lancamentosDia?.lancamentos ?? []).filter((l) => l.meu);
    return agruparBoloesLanc(meus, opcoesBoloes);
  }, [lancamentosDia, opcoesBoloes]);

  // Aplica os bolões lançados na tabela, sem sobrescrever linhas preenchidas à mão.
  // Nunca ao editar fechamento salvo (senão mistura lançamentos de outros caixas).
  const boloesLancRef = useRef<string>("");
  useEffect(() => {
    if (fechamentoId) return;
    const chaveAtual = JSON.stringify(boloesLanc);
    if (boloesLancRef.current === chaveAtual) return;
    boloesLancRef.current = chaveAtual;
    setBoloes((prev) => {
      const manuais = prev.filter((b) => !b.lanc);
      const proximo = [...manuais];
      for (const novo of boloesLanc) {
        const vazio = proximo.findIndex(
          (b) => !b.concurso && !b.valor && !b.taxa && !b.quant,
        );
        if (vazio >= 0) proximo[vazio] = novo;
        else proximo.push(novo);
      }
      while (proximo.length < 8) proximo.push(bolaoVazio());
      return proximo;
    });
  }, [boloesLanc, fechamentoId]);

  // Guarda o que já foi aplicado para não sobrescrever ajustes manuais.
  const aplicadoRef = useRef<{
    dia: string;
    valores: Partial<Record<ValorKey, number>>;
    saldo: Partial<Record<SaldoKey, number>>;
    relatorio?: number | undefined;
  }>({ dia: "", valores: {}, saldo: {} });

  useEffect(() => {
    // Ao editar fechamento salvo, não aplica lançamentos do dia por cima
    // (o admin veria somatório de todos/caixa errado).
    if (fechamentoId) return;
    if (aplicadoRef.current.dia !== data) {
      aplicadoRef.current = { dia: data, valores: {}, saldo: {} };
    }
    const anterior = aplicadoRef.current.valores;
    const mudou: Partial<Record<ValorKey, number>> = {};
    for (const c of VALOR_CAMPOS) {
      const atual = somaLancamentos.valores[c.key];
      if (atual === undefined) continue;
      if (anterior[c.key] !== atual) mudou[c.key] = atual;
    }

    const anteriorSaldo = aplicadoRef.current.saldo;
    const mudouSaldo: Partial<Record<SaldoKey, number>> = {};
    for (const i of SALDO_ITENS) {
      const atual = somaLancamentos.saldo[i.key];
      if (atual === undefined) continue;
      if (anteriorSaldo[i.key] !== atual) mudouSaldo[i.key] = atual;
    }

    const relatorioLanc = somaLancamentos.relatorio;
    const mudouRelatorio =
      relatorioLanc !== undefined && aplicadoRef.current.relatorio !== relatorioLanc;
    if (mudouRelatorio) {
      aplicadoRef.current.relatorio = relatorioLanc;
      setRelatorio(String(relatorioLanc.toFixed(2)).replace(".", ","));
    }

    if (Object.keys(mudou).length === 0 && Object.keys(mudouSaldo).length === 0) return;
    aplicadoRef.current = {
      dia: data,
      valores: { ...anterior, ...mudou },
      saldo: { ...anteriorSaldo, ...mudouSaldo },
      relatorio: aplicadoRef.current.relatorio,
    };

    if (Object.keys(mudou).length > 0) {
      setValores((v) => {
        const proximo = { ...v };
        for (const [chave, valor] of Object.entries(mudou)) {
          proximo[chave as ValorKey] = String((valor as number).toFixed(2)).replace(".", ",");
        }
        return proximo;
      });
    }

    if (Object.keys(mudouSaldo).length > 0) {
      setSaldoFinal((s) => {
        const proximo = { ...s };
        for (const [chave, valor] of Object.entries(mudouSaldo)) {
          proximo[chave as SaldoKey] = String((valor as number).toFixed(2)).replace(".", ",");
        }
        return proximo;
      });
    }
  }, [somaLancamentos, data, fechamentoId]);


  // Correção: abre um fechamento já salvo com todas as informações preenchidas.
  // Substituição completa (não merge): ao trocar de fechamento, nada do anterior fica.
  const obterFechamentoFn = useServerFn(obterFechamento);
  const fechamentoQuery = useQuery({
    queryKey: ["fechamento-edicao", fechamentoId],
    queryFn: () => obterFechamentoFn({ data: { id: fechamentoId! } }),
    enabled: Boolean(fechamentoId),
    staleTime: 30_000,
  });
  const fechamentoSalvo = fechamentoQuery.data;

  const carregadoRef = useRef<string>("");
  useEffect(() => {
    carregadoRef.current = "";
  }, [fechamentoId]);

  useEffect(() => {
    if (!fechamentoSalvo) return;
    if (carregadoRef.current === fechamentoSalvo.id) return;
    carregadoRef.current = fechamentoSalvo.id;

    // Zera estado de auto-aplicação para que lançamentos do dia não sobrescreva.
    aplicadoRef.current = { dia: "", valores: {}, saldo: {} };
    boloesLancRef.current = "";
    setRascunhoNotificacao(false);

    setData(fechamentoSalvo.data);
    setFuncionario(fechamentoSalvo.funcionario ?? "");
    setRelatorio(
      fechamentoSalvo.relatorio
        ? String(Number(fechamentoSalvo.relatorio).toFixed(2)).replace(".", ",")
        : "",
    );
    try {
      const d = JSON.parse(fechamentoSalvo.dadosJson) as {
        caixaNumero?: string;
        valores?: Record<string, string>;
        saldoInicial?: Saldo;
        saldoFinal?: Saldo;
        boloes?: Bolao[];
      };
      setCaixaNumero(d.caixaNumero ?? "");
      setValores(
        (d.valores
          ? { ...valoresVazios(), ...d.valores }
          : valoresVazios()) as Record<ValorKey, string>,
      );
      const sInicial = saldoVazio();
      sInicial.cedulas = "500";
      setSaldoInicial(d.saldoInicial ? { ...sInicial, ...d.saldoInicial } : sInicial);
      setSaldoFinal(d.saldoFinal ? { ...saldoVazio(), ...d.saldoFinal } : saldoVazio());
      setBoloes(
        Array.from(
          { length: Math.max(8, d.boloes?.length ?? 0) },
          (_, i) => d.boloes?.[i] ?? bolaoVazio(),
        ),
      );
    } catch {
      setCaixaNumero("");
      setValores(valoresVazios());
      const sInicial = saldoVazio();
      sInicial.cedulas = "500";
      setSaldoInicial(sInicial);
      setSaldoFinal(saldoVazio());
      setBoloes(Array.from({ length: 8 }, bolaoVazio));
    }
    setAviso("Fechamento aberto para correção. Ajuste os valores e salve novamente.");
  }, [fechamentoSalvo]);



  // Aplica um fechamento vindo da importação por imagem (prévia interativa).
  useEffect(() => {
    const bruto = sessionStorage.getItem(IMPORT_STORAGE_KEY);
    if (!bruto) return;
    sessionStorage.removeItem(IMPORT_STORAGE_KEY);
    try {
      const imp = JSON.parse(bruto) as FechamentoImportado;
      if (imp.data) setData(imp.data);
      if (imp.funcionario) setFuncionario(imp.funcionario);
      if (imp.relatorio) setRelatorio(imp.relatorio);
      if (imp.valores) setValores((v) => ({ ...v, ...imp.valores }));
      if (imp.saldoFinal) setSaldoFinal((s) => ({ ...s, ...imp.saldoFinal }));
      if (imp.boloes?.length) {
        setBoloes(
          Array.from({ length: Math.max(8, imp.boloes.length) }, (_, i) =>
            imp.boloes[i] ?? bolaoVazio(),
          ),
        );
      }
      setAviso("Fechamento importado da imagem. Revise os valores antes de salvar.");
    } catch {
      /* ignora conteúdo inválido */
    }
  }, []);



  const total = useMemo(
    () => VALOR_CAMPOS.reduce((acc, c) => acc + num(valores[c.key]), 0),
    [valores],
  );
  const totalInicial = useMemo(
    () => SALDO_ITENS.reduce((acc, i) => acc + num(saldoInicial[i.key]), 0),
    [saldoInicial],
  );
  const totalFinal = useMemo(
    () => SALDO_ITENS.reduce((acc, i) => acc + num(saldoFinal[i.key]), 0),
    [saldoFinal],
  );
  const totalValor = useMemo(
    () => boloes.reduce((acc, b) => acc + num(b.valor) * num(b.quant), 0),
    [boloes],
  );
  const totalTaxa = useMemo(
    () => boloes.reduce((acc, b) => acc + num(b.taxa) * num(b.quant), 0),
    [boloes],
  );
  const totalQuant = useMemo(
    () => boloes.reduce((acc, b) => acc + num(b.quant), 0),
    [boloes],
  );
  const diferenca = total - num(relatorio);
  const diferencaSaldo = totalFinal - totalInicial;


  const [salvando, setSalvando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [limparConfirm, setLimparConfirm] = useState(false);
  const [rascunhoNotificacao, setRascunhoNotificacao] = useState(false);
  const [bolaoExcluirIdx, setBolaoExcluirIdx] = useState<number | null>(null);

  // Rascunho por usuário: evita que o rascunho de um usuário apareça em outro
  // (mesmo navegador/computador compartilhado).
  const AUTOSAVE_KEY = acesso?.perfil?.id
    ? `fechamento:rascunho:${acesso.perfil.id}`
    : "";
  const restauradoKeyRef = useRef<string>("");
  const skipSaveRef = useRef(false);

  // Restore from localStorage (antes do auto-save para não sobrescrever o rascunho)
  useEffect(() => {
    if (fechamentoId) {
      restauradoKeyRef.current = "";
      return;
    }
    if (!AUTOSAVE_KEY) return;
    if (restauradoKeyRef.current === AUTOSAVE_KEY) return;
    restauradoKeyRef.current = AUTOSAVE_KEY;
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (!saved) return;
      const state = JSON.parse(saved);
      let restored = false;
      if (state.funcionario) { setFuncionario(state.funcionario); restored = true; }
      if (state.caixaNumero) { setCaixaNumero(state.caixaNumero); restored = true; }
      if (state.relatorio) { setRelatorio(state.relatorio); restored = true; }
      if (state.valores) { setValores(state.valores); restored = true; }
      if (state.saldoInicial) { setSaldoInicial(state.saldoInicial); restored = true; }
      if (state.saldoFinal) { setSaldoFinal(state.saldoFinal); restored = true; }
      if (state.boloes?.length) { setBoloes(state.boloes); restored = true; }
      if (restored) {
        setRascunhoNotificacao(true);
        // Pula o save imediato do mesmo flush: senão gravaria o estado inicial por cima.
        skipSaveRef.current = true;
      }
    } catch { /* ignore parse errors */ }
  }, [fechamentoId, AUTOSAVE_KEY]);

  // Auto-save to localStorage
  useEffect(() => {
    if (fechamentoId || !AUTOSAVE_KEY) return;
    if (restauradoKeyRef.current !== AUTOSAVE_KEY) return;
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    const state = { funcionario, caixaNumero, relatorio, valores, saldoInicial, saldoFinal, boloes };
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
    } catch { /* ignore quota errors */ }
  }, [funcionario, caixaNumero, relatorio, valores, saldoInicial, saldoFinal, boloes, fechamentoId, AUTOSAVE_KEY]);

  useEffect(() => {
    if (acessoLoading) return;
    if (isAdmin) return;
    if (!caixaLoading && !caixaAberto && !fechamentoId) {
      // Caixa do dia já vinculado a um fechamento: reabre o próprio fechamento
      // (visão/correção do dono) em vez de expulsar o operador para /inicio.
      const meuId = caixaData?.caixaHoje?.fechamentoId;
      if (meuId) {
        void navigateFn({ to: "/fechamento", search: { fechamentoId: meuId } });
      } else {
        void navigateFn({ to: "/inicio" });
      }
    }
  }, [caixaLoading, caixaAberto, fechamentoId, isAdmin, acessoLoading, navigateFn, caixaData]);

  // Mudou a data do fechamento: recalcula os Nº dos concurso preenchidos pelo sistema.
  // (Hook declarado antes de qualquer return condicional — regra de hooks.)
  const dataRef = useRef(data);
  useEffect(() => {
    if (!data || dataRef.current === data) return;
    dataRef.current = data;
    const modIds = new Set<string>();
    for (const b of boloes) {
      if (!b.numeroAuto) continue;
      const id = b.mod || achaModalidade(b.concurso || "")?.id;
      if (id) modIds.add(id);
    }
    for (const modId of modIds) {
      concursoPorDataFn({ data: { modalidade: modId, data } })
        .then((r) => {
          if (!r?.ok) return;
          const n = String(r.concurso);
          setBoloes((bs) =>
            bs.map((b) => {
              if (!b.numeroAuto) return b;
              const id = b.mod || achaModalidade(b.concurso || "")?.id;
              if (id !== modId) return b;
              return { ...b, numero: n };
            }),
          );
        })
        .catch(() => {});
    }
  }, [data, boloes]);

  if (acessoLoading || caixaLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAdmin && !caixaAberto && !fechamentoId) return null;

  // Correção: o dono (quem salvou) pode corrigir o próprio fechamento; de outro
  // funcionário, somente admin (mesma regra do servidor + RLS).
  if (fechamentoId && !isAdmin && fechamentoQuery.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-foreground">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este fechamento é de outro funcionário. Somente administradores podem
            corrigir fechamentos de terceiros. Fale com o administrador para ajustar.
          </p>
          <button
            type="button"
            onClick={() => navigateFn({ to: "/fechamentos", search: { filtroData: "", filtroOperador: "", filtroCaixa: "", filtroMes: "" } })}
            className="mt-4 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Voltar ao histórico
          </button>
        </div>
      </main>
    );
  }

  const compartilharPdf = async () => {
    setErro(null);
    setGerandoPdf(true);
    try {
      const doc = await gerarDocFechamento({
        data,
        funcionario,
        caixaNumero,
        relatorio: num(relatorio),
        total,
        diferenca,
        totalInicial,
        totalFinal,
        totalBolaoValor: totalValor,
        totalBolaoTaxa: totalTaxa,
        totalBolaoQuant: totalQuant,
        valores,
        saldoInicial,
        saldoFinal,
        boloes,
        ...(saldoBoloes ? { saldoBoloes } : {}),
      });
      const dataBr = data.split("-").reverse().join("/");
      const nome = `fechamento-${data}.pdf`;
      const blob = doc.output("blob");
      const file = new File([blob], nome, { type: "application/pdf" });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Fechamento de Caixa",
            text: `Fechamento de ${dataBr}`,
          });
          return;
        } catch {
          // usuário cancelou ou compartilhamento indisponível: baixa o arquivo
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErro(
        `Não foi possível gerar o PDF: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setGerandoPdf(false);
    }
  };

  const salvar = async () => {
    if (Math.abs(diferenca) > 0.005) {
      const ok = window.confirm(
        `A diferença é de ${brl(diferenca)}. Deseja salvar mesmo assim?`
      );
      if (!ok) return;
    }

    // Validação: não permitir data muito no futuro
    if (data) {
      const hoje = new Date();
      hoje.setHours(23, 59, 59, 999);
      const amanha = new Date(hoje);
      amanha.setDate(amanha.getDate() + 1);
      const dataSel = new Date(data + "T12:00:00");
      if (dataSel > amanha) {
        const ok = window.confirm(
          `A data selecionada (${data.split("-").reverse().join("/")}) é futura. Deseja salvar mesmo assim?`
        );
        if (!ok) return;
      }
    }

    setSalvando(true);
    setAviso(null);
    setErro(null);
    try {
      const doc = await gerarDocFechamento({
        data,
        funcionario,
        caixaNumero,
        relatorio: num(relatorio),
        total,
        diferenca,
        totalInicial,
        totalFinal,
        totalBolaoValor: totalValor,
        totalBolaoTaxa: totalTaxa,
        totalBolaoQuant: totalQuant,
        valores,
        saldoInicial,
        saldoFinal,
        boloes,
        ...(saldoBoloes ? { saldoBoloes } : {}),
      });
      const pdfBase64 = (doc.output("datauristring") as string).split(",")[1] ?? "";
      const res = await salvarFechamentoFn({
        data: {
          ...(fechamentoId ? { id: fechamentoId } : {}),
          data,
          funcionario,
          relatorio: num(relatorio),
          total,
          diferenca,
          totalInicial,
          totalFinal,
          totalBolaoValor: totalValor,
          totalBolaoTaxa: totalTaxa,
          totalBolaoQuant: totalQuant,
          dados: { caixaNumero, valores, saldoInicial, saldoFinal, boloes },
          pdfBase64,
        },
      });
      setAviso(
        fechamentoId
          ? "Correção salva no fechamento existente."
          : (res.emailAviso ?? "Fechamento salvo e enviado por e-mail."),
      );
      toast.success(
        fechamentoId
          ? "Correção salva com sucesso!"
          : "Fechamento salvo com sucesso!",
      );
      if (res.boloesSincronizados > 0) {
        toast.success(
          `Controle de Bolões: ${res.boloesSincronizados} linha(s) baixada(s) no estoque (${res.boloesCotas} cota(s)).`,
        );
      }
      for (const a of res.boloesAvisos ?? []) {
        toast.warning(a);
      }
      if (AUTOSAVE_KEY) localStorage.removeItem(AUTOSAVE_KEY);
      // Admin volta para a gestão de caixas; operador para o próprio caixa.
      void navigate({ to: isAdmin ? "/caixas" : "/meu-caixa" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErro(
        msg.toLowerCase().includes("unauthorized")
          ? "Sua sessão expirou. Entre novamente para salvar o fechamento."
          : `Não foi possível salvar o fechamento: ${msg}`,
      );
    } finally {
      setSalvando(false);
    }
  };


  const limpar = () => {
    if (AUTOSAVE_KEY) localStorage.removeItem(AUTOSAVE_KEY);
    setFuncionario("");
    setCaixaNumero("");
    setRelatorio("");
    setValores(
      Object.fromEntries(VALOR_CAMPOS.map((c) => [c.key, ""])) as Record<ValorKey, string>,
    );
    setSaldoFinal(saldoVazio());
    setBoloes(Array.from({ length: 8 }, bolaoVazio));
  };

  const setBolao = (idx: number, campo: keyof Bolao, v: string | boolean) =>
    setBoloes((bs) => bs.map((b, i) => (i === idx ? { ...b, [campo]: v } : b)));

  // Ao escolher um bolão (modelo do estoque), preenche valor da cota e taxa do
  // modelo e o "Nº do concurso" com o oficial da data do fechamento.
  const escolherBolao = (idx: number, modeloId: string) => {
    const opcao = opcoesBoloes.find((o) => o.id === modeloId);
    const m = opcao ? achaModalidade(opcao.nome || opcao.concurso) : null;
    setBoloes((bs) =>
      bs.map((b, i) =>
        i === idx
          ? opcao
            ? {
                ...b,
                concurso: opcao.concurso,
                mod: m?.id ?? "",
                // Trocou de bolão: o concurso antigo não serve — zera e busca o oficial.
                numero: "",
                numeroAuto: Boolean(m),
                valor: String(opcao.valorCota).replace(".", ","),
                taxa: String(opcao.taxa).replace(".", ","),
              }
            : { ...b, concurso: "", valor: "", taxa: "", mod: "", numeroAuto: false }
          : b,
      ),
    );
    if (!m) return;
    concursoPorDataFn({ data: { modalidade: m.id, data: data || hojeBR() } })
      .then((r) => {
        if (!r?.ok) return;
        const n = String(r.concurso);
        setBoloes((bs) =>
          bs.map((b, i) =>
            i === idx && (b.numero ?? "") === "" ? { ...b, numero: n } : b,
          ),
        );
      })
      .catch(() => {});
  };

  /**
   * A linha (b.concurso) corresponde à opção? Compara por igualdade ou pelo
   * sufixo " 3062": fechamentos antigos guardavam só o número do concurso do
   * estoque novo; hoje a opção vem como "MEGA 3062".
   */
  const corresponde = (opcaoConcurso: string, linhaConcurso: string) => {
    if (opcaoConcurso === linhaConcurso) return true;
    const linha = linhaConcurso.trim();
    return linha !== "" && linha !== " " && opcaoConcurso.endsWith(` ${linha}`);
  };

  /** Id do modelo correspondente à linha (nome + valor da cota), para o seletor. */
  const idModeloLinha = (b: Bolao) => {
    const mesmos = opcoesBoloes.filter((o) => corresponde(o.concurso, b.concurso));
    if (mesmos.length === 0) return "";
    const exato = mesmos.find((o) => Math.abs(o.valorCota - num(b.valor)) < 0.005);
    return (exato ?? mesmos[0]!).id;
  };





  const inputCls =
    "h-8 w-28 rounded-md border border-input bg-background px-3 text-right text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  const renderSaldo = (
    titulo: string,
    saldo: Saldo,
    setSaldo: (fn: (s: Saldo) => Saldo) => void,
    totalSaldo: number,
  ) => (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <h2 className="border-b border-border bg-secondary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
        {titulo}
      </h2>
      <div className="divide-y divide-border">
        {SALDO_ITENS.map((i) => (
          <div key={i.key} className="flex items-center justify-between gap-4 px-4 py-1.5">
            <span className="text-sm font-medium text-foreground">{i.label}</span>
            <input
              inputMode="decimal"
              value={saldo[i.key]}
              onChange={(e) => setSaldo((s) => ({ ...s, [i.key]: e.target.value }))}
              placeholder="0"
              className={inputCls}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border bg-secondary/40 px-4 py-2">
        <span className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Total
        </span>
        <span className="text-base font-bold text-foreground">
          {brl(totalSaldo)}
        </span>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-background px-4 pb-24 pt-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <AppNav />
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Lotérica Brasil da Sorte
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            Fechamento de Caixa
          </h1>
        </header>

        {!fechamentoId && caixaOperador?.caixa && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm text-sm">
            <span className="font-medium text-foreground">
              {caixaNumero || "Caixa"} — {caixaOperador.operador || "—"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              caixaOperador.caixa.situacao === "aberto"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                : caixaOperador.caixa.situacao === "conferido"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  : "bg-muted text-muted-foreground"
            }`}>
              {caixaOperador.caixa.situacao === "aberto" ? "Aberto" : caixaOperador.caixa.situacao === "conferido" ? "Conferido" : "Fechado"}
            </span>
          </div>
        )}

        {fechamentoId && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm text-sm">
            <span className="text-xs text-muted-foreground">Editando fechamento existente</span>
          </div>
        )}


        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Data</span>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Nº do caixa</span>
              <select
                value={caixaNumero}
                onChange={(e) => setCaixaNumero(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione...</option>
                <option value="CAIXA 01">CAIXA 01</option>
                <option value="CAIXA 02">CAIXA 02</option>
                <option value="CAIXA 03">CAIXA 03</option>
                <option value="CAIXA 04">CAIXA 04</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">RELATÓRIO</span>
              <input
                inputMode="decimal"
                value={relatorio}
                onChange={(e) => setRelatorio(e.target.value)}
                placeholder="0,00"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
        </section>

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <h2 className="border-b border-border bg-secondary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
            Saldo Inicial (fixo)
          </h2>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Cédulas (gaveta)</span>
            <span className="text-base font-bold text-foreground">{brl(totalInicial)}</span>
          </div>
        </div>
        {renderSaldo("Saldo Final", saldoFinal, setSaldoFinal, totalFinal)}

        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2 shadow-sm">
          <span className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Diferença de saldo (final − inicial fixo R$ 500)
          </span>
          <span className={`text-lg font-bold ${classeDiferenca(diferencaSaldo)}`}>
            {brlSinal(diferencaSaldo)}
          </span>
        </div>

        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="divide-y divide-border">
            {VALOR_CAMPOS.map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between gap-4 px-4 py-1.5"
              >
                <span className="text-sm font-medium text-foreground">{c.label}</span>
                <input
                  inputMode="decimal"
                  value={valores[c.key]}
                  onChange={(e) =>
                    setValores((v) => ({ ...v, [c.key]: e.target.value }))
                  }
                  placeholder="0,00"
                  className="h-9 w-40 rounded-md border border-input bg-background px-3 text-right text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1 bg-secondary px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
                Total
              </span>
              <span className="text-base font-bold text-secondary-foreground">
                {brl(total)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
                Diferença
              </span>
              <span
                className={`text-base font-bold ${classeDiferenca(diferenca)}`}
              >
                {brlSinal(diferenca)}
              </span>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <h2 className="border-b border-border bg-secondary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
            Controle de Bolões
          </h2>
          <p className="border-b border-border bg-secondary/40 px-4 py-1.5 text-xs text-muted-foreground">
            Linhas preenchidas aqui dão baixa automática no estoque ao salvar o
            fechamento. As vindas do lançamento rápido já entram baixadas.
          </p>

          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Bolão (modelo)</th>
                  <th className="px-3 py-2">Concurso</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Taxa</th>
                  <th className="px-3 py-2 text-right">Quant.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {boloes.map((b, idx) => {
                  const naLista = opcoesBoloes.some((o) => corresponde(o.concurso, b.concurso));
                  const modoManual = b.concurso !== "" && !naLista;
                  const modeloAtivo = !modoManual ? opcoesBoloes.find((o) => o.id === idModeloLinha(b)) : null;
                  const rowStyle = modeloAtivo
                    ? getLoteriaRowStyle(modeloAtivo.nome || modeloAtivo.concurso)
                    : b.mod
                      ? getLoteriaRowStyle(getModalidade(b.mod)?.nome ?? "")
                      : undefined;
                  return (
                  <tr key={idx} style={rowStyle}>
                    <td className="px-3 py-1">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const nomeCor = !modoManual && idModeloLinha(b)
                            ? (opcoesBoloes.find((o) => o.id === idModeloLinha(b))?.concurso ?? "")
                            : b.mod
                              ? (getModalidade(b.mod)?.nome ?? "")
                              : "";
                          const cor = nomeCor ? getLoteriaDotColor(nomeCor) : "";
                          return cor ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} /> : null;
                        })()}
                        <select
                          value={modoManual ? "__outro__" : idModeloLinha(b)}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__outro__") {
                              setBolao(idx, "concurso", " ");
                              setBolao(idx, "numeroAuto", false);
                            } else {
                              escolherBolao(idx, v);
                            }
                          }}
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">Escolha o bolão</option>
                          {opcoesBoloes.map((o) => (
                            <option key={o.id} value={o.id}>
                              {`${o.concurso} • ${brl(o.valorCota)}`}
                            </option>
                          ))}
                          <option value="__outro__">Outro (nome livre)</option>
                        </select>
                        {modoManual && (
                          <input
                            value={b.concurso}
                            onChange={(e) => setBolao(idx, "concurso", e.target.value)}
                            placeholder="Digite o bolão"
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1">
                      <input
                        value={b.numero ?? ""}
                        onChange={(e) => {
                          setBolao(idx, "numero", e.target.value);
                          setBolao(idx, "numeroAuto", false);
                        }}
                        placeholder="Nº do concurso"
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input inputMode="decimal" value={b.valor} onChange={(e) => setBolao(idx, "valor", e.target.value)} placeholder="0,00" className={inputCls} />
                    </td>
                    <td className="px-3 py-1">
                      <input inputMode="decimal" value={b.taxa} onChange={(e) => setBolao(idx, "taxa", e.target.value)} placeholder="0,00" className={inputCls} />
                    </td>
                    <td className="px-3 py-1">
                      <input inputMode="numeric" value={b.quant} onChange={(e) => setBolao(idx, "quant", e.target.value)} placeholder="0" className={inputCls} />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-secondary/50 text-sm font-bold">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right text-foreground">{brl(totalValor)}</td>
                  <td className="px-3 py-2 text-right text-foreground">{brl(totalTaxa)}</td>
                  <td className="px-3 py-2 text-right text-foreground">{totalQuant}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden divide-y divide-border">
            {boloes.map((b, idx) => {
              const naLista = opcoesBoloes.some((o) => corresponde(o.concurso, b.concurso));
              const modoManual = b.concurso !== "" && !naLista;
              const modeloAtivo = !modoManual ? opcoesBoloes.find((o) => o.id === idModeloLinha(b)) : null;
              const rowStyle = modeloAtivo
                ? getLoteriaRowStyle(modeloAtivo.nome || modeloAtivo.concurso)
                : b.mod
                  ? getLoteriaRowStyle(getModalidade(b.mod)?.nome ?? "")
                  : undefined;
              return (
                <div key={idx} style={rowStyle} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Bolão {idx + 1}</span>
                    <button
                      onClick={() => setBolaoExcluirIdx(idx)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remover
                    </button>
                  </div>

                  <select
                    value={modoManual ? "__outro__" : idModeloLinha(b)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__outro__") {
                        setBolao(idx, "concurso", " ");
                        setBolao(idx, "numeroAuto", false);
                      } else {
                        escolherBolao(idx, v);
                      }
                    }}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Selecione o bolão...</option>
                    {opcoesBoloes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.concurso} — {brl(o.valorCota)}/cota
                      </option>
                    ))}
                    <option value="__outro__">Outro (nome livre)</option>
                  </select>

                  {modoManual && (
                    <input
                      value={b.concurso}
                      onChange={(e) => setBolao(idx, "concurso", e.target.value)}
                      placeholder="Nome do bolão"
                      className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Nº Concurso</span>
                      <input
                        value={b.numero ?? ""}
                        onChange={(e) => {
                          setBolao(idx, "numero", e.target.value);
                          setBolao(idx, "numeroAuto", false);
                        }}
                        placeholder="—"
                        className="h-10 w-full rounded-lg border border-input bg-background px-2 text-center text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Valor cota</span>
                      <input
                        inputMode="decimal"
                        value={b.valor}
                        onChange={(e) => setBolao(idx, "valor", e.target.value)}
                        placeholder="0,00"
                        className="h-10 w-full rounded-lg border border-input bg-background px-2 text-center text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Quant.</span>
                      <input
                        inputMode="numeric"
                        value={b.quant}
                        onChange={(e) => setBolao(idx, "quant", e.target.value)}
                        placeholder="0"
                        className="h-10 w-full rounded-lg border border-input bg-background px-2 text-center text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs">
                    <label className="flex items-center gap-1">
                      <span className="text-muted-foreground">Taxa:</span>
                      <input
                        inputMode="decimal"
                        value={b.taxa}
                        onChange={(e) => setBolao(idx, "taxa", e.target.value)}
                        placeholder="0,00"
                        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                    <span className="font-bold text-foreground">Subtotal: {brl(num(b.valor) * num(b.quant))}</span>
                  </div>
                </div>
              );
            })}

            {boloes.length > 0 && (
              <div className="flex items-center justify-between bg-secondary/50 px-4 py-3">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Total</span>
                <div className="flex gap-4 text-xs font-bold text-foreground">
                  <span>{totalQuant} cotas</span>
                  <span>{brl(totalValor)}</span>
                  <span>Taxa: {brl(totalTaxa)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3">
            <button
              onClick={() => setBoloes((bs) => [...bs, bolaoVazio()])}
              className="inline-flex h-11 sm:h-8 items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-background px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground w-full sm:w-auto"
            >
              + Adicionar bolão
            </button>
          </div>
        </section>



        {rascunhoNotificacao && (
          <div className="flex items-center justify-between rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-700 dark:text-sky-400">
            <span>Rascunho restaurado com sucesso.</span>
            <div className="flex gap-2">
              <button
                onClick={() => { if (AUTOSAVE_KEY) localStorage.removeItem(AUTOSAVE_KEY); limpar(); setRascunhoNotificacao(false); }}
                className="rounded px-2 py-0.5 text-xs font-medium hover:bg-sky-500/10"
              >
                Descartar
              </button>
              <button onClick={() => setRascunhoNotificacao(false)} className="rounded p-0.5 hover:bg-sky-500/10">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {aviso && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            {aviso}
          </div>
        )}

        {erro && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {erro}
          </div>
        )}

      </div>

      {/* Sticky action bar - sits above BottomNav on mobile */}
      <div className="fixed left-0 right-0 z-40 bottom-[60px] md:bottom-0 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-lg">
        {(salvando || gerandoPdf) && (
          <div className="mx-auto max-w-3xl px-4 pt-2">
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {salvando ? "Gerando o PDF e salvando no historico..." : "Montando o PDF..."}
            </p>
          </div>
        )}

        {/* Desktop layout */}
        <div className="hidden md:flex mx-auto max-w-3xl items-center justify-between gap-2 px-4 py-2">
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Imprimir
              </button>
              <button
                onClick={() => void compartilharPdf()}
                disabled={gerandoPdf || salvando}
                className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                {gerandoPdf ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Gerando PDF...
                  </span>
                ) : (
                  "Compartilhar PDF"
                )}
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setLimparConfirm(true)}
              className="inline-flex h-10 items-center rounded-md border border-destructive/30 bg-destructive/5 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Limpar
            </button>
            <button
              onClick={() => void salvar()}
              disabled={salvando || gerandoPdf}
              className="inline-flex h-11 items-center rounded-md bg-emerald-600 px-6 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 shadow-md"
            >
              {salvando ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Salvando...
                </span>
              ) : (
                "Salvar e enviar"
              )}
            </button>
          </div>
        </div>

        {/* Mobile layout - save + limpar side by side */}
        <div className="flex md:hidden items-center gap-2 px-4 py-3">
          <button
            onClick={() => void salvar()}
            disabled={salvando || gerandoPdf}
            className="flex-[2] h-12 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-base font-bold text-white transition-colors hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 shadow-md"
          >
            {salvando ? (
              <>
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Salvando...
              </>
            ) : (
              "Salvar e enviar"
            )}
          </button>
          <button
            onClick={() => setLimparConfirm(true)}
            className="flex-1 h-10 flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10"
          >
            Limpar
          </button>
        </div>
      </div>

      {limparConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Limpar formulário</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Todos os dados não salvos serão apagados. Tem certeza?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setLimparConfirm(false)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setLimparConfirm(false); limpar(); }}
                className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:opacity-90"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}

      {bolaoExcluirIdx !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Remover bolão</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Remover o bolão {bolaoExcluirIdx + 1} da lista? Esta ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setBolaoExcluirIdx(null)}
                className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setBoloes((bs) => bs.filter((_, i) => i !== bolaoExcluirIdx)); setBolaoExcluirIdx(null); }}
                className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:opacity-90"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
