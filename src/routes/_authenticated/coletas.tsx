import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import { listarColetas, registrarColeta, removerColeta, saldoCofre } from "@/lib/coletas.functions";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const Route = createFileRoute("/_authenticated/coletas")({
  head: () => ({
    meta: [
      { title: "Coletas Carro Forte | Lotérica Brasil da Sorte" },
      {
        name: "description",
        content: "Controle de coletas do carro forte e saldo do cofre boca de lobo.",
      },
    ],
  }),
  component: ColetasPage,
});

function ColetasPage() {
  const queryClient = useQueryClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const [dataColeta, setDataColeta] = useState(hoje);
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const listarFn = useServerFn(listarColetas);
  const saldoFn = useServerFn(saldoCofre);
  const registrarFn = useServerFn(registrarColeta);
  const removerFn = useServerFn(removerColeta);

  const { data: dadosColetas, isLoading } = useQuery({
    queryKey: ["coletas-mes"],
    queryFn: () => listarFn({}),
  });

  const { data: dadosSaldo } = useQuery({
    queryKey: ["saldo-cofre"],
    queryFn: () => saldoFn({}),
  });

  const registrarMutation = useMutation({
    mutationFn: () => {
      const numValor = Number(valor.replace(",", ".")) || 0;
      return registrarFn({
        data: { data: dataColeta, valor: numValor, observacao },
      });
    },
    onSuccess: () => {
      setAviso("Coleta registrada com sucesso!");
      setErro(null);
      setValor("");
      setObservacao("");
      queryClient.invalidateQueries({ queryKey: ["coletas-mes"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-cofre"] });
    },
    onError: (err: Error) => {
      setErro(err.message);
      setAviso(null);
    },
  });

  const removerMutation = useMutation({
    mutationFn: (id: string) => removerFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coletas-mes"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-cofre"] });
    },
  });

  const num = (v: string) => Number(v.replace(",", ".")) || 0;

  const handleRegistrar = () => {
    if (!valor || num(valor) <= 0) {
      setErro("Informe um valor válido para a coleta.");
      return;
    }
    setErro(null);
    setAviso(null);
    registrarMutation.mutate();
  };

  const coletas = dadosColetas?.coletas ?? [];
  const totalColetado = dadosColetas?.totalColetado ?? 0;
  const qtdColetas = dadosColetas?.quantidadeColetas ?? 0;
  const saldo = dadosSaldo?.saldo ?? 0;
  const totalDepositos = dadosSaldo?.totalDepositos ?? 0;
  const totalGeralColetado = dadosSaldo?.totalColetado ?? 0;

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <AppNav />

        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Lotérica Brasil da Sorte
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            Controle de Coletas — Carro Forte
          </h1>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total Depósitos
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">{brl(totalDepositos)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total Coletado
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">{brl(totalGeralColetado)}</p>
          </div>
          <div className={`rounded-lg border p-4 shadow-sm ${saldo >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Saldo no Cofre
            </p>
            <p className={`mt-1 text-xl font-bold ${saldo >= 0 ? "text-green-700" : "text-red-700"}`}>
              {brl(saldo)}
            </p>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <h2 className="border-b border-border bg-secondary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
            Registrar Coleta
          </h2>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Data</span>
              <input
                type="date"
                value={dataColeta}
                onChange={(e) => setDataColeta(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Valor coletado</span>
              <input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Observação</span>
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Opcional"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={handleRegistrar}
              disabled={registrarMutation.isPending}
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {registrarMutation.isPending ? "Registrando..." : "Registrar coleta"}
            </button>
          </div>
        </section>

        {aviso && (
          <p className="rounded-md border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
            {aviso}
          </p>
        )}

        {erro && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-secondary px-4 py-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
              Coletas do mês
            </h2>
            <span className="text-sm font-bold text-secondary-foreground">
              {qtdColetas} {qtdColetas === 1 ? "coleta" : "coletas"} — {brl(totalColetado)}
            </span>
          </div>

          {isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : coletas.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhuma coleta registrada este mês.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2">Observação</th>
                    <th className="px-3 py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coletas.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 text-foreground">
                        {new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-foreground">
                        {brl(c.valor)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{c.observacao || "-"}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removerMutation.mutate(c.id)}
                          disabled={removerMutation.isPending}
                          className="text-xs text-destructive hover:underline"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
