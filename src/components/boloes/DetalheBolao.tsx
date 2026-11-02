import { brl } from "@/lib/fechamento-campos";
import { dataBr, rotuloSituacao, type Linha } from "@/components/boloes/comum";

type Props = {
  detalhe: Linha;
  admin: boolean;
  /** Vendas agrupadas por dia, já ordenadas da mais recente para a mais antiga. */
  dias: Array<[string, Array<{ coluna: string; cotas: number }>]>;
  nomeColuna: Map<string, string>;
  onFechar: () => void;
  onVender: () => void;
  onEncerrar: () => void;
  onReativar: () => void;
  onFinalizar: () => void;
  onAjustarCotas: () => void;
};

/** Modal de detalhe de um bolão: dia a dia das vendas e ações. */
export function DetalheBolao({
  detalhe,
  admin,
  dias,
  nomeColuna,
  onFechar,
  onVender,
  onEncerrar,
  onReativar,
  onFinalizar,
  onAjustarCotas,
}: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {detalhe.cotas} cotas de {brl(detalhe.valorCota)}
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              detalhe.situacao === "finalizado"
                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                : detalhe.situacao === "encerrado"
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  : "bg-secondary text-muted-foreground"
            }`}
          >
            {rotuloSituacao(detalhe)}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {detalhe.nome}
          {detalhe.concurso ? ` · concurso ${detalhe.concurso}` : ""} · {detalhe.vendidas}{" "}
          vendida(s) · {Math.max(0, detalhe.cotas - detalhe.vendidas)} disponível(is)
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Loja: {detalhe.vendidasLoja} · Marketplace: {detalhe.vendidasMkp}
        </p>

        {(detalhe.situacao === "encerrado" || detalhe.situacao === "finalizado") && (
          <div className="mt-3 rounded-md border border-border/60 bg-secondary/20 p-2 text-sm">
            <p className="font-semibold text-foreground">Resultado</p>
            <p className="text-muted-foreground">
              Vendidas: {detalhe.vendidas} (Loja {detalhe.vendidasLoja} · MKP{" "}
              {detalhe.vendidasMkp}) · Sobra: {Math.max(0, detalhe.cotas - detalhe.vendidas)}{" "}
              cota(s) · Perda:{" "}
              {brl(Math.max(0, detalhe.cotas - detalhe.vendidas) * detalhe.valorCota)}
            </p>
          </div>
        )}

        {detalhe.porDia.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma venda registrada neste período.
          </p>
        ) : (
          <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">
            {dias.map(([dia, itens]) => (
              <div key={dia} className="rounded-md border border-border/60 bg-secondary/20 p-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {dataBr(dia)}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {itens.map((i, idx) => (
                    <li
                      key={`${i.coluna}-${idx}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-foreground">{nomeColuna.get(i.coluna) ?? i.coluna}</span>
                      <span className="font-semibold text-foreground">{i.cotas} cota(s)</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {detalhe.situacao !== "finalizado" && detalhe.disponiveis > 0 && (
            <button
              type="button"
              onClick={onVender}
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Vender
            </button>
          )}
          {admin && (
            <>
              {detalhe.situacao === "ativo" && (
                <button
                  type="button"
                  onClick={onEncerrar}
                  className="h-9 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Encerrar
                </button>
              )}
              {detalhe.situacao === "encerrado" && (
                <>
                  <button
                    type="button"
                    onClick={onReativar}
                    className="h-9 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    Reativar
                  </button>
                  <button
                    type="button"
                    onClick={onFinalizar}
                    className="h-9 rounded-md border border-emerald-600 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  >
                    Finalizar
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onAjustarCotas}
                className="h-9 rounded-md border border-input px-3 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                Ajustar cotas
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onFechar}
            className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
