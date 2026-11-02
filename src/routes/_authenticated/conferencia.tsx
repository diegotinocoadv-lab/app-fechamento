import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { Trash2 } from "lucide-react";
import {
  conferenciaBancaria,
  registrarMovimentoBancario,
  removerMovimentoBancario,
  salvarExtratoBancario,
} from "@/lib/contas.functions";
import { meuAcesso } from "@/lib/usuarios.functions";
import { brl, num } from "@/lib/fechamento-campos";

export const Route = createFileRoute("/_authenticated/conferencia")({
  validateSearch: (search: Record<string, unknown>) => ({
    data: typeof search["data"] === "string" ? search["data"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Conferência com o extrato | Brasil da Sorte" },
      {
        name: "description",
        content:
          "Quadro de entradas e saídas das contas bancárias 043 e 003 para conferência contra o extrato do banco.",
      },
    ],
  }),
  component: Conferencia,
});

const hojeSp = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

const fmtInput = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

type FormMov = { sentido: string; valor: string; descricao: string };
type FormExtrato = { inicial: string; final: string };

function Conferencia() {
  const qc = useQueryClient();
  const acessoFn = useServerFn(meuAcesso);
  const conferenciaFn = useServerFn(conferenciaBancaria);
  const movimentoFn = useServerFn(registrarMovimentoBancario);
  const extratoFn = useServerFn(salvarExtratoBancario);
  const removerMovFn = useServerFn(removerMovimentoBancario);

  const [dia, setDia] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [confirmarRemocao, setConfirmarRemocao] = useState<{
    id: string;
    texto: string;
  } | null>(null);
  // Data também fica na URL: sobrevive a recarregar a página.
  const busca = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const trocarDia = (nova: string) => {
    setDia(nova);
    void navigate({ search: (s) => ({ ...s, data: nova }) });
  };
  const [form, setForm] = useState<Record<string, FormMov>>({
    "CONTA 043": { sentido: "entrada", valor: "", descricao: "" },
    "CONTA 003": { sentido: "entrada", valor: "", descricao: "" },
  });
  const [extratos, setExtratos] = useState<Record<string, FormExtrato>>({
    "CONTA 043": { inicial: "", final: "" },
    "CONTA 003": { inicial: "", final: "" },
  });
  const [tocado, setTocado] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDia(busca.data || hojeSp());
  }, []);

  const acesso = useQuery({
    queryKey: ["meu-acesso"],
    queryFn: () => acessoFn({}),
    staleTime: 5 * 60 * 1000,
  });
  const admin = Boolean(acesso.data?.admin);

  const conf = useQuery({
    queryKey: ["conferencia-bancaria", dia],
    queryFn: () => conferenciaFn({ data: { data: dia } }),
    enabled: admin && !!dia,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!conf.data) return;
    setExtratos((atual) => {
      const novo = { ...atual };
      for (const c of conf.data.contas) {
        if (tocado[c.conta]) continue;
        novo[c.conta] = {
          inicial: c.extrato.saldoInicial == null ? "" : fmtInput(c.extrato.saldoInicial),
          final: c.extrato.saldoFinal == null ? "" : fmtInput(c.extrato.saldoFinal),
        };
      }
      return novo;
    });
  }, [conf.data, tocado]);

  const movimentoMut = useMutation({
    mutationFn: (v: { conta: string }) => {
      const f = form[v.conta] ?? { sentido: "entrada", valor: "", descricao: "" };
      return movimentoFn({
        data: {
          data: dia,
          conta: v.conta as never,
          sentido: f.sentido as never,
          valor: num(f.valor),
          descricao: f.descricao,
        },
      });
    },
    onSuccess: (_r, v) => {
      setErro("");
      setForm((f) => ({ ...f, [v.conta]: { sentido: "entrada", valor: "", descricao: "" } }));
      void qc.invalidateQueries({ queryKey: ["conferencia-bancaria"] });
      void qc.invalidateQueries({ queryKey: ["historico-contas"] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao lançar o movimento."),
  });

  const extratoMut = useMutation({
    mutationFn: (v: { conta: string }) => {
      const f = extratos[v.conta] ?? { inicial: "", final: "" };
      return extratoFn({
        data: {
          data: dia,
          conta: v.conta as never,
          saldoInicial: num(f.inicial),
          saldoFinal: num(f.final),
        },
      });
    },
    onSuccess: (_r, v) => {
      setErro("");
      setTocado((t) => ({ ...t, [v.conta]: false }));
      void qc.invalidateQueries({ queryKey: ["conferencia-bancaria"] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao salvar o extrato."),
  });

  const lista = conf.data?.contas ?? [];

  // Contas com extrato alterado e preenchido (ainda não salvas).
  const pendentesExtrato = lista.filter((c) => {
    if (!tocado[c.conta]) return false;
    const f = extratos[c.conta] ?? { inicial: "", final: "" };
    return f.inicial !== "" && f.final !== "";
  });

  const extratoTudoMut = useMutation({
    mutationFn: async () => {
      let salvos = 0;
      for (const c of pendentesExtrato) {
        const f = extratos[c.conta] ?? { inicial: "", final: "" };
        const r = await extratoFn({
          data: {
            data: dia,
            conta: c.conta as never,
            saldoInicial: num(f.inicial),
            saldoFinal: num(f.final),
          },
        });
        if (r && (r as { ok?: boolean }).ok === false) {
          throw new Error("Uma das contas não pôde ser salva. Tente novamente.");
        }
        salvos += 1;
      }
      return salvos;
    },
    onSuccess: (n) => {
      setErro("");
      setAviso(`${n} extrato(s) salvo(s) com sucesso.`);
      setTocado({});
      void qc.invalidateQueries({ queryKey: ["conferencia-bancaria"] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao salvar os extratos."),
  });

  const removerMovMut = useMutation({
    mutationFn: (id: string) => removerMovFn({ data: { id } }),
    onSuccess: (r) => {
      if (!r?.ok) {
        setErro(r?.erro || "Não foi possível excluir o lançamento.");
        return;
      }
      setErro("");
      setAviso("Lançamento excluído.");
      setConfirmarRemocao(null);
      void qc.invalidateQueries({ queryKey: ["conferencia-bancaria"] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao excluir o lançamento."),
  });

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <AppNav />

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Conferência com o extrato
          </h1>
          <p className="text-sm text-muted-foreground">
            Quadro de entradas e saídas das contas bancárias calculado a partir dos fechamentos,
            transferências e lançamentos manuais. Informe os saldos do extrato para conferir.
          </p>
        </header>

        {!acesso.isPending && !admin && (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-destructive">
            Acesso restrito aos administradores.
          </p>
        )}

        {admin && (
          <>
            <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Data
                <input
                  type="date"
                  value={dia}
                  onChange={(e) => trocarDia(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <button
                type="button"
                onClick={() => trocarDia(hojeSp())}
                className="h-9 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-muted"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => void conf.refetch()}
                className="h-9 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-muted"
              >
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => extratoTudoMut.mutate()}
                disabled={extratoTudoMut.isPending || pendentesExtrato.length === 0}
                title={
                  pendentesExtrato.length === 0
                    ? "Preencha os saldos do extrato para salvar"
                    : `Salvar os extratos de ${pendentesExtrato.length} conta(s)`
                }
                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {extratoTudoMut.isPending
                  ? "Salvando..."
                  : `Salvar extratos${pendentesExtrato.length > 0 ? ` (${pendentesExtrato.length})` : ""}`}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="h-9 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-muted no-print"
              >
                Imprimir
              </button>
              {conf.data && (
                <span className="ml-auto text-xs text-muted-foreground">
                  Dia anterior considerado: <strong>{conf.data.diaAnterior}</strong>
                </span>
              )}
            </section>

            {erro && (
              <p className="rounded-lg border border-border bg-card p-3 text-sm text-destructive">
                {erro}
              </p>
            )}
            {aviso && !erro && (
              <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                {aviso}
              </p>
            )}

            {conf.isPending && (
              <p className="text-sm text-muted-foreground" role="status">
                Carregando conferência...
              </p>
            )}
            {conf.isError && (
              <p className="text-sm text-destructive">
                {conf.error instanceof Error
                  ? conf.error.message
                  : "Falha ao carregar a conferência."}
              </p>
            )}

            {conf.data && (
              <div className="grid gap-4 lg:grid-cols-2">
                {lista.map((c) => {
                  const fEx = extratos[c.conta] ?? { inicial: "", final: "" };
                  const fMov = form[c.conta] ?? { sentido: "entrada", valor: "", descricao: "" };
                  const preenchido = fEx.inicial !== "" && fEx.final !== "";
                  const liqExt = num(fEx.final) - num(fEx.inicial);
                  const dif = c.liquido - liqExt;
                  const confere = Math.abs(dif) < 0.005;

                  return (
                    <section
                      key={c.conta}
                      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
                    >
                      <header className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-foreground">{c.rotulo}</h2>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Conta bancária
                        </span>
                      </header>

                      <div className="flex flex-col gap-1">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Entradas
                        </h3>
                        {c.entradas.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhuma entrada no dia.</p>
                        ) : (
                          c.entradas.map((i, idx) => (
                            <div
                              key={`${i.rotulo}-${idx}`}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <span className="text-foreground">{i.rotulo}</span>
                              <span className="whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
                                {brl(i.valor)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Saídas
                        </h3>
                        {c.saidas.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhuma saída no dia.</p>
                        ) : (
                          c.saidas.map((i, idx) => (
                            <div
                              key={`${i.rotulo}-${idx}`}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <span className="text-foreground">{i.rotulo}</span>
                              <span className="whitespace-nowrap font-medium text-destructive">
                                - {brl(i.valor)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2">
                        <span className="text-sm font-medium text-foreground">
                          Líquido calculado (app)
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {brl(c.liquido)}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Conferir com o extrato
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Saldo no extrato (início do dia)
                            <input
                              inputMode="decimal"
                              value={fEx.inicial}
                              onChange={(e) => {
                                setTocado((t) => ({ ...t, [c.conta]: true }));
                                setExtratos((x) => ({
                                  ...x,
                                  [c.conta]: { ...fEx, inicial: e.target.value },
                                }));
                              }}
                              placeholder="0,00"
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Saldo no extrato (fim do dia)
                            <input
                              inputMode="decimal"
                              value={fEx.final}
                              onChange={(e) => {
                                setTocado((t) => ({ ...t, [c.conta]: true }));
                                setExtratos((x) => ({
                                  ...x,
                                  [c.conta]: { ...fEx, final: e.target.value },
                                }));
                              }}
                              placeholder="0,00"
                              className={inputCls}
                            />
                          </label>
                        </div>

                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">Líquido do extrato</span>
                          <span className="font-medium text-foreground">
                            {preenchido ? brl(liqExt) : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-foreground">Diferença</span>
                          {!preenchido ? (
                            <span className="text-xs text-muted-foreground">
                              Informe os dois saldos do extrato para conferir.
                            </span>
                          ) : confere ? (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              Confere ✓
                            </span>
                          ) : (
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                              Diverge: {brl(dif)}
                            </span>
                          )}
                        </div>
                        {tocado[c.conta] && preenchido && (
                          <span className="w-fit rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            Alterado — não salvo
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => extratoMut.mutate({ conta: c.conta })}
                          disabled={extratoMut.isPending || !preenchido}
                          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                          {extratoMut.isPending ? "Salvando..." : "Salvar extrato"}
                        </button>
                        {c.extrato.quando && (
                          <span className="text-xs text-muted-foreground">
                            Extrato salvo em{" "}
                            {new Date(c.extrato.quando).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            .
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Lançamento manual (tarifa, pix extra...)
                        </h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Tipo
                            <select
                              value={fMov.sentido}
                              onChange={(e) =>
                                setForm((fm) => ({
                                  ...fm,
                                  [c.conta]: { ...fMov, sentido: e.target.value },
                                }))
                              }
                              className={inputCls}
                            >
                              <option value="entrada">Entrada</option>
                              <option value="saida">Saída</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Valor
                            <input
                              inputMode="decimal"
                              value={fMov.valor}
                              onChange={(e) =>
                                setForm((fm) => ({
                                  ...fm,
                                  [c.conta]: { ...fMov, valor: e.target.value },
                                }))
                              }
                              placeholder="0,00"
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                            Descrição
                            <input
                              value={fMov.descricao}
                              onChange={(e) =>
                                setForm((fm) => ({
                                  ...fm,
                                  [c.conta]: { ...fMov, descricao: e.target.value },
                                }))
                              }
                              placeholder="Ex.: tarifa bancária"
                              maxLength={200}
                              className={inputCls}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => movimentoMut.mutate({ conta: c.conta })}
                          disabled={movimentoMut.isPending || num(fMov.valor) <= 0}
                          className="h-9 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                          {movimentoMut.isPending ? "Lançando..." : "Lançar"}
                        </button>
                      </div>

                      {c.movimentos.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Movimentos manuais do dia
                          </h3>
                              {c.movimentos.map((m, idx) => (
                                <div
                                  key={m.id || `${m.quando}-${idx}`}
                                  className="flex items-center justify-between gap-3 text-sm"
                                >
                                  <span className="text-foreground">
                                    <span className="text-muted-foreground">
                                      {new Date(m.quando).toLocaleString("pt-BR", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}{" "}
                                      · {m.quem} ·{" "}
                                    </span>
                                    {m.texto}
                                  </span>
                                  <span className="flex items-center gap-2 whitespace-nowrap">
                                    <span className="font-medium text-foreground">
                                      {brl(m.valor)}
                                    </span>
                                    {m.removivel && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmarRemocao({ id: m.id, texto: m.texto })
                                        }
                                        title="Excluir este lançamento"
                                        className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </span>
                                </div>
                              ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}

        {confirmarRemocao && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
              <h3 className="text-base font-semibold text-foreground">Excluir lançamento</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {confirmarRemocao.texto} — o valor sai da conferência do dia. A exclusão
                fica registrada no histórico.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmarRemocao(null)}
                  className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => removerMovMut.mutate(confirmarRemocao.id)}
                  disabled={removerMovMut.isPending}
                  className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {removerMovMut.isPending ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
