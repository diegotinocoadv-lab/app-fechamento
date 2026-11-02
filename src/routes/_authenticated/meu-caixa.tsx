import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import {
  abrirMeuCaixa,
  fecharMeuCaixa,
  meuCaixa,
} from "@/lib/caixas.functions";
import {
  Lock,
  Unlock,
  Loader2,
  CheckCircle2,
  Clock,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/meu-caixa")({
  head: () => ({
    meta: [
      { title: "Meu Caixa | Brasil da Sorte" },
      {
        name: "description",
        content: "Abra e feche seu caixa do dia. Acompanhe o status do seu caixa.",
      },
      { property: "og:title", content: "Meu Caixa | Brasil da Sorte" },
      {
        property: "og:description",
        content: "Abra e feche seu caixa do dia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeuCaixa,
});

const dataBr = (d: string) => d.split("-").reverse().join("/");

const CAIXAS = ["CAIXA 01", "CAIXA 02", "CAIXA 03", "CAIXA 04"];

function MeuCaixa() {
  const qc = useQueryClient();
  const meuCaixaFn = useServerFn(meuCaixa);
  const abrirFn = useServerFn(abrirMeuCaixa);
  const fecharFn = useServerFn(fecharMeuCaixa);

  const [caixaSelecionado, setCaixaSelecionado] = useState(CAIXAS[0]);
  const [observacoes, setObservacoes] = useState("");
  const [fecharConfirm, setFecharConfirm] = useState(false);

  const { data, isFetching, error } = useQuery({
    queryKey: ["meu-caixa"],
    queryFn: () => meuCaixaFn({}),
    staleTime: 30_000,
  });

  const abrirMut = useMutation({
    mutationFn: () =>
      abrirFn({
        data: {
          nome: caixaSelecionado,
          data: data?.hoje ?? "",
          observacoes: observacoes.trim(),
        },
      }),
    onSuccess: () => {
      setObservacoes("");
      toast.success("Caixa aberto com sucesso!");
      void qc.invalidateQueries({ queryKey: ["meu-caixa"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao abrir caixa."),
  });

  const fecharMut = useMutation({
    mutationFn: (caixaId: string) =>
      fecharFn({ data: { id: caixaId } }),
    onSuccess: (res) => {
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success("Caixa fechado com sucesso!");
      void qc.invalidateQueries({ queryKey: ["meu-caixa"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao fechar caixa."),
  });

  const caixaHoje = data?.caixaHoje ?? null;
  const aberto = caixaHoje?.situacao === "aberto";
  const nomeOperador = data?.operador || "Operador";

  const input =
    "h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <AppNav />

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Meu Caixa
          </h1>
          <p className="text-sm text-muted-foreground">
            Abra seu caixa no início do expediente e feche ao finalizar.
          </p>
        </header>

        {isFetching && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Carregando...</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Erro ao carregar dados do caixa."}
          </div>
        )}

        {!isFetching && !error && (
          <>
            {/* Nenhum caixa aberto hoje */}
            {!caixaHoje && (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Unlock className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Abrir Caixa
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {data?.hoje ? dataBr(data.hoje) : "Carregando data..."} — Selecione o caixa e abra.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    abrirMut.mutate();
                  }}
                  className="flex flex-col gap-3"
                >
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Operador
                    <input
                      value={nomeOperador}
                      readOnly
                      className={`${input} bg-muted cursor-not-allowed`}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Nº do Caixa
                    <select
                      value={caixaSelecionado}
                      onChange={(e) => setCaixaSelecionado(e.target.value)}
                      className={input}
                    >
                      {CAIXAS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Observações (opcional)
                    <input
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      placeholder="Alguma observação?"
                      className={input}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={abrirMut.isPending}
                    className="inline-flex h-12 sm:h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base sm:text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {abrirMut.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Abrindo...
                      </>
                    ) : (
                      <>
                        <Unlock className="h-4 w-4" />
                        Abrir Caixa
                      </>
                    )}
                  </button>
                </form>
              </section>
            )}

            {/* Caixa aberto hoje */}
            {caixaHoje && aberto && (
              <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-full bg-emerald-500/10 p-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Caixa Aberto
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {caixaHoje.nome} — {nomeOperador} — {dataBr(caixaHoje.data)}
                    </p>
                  </div>
                </div>

                {caixaHoje.observacoes && (
                  <p className="mb-4 text-sm text-muted-foreground">
                    {caixaHoje.observacoes}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {caixaHoje.fechamentoId ? (
                    <Link
                      to="/fechamento"
                      search={{ fechamentoId: caixaHoje.fechamentoId }}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      <FileText className="h-4 w-4" />
                      Ver Fechamento
                    </Link>
                  ) : (
                    <Link
                      to="/fechamento"
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      <FileText className="h-4 w-4" />
                      Ir para Fechamento
                    </Link>
                  )}

                  <button
                    onClick={() => setFecharConfirm(true)}
                    disabled={fecharMut.isPending}
                    className="inline-flex h-12 sm:h-10 w-full items-center justify-center gap-2 rounded-lg bg-destructive px-4 text-base sm:text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                  >
                    {fecharMut.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Fechando...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Fechar Caixa
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}

            {/* Caixa fechado hoje */}
            {caixaHoje && !aberto && (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-full bg-muted p-3">
                    <Lock className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Caixa Fechado
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {caixaHoje.nome} — {nomeOperador} — {dataBr(caixaHoje.data)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {caixaHoje.fechamentoId && (
                    <Link
                      to="/fechamento"
                      search={{ fechamentoId: caixaHoje.fechamentoId }}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      <FileText className="h-4 w-4" />
                      Ver Fechamento
                    </Link>
                  )}
                </div>
              </section>
            )}

            {/* Histórico */}
            {data?.caixas && data.caixas.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Histórico recente
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Data</th>
                        <th className="py-2 pr-3">Caixa</th>
                        <th className="py-2 pr-3">Situação</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.caixas.slice(0, 10).map((c) => (
                        <tr
                          key={c.id}
                          className="border-t border-border transition-colors hover:bg-muted/50"
                        >
                          <td className="py-2 pr-3 text-foreground">
                            {dataBr(c.data)}
                          </td>
                          <td className="py-2 pr-3 text-foreground">{c.nome}</td>
                          <td className="py-2 pr-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                c.situacao === "conferido"
                                  ? "bg-primary/10 text-primary"
                                  : c.situacao === "fechado"
                                    ? "bg-secondary text-muted-foreground"
                                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {c.situacao === "conferido"
                                ? "Conferido"
                                : c.situacao === "fechado"
                                  ? "Fechado"
                                  : "Aberto"}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            {c.fechamentoId && (
                              <Link
                                to="/fechamento"
                                search={{ fechamentoId: c.fechamentoId }}
                                className="text-xs text-primary hover:underline"
                              >
                                Ver fechamento
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {fecharConfirm && caixaHoje && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Fechar Caixa</h3>
            {!caixaHoje.fechamentoId && (
              <p className="mt-2 rounded-md bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-400">
                Nenhum fechamento foi salvo para hoje. Deseja fechar o caixa mesmo assim?
              </p>
            )}
            {caixaHoje.fechamentoId && (
              <p className="mt-2 text-sm text-muted-foreground">Tem certeza que deseja fechar o caixa?</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setFecharConfirm(false)} className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent">Cancelar</button>
              <button
                onClick={() => { setFecharConfirm(false); fecharMut.mutate(caixaHoje.id); }}
                disabled={fecharMut.isPending}
                className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >Fechar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
