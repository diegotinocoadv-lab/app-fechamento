import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import { linkPdfFechamento, obterFechamento } from "@/lib/fechamentos.functions";
import { definirSituacaoCaixa } from "@/lib/caixas.functions";
import { meuAcesso } from "@/lib/usuarios.functions";
import { SALDO_ITENS, VALOR_CAMPOS, brl, brlSinal, classeDiferenca, type Bolao } from "@/lib/fechamento-campos";
import { PenLine, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/fechamentos/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe do fechamento | Brasil da Sorte" },
      {
        name: "description",
        content:
          "Veja os valores, saldos e bolões de um fechamento salvo e baixe o PDF com link protegido.",
      },
      { property: "og:title", content: "Detalhe do fechamento" },
      {
        property: "og:description",
        content: "Valores, saldos, bolões e PDF de um fechamento de caixa salvo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Detalhe,
});

function Detalhe() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const obter = useServerFn(obterFechamento);
  const gerarLink = useServerFn(linkPdfFechamento);
  const definirSituacaoFn = useServerFn(definirSituacaoCaixa);
  const acessoFn = useServerFn(meuAcesso);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [confirmandoFechar, setConfirmandoFechar] = useState(false);

  const { data: acesso } = useQuery({
    queryKey: ["meu-acesso"],
    queryFn: () => acessoFn({}),
    staleTime: 5 * 60 * 1000,
  });
  const isAdmin = Boolean(acesso?.admin);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["fechamento", id],
    queryFn: () => obter({ data: { id } }),
    retry: false,
  });

  const fecharMut = useMutation({
    mutationFn: (caixaId: string) =>
      definirSituacaoFn({ data: { id: caixaId, situacao: "conferido" as const } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fechamentos"] });
      void qc.invalidateQueries({ queryKey: ["caixas"] });
      void qc.invalidateQueries({ queryKey: ["fechamento", id] });
      setConfirmandoFechar(false);
    },
  });

  const baixarPdf = async () => {
    setErroPdf(null);
    setBaixando(true);
    try {
      const { url } = await gerarLink({ data: { id } });
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Não foi possível baixar o arquivo do PDF.");
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `fechamento-${data?.data ?? id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (err) {
      setErroPdf(err instanceof Error ? err.message : "Não foi possível abrir o PDF.");
    } finally {
      setBaixando(false);
    }
  };


  let dadosSalvos: Record<string, unknown> = {};
  try {
    dadosSalvos = data ? (JSON.parse(data.dadosJson) as Record<string, unknown>) : {};
  } catch {
    dadosSalvos = {};
  }
  const valores = (dadosSalvos["valores"] ?? {}) as Record<string, string>;
  const saldoInicial = (dadosSalvos["saldoInicial"] ?? {}) as Record<string, string>;
  const saldoFinal = (dadosSalvos["saldoFinal"] ?? {}) as Record<string, string>;
  const boloes = (Array.isArray(dadosSalvos["boloes"]) ? dadosSalvos["boloes"] : []) as Bolao[];

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <AppNav />

        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Fechamento {data ? data.data.split("-").reverse().join("/") : ""}
            </h1>
            <p className="text-sm text-muted-foreground">
              {data?.funcionario ? `Funcionário: ${data.funcionario}` : "Detalhe do fechamento salvo"}
            </p>
          </div>
          <Link to="/fechamentos" search={{ filtroData: "", filtroOperador: "", filtroCaixa: "", filtroMes: "" }} className="text-sm font-medium text-primary underline">
            Voltar ao histórico
          </Link>
        </header>

        {isPending && (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground" role="status">
            Carregando fechamento...
          </p>
        )}

        {isError && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Falha ao carregar o fechamento."}
            </p>
            <button
              onClick={() => void refetch()}
              className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-accent"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {data && (
          <>
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Fechamento
              </h2>
              <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {VALOR_CAMPOS.map((c) => (
                  <div key={c.key} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{c.label}</span>
                    <span className="text-foreground">{valores[c.key] || "—"}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">
                Relatório: {brl(data.relatorio)} · Total: {brl(data.total)} · Diferença:{" "}
                <span className={classeDiferenca(data.diferenca)}>
                  {brlSinal(data.diferenca)}
                </span>
              </p>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Saldo inicial", saldoInicial, data.totalInicial],
                  ["Saldo final", saldoFinal, data.totalFinal],
                ] as const
              ).map(([titulo, saldo, totalSaldo]) => (
                <div key={titulo} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {titulo}
                  </h2>
                  <div className="mt-2 flex flex-col gap-1 text-sm">
                    {SALDO_ITENS.map((i) => (
                      <div key={i.key} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{i.label}</span>
                        <span className="text-foreground">{saldo[i.key] || "—"}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    Total: {brl(totalSaldo)}
                  </p>
                </div>
              ))}
            </section>

            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2 shadow-sm">
              <span className="text-sm font-semibold uppercase tracking-wide text-foreground">
                Diferença de saldo (final − inicial)
              </span>
              <span
                className={`text-base font-bold ${classeDiferenca(
                  data.totalFinal - data.totalInicial,
                )}`}
              >
                {brlSinal(data.totalFinal - data.totalInicial)}
              </span>
            </div>

            {boloes.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Controle de bolões
                </h2>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground">
                        <th className="py-1 pr-2">Bolão / Concurso</th>
                        <th className="py-1 pr-2 text-right">Valor</th>
                        <th className="py-1 pr-2 text-right">Taxa</th>
                        <th className="py-1 text-right">Quant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boloes
                        .filter((b) => b?.concurso || b?.valor || b?.quant)
                        .map((b, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="py-1 pr-2 text-foreground">{b.concurso || "—"}</td>
                            <td className="py-1 pr-2 text-right text-foreground">{b.valor || "—"}</td>
                            <td className="py-1 pr-2 text-right text-foreground">{b.taxa || "—"}</td>
                            <td className="py-1 text-right text-foreground">{b.quant || "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  Valor: {brl(data.totalBolaoValor)} · Taxa: {brl(data.totalBolaoTaxa)} · Quant.:{" "}
                  {data.totalBolaoQuant}
                </p>
              </section>
            )}

            <div className="flex flex-col items-start gap-2">
              <div className="flex flex-wrap gap-2">
                {isAdmin && data?.caixaSituacao !== "conferido" && (
                  <Link
                    to="/fechamento"
                    search={{ fechamentoId: id }}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-700 shadow-md"
                  >
                    <PenLine className="h-4 w-4" />
                    Corrigir fechamento
                  </Link>
                )}
                {isAdmin && data?.caixaSituacao !== "conferido" && data?.caixaId && (
                  <button
                    onClick={() => setConfirmandoFechar(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-amber-600 px-4 text-sm font-bold text-white transition-colors hover:bg-amber-700 shadow-md"
                  >
                    <Lock className="h-4 w-4" />
                    Fechar definitivamente
                  </button>
                )}
                {data?.caixaSituacao === "conferido" && (
                  <span className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-500/10 px-4 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    <Lock className="h-4 w-4" />
                    Fechado e conferido
                  </span>
                )}
                <button
                  onClick={() => void baixarPdf()}
                  disabled={baixando || !data.temPdf}
                  className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {baixando ? "Gerando link..." : data.temPdf ? "Baixar PDF" : "Sem PDF salvo"}
                </button>
              </div>
              {erroPdf && <p className="text-sm text-destructive">{erroPdf}</p>}
            </div>

            {confirmandoFechar && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                      <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        Fechar definitivamente
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {data?.funcionario} — {data?.caixaNumero || "Caixa"} — {data?.data?.split("-").reverse().join("/")}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                    Após confirmar, este fechamento <strong>não poderá mais ser modificado ou excluído</strong>.
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmandoFechar(false)}
                      className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => fecharMut.mutate(data!.caixaId!)}
                      disabled={fecharMut.isPending}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {fecharMut.isPending ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                      Confirmar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
