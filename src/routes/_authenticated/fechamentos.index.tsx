import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppNav } from "@/components/AppNav";
import { listarFechamentos } from "@/lib/fechamentos.functions";
import { brl } from "@/lib/fechamento-campos";

export const Route = createFileRoute("/_authenticated/fechamentos/")({
  head: () => ({
    meta: [
      { title: "Histórico de fechamentos | Brasil da Sorte" },
      {
        name: "description",
        content:
          "Consulte os fechamentos de caixa salvos, veja totais e diferenças e baixe o PDF de cada dia.",
      },
      { property: "og:title", content: "Histórico de fechamentos" },
      {
        property: "og:description",
        content: "Fechamentos de caixa salvos com totais, diferenças e PDF por dia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Historico,
});

function Historico() {
  const listar = useServerFn(listarFechamentos);
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["fechamentos"],
    queryFn: () => listar({}),
  });

  const linhas = data?.fechamentos ?? [];

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <AppNav />

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Histórico de fechamentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Você vê apenas os fechamentos que salvou; administradores veem todos.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          {isPending && (
            <p className="text-sm text-muted-foreground" role="status">
              Carregando fechamentos...
            </p>
          )}

          {isError && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Falha ao carregar o histórico."}
              </p>
              <button
                onClick={() => void refetch()}
                className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-accent"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!isPending && !isError && linhas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum fechamento salvo ainda. Gere um em{" "}
              <Link to="/fechamento" className="font-medium text-primary underline">
                Fechamento
              </Link>
              .
            </p>
          )}

          {linhas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Funcionário</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Diferença</th>
                    <th className="py-2 pr-3">PDF</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((f) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="py-2 pr-3 text-foreground">
                        {f.data.split("-").reverse().join("/")}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{f.funcionario || "—"}</td>
                      <td className="py-2 pr-3 text-right text-foreground">{brl(f.total)}</td>
                      <td
                        className={`py-2 pr-3 text-right ${
                          f.diferenca === 0 ? "text-muted-foreground" : "text-destructive"
                        }`}
                      >
                        {brl(f.diferenca)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {f.temPdf ? "sim" : "não"}
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          to="/fechamentos/$id"
                          params={{ id: f.id }}
                          className="font-medium text-primary underline"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isFetching && (
                <p className="mt-2 text-xs text-muted-foreground">Atualizando...</p>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
