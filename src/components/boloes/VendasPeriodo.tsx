import { brl } from "@/lib/fechamento-campos";
import { dataBr, input, type VendaEstoque } from "@/components/boloes/comum";

type Props = {
  admin: boolean;
  filtro: string;
  onFiltro: (valor: string) => void;
  opcoes: Array<{ chave: string; titulo: string }>;
  vendas: VendaEstoque[];
  carregando: boolean;
  totalCotas: number;
  totalValor: number;
  onExcluir: (id: string) => void;
};

/** Quadro "Vendas do período": lista as vendas com filtro por bolão. */
export function VendasPeriodo({
  admin,
  filtro,
  onFiltro,
  opcoes,
  vendas,
  carregando,
  totalCotas,
  totalValor,
  onExcluir,
}: Props) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-foreground">Vendas do período</h2>
        <select
          value={filtro}
          onChange={(e) => onFiltro(e.target.value)}
          className={`${input} min-w-52`}
        >
          <option value="">Todos os bolões</option>
          {opcoes.map((g) => (
            <option key={g.chave} value={g.chave}>
              {g.titulo}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {vendas.length} venda(s) · {totalCotas} cota(s) · {brl(totalValor)}
        </span>
      </div>
      {carregando ? (
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-secondary" />
      ) : vendas.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma venda no período.</p>
      ) : (
        <div className="mt-3 max-h-80 overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-1.5 text-left text-[11px] uppercase text-muted-foreground">Data</th>
                <th className="px-2 py-1.5 text-left text-[11px] uppercase text-muted-foreground">Bolão</th>
                <th className="px-2 py-1.5 text-left text-[11px] uppercase text-muted-foreground">Operadora</th>
                <th className="px-2 py-1.5 text-left text-[11px] uppercase text-muted-foreground">Canal</th>
                <th className="px-2 py-1.5 text-right text-[11px] uppercase text-muted-foreground">Qtd</th>
                <th className="px-2 py-1.5 text-right text-[11px] uppercase text-muted-foreground">R$</th>
                {admin && <th className="px-2 py-1.5 text-right text-[11px] uppercase text-muted-foreground">—</th>}
              </tr>
            </thead>
            <tbody>
              {vendas.map((v) => (
                <tr key={v.id} className="border-b border-border/50">
                  <td className="px-2 py-1.5">{dataBr(v.data)}</td>
                  <td className="px-2 py-1.5">
                    {v.nome}
                    {v.concurso ? ` · ${v.concurso}` : ""}
                  </td>
                  <td className="px-2 py-1.5">{v.operador}</td>
                  <td className="px-2 py-1.5">{v.canal === "MARKETPLACE" ? "MKP" : "Loja"}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{v.quantidade}</td>
                  <td className="px-2 py-1.5 text-right">{brl(v.valorTotal)}</td>
                  {admin && (
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Excluir venda de ${v.quantidade} cota(s) de ${v.nome}? O lançamento vinculado é ajustado junto.`,
                            )
                          ) {
                            onExcluir(v.id);
                          }
                        }}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Excluir
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
