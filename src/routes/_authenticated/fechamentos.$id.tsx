import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import { linkPdfFechamento, obterFechamento } from "@/lib/fechamentos.functions";
import { SALDO_ITENS, VALOR_CAMPOS, brl, brlSinal, classeDiferenca, type Bolao } from "@/lib/fechamento-campos";

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
  const obter = useServerFn(obterFechamento);
  const gerarLink = useServerFn(linkPdfFechamento);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["fechamento", id],
    queryFn: () => obter({ data: { id } }),
    retry: false,
  });

  const baixarPdf = async () => {
    setErroPdf(null);
    setBaixando(true);
    try {
      const { url } = await gerarLink({ data: { id } });
      window.open(url, "_blank", "noopener,noreferrer");
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
          <Link to="/fechamentos" className="text-sm font-medium text-primary underline">
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
              <button
                onClick={() => void baixarPdf()}
                disabled={baixando || !data.temPdf}
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {baixando ? "Gerando link..." : data.temPdf ? "Baixar PDF" : "Sem PDF salvo"}
              </button>
              {erroPdf && <p className="text-sm text-destructive">{erroPdf}</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
