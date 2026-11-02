import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { abrirMeuCaixa, fecharMeuCaixa, meuCaixa } from "@/lib/caixas.functions";
import { meuAcesso } from "@/lib/usuarios.functions";
import { Lock, Loader2, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({
    meta: [
      { title: "Caixa | Brasil da Sorte" },
      { name: "description", content: "Abra seu caixa e comece a registrar lancamentos." },
    ],
  }),
  component: Inicio,
});

const dataBr = (d: string) => d.split("-").reverse().join("/");
const CAIXAS = ["CAIXA 01", "CAIXA 02", "CAIXA 03", "CAIXA 04"];
const input = "h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

function Inicio() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const meuCaixaFn = useServerFn(meuCaixa);
  const abrirFn = useServerFn(abrirMeuCaixa);
  const fecharFn = useServerFn(fecharMeuCaixa);
  const acessoFn = useServerFn(meuAcesso);

  const [caixaSelecionado, setCaixaSelecionado] = useState(CAIXAS[0]);
  const [observacoes, setObservacoes] = useState("");
  const [fecharConfirm, setFecharConfirm] = useState(false);

  const { data: acesso, isLoading: acessoLoading } = useQuery({
    queryKey: ["meu-acesso"],
    queryFn: () => acessoFn({}),
    staleTime: 5 * 60 * 1000,
  });

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
    mutationFn: (caixaId: string) => fecharFn({ data: { id: caixaId } }),
    onSuccess: (res) => {
      if (res.erro) { toast.error(res.erro); return; }
      toast.success("Caixa fechado com sucesso!");
      void qc.invalidateQueries({ queryKey: ["meu-caixa"] });
      void qc.invalidateQueries({ queryKey: ["lancamentos-simples"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao fechar caixa."),
  });

  const caixaHoje = data?.caixaHoje ?? null;
  const aberto = caixaHoje?.situacao === "aberto";
  const nomeOperador = data?.operador || "Operador";
  const isAdmin = Boolean(acesso?.admin);

  useEffect(() => {
    if (acessoLoading) return;
    if (isAdmin) {
      navigate({ to: "/dashboard", search: { data: "" } });
    }
  }, [isAdmin, acessoLoading, navigate]);

  if (isFetching || acessoLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (error) {
    const expirada = error instanceof Error && error.message.includes("Unauthorized");
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4">
        {expirada ? (
          <>
            <p className="text-sm text-muted-foreground">Sessão expirada. Redirecionando para o login…</p>
            <a href="/auth" className="text-sm font-medium text-primary underline">
              Entrar novamente
            </a>
          </>
        ) : (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Erro ao carregar dados."}
          </p>
        )}
      </main>
    );
  }

  if (caixaHoje && aberto) {
    return (
      <main className="min-h-screen bg-background px-4 pb-6 pt-6">
        <div className="mx-auto max-w-lg">
          <AppNav />
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{caixaHoje.nome} aberto</p>
                  <p className="text-xs text-muted-foreground">{nomeOperador} — {dataBr(caixaHoje.data)}</p>
                </div>
              </div>
              <button
                onClick={() => setFecharConfirm(true)}
                disabled={fecharMut.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                <Lock className="h-3.5 w-3.5" />
                Fechar
              </button>
            </div>
          </div>

          <Link
            to="/fechamento"
            className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-10 text-center transition-all hover:border-primary/50 hover:bg-primary/10 active:scale-[0.98]"
          >
            <div>
              <h2 className="text-xl font-bold text-foreground">Fechamento do Dia</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Preencha e salve o fechamento
              </p>
            </div>
          </Link>

          <Link
            to="/lancar"
            search={{ tipo: "bolao" }}
            className="mt-3 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-violet-500/30 bg-violet-500/5 p-6 text-center transition-all hover:border-violet-500/50 hover:bg-violet-500/10 active:scale-[0.98]"
          >
            <div>
              <h2 className="text-lg font-bold text-foreground">Vender cota de bolão</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Registro rápido de cotas do dia
              </p>
            </div>
          </Link>
        </div>

        {fecharConfirm && (
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

  return (
    <main className="min-h-screen bg-background px-4 pb-6 pt-6">
      <div className="mx-auto max-w-lg">
        <AppNav />
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Bem-vindo, {nomeOperador}</h1>
          <p className="text-sm text-muted-foreground">
            {data?.hoje ? dataBr(data.hoje) : "Carregando..."} — Abra seu caixa para começar.
          </p>
        </header>

        {!caixaHoje && (
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-full bg-primary/10 p-3">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Abrir Caixa</h2>
                <p className="text-sm text-muted-foreground">Selecione o caixa e abra.</p>
              </div>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); abrirMut.mutate(); }}
              className="flex flex-col gap-3"
            >
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Operador
                <input value={nomeOperador} readOnly className={`${input} bg-muted cursor-not-allowed`} />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Nº do Caixa
                <select value={caixaSelecionado} onChange={(e) => setCaixaSelecionado(e.target.value)} className={input}>
                  {CAIXAS.map((c) => <option key={c} value={c}>{c}</option>)}
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
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {abrirMut.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Abrindo...</>
                ) : (
                  <><Lock className="h-4 w-4" /> Abrir Caixa</>
                )}
              </button>
            </form>
          </section>
        )}

        {caixaHoje && !aberto && (
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-full bg-muted p-3">
                <Lock className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Caixa Fechado</h2>
                <p className="text-sm text-muted-foreground">
                  {caixaHoje.nome} — {dataBr(caixaHoje.data)}
                </p>
              </div>
            </div>
            {caixaHoje.fechamentoId && (
              <Link
                to="/fechamento"
                search={{ fechamentoId: caixaHoje.fechamentoId }}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
              >
                <FileText className="h-4 w-4" /> Ver Fechamento
              </Link>
            )}
          </section>
        )}

        {data?.caixas && data.caixas.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Histórico recente
            </h3>
            <div className="space-y-2">
              {data.caixas.slice(0, 10).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">{dataBr(c.data)}</span>
                    <span className="text-xs text-muted-foreground">{c.nome}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.situacao === "conferido"
                          ? "bg-primary/10 text-primary"
                          : c.situacao === "fechado"
                            ? "bg-secondary text-muted-foreground"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {c.situacao === "conferido" ? "Conferido" : c.situacao === "fechado" ? "Fechado" : "Aberto"}
                    </span>
                  </div>
                  {c.fechamentoId && (
                    <Link
                      to="/fechamento"
                      search={{ fechamentoId: c.fechamentoId }}
                      className="text-xs text-primary hover:underline"
                    >
                      Ver
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
