import { SALDO_ITENS, VALOR_CAMPOS } from "@/lib/fechamento-campos";
import type { TipoLancamento } from "@/lib/lancamentos-simples.functions";

/** Gaveta = itens do saldo final do caixa (prefixo saldo:); Caixa = campos de valores. */
export const OPCOES_GAVETA = SALDO_ITENS.map((i) => ({
  key: `saldo:${i.key}`,
  label: i.label,
}));
export const OPCOES_CAIXA = VALOR_CAMPOS.map((c) => ({ key: c.key as string, label: c.label }));
export const OPCOES_RELATORIO = [{ key: "relatorio", label: "Relatório" }];

export const opcoesCampo = (tipo: TipoLancamento | null) =>
  tipo === "GAVETA" ? OPCOES_GAVETA : tipo === "RELATORIO" ? OPCOES_RELATORIO : OPCOES_CAIXA;

/** Rótulo do campo do fechamento a que o lançamento se refere. */
export const rotuloCampo = (key: string) =>
  [...OPCOES_GAVETA, ...OPCOES_CAIXA, ...OPCOES_RELATORIO].find((c) => c.key === key)?.label ?? "";

export type ModeloBolao = {
  id: string;
  concurso: string;
  /** Nome/modalidade do bolão (para cor); igual ao concurso nos modelos antigos. */
  nome: string;
  valorCota: number;
  taxa: number;
  /** Saldo disponível no estoque; null quando é modelo antigo sem estoque. */
  disponiveis: number | null;
  /** Concurso do estoque (pré-preenchido no modal). */
  estoqueConcurso: string;
};

/** Nome do modelo de bolão a partir do campo bolao:<id>. */
export const rotuloBolao = (key: string, modelos: ModeloBolao[]) =>
  modelos.find((m) => `bolao:${m.id}` === key)?.concurso ?? "";
