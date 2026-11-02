import type { jsPDF } from "jspdf";
import {
  brl,
  brlSinal,
  VALOR_CAMPOS,
  type ValorKey,
  SALDO_ITENS,
  type SaldoKey,
  type Saldo,
  num,
} from "./fechamento-campos";

/** Cor RGB da diferença no PDF: verde positivo, vermelho negativo, neutro zero. */
const corDiferencaPdf = (n: number): [number, number, number] =>
  Math.abs(n) < 0.005 ? [30, 30, 30] : n > 0 ? [5, 150, 105] : [220, 38, 38];

const PDF_CONFIG = {
  margin: 32,
  lineSaldo: 18,
  lineValor: 24,
  gapTopTitle: 18,
  gapTitle2Title: 22,
  gapTitle2Meta: 26,
  gapMetaSaldo: 28,
  gapSaldoValor: 34,
  gapValorRelatorio: 10,
  gapRelatorioTotal: 26,
  gapTotalDiferenca: 22,
  gapBottom: 6,
} as const;

type BolaoParam = { concurso: string; valor: string; taxa: string; quant: string; numero?: string };

type SaldoBoloes = {
  boloes: Array<{
    concurso: string;
    totalCotas: number;
    lojaDia: number;
    mkpDia: number;
    disponiveis: number;
  }>;
  resumo: {
    vendidasDia: number;
    lojaDia: number;
    mkpDia: number;
    disponiveis: number;
    valorDia: number;
    taxaDia: number;
    valorDisponivel: number;
  };
};

export async function gerarDocFechamento(params: {
  data: string;
  funcionario: string;
  caixaNumero: string;
  relatorio: number;
  total: number;
  diferenca: number;
  totalInicial: number;
  totalFinal: number;
  totalBolaoValor: number;
  totalBolaoTaxa: number;
  totalBolaoQuant: number;
  valores: Record<string, string>;
  saldoInicial: Record<string, string>;
  saldoFinal: Record<string, string>;
  boloes: BolaoParam[];
  saldoBoloes?: SaldoBoloes | undefined;
}): Promise<jsPDF> {
  const { default: jsPDFModule } = await import("jspdf");
  const doc = new jsPDFModule({ unit: "pt", format: "a4" });

  const {
    data,
    funcionario,
    caixaNumero,
    relatorio,
    total,
    diferenca,
    totalInicial,
    totalFinal,
    totalBolaoValor,
    totalBolaoTaxa,
    totalBolaoQuant,
    valores,
    saldoInicial,
    saldoFinal,
    boloes,
    saldoBoloes,
  } = params;

  const dataBr = data.split("-").reverse().join("/");

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const { margin, lineSaldo, lineValor } = PDF_CONFIG;
  const availH = pageH - margin * 2;
  const availW = pageW - margin * 2;

  const baseHeight =
    PDF_CONFIG.gapTopTitle +
    PDF_CONFIG.gapTitle2Title +
    PDF_CONFIG.gapTitle2Meta +
    PDF_CONFIG.gapMetaSaldo +
    lineSaldo * (SALDO_ITENS.length + 1) +
    PDF_CONFIG.gapSaldoValor +
    lineValor * VALOR_CAMPOS.length +
    PDF_CONFIG.gapValorRelatorio +
    PDF_CONFIG.gapRelatorioTotal +
    PDF_CONFIG.gapTotalDiferenca * 2 +
    PDF_CONFIG.gapBottom;

  const s = Math.min(1, availH / baseHeight);
  const colMid = margin + availW / 2 + 8;
  const rightIn = margin + availW / 2 - 16;
  const rightEnd = pageW - margin;

  const fs = (size: number) => doc.setFontSize(size * s);

  let y = margin + PDF_CONFIG.gapTopTitle * s;
  doc.setFont("helvetica", "bold");
  fs(16);
  doc.text("Loterica Brasil da Sorte", margin, y);
  y += PDF_CONFIG.gapTitle2Title * s;
  fs(13);
  doc.text("Fechamento de Caixa", margin, y);

  doc.setFont("helvetica", "normal");
  y += PDF_CONFIG.gapTitle2Meta * s;
  doc.setFontSize(11 * s);
  doc.text(`Data: ${dataBr}`, margin, y);
  doc.text(`Funcionario: ${funcionario || "-"}`, margin + 160 * s, y);
  doc.text(`Caixa: ${caixaNumero || "-"}`, margin + 330 * s, y);

  y += PDF_CONFIG.gapMetaSaldo * s;
  doc.setFont("helvetica", "bold");
  doc.text("SALDO INICIAL", margin, y);
  doc.text("SALDO FINAL", colMid, y);
  doc.setFont("helvetica", "normal");
  y += lineSaldo * s;
  SALDO_ITENS.forEach((i) => {
    doc.text(i.label, margin, y);
    doc.text(saldoInicial[i.key] || "-", rightIn, y, { align: "right" });
    doc.text(i.label, colMid, y);
    doc.text(saldoFinal[i.key] || "-", rightEnd, y, { align: "right" });
    y += lineSaldo * s;
  });
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", margin, y);
  doc.text(brl(totalInicial), rightIn, y, { align: "right" });
  doc.text("TOTAL", colMid, y);
  doc.text(brl(totalFinal), rightEnd, y, { align: "right" });
  doc.setFont("helvetica", "normal");

  y += PDF_CONFIG.gapSaldoValor * s;
  doc.setDrawColor(200);
  VALOR_CAMPOS.forEach((c) => {
    doc.text(c.label, margin, y);
    doc.text(brl(num(valores[c.key] ?? "")), rightEnd, y, { align: "right" });
    doc.line(margin, y + 6 * s, rightEnd, y + 6 * s);
    y += lineValor * s;
  });

  y += PDF_CONFIG.gapValorRelatorio * s;
  doc.text("RELATÓRIO", margin, y);
  doc.text(brl(num(String(relatorio))), rightEnd, y, { align: "right" });

  y += PDF_CONFIG.gapRelatorioTotal * s;
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", margin, y);
  doc.text(brl(total), rightEnd, y, { align: "right" });

  y += PDF_CONFIG.gapTotalDiferenca * s;
  doc.text("DIFERENÇA DE SALDO", margin, y);
  doc.setTextColor(...corDiferencaPdf(totalFinal - totalInicial));
  doc.text(brlSinal(totalFinal - totalInicial), rightEnd, y, { align: "right" });
  doc.setTextColor(30, 30, 30);

  y += PDF_CONFIG.gapTotalDiferenca * s;
  doc.text("DIFERENÇA", margin, y);
  doc.setTextColor(...corDiferencaPdf(diferenca));
  doc.text(brlSinal(diferenca), rightEnd, y, { align: "right" });
  doc.setTextColor(30, 30, 30);

  // Segunda página: controle de bolões
  const preenchidos = boloes.filter(
    (b) => b.concurso || b.numero || b.valor || b.taxa || b.quant,
  );
  if (preenchidos.length) {
    doc.addPage();
    const colValor = margin + availW * 0.5;
    const colTaxa = margin + availW * 0.72;
    let by = margin + 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Controle de Bolões", margin, by);
    by += 20;
    doc.setFontSize(11);
    doc.text(`Data: ${dataBr}`, margin, by);
    doc.text(`Funcionario: ${funcionario || "-"}`, margin + 180, by);
    doc.text(`Caixa: ${caixaNumero || "-"}`, margin + 360, by);
    by += 26;
    doc.text("Bolão / Concurso", margin, by);
    doc.text("Valor", colValor, by, { align: "right" });
    doc.text("Taxa", colTaxa, by, { align: "right" });
    doc.text("Quant.", rightEnd, by, { align: "right" });
    doc.setFont("helvetica", "normal");
    by += 6;
    doc.line(margin, by, rightEnd, by);
    by += 16;
    preenchidos.forEach((b) => {
      doc.text(
        [b.concurso, b.numero].filter(Boolean).join(" - ") || "-",
        margin,
        by,
      );
      doc.text(b.valor ? brl(num(b.valor)) : "-", colValor, by, { align: "right" });
      doc.text(b.taxa ? brl(num(b.taxa)) : "-", colTaxa, by, { align: "right" });
      doc.text(b.quant || "-", rightEnd, by, { align: "right" });
      doc.line(margin, by + 6, rightEnd, by + 6);
      by += 22;
    });
    by += 8;
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL", margin, by);
    doc.text(brl(totalBolaoValor), colValor, by, { align: "right" });
    doc.text(brl(totalBolaoTaxa), colTaxa, by, { align: "right" });
    doc.text(String(totalBolaoQuant || ""), rightEnd, by, { align: "right" });
  }

  // Saldo de bolões vendidos por canal
  if (saldoBoloes && saldoBoloes.boloes.length) {
    doc.addPage();
    const cQuant = margin + availW * 0.46;
    const cLoja = margin + availW * 0.6;
    const cMkp = margin + availW * 0.74;
    let sy = margin + 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Saldo de Bolões por Canal", margin, sy);
    sy += 20;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Data: ${dataBr}`, margin, sy);
    doc.text(`Caixa: ${caixaNumero || "-"}`, margin + 180, sy);
    sy += 26;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Bolão/Concurso", margin, sy);
    doc.text("Cotas", cQuant, sy, { align: "right" });
    doc.text("Loja", cLoja, sy, { align: "right" });
    doc.text("Mkp", cMkp, sy, { align: "right" });
    doc.text("Sobrou", rightEnd, sy, { align: "right" });
    sy += 6;
    doc.line(margin, sy, rightEnd, sy);
    sy += 16;

    doc.setFont("helvetica", "normal");
    saldoBoloes.boloes.forEach((b) => {
      if (sy > pageH - margin - 60) {
        doc.addPage();
        sy = margin + 18;
      }
      doc.text(b.concurso, margin, sy, { maxWidth: availW * 0.42 });
      doc.text(String(b.totalCotas), cQuant, sy, { align: "right" });
      doc.text(String(b.lojaDia), cLoja, sy, { align: "right" });
      doc.text(String(b.mkpDia), cMkp, sy, { align: "right" });
      doc.text(String(b.disponiveis), rightEnd, sy, { align: "right" });
      doc.line(margin, sy + 6, rightEnd, sy + 6);
      sy += 20;
    });

    sy += 8;
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL VENDIDO NO DIA", margin, sy);
    doc.text(String(saldoBoloes.resumo.vendidasDia), cQuant, sy, { align: "right" });
    doc.text(String(saldoBoloes.resumo.lojaDia), cLoja, sy, { align: "right" });
    doc.text(String(saldoBoloes.resumo.mkpDia), cMkp, sy, { align: "right" });
    doc.text(String(saldoBoloes.resumo.disponiveis), rightEnd, sy, { align: "right" });
    sy += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Valor vendido: ${brl(saldoBoloes.resumo.valorDia)}   Taxas: ${brl(saldoBoloes.resumo.taxaDia)}`,
      margin,
      sy,
    );
    sy += 16;
    doc.text(
      `Cotas que sobraram: ${saldoBoloes.resumo.disponiveis} (${brl(saldoBoloes.resumo.valorDisponivel)})`,
      margin,
      sy,
    );
  }

  return doc;
}
