import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import { extrairFechamentoDaImagem } from "@/lib/importar.functions";
import {
  IMPORT_STORAGE_KEY,
  SALDO_ITENS,
  VALOR_CAMPOS,
  bolaoVazio,
  brl,
  num,
  saldoVazio,
  valoresVazios,
  type Bolao,
  type FechamentoImportado,
  type Saldo,
  type SaldoKey,
  type ValorKey,
} from "@/lib/fechamento-campos";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({
    meta: [
      { title: "Importar fechamento por foto | Brasil da Sorte" },
      {
        name: "description",
        content:
          "Envie a foto da planilha e o app monta o fechamento e o caixa em uma prévia interativa para revisar antes de salvar.",
      },
      { property: "og:title", content: "Importar fechamento por foto" },
      {
        property: "og:description",
        content: "A IA lê a planilha da foto e preenche o fechamento de caixa automaticamente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Importar,
});

function normalizar(bruto: Record<string, unknown>): FechamentoImportado {
  const texto = (v: unknown) => (v == null ? "" : String(v).trim());
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

  const valoresBrutos = obj(bruto["valores"]);
  const valores = valoresVazios();
  for (const c of VALOR_CAMPOS) valores[c.key as ValorKey] = texto(valoresBrutos[c.key]);

  const lerSaldo = (v: unknown): Saldo => {
    const src = obj(v);
    const s = saldoVazio();
    for (const i of SALDO_ITENS) s[i.key as SaldoKey] = texto(src[i.key]);
    return s;
  };

  const listaBoloes = Array.isArray(bruto["boloes"]) ? (bruto["boloes"] as unknown[]) : [];
  const boloes: Bolao[] = listaBoloes.slice(0, 40).map((b) => {
    const o = obj(b);
    return {
      concurso: texto(o["concurso"]),
      valor: texto(o["valor"]),
      taxa: texto(o["taxa"]),
      quant: texto(o["quant"]),
    };
  });

  return {
    data: texto(bruto["data"]),
    funcionario: texto(bruto["funcionario"]),
    relatorio: texto(bruto["relatorio"]),
    valores,
    saldoInicial: lerSaldo(bruto["saldoInicial"]),
    saldoFinal: lerSaldo(bruto["saldoFinal"]),
    boloes: boloes.length ? boloes : [bolaoVazio()],
  };
}

function Importar() {
  const navigate = useNavigate();
  const extrair = useServerFn(extrairFechamentoDaImagem);
  const [preview, setPreview] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dados, setDados] = useState<FechamentoImportado | null>(null);

  const enviarArquivo = async (file: File) => {
    setErro(null);
    setAviso(null);
    setDados(null);
    setPreview(URL.createObjectURL(file));

    if (!file.type.startsWith("image/")) {
      setErro(
        `O arquivo "${file.name}" não é uma imagem (${file.type || "tipo desconhecido"}). Envie uma foto ou print em JPG, PNG ou WEBP.`,
      );
      return;
    }
    if (file.size > 6_000_000) {
      setErro(
        `A imagem tem ${(file.size / 1_000_000).toFixed(1)} MB e o limite é 6 MB. Reduza a resolução ou tire a foto mais próxima da planilha.`,
      );
      return;
    }

    setCarregando(true);
    setEtapa("Preparando a imagem...");
    try {
      const buffer = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 8192) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      setEtapa("Lendo a planilha com a IA (pode levar alguns segundos)...");
      const { json } = await extrair({
        data: { mimeType: file.type || "image/jpeg", imageBase64: btoa(bin) },
      });
      setEtapa("Montando a prévia do fechamento...");
      const bruto = JSON.parse(json) as Record<string, unknown>;
      const normalizado = normalizar(bruto);
      const vazio =
        VALOR_CAMPOS.every((c) => !normalizado.valores[c.key]) &&
        SALDO_ITENS.every((i) => !normalizado.saldoInicial[i.key] && !normalizado.saldoFinal[i.key]) &&
        normalizado.boloes.length === 0;
      setAviso(
        vazio
          ? "Nenhum valor foi reconhecido na imagem (parece uma planilha em branco). Confira a nitidez e o enquadramento, ou preencha os campos abaixo manualmente."
          : null,
      );
      setDados(normalizado);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErro(
        msg.includes("JSON")
          ? "A leitura da imagem voltou em um formato inesperado. Tente novamente ou envie outra foto."
          : `Não foi possível ler a imagem: ${msg}`,
      );
    } finally {
      setCarregando(false);
      setEtapa("");
    }
  };

  const inputCls =
    "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

  const total = dados ? VALOR_CAMPOS.reduce((a, c) => a + num(dados.valores[c.key]), 0) : 0;
  const totalInicial = dados
    ? SALDO_ITENS.reduce((a, i) => a + num(dados.saldoInicial[i.key]), 0)
    : 0;
  const totalFinal = dados ? SALDO_ITENS.reduce((a, i) => a + num(dados.saldoFinal[i.key]), 0) : 0;

  const aplicar = () => {
    if (!dados) return;
    sessionStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(dados));
    navigate({ to: "/fechamento" });
  };

  const editarSaldo = (qual: "saldoInicial" | "saldoFinal", key: SaldoKey, v: string) =>
    setDados((d) => (d ? { ...d, [qual]: { ...d[qual], [key]: v } } : d));

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <AppNav />

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Importar fechamento por foto
          </h1>
          <p className="text-sm text-muted-foreground">
            Envie a foto da planilha. A leitura é automática e você revisa tudo antes de aplicar.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <input
            type="file"
            accept="image/*"
            disabled={carregando}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void enviarArquivo(f);
            }}
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground disabled:opacity-60"
          />
          {preview && (
            <img
              src={preview}
              alt="Prévia da planilha de fechamento enviada"
              className="mt-3 max-h-64 w-full rounded-md border border-border object-contain"
            />
          )}
          {carregando && (
            <div className="mt-3 flex items-center gap-2" role="status" aria-live="polite">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <p className="text-sm text-muted-foreground">{etapa || "Lendo a imagem, aguarde..."}</p>
            </div>
          )}
          {carregando && (
            <div className="mt-3 grid gap-2">
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          )}
          {aviso && !erro && (
            <p className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {aviso}
            </p>
          )}
          {erro && (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro}
            </p>
          )}
        </section>

        {dados && (
          <>
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Prévia — fechamento
              </h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Data
                  <input
                    type="date"
                    value={dados.data}
                    onChange={(e) => setDados({ ...dados, data: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Funcionário
                  <input
                    value={dados.funcionario}
                    onChange={(e) => setDados({ ...dados, funcionario: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Relatório
                  <input
                    value={dados.relatorio}
                    onChange={(e) => setDados({ ...dados, relatorio: e.target.value })}
                    className={inputCls}
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {VALOR_CAMPOS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">{c.label}</span>
                    <input
                      value={dados.valores[c.key]}
                      onChange={(e) =>
                        setDados({
                          ...dados,
                          valores: { ...dados.valores, [c.key]: e.target.value },
                        })
                      }
                      className={inputCls}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">
                Total: {brl(total)} · Diferença: {brl(total - num(dados.relatorio))}
              </p>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              {(["saldoInicial", "saldoFinal"] as const).map((qual) => (
                <div key={qual} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {qual === "saldoInicial" ? "Saldo inicial" : "Saldo final"}
                  </h2>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {SALDO_ITENS.map((i) => (
                      <label key={i.key} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 text-xs text-muted-foreground">
                          {i.label}
                        </span>
                        <input
                          value={dados[qual][i.key]}
                          onChange={(e) => editarSaldo(qual, i.key, e.target.value)}
                          className={inputCls}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    Total: {brl(qual === "saldoInicial" ? totalInicial : totalFinal)}
                  </p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Prévia — bolões
              </h2>
              <div className="mt-2 flex flex-col gap-1.5">
                {dados.boloes.map((b, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-1.5">
                    {(["concurso", "valor", "taxa", "quant"] as const).map((campo) => (
                      <input
                        key={campo}
                        placeholder={campo}
                        value={b[campo]}
                        onChange={(e) =>
                          setDados({
                            ...dados,
                            boloes: dados.boloes.map((x, i) =>
                              i === idx ? { ...x, [campo]: e.target.value } : x,
                            ),
                          })
                        }
                        className={inputCls}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </section>

            <button
              onClick={aplicar}
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Aplicar no fechamento
            </button>
          </>
        )}
      </div>
    </main>
  );
}
