import type { Dispatch, SetStateAction } from "react";
import { brl, num } from "@/lib/fechamento-campos";
import { getLoteriaDotColor, getLoteriaRowStyle } from "@/lib/loteria-colors";
import { getModalidade } from "@/lib/loterias-sorteio";
import { bolaoVazio, inputCls, type Bolao } from "@/components/fechamento/tipos";

/** Modelo de bolão disponível para escolher na linha. */
export type OpcaoBolao = {
  id: string;
  concurso: string;
  nome?: string;
  valorCota: number;
};

type Props = {
  boloes: Bolao[];
  opcoes: OpcaoBolao[];
  setBolao: (idx: number, campo: keyof Bolao, valor: string | boolean) => void;
  escolherBolao: (idx: number, modeloId: string) => void;
  setBoloes: Dispatch<SetStateAction<Bolao[]>>;
  onRemover: (idx: number) => void;
  totalValor: number;
  totalTaxa: number;
  totalQuant: number;
};

/**
 * Tabela "Controle de Bolões" do fechamento: versão desktop (tabela) e mobile
 * (cards), com escolha do modelo, concurso, valor, taxa e quantidade.
 */
export function ControleBoloesFechamento({
  boloes,
  opcoes: opcoesBoloes,
  setBolao,
  escolherBolao,
  setBoloes,
  onRemover,
  totalValor,
  totalTaxa,
  totalQuant,
}: Props) {
  /**
   * A linha (b.concurso) corresponde à opção? Compara por igualdade ou pelo
   * sufixo " 3062": fechamentos antigos guardavam só o número do concurso do
   * estoque novo; hoje a opção vem como "MEGA 3062".
   */
  const corresponde = (opcaoConcurso: string, linhaConcurso: string) => {
    if (opcaoConcurso === linhaConcurso) return true;
    const linha = linhaConcurso.trim();
    return linha !== "" && linha !== " " && opcaoConcurso.endsWith(` ${linha}`);
  };

  /** Id do modelo correspondente à linha (nome + valor da cota), para o seletor. */
  const idModeloLinha = (b: Bolao) => {
    const mesmos = opcoesBoloes.filter((o) => corresponde(o.concurso, b.concurso));
    if (mesmos.length === 0) return "";
    const exato = mesmos.find((o) => Math.abs(o.valorCota - num(b.valor)) < 0.005);
    return (exato ?? mesmos[0]!).id;
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <h2 className="border-b border-border bg-secondary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
        Controle de Bolões
      </h2>
      <p className="border-b border-border bg-secondary/40 px-4 py-1.5 text-xs text-muted-foreground">
        Linhas preenchidas aqui dão baixa automática no estoque ao salvar o fechamento. As
        vindas do lançamento rápido já entram baixadas.
      </p>

      {/* Desktop: tabela */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Bolão (modelo)</th>
              <th className="px-3 py-2">Concurso</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Taxa</th>
              <th className="px-3 py-2 text-right">Quant.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {boloes.map((b, idx) => {
              const naLista = opcoesBoloes.some((o) => corresponde(o.concurso, b.concurso));
              const modoManual = b.concurso !== "" && !naLista;
              const modeloAtivo = !modoManual
                ? opcoesBoloes.find((o) => o.id === idModeloLinha(b))
                : null;
              const rowStyle = modeloAtivo
                ? getLoteriaRowStyle(modeloAtivo.nome || modeloAtivo.concurso)
                : b.mod
                  ? getLoteriaRowStyle(getModalidade(b.mod)?.nome ?? "")
                  : undefined;
              return (
                <tr key={idx} style={rowStyle}>
                  <td className="px-3 py-1">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const nomeCor =
                          !modoManual && idModeloLinha(b)
                            ? (opcoesBoloes.find((o) => o.id === idModeloLinha(b))?.concurso ?? "")
                            : b.mod
                              ? (getModalidade(b.mod)?.nome ?? "")
                              : "";
                        const cor = nomeCor ? getLoteriaDotColor(nomeCor) : "";
                        return cor ? (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: cor }}
                          />
                        ) : null;
                      })()}
                      <select
                        value={modoManual ? "__outro__" : idModeloLinha(b)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__outro__") {
                            setBolao(idx, "concurso", " ");
                            setBolao(idx, "numeroAuto", false);
                          } else {
                            escolherBolao(idx, v);
                          }
                        }}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Escolha o bolão</option>
                        {opcoesBoloes.map((o) => (
                          <option key={o.id} value={o.id}>
                            {`${o.concurso} • ${brl(o.valorCota)}`}
                          </option>
                        ))}
                        <option value="__outro__">Outro (nome livre)</option>
                      </select>
                      {modoManual && (
                        <input
                          value={b.concurso}
                          onChange={(e) => setBolao(idx, "concurso", e.target.value)}
                          placeholder="Digite o bolão"
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1">
                    <input
                      value={b.numero ?? ""}
                      onChange={(e) => {
                        setBolao(idx, "numero", e.target.value);
                        setBolao(idx, "numeroAuto", false);
                      }}
                      placeholder="Nº do concurso"
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </td>
                  <td className="px-3 py-1">
                    <input
                      inputMode="decimal"
                      value={b.valor}
                      onChange={(e) => setBolao(idx, "valor", e.target.value)}
                      placeholder="0,00"
                      className={inputCls}
                    />
                  </td>
                  <td className="px-3 py-1">
                    <input
                      inputMode="decimal"
                      value={b.taxa}
                      onChange={(e) => setBolao(idx, "taxa", e.target.value)}
                      placeholder="0,00"
                      className={inputCls}
                    />
                  </td>
                  <td className="px-3 py-1">
                    <input
                      inputMode="numeric"
                      value={b.quant}
                      onChange={(e) => setBolao(idx, "quant", e.target.value)}
                      placeholder="0"
                      className={inputCls}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-secondary/50 text-sm font-bold">
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right text-foreground">{brl(totalValor)}</td>
              <td className="px-3 py-2 text-right text-foreground">{brl(totalTaxa)}</td>
              <td className="px-3 py-2 text-right text-foreground">{totalQuant}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden divide-y divide-border">
        {boloes.map((b, idx) => {
          const naLista = opcoesBoloes.some((o) => corresponde(o.concurso, b.concurso));
          const modoManual = b.concurso !== "" && !naLista;
          const modeloAtivo = !modoManual
            ? opcoesBoloes.find((o) => o.id === idModeloLinha(b))
            : null;
          const rowStyle = modeloAtivo
            ? getLoteriaRowStyle(modeloAtivo.nome || modeloAtivo.concurso)
            : b.mod
              ? getLoteriaRowStyle(getModalidade(b.mod)?.nome ?? "")
              : undefined;
          return (
            <div key={idx} style={rowStyle} className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Bolão {idx + 1}
                </span>
                <button
                  onClick={() => onRemover(idx)}
                  className="text-xs text-destructive hover:underline"
                >
                  Remover
                </button>
              </div>

              <select
                value={modoManual ? "__outro__" : idModeloLinha(b)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__outro__") {
                    setBolao(idx, "concurso", " ");
                    setBolao(idx, "numeroAuto", false);
                  } else {
                    escolherBolao(idx, v);
                  }
                }}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione o bolão...</option>
                {opcoesBoloes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.concurso} — {brl(o.valorCota)}/cota
                  </option>
                ))}
                <option value="__outro__">Outro (nome livre)</option>
              </select>

              {modoManual && (
                <input
                  value={b.concurso}
                  onChange={(e) => setBolao(idx, "concurso", e.target.value)}
                  placeholder="Nome do bolão"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              )}

              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Nº Concurso</span>
                  <input
                    value={b.numero ?? ""}
                    onChange={(e) => {
                      setBolao(idx, "numero", e.target.value);
                      setBolao(idx, "numeroAuto", false);
                    }}
                    placeholder="—"
                    className="h-10 w-full rounded-lg border border-input bg-background px-2 text-center text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Valor cota</span>
                  <input
                    inputMode="decimal"
                    value={b.valor}
                    onChange={(e) => setBolao(idx, "valor", e.target.value)}
                    placeholder="0,00"
                    className="h-10 w-full rounded-lg border border-input bg-background px-2 text-center text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Quant.</span>
                  <input
                    inputMode="numeric"
                    value={b.quant}
                    onChange={(e) => setBolao(idx, "quant", e.target.value)}
                    placeholder="0"
                    className="h-10 w-full rounded-lg border border-input bg-background px-2 text-center text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs">
                <label className="flex items-center gap-1">
                  <span className="text-muted-foreground">Taxa:</span>
                  <input
                    inputMode="decimal"
                    value={b.taxa}
                    onChange={(e) => setBolao(idx, "taxa", e.target.value)}
                    placeholder="0,00"
                    className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <span className="font-bold text-foreground">
                  Subtotal: {brl(num(b.valor) * num(b.quant))}
                </span>
              </div>
            </div>
          );
        })}

        {boloes.length > 0 && (
          <div className="flex items-center justify-between bg-secondary/50 px-4 py-3">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Total</span>
            <div className="flex gap-4 text-xs font-bold text-foreground">
              <span>{totalQuant} cotas</span>
              <span>{brl(totalValor)}</span>
              <span>Taxa: {brl(totalTaxa)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        <button
          onClick={() => setBoloes((bs) => [...bs, bolaoVazio()])}
          className="inline-flex h-11 sm:h-8 items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-background px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground w-full sm:w-auto"
        >
          + Adicionar bolão
        </button>
      </div>
    </section>
  );
}
