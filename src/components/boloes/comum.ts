/**
 * Tipos e utilitários compartilhados da tela de Bolões.
 *
 * Ficam aqui para que a rota (`controle-boloes.tsx`) e os componentes
 * extraídos (`VendasPeriodo`, `RelatorioOperadoras`, `DetalheBolao`) usem
 * exatamente as mesmas formas de dados e a mesma formatação.
 */

/** Classes padrão dos campos de formulário (mesmo visual em toda a tela). */
export const input =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

/** Converte `2026-11-02` em `02/11/2026`; vazio vira `—`. */
export const dataBr = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

/** Uma linha do quadro de bolões (já agregada por nome/concurso/valor/taxa). */
export type Linha = {
  nome: string;
  concurso: string;
  valorCota: number;
  taxa: number;
  data: string;
  observacoes: string;
  cotas: number;
  vendidas: number;
  disponiveis: number;
  situacao: string;
  finalizado: boolean;
  ids: string[];
  vendidasLoja: number;
  vendidasMkp: number;
  ultimaVenda: string;
  celulas: Record<string, number>;
  porDia: Array<{ data: string; coluna: string; cotas: number; operador: string; canal: string }>;
};

/** Uma venda individual listada em "Vendas do período". */
export type VendaEstoque = {
  id: string;
  nome: string;
  concurso: string;
  quantidade: number;
  canal: "LOJA" | "MARKETPLACE";
  data: string;
  operador: string;
  valorTotal: number;
};

/** Totais de um dia no relatório por operadora. */
export type RelDia = {
  data: string;
  cotas: number;
  valor: number;
  taxa: number;
  mkpCotas: number;
  mkpValor: number;
};

/** Total (ou subtotal por operadora) do relatório do mês. */
export type RelTotal = {
  cotas: number;
  valor: number;
  taxa: number;
  mkpCotas: number;
  mkpValor: number;
  mkpTaxa: number;
};

/** Uma operadora no relatório do mês (MKP usa o id reservado `__mkp__`). */
export type RelOperador = {
  operadorId: string;
  operador: string;
  cotas: number;
  valor: number;
  taxa: number;
  dias: RelDia[];
};

/** Texto da situação do bolão. */
export const rotuloSituacao = (l: { situacao: string }) =>
  l.situacao === "finalizado"
    ? "Finalizado"
    : l.situacao === "encerrado"
      ? "Encerrado"
      : "Em aberto";
