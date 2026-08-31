import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  data: z.string().min(8),
  funcionario: z.string().max(120).optional().default(""),
  relatorio: z.number(),
  total: z.number(),
  diferenca: z.number(),
  totalInicial: z.number(),
  totalFinal: z.number(),
  totalBolaoValor: z.number(),
  totalBolaoTaxa: z.number(),
  totalBolaoQuant: z.number(),
  dados: z.record(z.string(), z.unknown()),
  pdfBase64: z.string().min(10).max(8_000_000),
});

/**
 * Salva o fechamento: guarda o PDF no armazenamento, grava o histórico
 * e envia um e-mail com o resumo e o link do PDF.
 */
export const salvarFechamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
    const path = `${data.data}/fechamento-${data.data}-${crypto.randomUUID()}.pdf`;

    const upload = await supabaseAdmin.storage
      .from("fechamentos")
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upload.error) throw new Error(`Falha ao salvar o PDF: ${upload.error.message}`);

    const signed = await supabaseAdmin.storage
      .from("fechamentos")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    const pdfUrl = signed.data?.signedUrl ?? null;

    const insert = await supabaseAdmin
      .from("fechamentos")
      .insert({
        data: data.data,
        funcionario: data.funcionario || null,
        relatorio: data.relatorio,
        total: data.total,
        diferenca: data.diferenca,
        total_inicial: data.totalInicial,
        total_final: data.totalFinal,
        total_bolao_valor: data.totalBolaoValor,
        total_bolao_taxa: data.totalBolaoTaxa,
        total_bolao_quant: data.totalBolaoQuant,
        dados: { ...data.dados, pdfPath: path } as never,
        pdf_url: pdfUrl,
        user_id: context.userId,
      })
      .select("id")
      .single();
    if (insert.error) throw new Error(`Falha ao gravar o fechamento: ${insert.error.message}`);

    return {
      id: insert.data.id,
      pdfUrl,
      emailEnviado: false,
      emailAviso:
        "Fechamento salvo. O envio automático por e-mail será ativado após a configuração do domínio de e-mail.",
    };
  });

