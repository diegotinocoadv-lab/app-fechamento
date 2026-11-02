import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import {
  aportarConta,
  CONTAS_LOTERICA,
  estornarTransferencia,
  listarContas,
  listarHistoricoContas,
  listarTransferencias,
  removerConta,
  rotuloConta,
  salvarConta,
  transferirEntreContas,
} from "@/lib/contas.functions";
import { meuAcesso } from "@/lib/usuarios.functions";
import { brl, num } from "@/lib/fechamento-campos";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => ({
    meta: [
      { title: "Contas da lotérica | Brasil da Sorte" },
      {
        name: "description",
        content:
          "Painel exclusivo do administrador para lançar e acompanhar os valores das contas da lotérica por data.",
      },
      { property: "og:title", content: "Contas da lotérica | Brasil da Sorte" },
      {
        property: "og:description",
        content: "Controle administrativo das contas 043, 003, retaguarda, comissão e demais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Contas,
});

const hojeSp = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

function descreverEvento(acao: string, d: Record<string, unknown>): string {
  const n = (x: unknown) => Number(x ?? 0);
  const c = rotuloConta(String(d["conta"] ?? ""));
  const origem = rotuloConta(String(d["origem"] ?? ""));
  const destino = rotuloConta(String(d["destino"] ?? ""));
  switch (acao) {
    case "conta_salva":
      return `Alterou ${c}: ${brl(n(d["de"]))} → ${brl(n(d["para"]))}`;
    case "conta_limpa":
      return `Removeu o valor de ${c} (era ${brl(n(d["valor"]))})`;
    case "conta_aporte":
      return `Aporte em ${c}: +${brl(n(d["valor"]))}`;
    case "conta_movimento":
      return `${d["sentido"] === "saida" ? "Saída" : "Entrada"} manual em ${c}: ${brl(n(d["valor"]))}${d["descricao"] ? ` (${d["descricao"]})` : ""}`;
    case "conta_transferencia":
      return `Transferiu ${brl(n(d["valor"]))} de ${origem} para ${destino}`;
    case "conta_estorno":
      return `Estornou transferência de ${brl(n(d["valor"]))} entre ${origem} e ${destino}`;
    case "conta_ajuste":
      return `Ajuste histórico em ${c}: ${brl(n(d["de"]))} → ${brl(n(d["para"]))}${d["motivo"] ? ` (${d["motivo"]})` : ""}`;
    default:
      return acao;
  }
}

function Contas() {
  const qc = useQueryClient();
  const acessoFn = useServerFn(meuAcesso);
  const listarFn = useServerFn(listarContas);
  const salvarFn = useServerFn(salvarConta);
  const removerFn = useServerFn(removerConta);

  const [data, setData] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState("");
  const [origem, setOrigem] = useState<string>(CONTAS_LOTERICA[0]);
  const [destino, setDestino] = useState<string>(CONTAS_LOTERICA[1]);
  const [valorTransf, setValorTransf] = useState("");
  const [obsTransf, setObsTransf] = useState("");
  const [contaAporte, setContaAporte] = useState<string>(CONTAS_LOTERICA[0]);
  const [valorAporte, setValorAporte] = useState("");
  const [obsAporte, setObsAporte] = useState("");

  useEffect(() => { setData(hojeSp()); }, []);

  const acesso = useQuery({ queryKey: ["meu-acesso"], queryFn: () => acessoFn({}), staleTime: 5 * 60 * 1000 });
  const admin = Boolean(acesso.data?.admin);

  const contas = useQuery({
    queryKey: ["contas-loterica", data],
    queryFn: () => listarFn({ data: { data } }),
    enabled: admin,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });

  const dataManual = useRef(false);
  useEffect(() => {
    const sync = () => {
      if (!dataManual.current) setData(hojeSp());
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    if (!contas.data) return;
    setValores(
      Object.fromEntries(
        contas.data.contas.map((c) => [c.conta, c.valor ? String(c.valor).replace(".", ",") : ""]),
      ),
    );
    setObs(Object.fromEntries(contas.data.contas.map((c) => [c.conta, c.observacoes])));
  }, [contas.data]);

  const salvarMut = useMutation({
    mutationFn: (conta: string) =>
      salvarFn({
        data: {
          data,
          conta: conta as never,
          valor: num(valores[conta] ?? ""),
          observacoes: (obs[conta] ?? "").trim(),
        },
      }),
    onSuccess: (_r, conta) => {
      setErro("");
      setSalvo(conta);
      invalidarTudo();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao salvar a conta."),
  });

  const removerMut = useMutation({
    mutationFn: (id: string) => removerFn({ data: { id } }),
    onSuccess: () => invalidarTudo(),
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao remover o lançamento."),
  });

  const transferirFn = useServerFn(transferirEntreContas);
  const estornarFn = useServerFn(estornarTransferencia);
  const listarTransfFn = useServerFn(listarTransferencias);
  const historicoFn = useServerFn(listarHistoricoContas);

  const historico = useQuery({
    queryKey: ["historico-contas", data],
    queryFn: () => historicoFn({ data: { data } }),
    enabled: admin,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const invalidarTudo = () => {
    void qc.invalidateQueries({ queryKey: ["contas-loterica"] });
    void qc.invalidateQueries({ queryKey: ["historico-contas"] });
  };

  const transferencias = useQuery({
    queryKey: ["transferencias-contas", data],
    queryFn: () => listarTransfFn({ data: { data } }),
    enabled: admin,
  });

  const transferirMut = useMutation({
    mutationFn: () =>
      transferirFn({
        data: {
          data,
          origem: origem as never,
          destino: destino as never,
          valor: num(valorTransf),
          observacoes: obsTransf.trim(),
        },
      }),
    onSuccess: () => {
      setErro("");
      setValorTransf("");
      setObsTransf("");
      invalidarTudo();
      void qc.invalidateQueries({ queryKey: ["transferencias-contas"] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha na transferência."),
  });

  const estornarMut = useMutation({
    mutationFn: (id: string) => estornarFn({ data: { id } }),
    onSuccess: () => {
      invalidarTudo();
      void qc.invalidateQueries({ queryKey: ["transferencias-contas"] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao estornar."),
  });

  const aportarFn = useServerFn(aportarConta);
  const aporteMut = useMutation({
    mutationFn: () =>
      aportarFn({
        data: {
          data,
          conta: contaAporte as never,
          valor: num(valorAporte),
          observacoes: obsAporte.trim(),
        },
      }),
    onSuccess: () => {
      setErro("");
      setValorAporte("");
      setObsAporte("");
      invalidarTudo();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Falha ao registrar o aporte."),
  });

  const lista = (contas.data?.contas ?? []).filter((c) => c.conta !== "CONTA CARRO FORTE");
  const total = lista.reduce((s, c) => s + num(valores[c.conta] ?? String(c.valor)), 0);

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <AppNav />

        <header>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Contas da lotérica
              </h1>
              <p className="text-sm text-muted-foreground">
                Área exclusiva do administrador para lançar os valores de cada conta por data.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Somente <strong className="text-foreground">Banco 043</strong> e{" "}
                <strong className="text-foreground">Banco 003</strong> são contas bancárias (batem
                com o extrato). As demais linhas são controles internos: cofres, fiado de
                clientes, cartão a receber, prêmios e comissão.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="h-9 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-muted no-print"
            >
              Imprimir
            </button>
          </div>
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
                  value={data}
                  onChange={(e) => {
                    dataManual.current = true;
                    setData(e.target.value);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  dataManual.current = false;
                  setData(hojeSp());
                }}
                className="h-9 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-muted"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => {
                  void contas.refetch();
                  void transferencias.refetch();
                }}
                className="h-9 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-muted"
              >
                Atualizar
              </button>

              <div className="ml-auto text-right">
                <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                  Total das contas
                </span>
                <span className="text-lg font-semibold text-foreground">{brl(total)}</span>
              </div>
            </section>


            {erro && (
              <p className="rounded-lg border border-border bg-card p-3 text-sm text-destructive">
                {erro}
              </p>
            )}

            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              {contas.isPending && (
                <div className="space-y-3" role="status">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-9 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-9 flex-1 animate-pulse rounded bg-muted" />
                      <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                  <span className="text-xs text-muted-foreground">Carregando contas...</span>
                </div>
              )}
              {contas.isError && (
                <p className="text-sm text-destructive">
                  {contas.error instanceof Error
                    ? contas.error.message
                    : "Falha ao carregar as contas."}
                </p>
              )}

              {!contas.isPending && !contas.isError && lista.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
                  </svg>
                  <span className="text-sm">Nenhuma conta encontrada para esta data.</span>
                </div>
              )}

              {!contas.isPending && !contas.isError && lista.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Conta</th>
                        <th className="py-2 pr-3 w-32">Valor</th>
                        <th className="py-2 pr-3">Observações</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((c) => (
                        <tr key={c.conta} className="border-t border-border transition-colors hover:bg-secondary/30">
                          <td className="py-2 pr-3 font-medium text-foreground">{rotuloConta(c.conta)}</td>
                          <td className="py-2 pr-3">
                            <input
                              inputMode="decimal"
                              value={valores[c.conta] ?? ""}
                              onChange={(e) =>
                                setValores((v) => ({ ...v, [c.conta]: e.target.value }))
                              }
                              placeholder="0,00"
                              className={inputCls}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              value={obs[c.conta] ?? ""}
                              onChange={(e) => setObs((v) => ({ ...v, [c.conta]: e.target.value }))}
                              placeholder="Opcional"
                              className={inputCls}
                            />
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => salvarMut.mutate(c.conta)}
                                disabled={salvarMut.isPending}
                                className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                              >
                                {salvo === c.conta && !salvarMut.isPending ? "Salvo" : "Salvar"}
                              </button>
                              {c.id && (
                                <button
                                  onClick={() => removerMut.mutate(c.id!)}
                                  disabled={removerMut.isPending}
                                  className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-destructive transition-colors hover:bg-accent disabled:opacity-50"
                                >
                                  Limpar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-base font-semibold text-foreground">Aporte em conta</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Soma um valor ao saldo da conta na data selecionada, sem debitar de outra conta.
              </p>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Conta
                  <select
                    value={contaAporte}
                    onChange={(e) => setContaAporte(e.target.value)}
                    className={inputCls}
                  >
                    {CONTAS_LOTERICA.map((c) => (
                      <option key={c} value={c}>
                        {rotuloConta(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Valor do aporte
                  <input
                    inputMode="decimal"
                    value={valorAporte}
                    onChange={(e) => setValorAporte(e.target.value)}
                    placeholder="0,00"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Observações
                  <input
                    value={obsAporte}
                    onChange={(e) => setObsAporte(e.target.value)}
                    placeholder="Opcional"
                    maxLength={500}
                    className={inputCls}
                  />
                </label>
              </div>

              <button
                onClick={() => aporteMut.mutate()}
                disabled={aporteMut.isPending || num(valorAporte) <= 0}
                className="mt-3 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {aporteMut.isPending ? "Aportando..." : "Aportar"}
              </button>
            </section>

            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-base font-semibold text-foreground">
                Transferência entre contas
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                O valor é debitado da conta de origem e creditado na conta de destino na data
                selecionada.
              </p>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Conta de origem
                  <select
                    value={origem}
                    onChange={(e) => setOrigem(e.target.value)}
                    className={inputCls}
                  >
                    {CONTAS_LOTERICA.map((c) => (
                      <option key={c} value={c}>
                        {rotuloConta(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Conta de destino
                  <select
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    className={inputCls}
                  >
                    {CONTAS_LOTERICA.map((c) => (
                      <option key={c} value={c}>
                        {rotuloConta(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Valor
                  <input
                    inputMode="decimal"
                    value={valorTransf}
                    onChange={(e) => setValorTransf(e.target.value)}
                    placeholder="0,00"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Observações
                  <input
                    value={obsTransf}
                    onChange={(e) => setObsTransf(e.target.value)}
                    placeholder="Opcional"
                    maxLength={500}
                    className={inputCls}
                  />
                </label>
              </div>

              <button
                onClick={() => transferirMut.mutate()}
                disabled={
                  transferirMut.isPending || num(valorTransf) <= 0 || origem === destino
                }
                className="mt-3 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {transferirMut.isPending ? "Transferindo..." : "Transferir"}
              </button>
              {origem === destino && (
                <p className="mt-2 text-xs text-destructive">
                  Escolha contas diferentes para origem e destino.
                </p>
              )}

              <div className="mt-4 overflow-x-auto">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Transferências do dia
                </h3>
                {transferencias.isPending ? (
                  <div className="space-y-2" role="status">
                    {[1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
                        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
                        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-5 flex-1 animate-pulse rounded bg-muted" />
                        <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                      </div>
                    ))}
                    <span className="text-xs text-muted-foreground">Carregando transferências...</span>
                  </div>
                ) : (transferencias.data?.length ?? 0) === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                    <span className="text-sm">Nenhuma transferência registrada nesta data.</span>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Origem</th>
                        <th className="py-2 pr-3">Destino</th>
                        <th className="py-2 pr-3">Valor</th>
                        <th className="py-2 pr-3">Observações</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(transferencias.data ?? []).map((t) => (
                        <tr key={t.id} className="border-t border-border transition-colors hover:bg-secondary/30">
                          <td className="py-2 pr-3 text-foreground">{rotuloConta(t.origem)}</td>
                          <td className="py-2 pr-3 text-foreground">{rotuloConta(t.destino)}</td>
                          <td className="py-2 pr-3 font-medium text-foreground">{brl(t.valor)}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{t.observacoes}</td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => estornarMut.mutate(t.id)}
                              disabled={estornarMut.isPending}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-destructive transition-colors hover:bg-accent disabled:opacity-50"
                            >
                              Estornar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-base font-semibold text-foreground">
                Histórico de alterações do dia
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Toda alteração manual nas contas fica registrada com hora e autor.
              </p>
              {historico.isPending ? (
                <span className="text-xs text-muted-foreground">Carregando histórico...</span>
              ) : (historico.data?.eventos.length ?? 0) === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Nenhuma alteração manual registrada nesta data.
                </span>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Hora</th>
                        <th className="py-2 pr-3">Quem</th>
                        <th className="py-2">O que foi feito</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(historico.data?.eventos ?? []).map((e, i) => (
                        <tr
                          key={`${e.quando}-${i}`}
                          className="border-t border-border transition-colors hover:bg-secondary/30"
                        >
                          <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                            {new Date(e.quando).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-2 pr-3 text-foreground">{e.quem}</td>
                          <td className="py-2 text-foreground">
                            {descreverEvento(e.acao, e.detalhes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
