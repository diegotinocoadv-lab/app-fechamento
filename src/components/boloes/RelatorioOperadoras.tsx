import { Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { brl } from "@/lib/fechamento-campos";
import {
  dataBr,
  input,
  type RelDia,
  type RelOperador,
  type RelTotal,
} from "@/components/boloes/comum";

type Props = {
  admin: boolean;
  /** Ex.: "Novembro 2026". */
  titulo: string;
  usuarios: Array<{ id: string; nome: string | null; email: string | null }>;
  filtro: string;
  onFiltro: (valor: string) => void;
  carregando: boolean;
  /** Mensagem de erro, ou `null` quando deu tudo certo. */
  erro: string | null;
  lancamentos: number | null;
  ops: RelOperador[];
  lojas: RelOperador[];
  mkp: RelOperador | null;
  total: RelTotal;
  taxaOperadoras: number;
  dias: Array<RelDia & { acumulado: number }>;
  abertoOp: string | null;
  onAbertoOp: (id: string | null) => void;
};

/** Relatório do mês: totais por operadora, dia a dia e acumulado. */
export function RelatorioOperadoras({
  admin,
  titulo,
  usuarios,
  filtro,
  onFiltro,
  carregando,
  erro,
  lancamentos,
  ops,
  lojas,
  mkp,
  total,
  taxaOperadoras,
  dias,
  abertoOp,
  onAbertoOp,
}: Props) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-foreground">Relatório por operadora — {titulo}</h2>
        {admin && (
          <select
            value={filtro}
            onChange={(e) => onFiltro(e.target.value)}
            className={`${input} min-w-40`}
          >
            <option value="">Todas</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome || u.email}
              </option>
            ))}
          </select>
        )}
        {lancamentos !== null && (
          <span className="ml-auto text-xs text-muted-foreground">
            {lancamentos} lançamento(s)
          </span>
        )}
      </div>

      {carregando ? (
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-secondary" />
      ) : erro !== null ? (
        <p className="mt-3 text-sm text-destructive">{erro}</p>
      ) : ops.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma venda de bolão neste período.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Total de taxas no mês:{" "}
            <span className="font-semibold text-foreground">{brl(total.taxa)}</span>{" "}
            · operadoras {brl(taxaOperadoras)} · MKP {brl(total.mkpTaxa)}{" "}
            <span className="text-muted-foreground/70">
              (MKP é operadora à parte e não soma nas de loja)
            </span>
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lojas.map((op) => {
              const ativo = admin && filtro === op.operadorId;
              return (
                <button
                  key={op.operadorId}
                  type="button"
                  onClick={() => {
                    if (!admin) return;
                    onFiltro(ativo ? "" : op.operadorId);
                    onAbertoOp(null);
                  }}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    ativo
                      ? "border-primary bg-primary/5"
                      : "border-border/60 bg-secondary/30 hover:bg-secondary/60"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {op.operador}
                  </p>
                  <p className="text-lg font-bold text-foreground">{brl(op.valor)}</p>
                  <p className="text-xs text-muted-foreground">
                    {op.cotas} cota(s) · taxas {brl(op.taxa)}
                  </p>
                </button>
              );
            })}
            {mkp && (
              <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-left dark:border-sky-800 dark:bg-sky-950/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                  MKP (Marketplace)
                </p>
                <p className="text-lg font-bold text-sky-900 dark:text-sky-100">{brl(mkp.valor)}</p>
                <p className="text-xs text-sky-700/80 dark:text-sky-300/80">
                  {mkp.cotas} cota(s) · taxas {brl(mkp.taxa)}
                </p>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5" />
                  <th className="px-3 py-2.5">Operadora</th>
                  <th className="px-3 py-2.5 text-right">Cotas</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-3 py-2.5 text-right">Taxa</th>
                  <th className="px-3 py-2.5 text-right">Dias</th>
                </tr>
              </thead>
              <tbody>
                {ops.map((op) => {
                  const aberto = abertoOp === op.operadorId;
                  const ehMkp = op.operadorId === "__mkp__";
                  return (
                    <Fragment key={op.operadorId}>
                      <tr
                        className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/30 ${
                          ehMkp ? "bg-sky-50/60 dark:bg-sky-950/20" : ""
                        }`}
                        onClick={() => onAbertoOp(aberto ? null : op.operadorId)}
                      >
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {aberto ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td
                          className={`px-3 py-2.5 font-medium ${
                            ehMkp ? "text-sky-700 dark:text-sky-300" : "text-foreground"
                          }`}
                        >
                          {ehMkp ? "MKP (Marketplace)" : op.operador}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium">{op.cotas}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                          {brl(op.valor)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-violet-600 dark:text-violet-400">
                          {brl(op.taxa)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {op.dias.length}
                        </td>
                      </tr>
                      {aberto && (
                        <tr>
                          <td colSpan={6} className="border-b border-border/60 bg-secondary/30 px-3 py-2">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Dia a dia — {ehMkp ? "MKP (Marketplace)" : op.operador}
                            </p>
                            <div className="overflow-x-auto rounded-md border border-border bg-card">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                                    <th className="px-3 py-2">Data</th>
                                    <th className="px-3 py-2 text-right">Cotas</th>
                                    <th className="px-3 py-2 text-right">Valor</th>
                                    <th className="px-3 py-2 text-right">Taxa</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {op.dias.map((d) => (
                                    <tr key={d.data} className="border-b border-border/50 last:border-0">
                                      <td className="px-3 py-1.5 text-foreground">{dataBr(d.data)}</td>
                                      <td className="px-3 py-1.5 text-right">{d.cotas}</td>
                                      <td className="px-3 py-1.5 text-right font-medium">
                                        {brl(d.valor)}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-medium text-violet-600 dark:text-violet-400">
                                        {brl(d.taxa)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-border bg-secondary/50 text-xs font-bold">
                                    <td className="px-3 py-2">Total</td>
                                    <td className="px-3 py-2 text-right">{op.cotas}</td>
                                    <td className="px-3 py-2 text-right">{brl(op.valor)}</td>
                                    <td className="px-3 py-2 text-right">{brl(op.taxa)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-secondary/50 text-sm font-bold">
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-foreground">TOTAL DO MÊS</td>
                  <td className="px-3 py-2.5 text-right text-foreground">{total.cotas}</td>
                  <td className="px-3 py-2.5 text-right text-foreground">{brl(total.valor)}</td>
                  <td className="px-3 py-2.5 text-right text-violet-600 dark:text-violet-400">
                    {brl(total.taxa)}
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Listagem por dia — total acumulado no mês
            </p>
            <div className="mt-1 overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 text-right">Cotas</th>
                    <th className="px-3 py-2 text-right">Valor do dia</th>
                    <th className="px-3 py-2 text-right">MKP</th>
                    <th className="px-3 py-2 text-right">Taxa</th>
                    <th className="px-3 py-2 text-right">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {dias.map((d) => (
                    <tr key={d.data} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-1.5 text-foreground">{dataBr(d.data)}</td>
                      <td className="px-3 py-1.5 text-right">{d.cotas}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{brl(d.valor)}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-sky-600 dark:text-sky-400">
                        {brl(d.mkpValor)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium text-violet-600 dark:text-violet-400">
                        {brl(d.taxa)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold text-foreground">
                        {brl(d.acumulado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/50 text-xs font-bold">
                    <td className="px-3 py-2">TOTAL DO MÊS</td>
                    <td className="px-3 py-2 text-right">{total.cotas}</td>
                    <td className="px-3 py-2 text-right">{brl(total.valor)}</td>
                    <td className="px-3 py-2 text-right">{brl(total.mkpValor)}</td>
                    <td className="px-3 py-2 text-right">{brl(total.taxa)}</td>
                    <td className="px-3 py-2 text-right">{brl(total.valor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
