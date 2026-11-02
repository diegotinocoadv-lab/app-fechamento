import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { BolaoRapidoModal } from "@/components/lancar/BolaoRapidoModal";
import {
  LancamentosDoDia,
  type LancamentoItem,
} from "@/components/lancar/LancamentosDoDia";
import { opcoesCampo, type ModeloBolao } from "@/components/lancar/comum";
import { brl, num, SALDO_ITENS, VALOR_CAMPOS, saldoVazio, type Saldo, type SaldoKey } from "@/lib/fechamento-campos";
import { listarEstoque } from "@/lib/estoque-boloes.functions";
import { buscarProximoConcurso } from "@/lib/caixa-loterias.functions";
import { getLoteriaDotColor, getLoteriaRowStyle } from "@/lib/loteria-colors";
import { achaModalidade, compararBoloes } from "@/lib/loterias-sorteio";
import {
  listarLancamentosSimples,
  registrarLancamento,
  removerLancamentoSimples,
  type TipoLancamento,
} from "@/lib/lancamentos-simples.functions";
import { meuCaixa } from "@/lib/caixas.functions";
import { listarUsuarios, meuAcesso } from "@/lib/usuarios.functions";
import { Loader2, Wallet, Banknote, Ticket, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/lancar")({
  validateSearch: (search: Record<string, unknown>) => ({
    tipo: typeof search["tipo"] === "string" ? search["tipo"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Lançar valores | Brasil da Sorte" },
      {
        name: "description",
        content:
          "Tela simplificada para as operadoras lançarem valores da gaveta e do caixa em poucos toques.",
      },
      { property: "og:title", content: "Lançar valores | Brasil da Sorte" },
      {
        property: "og:description",
        content: "Lançamento rápido de valores da gaveta e do caixa pela operadora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LancarPage,
});

/** Gaveta = itens do saldo final do caixa (prefixo saldo:); Caixa = campos de valores. */
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function LancarPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
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

  const [dia, setDia] = useState("");
  const [aberto, setAberto] = useState<TipoLancamento | null>(null);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [campo, setCampo] = useState<string>(VALOR_CAMPOS[0].key);
  const [modeloId, setModeloId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [erro, setErro] = useState("");
  const [excluirLanc, setExcluirLanc] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [modoManual, setModoManual] = useState(false);
  const [valorManual, setValorManual] = useState("");
  const [taxaManual, setTaxaManual] = useState("");
  const [bolaoRapido, setBolaoRapido] = useState<ModeloBolao | null>(null);
  const [rapidoConcurso, setRapidoConcurso] = useState("");
  const [rapidoQuant, setRapidoQuant] = useState("1");
  const [rapidoErro, setRapidoErro] = useState("");
  const [rapidoSalvando, setRapidoSalvando] = useState(false);
  const [gaveta, setGaveta] = useState<Saldo>(saldoVazio());
  const [gavetaSalvando, setGavetaSalvando] = useState(false);
  const [gavetaErro, setGavetaErro] = useState("");
  const [filtroOperador, setFiltroOperador] = useState("");

  useEffect(() => { setDia(hoje()); }, []);

  const { data: clientesEncontrados } = useQuery({
    queryKey: ["clientes-lancar", clienteSearch],
    queryFn: async () => {
      let q = supabase.from("clientes").select("id, nome").order("nome").limit(20);
      if (clienteSearch.trim()) q = q.ilike("nome", `%${clienteSearch.trim()}%`);
      const { data } = await q;
      return data ?? [];
    },
    enabled: campo === "fiado",
  });

  const listarFn = useServerFn(listarLancamentosSimples);
  const registrarFn = useServerFn(registrarLancamento);
  const removerFn = useServerFn(removerLancamentoSimples);
  const listarEstoqueFn = useServerFn(listarEstoque);
  const listarUsuariosFn = useServerFn(listarUsuarios);

  const qUsuarios = useQuery({
    queryKey: ["usuarios-lancar-filtro"],
    queryFn: () => listarUsuariosFn({}),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const q = useQuery({
    queryKey: ["lancamentos-simples", dia, filtroOperador],
    queryFn: () =>
      listarFn({
        data: {
          data: dia,
          ...(isAdmin && filtroOperador ? { operadorId: filtroOperador } : {}),
        },
      }),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const qModelos = useQuery({
    queryKey: ["modelos-bolao-lancar"],
    queryFn: async () => {
      const resNovo = await listarEstoqueFn({ data: { situacao: "ativo" } });
      const norm = (s: unknown) =>
        String(s ?? "")
          .trim()
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ");
      const hojeStr = hoje();
      // Estoque atual agrupado por bolão (nome + concurso + preço): é o que dá para vender.
      const grupos = new Map<string, ModeloBolao>();
      for (const e of resNovo.estoques ?? []) {
        // Rodada já sorteada não aparece para o operador — evita baixa no
        // concurso antigo por engano (o lote precisa ser rolado pelo admin).
        if (e.data && e.data < hojeStr) continue;
        const nome = String(e.nome ?? "").trim();
        const conc = String(e.concurso ?? "").trim();
        const chave = `${norm(nome)}|${conc}|${e.valorCota}|${e.taxa}`;
        const atual = grupos.get(chave);
        if (atual) {
          atual.ids.push(e.id);
          if (atual.disponiveis !== null) atual.disponiveis += Number(e.disponiveis ?? 0);
          if (atual.totalCotas !== null) atual.totalCotas += Number(e.cotas ?? 0);
          continue;
        }
        grupos.set(chave, {
          id: e.id,
          ids: [e.id],
          concurso: `${nome}${conc ? ` ${conc}` : ""}`.trim(),
          nome,
          valorCota: e.valorCota,
          taxa: e.taxa,
          disponiveis: Number(e.disponiveis ?? 0),
          totalCotas: Number(e.cotas ?? 0),
          estoqueConcurso: conc,
        });
      }
      return [...grupos.values()].sort((a, b) => {
        const esgotadoA = a.disponiveis === 0 ? 1 : 0;
        const esgotadoB = b.disponiveis === 0 ? 1 : 0;
        if (esgotadoA !== esgotadoB) return esgotadoA - esgotadoB;
        return compararBoloes({ nome: a.nome || a.concurso }, { nome: b.nome || b.concurso });
      });
    },
    staleTime: 30_000,
  });
  const modelos = qModelos.data ?? [];

  // Concurso em vigência da modalidade do bolão aberto no mini-modal — o
  // número digitado/preenchido deve ser o da rodada atual, não o do lote.
  const proximoFn = useServerFn(buscarProximoConcurso);
  const modRapido = bolaoRapido ? achaModalidade(bolaoRapido.nome || bolaoRapido.concurso) : null;
  const qProximo = useQuery({
    queryKey: ["proximo-concurso-lancar", modRapido?.id ?? ""],
    queryFn: () => proximoFn({ data: { modalidade: modRapido?.id ?? "" } }),
    enabled: Boolean(bolaoRapido && modRapido),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const vigente = qProximo.data?.ok ? String(qProximo.data.concurso) : "";

  // Ao carregar o concurso oficial, preenche o campo (se o operador ainda não digitou outro).
  useEffect(() => {
    if (!vigente || !bolaoRapido) return;
    setRapidoConcurso((atual) =>
      atual === "" || atual === bolaoRapido.estoqueConcurso ? vigente : atual,
    );
  }, [vigente, bolaoRapido]);

  // Formulário principal (sem modal): concurso do modelo escolhido já aparece preenchido.
  useEffect(() => {
    if (aberto !== "BOLAO" || modoManual || descricao) return;
    const m = modelos.find((x) => x.id === modeloId);
    if (m?.estoqueConcurso) setDescricao(m.estoqueConcurso);
  }, [aberto, modoManual, descricao, modeloId, modelos]);

  const abrir = (tipo: TipoLancamento) => {
    setAberto(tipo);
    setCampo(opcoesCampo(tipo)[0]?.key ?? "");
    setModeloId(modelos[0]?.id ?? "");
    setQuantidade("1");
    setValor("");
    setDescricao("");
    setErro("");
    setOkMsg("");
    setClienteId(null);
    setClienteNome("");
    setClienteSearch("");
    setModoManual(false);
    setValorManual("");
    setTaxaManual("");
  };

  const fechar = () => {
    setAberto(null);
    setErro("");
  };

  // Atalho ?tipo=bolao: abre direto na seção de bolões (Início → Vender cota).
  const busca = Route.useSearch();
  const [atalhoUsado, setAtalhoUsado] = useState(false);
  useEffect(() => {
    if (atalhoUsado || acessoLoading || caixaLoading) return;
    if (busca.tipo !== "bolao") return;
    if (!isAdmin && !caixaAberto) return;
    setAtalhoUsado(true);
    abrir("BOLAO");
  }, [busca.tipo, atalhoUsado, acessoLoading, caixaLoading, isAdmin, caixaAberto]);

  const salvarRapido = async () => {
    if (!bolaoRapido) return;
    const quant = Math.trunc(Number(rapidoQuant));
    if (!Number.isFinite(quant) || quant < 1) {
      setRapidoErro("Informe a quantidade de cotas (mínimo 1).");
      return;
    }
    if (bolaoRapido.disponiveis !== null && quant > bolaoRapido.disponiveis) {
      setRapidoErro(
        bolaoRapido.disponiveis === 0
          ? "Esgotado: não há cotas disponíveis nesse bolão."
          : `Estoque insuficiente: restam ${bolaoRapido.disponiveis} cota(s).`,
      );
      return;
    }
    setRapidoSalvando(true);
    setRapidoErro("");
    const enviar = (confirmar: boolean) =>
      registrarFn({
        data: {
          tipo: "BOLAO",
          valor: bolaoRapido.valorCota,
          descricao: rapidoConcurso || null,
          campo: `bolao:${bolaoRapido.id}`,
          quantidade: quant,
          taxa: bolaoRapido.taxa,
          data: dia,
          estoqueIds: bolaoRapido.ids,
          confirmarConcurso: confirmar,
        },
      });
    let res = await enviar(false);
    // Concurso digitado não tem lote: pergunta antes de baixar no estoque atual.
    if (!res.ok && res.falha === "concurso_diferente" && window.confirm(res.erro)) {
      res = await enviar(true);
    }
    setRapidoSalvando(false);
    if (!res.ok) {
      setRapidoErro(res.erro);
      await qc.invalidateQueries({ queryKey: ["modelos-bolao-lancar"] });
      return;
    }
    setBolaoRapido(null);
    setRapidoConcurso("");
    setRapidoQuant("1");
    setOkMsg(
      `${bolaoRapido.concurso} — ${quant} cota(s) lançada(s) com sucesso!` +
        (res.aviso ? ` ${res.aviso}` : ""),
    );
    await qc.invalidateQueries({ queryKey: ["lancamentos-simples"] });
    await qc.invalidateQueries({ queryKey: ["modelos-bolao-lancar"] });
  };

  const totalGaveta = SALDO_ITENS.reduce((acc, i) => acc + num(gaveta[i.key as SaldoKey]), 0);

  const salvarGaveta = async () => {
    const itensComValor = SALDO_ITENS.filter((i) => num(gaveta[i.key as SaldoKey]) > 0);
    if (itensComValor.length === 0) {
      setGavetaErro("Preencha pelo menos um campo.");
      return;
    }
    setGavetaSalvando(true);
    setGavetaErro("");
    const resultados = await Promise.allSettled(
      itensComValor.map((item) =>
        registrarFn({
          data: {
            tipo: "GAVETA",
            valor: num(gaveta[item.key as SaldoKey]),
            descricao: null,
            campo: `saldo:${item.key}`,
            data: dia,
          },
        })
      )
    );
    setGavetaSalvando(false);
    const sucesso = resultados.filter((r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<{ ok: boolean }>).value?.ok);
    const falhas = resultados.filter((r) => r.status === "rejected" || !(r as PromiseFulfilledResult<{ ok: boolean }>).value?.ok);
    if (falhas.length > 0) {
      setGavetaErro(`${falhas.length} item(ns) falharam ao salvar. Tente novamente.`);
    }
    if (sucesso.length > 0) {
      setGaveta(saldoVazio());
      setOkMsg(`${sucesso.length} item(ns) da gaveta lançado(s) com sucesso!`);
      await qc.invalidateQueries({ queryKey: ["lancamentos-simples"] });
    }
  };

  const salvar = async () => {
    if (!aberto) return;
    if (aberto === "BOLAO") {
      if (modoManual) {
        if (!descricao.trim()) {
          setErro("Informe o nome do bolão.");
          return;
        }
        const val = Number(valorManual.replace(/\./g, "").replace(",", "."));
        if (!Number.isFinite(val) || val <= 0) {
          setErro("Informe o valor da cota.");
          return;
        }
        const quant = Math.trunc(Number(quantidade));
        if (!Number.isFinite(quant) || quant < 1) {
          setErro("Informe a quantidade de cotas (mínimo 1).");
          return;
        }
        setSalvando(true);
        setErro("");
        const taxa = Number(taxaManual.replace(/\./g, "").replace(",", ".")) || 0;
        const res = await registrarFn({
          data: {
            tipo: "BOLAO",
            valor: val,
            descricao,
            campo: "bolao:manual",
            quantidade: quant,
            taxa,
            data: dia,
          },
        });
        setSalvando(false);
        if (!res.ok) {
          setErro(res.erro);
          return;
        }
        setOkMsg(
          "Bolão lançado no controle de bolões do fechamento." +
            (res.aviso ? ` ${res.aviso}` : ""),
        );
        setAberto(null);
        setDescricao("");
        setQuantidade("1");
        setValorManual("");
        setTaxaManual("");
        setModoManual(false);
        await qc.invalidateQueries({ queryKey: ["lancamentos-simples"] });
        return;
      }
      const modelo = modelos.find((m) => m.id === modeloId);
      if (!modelo) {
        setErro("Escolha o modelo de bolão.");
        return;
      }
      const quant = Math.trunc(Number(quantidade));
      if (!Number.isFinite(quant) || quant < 1) {
        setErro("Informe a quantidade de cotas (mínimo 1).");
        return;
      }
      if (modelo.disponiveis !== null && quant > modelo.disponiveis) {
        setErro(
          modelo.disponiveis === 0
            ? "Esgotado: não há cotas disponíveis nesse bolão."
            : `Estoque insuficiente: restam ${modelo.disponiveis} cota(s).`,
        );
        return;
      }
      setSalvando(true);
      setErro("");
      const enviar = (confirmar: boolean) =>
        registrarFn({
          data: {
            tipo: "BOLAO",
            valor: modelo.valorCota,
            descricao,
            campo: `bolao:${modelo.id}`,
            quantidade: quant,
            taxa: modelo.taxa,
            data: dia,
            estoqueIds: modelo.ids,
            confirmarConcurso: confirmar,
          },
        });
      let res = await enviar(false);
      // Concurso digitado não tem lote: pergunta antes de baixar no estoque atual.
      if (!res.ok && res.falha === "concurso_diferente" && window.confirm(res.erro)) {
        res = await enviar(true);
      }
      setSalvando(false);
      if (!res.ok) {
        setErro(res.erro);
        await qc.invalidateQueries({ queryKey: ["modelos-bolao-lancar"] });
        return;
      }
      setOkMsg(
        "Bolão lançado no controle de bolões do fechamento." +
          (res.aviso ? ` ${res.aviso}` : ""),
      );
      setAberto(null);
      setDescricao("");
      setQuantidade("1");
      await qc.invalidateQueries({ queryKey: ["lancamentos-simples"] });
      await qc.invalidateQueries({ queryKey: ["modelos-bolao-lancar"] });
      return;
    }
    const numero = Number(valor.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(numero) || numero === 0) {
      setErro("Informe um valor diferente de zero.");
      return;
    }
    setSalvando(true);
    setErro("");

    if (campo === "fiado") {
      if (!clienteId) {
        setErro("Selecione um cliente para lançar fiado.");
        setSalvando(false);
        return;
      }
      const hoje = new Date().toISOString().slice(0, 10);
      const vencimento = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErro("Usuário não autenticado."); setSalvando(false); return; }

      const { error: fiadoErr } = await supabase.from("fiados").insert({
        cliente_id: clienteId,
        valor: numero,
        descricao: descricao || "Fiado lançado via Lançar",
        data_inicio: dia || hoje,
        data_vencimento: vencimento,
        observacao: null,
        lancado_por: user.id,
      });
      if (fiadoErr) { setErro(fiadoErr.message); setSalvando(false); return; }
    }

    const res = await registrarFn({
      data: {
        tipo: aberto,
        valor: numero,
        descricao,
        campo,
        data: dia,
      },
    });
    setSalvando(false);
    if (!res.ok) {
      setErro(res.erro);
      return;
    }
    setOkMsg(
      aberto === "GAVETA"
        ? "Valor da gaveta lançado."
        : aberto === "RELATORIO"
          ? "Relatório lançado."
          : "Valor do caixa lançado.",
    );
    setAberto(null);
    setValor("");
    setDescricao("");
    setClienteId(null);
    setClienteNome("");
    setClienteSearch("");
    await qc.invalidateQueries({ queryKey: ["lancamentos-simples"] });
  };

  const excluir = async (id: string) => {
    const res = await removerFn({ data: { id } });
    if (!res.ok) {
      setErro(res.erro);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["lancamentos-simples"] });
  };

  const lancamentos = q.data?.lancamentos ?? [];

  useEffect(() => {
    if (acessoLoading) return;
    if (isAdmin) return;
    if (!caixaLoading && !caixaAberto) {
      navigate({ to: "/inicio" });
    }
  }, [caixaLoading, caixaAberto, isAdmin, acessoLoading, navigate]);

  if (acessoLoading || caixaLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAdmin && !caixaAberto) return null;

  const botoes: Array<{
    tipo: TipoLancamento;
    label: string;
    sublabel: string;
    valor: string;
    icone: React.ComponentType<{ className?: string }>;
    cor: string;
  }> = [
    { tipo: "GAVETA", label: "Gaveta", sublabel: `${filtroOperador ? "Total do operador" : "Total do dia"}: ${brl(q.data?.totalGaveta ?? 0)}`, valor: brl(q.data?.totalGaveta ?? 0), icone: Wallet, cor: "amber" },
    { tipo: "CAIXA", label: "Caixa", sublabel: `${filtroOperador ? "Total do operador" : "Total do dia"}: ${brl(q.data?.totalCaixa ?? 0)}`, valor: brl(q.data?.totalCaixa ?? 0), icone: Banknote, cor: "sky" },
    { tipo: "BOLAO", label: "Bolão", sublabel: `${filtroOperador ? "Cotas do operador" : "Cotas no dia"}: ${q.data?.totalBolaoCotas ?? 0}`, valor: `${q.data?.totalBolaoCotas ?? 0} cotas`, icone: Ticket, cor: "violet" },
    { tipo: "RELATORIO", label: "Relatório", sublabel: `${filtroOperador ? "Total do operador" : "Total do dia"}: ${brl(q.data?.totalRelatorio ?? 0)}`, valor: brl(q.data?.totalRelatorio ?? 0), icone: FileText, cor: "slate" },
  ];

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <AppNav />

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Lançar valores</h1>
            <p className="text-sm text-muted-foreground">
              Escolha o tipo, preencha os dados e confirme.
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
                  {(qUsuarios.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome || u.email}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Data
              <input
                type="date"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              />
            </label>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          {botoes.map((b) => {
            const ativo = aberto === b.tipo;
            const corClasses: Record<string, string> = {
              amber: ativo ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "border-border bg-card hover:bg-accent",
              sky: ativo ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-400" : "border-border bg-card hover:bg-accent",
              violet: ativo ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-400" : "border-border bg-card hover:bg-accent",
              slate: ativo ? "border-slate-500 bg-slate-500/10 text-slate-700 dark:text-slate-400" : "border-border bg-card hover:bg-accent",
            };
            return (
              <button
                key={b.tipo}
                type="button"
                onClick={() => abrir(b.tipo)}
                className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${corClasses[b.cor]}`}
              >
                <b.icone className="h-6 w-6 shrink-0" />
                <div>
                  <span className="text-base font-semibold">{b.label}</span>
                  <span className="block text-xs text-muted-foreground">{b.sublabel}</span>
                </div>
              </button>
            );
          })}
        </section>

        {okMsg && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            {okMsg}
          </div>
        )}

        {aberto && (
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              {aberto === "GAVETA"
                ? "Novo lançamento de gaveta"
                : aberto === "BOLAO"
                  ? "Novo lançamento de bolão"
                  : aberto === "RELATORIO"
                    ? "Novo lançamento de relatório"
                    : "Novo lançamento de caixa"}
            </h2>
            {aberto === "BOLAO" ? (
              <div className="grid gap-3">
                <div>
                  <span className="text-xs font-medium text-muted-foreground mb-2 block">Modelo de bolão</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {modelos.map((m) => {
                      const cor = getLoteriaDotColor(m.nome || m.concurso);
                      const rowStyle = getLoteriaRowStyle(m.nome || m.concurso);
                      const esgotado = m.disponiveis === 0;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={esgotado}
                          onClick={() => { setBolaoRapido(m); setRapidoConcurso(m.estoqueConcurso); setRapidoQuant("1"); setRapidoErro(""); setModeloId(m.id); setDescricao(m.estoqueConcurso); }}
                          style={rowStyle}
                          className="flex items-center gap-2 rounded-lg border-2 border-border p-2.5 text-left text-sm transition-all hover:border-primary/50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">{m.concurso}</span>
                            <span className="block text-xs text-muted-foreground">{brl(m.valorCota)}</span>
                            <span
                              className={`block text-xs font-medium ${
                                m.disponiveis === null
                                  ? "text-muted-foreground/70"
                                  : esgotado
                                    ? "text-destructive"
                                    : m.disponiveis <= 5
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {m.disponiveis === null
                                ? "sem estoque"
                                : esgotado
                                  ? "esgotado"
                                  : `${m.disponiveis} de ${m.totalCotas ?? "?"} disp.`}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => { setModoManual(true); setDescricao(""); setValorManual(""); setTaxaManual(""); }}
                      className={`flex items-center gap-2 rounded-lg border-2 border-dashed p-2.5 text-left text-sm transition-all ${
                        modoManual
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:border-primary/30"
                      }`}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full bg-gray-400" />
                      <div>
                        <span className="block font-medium text-foreground">Outro</span>
                        <span className="block text-xs text-muted-foreground">digitar</span>
                      </div>
                    </button>
                  </div>
                </div>
                {modoManual ? (
                  <>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Nome do bolão</span>
                      <input
                        autoFocus
                        value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                        placeholder="Ex.: Lotofácil, Quina..."
                        className="h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Valor da cota (R$)</span>
                      <input
                        inputMode="decimal"
                        value={valorManual}
                        onChange={(e) => setValorManual(e.target.value)}
                        placeholder="0,00"
                        className="h-10 rounded-md border border-input bg-background px-2.5 text-right text-base font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Taxa por cota (R$)</span>
                      <input
                        inputMode="decimal"
                        value={taxaManual}
                        onChange={(e) => setTaxaManual(e.target.value)}
                        placeholder="0,00"
                        className="h-10 rounded-md border border-input bg-background px-2.5 text-right text-base font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                  </>
                ) : (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Concurso</span>
                    <input
                      autoFocus
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Nº do concurso"
                      className="h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                )}
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Quantidade de cotas</span>
                  <input
                    inputMode="numeric"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                    placeholder="1"
                    className="h-10 rounded-md border border-input bg-background px-2.5 text-right text-base font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>
            ) : aberto === "GAVETA" ? (
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold text-foreground mb-1">Saldo Final do Caixa</h3>
                {SALDO_ITENS.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                    <input
                      inputMode="decimal"
                      value={gaveta[item.key as SaldoKey]}
                      onChange={(e) => setGaveta((g) => ({ ...g, [item.key]: e.target.value }))}
                      placeholder="0"
                      className="h-9 w-28 rounded-md border border-input bg-background px-3 text-right text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 mt-1">
                  <span className="text-sm font-bold uppercase text-foreground">Total</span>
                  <span className="text-lg font-bold text-foreground">{brl(totalGaveta)}</span>
                </div>
                {gavetaErro && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {gavetaErro}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {aberto === "RELATORIO"
                      ? "Campo relatório"
                      : "Campo do fechamento"}
                  </span>
                  <select
                    value={campo}
                    onChange={(e) => setCampo(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  >
                    {opcoesCampo(aberto).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Valor (R$)</span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="0,00"
                    className="h-10 rounded-md border border-input bg-background px-2.5 text-right text-base font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-xs font-medium text-muted-foreground">Descrição (opcional)</span>
                  <input
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Ex.: sangria, suprimento"
                    className="h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                {campo === "fiado" && (
                  <label className="flex flex-col gap-1.5 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Cliente *</span>
                    {clienteId ? (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                          {clienteNome}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setClienteId(null); setClienteNome(""); setClienteSearch(""); }}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          Trocar
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <input
                          autoFocus
                          value={clienteSearch}
                          onChange={(e) => { setClienteSearch(e.target.value); setClienteId(null); setClienteNome(""); }}
                          placeholder="Buscar cliente pelo nome..."
                          className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                        />
                        {clientesEncontrados && clientesEncontrados.length > 0 && !clienteId && (
                          <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-card shadow-sm">
                            {clientesEncontrados.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => { setClienteId(c.id); setClienteNome(c.nome); setClienteSearch(""); }}
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                              >
                                {c.nome}
                              </button>
                            ))}
                          </div>
                        )}
                        {clienteSearch && clientesEncontrados && clientesEncontrados.length === 0 && (
                          <p className="text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
                        )}
                      </div>
                    )}
                  </label>
                )}
              </div>
            )}

            {erro && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => aberto === "GAVETA" ? void salvarGaveta() : void salvar()}
                disabled={salvando || gavetaSalvando}
                className="inline-flex h-12 sm:h-10 items-center justify-center gap-2 rounded-lg sm:rounded-md bg-primary px-6 text-base sm:text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {(salvando || gavetaSalvando) ? (
                  <>
                    <Loader2 className="h-5 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : aberto === "GAVETA" ? (
                  "Enviar saldo final"
                ) : (
                  "Confirmar lançamento"
                )}
              </button>
              <button
                type="button"
                onClick={fechar}
                className="inline-flex h-12 sm:h-10 items-center justify-center rounded-lg sm:rounded-md border border-input px-6 text-base sm:text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </section>
        )}

        <LancamentosDoDia
          lancamentos={lancamentos as LancamentoItem[]}
          modelos={modelos}
          carregando={q.isPending}
          erro={
            q.isError
              ? q.error instanceof Error
                ? q.error.message
                : "Falha ao carregar."
              : null
          }
          filtroOperador={filtroOperador}
          admin={Boolean(q.data?.admin)}
          onExcluir={setExcluirLanc}
        />
      </div>

      {bolaoRapido && (
        <BolaoRapidoModal
          bolao={bolaoRapido}
          concurso={rapidoConcurso}
          onConcurso={setRapidoConcurso}
          quantidade={rapidoQuant}
          onQuantidade={setRapidoQuant}
          erro={rapidoErro}
          salvando={rapidoSalvando}
          vigente={vigente}
          buscandoVigente={Boolean(modRapido) && qProximo.isLoading}
          onConfirmar={() => void salvarRapido()}
          onCancelar={() => setBolaoRapido(null)}
        />
      )}

      {excluirLanc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Excluir lançamento</h3>
            <p className="mt-2 text-sm text-muted-foreground">Tem certeza que deseja excluir este lançamento?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setExcluirLanc(null)} className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent">Cancelar</button>
              <button
                onClick={() => { excluir(excluirLanc); setExcluirLanc(null); }}
                className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:opacity-90"
              >Excluir</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
