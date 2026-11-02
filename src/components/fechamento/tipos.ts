import type { Bolao as BaseBolao } from "@/lib/fechamento-campos";

/** Linha da tabela de Controle de Bolões dentro do fechamento. */
export type Bolao = BaseBolao & {
  numero?: string;
  lanc?: string;
  /** Id da modalidade quando a linha veio do seletor de modalidades (sem estoque). */
  mod?: string;
  /** Nº preenchido pelo sistema (vigente da data do fechamento) — recalcula ao mudar a data. */
  numeroAuto?: boolean;
};

/** Linha vazia para iniciar a tabela/add um bolão. */
export const bolaoVazio = (): Bolao => ({
  concurso: "",
  numero: "",
  valor: "",
  taxa: "",
  quant: "",
});

/** Campos numéricos da tabela usam o mesmo estilo compacto à direita. */
export const inputCls =
  "h-8 w-28 rounded-md border border-input bg-background px-3 text-right text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
