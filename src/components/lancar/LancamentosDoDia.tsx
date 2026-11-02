import { Banknote, Trash2 } from "lucide-react";
import { brl } from "@/lib/fechamento-campos";
import { rotuloBolao, rotuloCampo, type ModeloBolao } from "@/components/lancar/comum";

/** Item da lista de lançamentos do dia (formato vindo de listarLancamentosSimples). */
export type LancamentoItem = {
  id: string;
  tipo: string;
  campo: string;
  caixaNumero: string | null;
  operador: string;
  descricao: string | null;
  quantidade: number;
  taxa: number;
  valor: number;
  meu: boolean;
};

type Props = {
  lancamentos: LancamentoItem[];
  modelos: ModeloBolao[];
  carregando: boolean;
  /** Mensagem de erro, ou `null`. */
  erro: string | null;
  filtroOperador: string;
  admin: boolean;
  onExcluir: (id: string) => void;
};

/** Tabela "Lançamentos do dia" com o botão de excluir. */
export function LancamentosDoDia({
  lancamentos,
  modelos,
  carregando,
  erro,
  filtroOperador,
  admin,
  onExcluir,
}: Props) {
  return (
    <section className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          Lançamentos do dia
          {filtroOperador && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (filtrado por operador)
            </span>
          )}
          {lancamentos.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">({lancamentos.length})</span>
          )}
        </h2>
      </div>
      {carregando ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-secondary" />
          ))}
        </div>
      ) : erro !== null ? (
        <p className="p-4 text-sm text-destructive">{erro}</p>
      ) : lancamentos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Banknote className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhum lançamento nesta data.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">Campo</th>
              <th className="px-3 py-2.5 hidden sm:table-cell">Caixa</th>
              <th className="px-3 py-2.5 hidden sm:table-cell">Operador</th>
              <th className="px-3 py-2.5">Descrição</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {lancamentos.map((l) => (
              <tr
                key={l.id}
                className="border-b border-border/60 transition-colors hover:bg-secondary/30 last:border-0"
              >
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      l.tipo === "GAVETA"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : l.tipo === "BOLAO"
                          ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
                          : l.tipo === "RELATORIO"
                            ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                            : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                    }`}
                  >
                    {l.tipo === "GAVETA"
                      ? "Gaveta"
                      : l.tipo === "BOLAO"
                        ? "Bolão"
                        : l.tipo === "RELATORIO"
                          ? "Relatório"
                          : "Caixa"}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-medium text-foreground">
                  {l.tipo === "BOLAO"
                    ? rotuloBolao(l.campo, modelos) ||
                      (l.campo === "bolao:manual" ? l.descricao : "") ||
                      "Bolão"
                    : rotuloCampo(l.campo) || "—"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">
                  {l.caixaNumero || "—"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">
                  {l.operador}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {l.tipo === "BOLAO"
                    ? l.campo === "bolao:manual"
                      ? `${l.quantidade} cota${l.quantidade > 1 ? "s" : ""} · Taxa ${brl(l.taxa)}/cota`
                      : `Concurso ${l.descricao || "—"} · ${l.quantidade} cota${l.quantidade > 1 ? "s" : ""}`
                    : l.descricao || "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                  {l.tipo === "BOLAO"
                    ? `${brl(l.valor * l.quantidade)}${l.taxa > 0 ? ` · Taxa ${brl(l.taxa * l.quantidade)}` : ""}`
                    : brl(l.valor)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {(l.meu || admin) && (
                    <button
                      type="button"
                      onClick={() => onExcluir(l.id)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 px-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
