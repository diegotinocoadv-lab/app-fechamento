import { brl } from "@/lib/fechamento-campos";
import { SALDO_ITENS, type Saldo } from "@/lib/fechamento-campos";
import { inputCls } from "@/components/fechamento/tipos";

type Props = {
  titulo: string;
  saldo: Saldo;
  setSaldo: (fn: (s: Saldo) => Saldo) => void;
  total: number;
};

/** Bloco de cédulas/moedas com total (usado no saldo final). */
export function SaldoBloco({ titulo, saldo, setSaldo, total }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <h2 className="border-b border-border bg-secondary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
        {titulo}
      </h2>
      <div className="divide-y divide-border">
        {SALDO_ITENS.map((i) => (
          <div key={i.key} className="flex items-center justify-between gap-4 px-4 py-1.5">
            <span className="text-sm font-medium text-foreground">{i.label}</span>
            <input
              inputMode="decimal"
              value={saldo[i.key]}
              onChange={(e) => setSaldo((s) => ({ ...s, [i.key]: e.target.value }))}
              placeholder="0"
              className={inputCls}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border bg-secondary/40 px-4 py-2">
        <span className="text-sm font-semibold uppercase tracking-wide text-foreground">Total</span>
        <span className="text-base font-bold text-foreground">{brl(total)}</span>
      </div>
    </div>
  );
}
