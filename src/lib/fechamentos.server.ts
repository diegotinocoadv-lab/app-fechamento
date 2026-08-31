/** Helpers server-only do histórico de fechamentos. */

/**
 * Descobre o caminho do PDF dentro do bucket "fechamentos".
 * Aceita o caminho salvo em `dados.pdfPath` ou extrai de uma URL assinada antiga.
 */
export function caminhoPdf(dados: unknown, pdfUrl: string | null): string | null {
  if (dados && typeof dados === "object") {
    const p = (dados as Record<string, unknown>)["pdfPath"];
    if (typeof p === "string" && p.length > 3) return p;
  }
  if (!pdfUrl) return null;
  const marca = "/fechamentos/";
  const i = pdfUrl.indexOf(marca);
  if (i < 0) return null;
  const resto = pdfUrl.slice(i + marca.length);
  const semQuery = resto.split("?")[0] ?? "";
  return semQuery ? decodeURIComponent(semQuery) : null;
}
