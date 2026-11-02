import { brl } from "@/lib/fechamento-campos";
import { getLoteriaDotColor } from "@/lib/loteria-colors";
import type { ModeloBolao } from "@/components/lancar/comum";

type Props = {
  bolao: ModeloBolao;
  concurso: string;
  onConcurso: (valor: string) => void;
  quantidade: string;
  onQuantidade: (valor: string) => void;
  erro: string;
  salvando: boolean;
  /** Concurso em vigência na Caixa ("" quando não há). */
  vigente: string;
  buscandoVigente: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
};

/** Modal de venda rápida de cotas de um bolão do estoque. */
export function BolaoRapidoModal({
  bolao,
  concurso,
  onConcurso,
  quantidade,
  onQuantidade,
  erro,
  salvando,
  vigente,
  buscandoVigente,
  onConfirmar,
  onCancelar,
}: Props) {
  return (
    <>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-sm">
        <div
          className="w-full max-w-sm rounded-t-2xl sm:rounded-xl border border-border bg-card p-5 shadow-xl"
          style={{ animation: "slideUp 0.2s ease-out" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <span
              className="h-4 w-4 rounded-full shrink-0"
              style={{ backgroundColor: getLoteriaDotColor(bolao.nome || bolao.concurso) }}
            />
            <div>
              <h3 className="text-base font-bold text-foreground">{bolao.concurso}</h3>
              <p className="text-sm text-muted-foreground">
                Cota {brl(bolao.valorCota)} · Taxa {brl(bolao.taxa)}
                {bolao.disponiveis !== null &&
                  ` · ${
                    bolao.disponiveis === 0
                      ? "esgotado"
                      : `${bolao.disponiveis} de ${bolao.totalCotas ?? "?"} disp.`
                  }`}
              </p>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Nº do Concurso</span>
              <input
                autoFocus
                inputMode="numeric"
                value={concurso}
                onChange={(e) => onConcurso(e.target.value)}
                placeholder="Ex.: 5827"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
              {buscandoVigente && (
                <span className="text-xs text-muted-foreground">
                  Buscando concurso em vigência...
                </span>
              )}
              {vigente && concurso === vigente && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  Concurso em vigência da Caixa.
                </span>
              )}
              {vigente && concurso !== vigente && (
                <button
                  type="button"
                  onClick={() => onConcurso(vigente)}
                  className="text-left text-xs font-medium text-primary hover:underline"
                >
                  Concurso em vigência: {vigente} — toque para usar
                </button>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Quantidade de cotas
              </span>
              <input
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => onQuantidade(e.target.value)}
                placeholder="1"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-center text-xl font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
          {erro && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onConfirmar}
              disabled={salvando}
              className="flex-1 h-12 rounded-lg bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={onCancelar}
              className="h-12 rounded-lg border border-input px-4 text-base font-medium text-foreground hover:bg-accent"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
