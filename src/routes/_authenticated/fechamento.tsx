import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { IMPORT_STORAGE_KEY, brlSinal, classeDiferenca, type FechamentoImportado } from "@/lib/fechamento-campos";
import { salvarFechamento } from "@/lib/fechamento.functions";


export const Route = createFileRoute("/_authenticated/fechamento")({
  head: () => ({
    meta: [
      { title: "Fechamento de Caixa | Lotérica Brasil da Sorte" },
      {
        name: "description",
        content:
          "Planilha digital de fechamento de caixa da Lotérica Brasil da Sorte: saldo inicial, saldo final, depósitos, cartão, Pix, prêmios e cálculo automático de total e diferença.",
      },
      { property: "og:title", content: "Fechamento de Caixa | Brasil da Sorte" },
      {
        property: "og:description",
        content: "Registre saldo inicial, saldo final e o fechamento diário com total e diferença automáticos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Fechamento,
});

const VALOR_CAMPOS = [
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

type ValorKey = (typeof VALOR_CAMPOS)[number]["key"];

const SALDO_ITENS = [
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

type SaldoKey = (typeof SALDO_ITENS)[number]["key"];
type Saldo = Record<SaldoKey, string>;

const saldoVazio = () =>
  Object.fromEntries(SALDO_ITENS.map((i) => [i.key, ""])) as Saldo;

type Bolao = { concurso: string; valor: string; taxa: string; quant: string };

const bolaoVazio = (): Bolao => ({ concurso: "", valor: "", taxa: "", quant: "" });

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Cor RGB da diferença no PDF: verde positivo, vermelho negativo, neutro zero. */
const corDiferencaPdf = (n: number): [number, number, number] =>
  Math.abs(n) < 0.005 ? [30, 30, 30] : n > 0 ? [5, 150, 105] : [220, 38, 38];


/**
 * Configurações centrais de layout do PDF A4.
 * Ajuste apenas estes valores para mudar margens, escala e espaçamentos.
 * @type {object}
 */
const PDF_CONFIG = {
  margin: 32, // margem (pt) em torno da página
  lineSaldo: 18, // altura de cada linha das seções de saldo
  lineValor: 24, // altura de cada linha da tabela de valores
  gapTopTitle: 18, // altura inicial do título "Loterica..."
  gapTitle2Title: 22, // espaço entre título 1 e "Fechamento de Caixa"
  gapTitle2Meta: 26, // espaço entre "Fechamento" e a linha data/funcionário
  gapMetaSaldo: 28, // espaço antes dos saldos
  gapSaldoValor: 34, // espaço entre os saldos e a tabela de valores
  gapValorRelatorio: 10, // espaço entre valores e relatório
  gapRelatorioTotal: 26, // espaço entre relatório e total
  gapTotalDiferenca: 22, // espaço entre total e diferença
  gapBottom: 6, // margem inferior de folga
} as const;

function Fechamento() {
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [funcionario, setFuncionario] = useState("");
  const [relatorio, setRelatorio] = useState("");
  const [valores, setValores] = useState<Record<ValorKey, string>>(
    () =>
      Object.fromEntries(VALOR_CAMPOS.map((c) => [c.key, ""])) as Record<ValorKey, string>,
  );
  const [saldoInicial, setSaldoInicial] = useState<Saldo>(saldoVazio);
  const [saldoFinal, setSaldoFinal] = useState<Saldo>(saldoVazio);
  const [boloes, setBoloes] = useState<Bolao[]>(() =>
    Array.from({ length: 8 }, bolaoVazio),
  );
  const salvarFechamentoFn = useServerFn(salvarFechamento);

  // Aplica um fechamento vindo da importação por imagem (prévia interativa).
  useEffect(() => {
    const bruto = sessionStorage.getItem(IMPORT_STORAGE_KEY);
    if (!bruto) return;
    sessionStorage.removeItem(IMPORT_STORAGE_KEY);
    try {
      const imp = JSON.parse(bruto) as FechamentoImportado;
      if (imp.data) setData(imp.data);
      if (imp.funcionario) setFuncionario(imp.funcionario);
      if (imp.relatorio) setRelatorio(imp.relatorio);
      if (imp.valores) setValores((v) => ({ ...v, ...imp.valores }));
      if (imp.saldoInicial) setSaldoInicial((s) => ({ ...s, ...imp.saldoInicial }));
      if (imp.saldoFinal) setSaldoFinal((s) => ({ ...s, ...imp.saldoFinal }));
      if (imp.boloes?.length) {
        setBoloes(
          Array.from({ length: Math.max(8, imp.boloes.length) }, (_, i) =>
            imp.boloes[i] ?? bolaoVazio(),
          ),
        );
      }
      setAviso("Fechamento importado da imagem. Revise os valores antes de salvar.");
    } catch {
      /* ignora conteúdo inválido */
    }
  }, []);


  const num = (v: string) => Number(v.replace(",", ".")) || 0;

  const total = useMemo(
    () => VALOR_CAMPOS.reduce((acc, c) => acc + num(valores[c.key]), 0),
    [valores],
  );
  const totalInicial = useMemo(
    () => SALDO_ITENS.reduce((acc, i) => acc + num(saldoInicial[i.key]), 0),
    [saldoInicial],
  );
  const totalFinal = useMemo(
    () => SALDO_ITENS.reduce((acc, i) => acc + num(saldoFinal[i.key]), 0),
    [saldoFinal],
  );
  const totalValor = useMemo(
    () => boloes.reduce((acc, b) => acc + num(b.valor) * num(b.quant), 0),
    [boloes],
  );
  const totalTaxa = useMemo(
    () => boloes.reduce((acc, b) => acc + num(b.taxa) * num(b.quant), 0),
    [boloes],
  );
  const totalQuant = useMemo(
    () => boloes.reduce((acc, b) => acc + num(b.quant), 0),
    [boloes],
  );
  const diferenca = total - num(relatorio);
  const diferencaSaldo = totalFinal - totalInicial;


  const [salvando, setSalvando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const gerarDoc = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const dataBr = data.split("-").reverse().join("/");

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const { margin, lineSaldo, lineValor } = PDF_CONFIG;
    const availH = pageH - margin * 2;
    const availW = pageW - margin * 2;

    // Altura total do conteúdo na escala 1, derivada das configurações centrais
    const baseHeight =
      PDF_CONFIG.gapTopTitle +
      PDF_CONFIG.gapTitle2Title +
      PDF_CONFIG.gapTitle2Meta +
      PDF_CONFIG.gapMetaSaldo +
      lineSaldo * (SALDO_ITENS.length + 1) + // itens + TOTAL
      PDF_CONFIG.gapSaldoValor +
      lineValor * VALOR_CAMPOS.length +
      PDF_CONFIG.gapValorRelatorio +
      PDF_CONFIG.gapRelatorioTotal +
      PDF_CONFIG.gapTotalDiferenca * 2 + // diferença de saldo + diferença do caixa
      PDF_CONFIG.gapBottom;

    // Escala para caber sempre em uma única página
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
      doc.text(brl(num(valores[c.key])), rightEnd, y, { align: "right" });
      doc.line(margin, y + 6 * s, rightEnd, y + 6 * s);
      y += lineValor * s;
    });

    y += PDF_CONFIG.gapValorRelatorio * s;
    doc.text("RELATÓRIO", margin, y);
    doc.text(brl(num(relatorio)), rightEnd, y, { align: "right" });

    y += PDF_CONFIG.gapRelatorioTotal * s;
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL", margin, y);
    doc.text(brl(total), rightEnd, y, { align: "right" });

    y += PDF_CONFIG.gapTotalDiferenca * s;
    doc.text("DIFERENÇA DE SALDO", margin, y);
    doc.setTextColor(...corDiferencaPdf(diferencaSaldo));
    doc.text(brlSinal(diferencaSaldo), rightEnd, y, { align: "right" });
    doc.setTextColor(30, 30, 30);

    y += PDF_CONFIG.gapTotalDiferenca * s;
    doc.text("DIFERENÇA", margin, y);
    doc.setTextColor(...corDiferencaPdf(diferenca));
    doc.text(brlSinal(diferenca), rightEnd, y, { align: "right" });
    doc.setTextColor(30, 30, 30);



    // Segunda página: controle de bolões
    const preenchidos = boloes.filter(
      (b) => b.concurso || b.valor || b.taxa || b.quant,
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
      by += 26;
      doc.text("Bolão/Concurso", margin, by);
      doc.text("Valor", colValor, by, { align: "right" });
      doc.text("Taxa", colTaxa, by, { align: "right" });
      doc.text("Quant.", rightEnd, by, { align: "right" });
      doc.setFont("helvetica", "normal");
      by += 6;
      doc.line(margin, by, rightEnd, by);
      by += 16;
      preenchidos.forEach((b) => {
        doc.text(b.concurso || "-", margin, by);
        doc.text(b.valor ? brl(num(b.valor)) : "-", colValor, by, { align: "right" });
        doc.text(b.taxa ? brl(num(b.taxa)) : "-", colTaxa, by, { align: "right" });
        doc.text(b.quant || "-", rightEnd, by, { align: "right" });
        doc.line(margin, by + 6, rightEnd, by + 6);
        by += 22;
      });
      by += 8;
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL", margin, by);
      doc.text(brl(totalValor), colValor, by, { align: "right" });
      doc.text(brl(totalTaxa), colTaxa, by, { align: "right" });
      doc.text(String(totalQuant || ""), rightEnd, by, { align: "right" });
    }


    return doc;
  };

  const compartilharPdf = async () => {
    setErro(null);
    setGerandoPdf(true);
    try {
      const doc = await gerarDoc();
      const dataBr = data.split("-").reverse().join("/");
      const nome = `fechamento-${data}.pdf`;
      const blob = doc.output("blob");
      const file = new File([blob], nome, { type: "application/pdf" });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Fechamento de Caixa",
            text: `Fechamento de ${dataBr}`,
          });
          return;
        } catch {
          // usuário cancelou ou compartilhamento indisponível: baixa o arquivo
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErro(
        `Não foi possível gerar o PDF: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setGerandoPdf(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    setAviso(null);
    setErro(null);
    try {
      const doc = await gerarDoc();
      const pdfBase64 = (doc.output("datauristring") as string).split(",")[1] ?? "";
      const res = await salvarFechamentoFn({
        data: {
          data,
          funcionario,
          relatorio: num(relatorio),
          total,
          diferenca,
          totalInicial,
          totalFinal,
          totalBolaoValor: totalValor,
          totalBolaoTaxa: totalTaxa,
          totalBolaoQuant: totalQuant,
          dados: { valores, saldoInicial, saldoFinal, boloes },
          pdfBase64,
        },
      });
      setAviso(res.emailAviso ?? "Fechamento salvo e enviado por e-mail.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErro(
        msg.toLowerCase().includes("unauthorized")
          ? "Sua sessão expirou. Entre novamente para salvar o fechamento."
          : `Não foi possível salvar o fechamento: ${msg}`,
      );
    } finally {
      setSalvando(false);
    }
  };


  const limpar = () => {
    setFuncionario("");
    setRelatorio("");
    setValores(
      Object.fromEntries(VALOR_CAMPOS.map((c) => [c.key, ""])) as Record<ValorKey, string>,
    );
    setSaldoInicial(saldoVazio());
    setSaldoFinal(saldoVazio());
    setBoloes(Array.from({ length: 8 }, bolaoVazio));
  };

  const setBolao = (idx: number, campo: keyof Bolao, v: string) =>
    setBoloes((bs) => bs.map((b, i) => (i === idx ? { ...b, [campo]: v } : b)));


  const inputCls =
    "h-8 w-28 rounded-md border border-input bg-background px-3 text-right text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  const renderSaldo = (
    titulo: string,
    saldo: Saldo,
    setSaldo: (fn: (s: Saldo) => Saldo) => void,
    totalSaldo: number,
  ) => (
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
        <span className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Total
        </span>
        <span className="text-base font-bold text-foreground">
          {brl(totalSaldo)}
        </span>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <AppNav />
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Lotérica Brasil da Sorte
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            Fechamento de Caixa
          </h1>
        </header>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Data</span>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Funcionário</span>
              <input
                value={funcionario}
                onChange={(e) => setFuncionario(e.target.value)}
                placeholder="Nome"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">RELATÓRIO</span>
              <input
                inputMode="decimal"
                value={relatorio}
                onChange={(e) => setRelatorio(e.target.value)}
                placeholder="0,00"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          {renderSaldo("Saldo inicial", saldoInicial, setSaldoInicial, totalInicial)}
          {renderSaldo("Saldo final", saldoFinal, setSaldoFinal, totalFinal)}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2 shadow-sm">
          <span className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Diferença de saldo (final − inicial)
          </span>
          <span className={`text-lg font-bold ${classeDiferenca(diferencaSaldo)}`}>
            {brlSinal(diferencaSaldo)}
          </span>
        </div>

        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="divide-y divide-border">
            {VALOR_CAMPOS.map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between gap-4 px-4 py-1.5"
              >
                <span className="text-sm font-medium text-foreground">{c.label}</span>
                <input
                  inputMode="decimal"
                  value={valores[c.key]}
                  onChange={(e) =>
                    setValores((v) => ({ ...v, [c.key]: e.target.value }))
                  }
                  placeholder="0,00"
                  className="h-9 w-40 rounded-md border border-input bg-background px-3 text-right text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1 bg-secondary px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
                Total
              </span>
              <span className="text-base font-bold text-secondary-foreground">
                {brl(total)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
                Diferença
              </span>
              <span
                className={`text-base font-bold ${classeDiferenca(diferenca)}`}
              >
                {brlSinal(diferenca)}
              </span>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <h2 className="border-b border-border bg-secondary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-secondary-foreground">
            Controle de Bolões
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Bolão/Concurso</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Taxa</th>
                  <th className="px-3 py-2 text-right">Quant.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {boloes.map((b, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-1">
                      <input
                        value={b.concurso}
                        onChange={(e) => setBolao(idx, "concurso", e.target.value)}
                        placeholder="Bolão / concurso"
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
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-secondary/50 text-sm font-bold">
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setBoloes((bs) => [...bs, bolaoVazio()])}
                      className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      + Adicionar linha
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">{brl(totalValor)}</td>
                  <td className="px-3 py-2 text-right text-foreground">{brl(totalTaxa)}</td>
                  <td className="px-3 py-2 text-right text-foreground">{totalQuant}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        
        </section>



        <div className="flex justify-end gap-2">
          <button
            onClick={limpar}
            className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Limpar
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Imprimir
          </button>
          <button
            onClick={() => void compartilharPdf()}
            disabled={gerandoPdf || salvando}
            className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            {gerandoPdf ? "Gerando PDF..." : "Compartilhar PDF"}
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando || gerandoPdf}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {salvando ? "Salvando e enviando..." : "Salvar e enviar"}
          </button>
        </div>

        {(salvando || gerandoPdf) && (
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {salvando ? "Gerando o PDF e salvando no histórico..." : "Montando o PDF..."}
          </p>
        )}

        {aviso && (
          <p className="rounded-md border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
            {aviso}
          </p>
        )}

        {erro && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}


      </div>
    </main>
  );
}
