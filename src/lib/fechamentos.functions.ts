import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { caminhoPdf } from "@/lib/fechamentos.server";

const idSchema = z.object({ id: z.string().uuid("Identificador inválido.") });

/** Histórico visível para o usuário (RLS: próprios fechamentos, ou todos para admin). */
export const listarFechamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fechamentos")
      .select(
        "id, data, funcionario, relatorio, total, diferenca, total_inicial, total_final, created_at, pdf_url",
      )
      .order("data", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`);
    return {
      fechamentos: (data ?? []).map((f) => ({
        id: f.id,
        data: f.data,
        funcionario: f.funcionario,
        relatorio: Number(f.relatorio),
        total: Number(f.total),
        diferenca: Number(f.diferenca),
        totalInicial: Number(f.total_inicial),
        totalFinal: Number(f.total_final),
        temPdf: Boolean(f.pdf_url),
        criadoEm: f.created_at,
      })),
    };
  });

/** Detalhe de um fechamento. A RLS garante que só o dono (ou admin) enxerga a linha. */
export const obterFechamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("fechamentos")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível abrir o fechamento: ${error.message}`);
    if (!row) throw new Error("Fechamento não encontrado ou você não tem permissão para vê-lo.");
    return {
      id: row.id,
      data: row.data,
      funcionario: row.funcionario,
      relatorio: Number(row.relatorio),
      total: Number(row.total),
      diferenca: Number(row.diferenca),
      totalInicial: Number(row.total_inicial),
      totalFinal: Number(row.total_final),
      totalBolaoValor: Number(row.total_bolao_valor),
      totalBolaoTaxa: Number(row.total_bolao_taxa),
      totalBolaoQuant: Number(row.total_bolao_quant),
      dadosJson: JSON.stringify(row.dados ?? {}),
      temPdf: Boolean(row.pdf_url),
      criadoEm: row.created_at,
    };
  });

/**
 * Gera um link temporário (10 min) para baixar o PDF.
 * A permissão é checada com a sessão do usuário antes de assinar a URL.
 */
export const linkPdfFechamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("fechamentos")
      .select("id, dados, pdf_url")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível validar o acesso: ${error.message}`);
    if (!row) throw new Error("Fechamento não encontrado ou você não tem permissão para vê-lo.");

    const path = caminhoPdf(row.dados, row.pdf_url);
    if (!path) throw new Error("Este fechamento não tem PDF salvo.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const assinada = await supabaseAdmin.storage
      .from("fechamentos")
      .createSignedUrl(path, 60 * 10);
    if (assinada.error || !assinada.data?.signedUrl) {
      throw new Error(`Não foi possível gerar o link do PDF: ${assinada.error?.message ?? "erro desconhecido"}`);
    }
    return { url: assinada.data.signedUrl };
  });
