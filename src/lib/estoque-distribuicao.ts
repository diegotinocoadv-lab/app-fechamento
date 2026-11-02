/**
 * Distribuição de cotas vendidas entre os lotes de um bolão (mesmo
 * nome+concurso+valor+taxa), do lote mais antigo para o mais novo,
 * pulando lotes finalizados. Usada pela venda direta na linha do quadro
 * (registrarVendaLinha).
 */
export type LoteDistribuicao = {
  id: string;
  cotas: number;
  situacao: string;
  created_at: string | null;
};

export function distribuirVendaEntreLotes(
  lotes: LoteDistribuicao[],
  vendidasPorLote: Map<string, number>,
  quantidade: number,
): Array<{ loteId: string; qtd: number }> {
  const ordem = [...lotes]
    .filter((l) => l.situacao !== "finalizado")
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const plano: Array<{ loteId: string; qtd: number }> = [];
  let restante = quantidade;
  for (const l of ordem) {
    if (restante <= 0) break;
    const cotasLote = Number(l.cotas ?? 0);
    const disp = Math.max(0, cotasLote - (vendidasPorLote.get(l.id) ?? 0));
    const n = Math.min(restante, disp);
    if (n <= 0) continue;
    plano.push({ loteId: l.id, qtd: n });
    restante -= n;
  }
  return plano;
}

/** Soma do estoque realmente disponível nos lotes (fora os finalizados). */
export function disponivelEntreLotes(
  lotes: LoteDistribuicao[],
  vendidasPorLote: Map<string, number>,
): number {
  return lotes
    .filter((l) => l.situacao !== "finalizado")
    .reduce(
      (s, l) => s + Math.max(0, Number(l.cotas ?? 0) - (vendidasPorLote.get(l.id) ?? 0)),
      0,
    );
}
