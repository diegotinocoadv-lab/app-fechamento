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

export const brl = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

/** Formata com sinal explícito: +R$ 10,00 / -R$ 10,00. */
export const brlSinal = (n: number) => (n > 0.005 ? "+" : "") + brl(n);

/** Classes de cor da diferença: verde positivo, vermelho negativo, neutro zero. */
export const classeDiferenca = (n: number) =>
  Math.abs(n) < 0.005
    ? "text-foreground"
    : n > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";

/**
 * Converte valor digitado em número, entendendo formato brasileiro:
 * "1.234,56" → 1234,56 · "1.234" → 1234 · "10,50" → 10,5 · "10.50" → 10,5.
 */
export const num = (v: string) => {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(s.replace(",", ".")) || 0;
};

/** Converte valores digitados no formato brasileiro ("1.234,56") em número. */
export function valorNumerico(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  if (typeof valor !== "string") return 0;
  const n = Number(valor.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export type LinhaManualFechamento = {
  rotulo: string;
  numero: string;
  valor: number;
  taxa: number;
  quantidade: number;
};

/**
 * Linhas da tabela "Controle de Bolões" do fechamento que ainda precisam virar
 * lançamento + baixa de estoque ao salvar:
 * - manuais (sem a marca `lanc` das linhas auto-preenchidas pelo /lancar);
 * - com bolão preenchido e quantidade >= 1.
 */
export function linhasManuaisDoFechamento(dados: unknown): LinhaManualFechamento[] {
  const linhas = (dados as { boloes?: unknown[] } | null)?.boloes;
  const out: LinhaManualFechamento[] = [];
  for (const bruto of linhas ?? []) {
    const b = (bruto ?? {}) as Record<string, unknown>;
    if (b["lanc"]) continue;
    const rotulo = String(b["concurso"] ?? "").trim();
    if (!rotulo) continue;
    const quantidade = Math.trunc(valorNumerico(b["quant"]));
    if (quantidade < 1) continue;
    out.push({
      rotulo,
      numero: String(b["numero"] ?? "").trim(),
      valor: valorNumerico(b["valor"]),
      taxa: valorNumerico(b["taxa"]),
      quantidade,
    });
  }
  return out;
}

export type BolaoLancado = Bolao & { numero?: string; lanc?: string };

export type LancamentoBolao = {
  tipo: string;
  campo: string;
  descricao: string;
  quantidade: number;
  valor: number;
  taxa: number;
};

export type OpcaoBolao = { id: string; concurso: string; valorCota: number; taxa: number };

/**
 * Agrupa os lançamentos rápidos de bolão do dia em linhas da tabela
 * "Controle de Bolões":
 * - por modelo+concurso, somando cotas repetidas (valor/taxa vêm do lote, iguais);
 * - manuais (campo bolao:manual) por descrição+valor+taxa: preços diferentes são
 *   vendas distintas e não podem virar uma linha só com o valor de uma delas
 *   (ex.: 1 cota a 34,01 + 1 cota a 154,63 nunca é 2 cotas a 154,63).
 */
export function agruparBoloesLanc(
  lancamentos: LancamentoBolao[],
  opcoes: OpcaoBolao[],
): BolaoLancado[] {
  const fmt = (n: number) => String(n.toFixed(2)).replace(".", ",");
  const mapa = new Map<string, BolaoLancado>();
  for (const l of lancamentos) {
    if (l.tipo !== "BOLAO" || !l.campo.startsWith("bolao:")) continue;
    const modeloId = l.campo.slice(6);
    const quant = l.quantidade || 1;

    if (modeloId === "manual") {
      const chave = `manual|${l.descricao}|${fmt(l.valor)}|${fmt(l.taxa)}`;
      const atual = mapa.get(chave);
      const total = (atual ? num(atual.quant) : 0) + quant;
      mapa.set(chave, {
        concurso: l.descricao || "Outro",
        numero: "",
        valor: fmt(l.valor),
        taxa: fmt(l.taxa),
        quant: String(total),
        lanc: chave,
      });
      continue;
    }

    const modelo = opcoes.find((b) => b.id === modeloId);
    if (!modelo) continue;
    const chave = `${modeloId}|${l.descricao}`;
    const atual = mapa.get(chave);
    const total = (atual ? num(atual.quant) : 0) + quant;
    mapa.set(chave, {
      concurso: modelo.concurso,
      numero: l.descricao,
      valor: fmt(modelo.valorCota),
      taxa: fmt(modelo.taxa),
      quant: String(total),
      lanc: chave,
    });
  }
  return [...mapa.values()];
}

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
