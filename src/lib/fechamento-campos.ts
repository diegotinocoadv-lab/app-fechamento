export const VALOR_CAMPOS = [
  { key: "deposito1", label: "Depósito 1" },
  { key: "deposito2", label: "Depósito 2" },
  { key: "cartao", label: "Cartão" },
  { key: "moedas", label: "Moedas" },
  { key: "premioRasp", label: "Prêmio Rasp" },
  { key: "premioTS", label: "Prêmio TS" },
  { key: "pix", label: "Pix" },
  { key: "fiado", label: "Fiado" },
  { key: "dinheiro", label: "Dinheiro" },
  { key: "loja", label: "Loja" },
] as const;

export type ValorKey = (typeof VALOR_CAMPOS)[number]["key"];

export const SALDO_ITENS = [
  { key: "cedulas", label: "Cédulas" },
  { key: "moedas", label: "Moedas" },
  { key: "rasp250", label: "RASP - 2,50" },
  { key: "rasp500", label: "RASP - 5,00" },
  { key: "rasp1000", label: "RASP - 10,00" },
  { key: "telesena", label: "Telesena" },
  { key: "tag", label: "TAG" },
  { key: "carneBau", label: "Carnê Baú" },
  { key: "chipCorreio", label: "Chip Correio" },
] as const;

export type SaldoKey = (typeof SALDO_ITENS)[number]["key"];
export type Saldo = Record<SaldoKey, string>;

export const saldoVazio = (): Saldo =>
  Object.fromEntries(SALDO_ITENS.map((i) => [i.key, ""])) as Saldo;

export const valoresVazios = (): Record<ValorKey, string> =>
  Object.fromEntries(VALOR_CAMPOS.map((c) => [c.key, ""])) as Record<ValorKey, string>;

export type Bolao = { concurso: string; valor: string; taxa: string; quant: string };

export const bolaoVazio = (): Bolao => ({ concurso: "", valor: "", taxa: "", quant: "" });

export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Formata com sinal explícito: +R$ 10,00 / -R$ 10,00. */
export const brlSinal = (n: number) => (n > 0.005 ? "+" : "") + brl(n);

/** Classes de cor da diferença: verde positivo, vermelho negativo, neutro zero. */
export const classeDiferenca = (n: number) =>
  Math.abs(n) < 0.005
    ? "text-foreground"
    : n > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";

export const num = (v: string) => Number(String(v ?? "").replace(",", ".")) || 0;

/** Estrutura preenchida pela importação por imagem e aplicada no fechamento. */
export type FechamentoImportado = {
  data: string;
  funcionario: string;
  relatorio: string;
  valores: Record<ValorKey, string>;
  saldoInicial: Saldo;
  saldoFinal: Saldo;
  boloes: Bolao[];
};

export const IMPORT_STORAGE_KEY = "fechamento:importado";
