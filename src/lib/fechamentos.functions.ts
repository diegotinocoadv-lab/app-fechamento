import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { caminhoPdf } from "@/lib/fechamentos.server";
import { valorNumerico } from "@/lib/fechamento-campos";

const idSchema = z.object({ id: z.string().uuid("Identificador inválido.") });

/** Histórico visível para o usuário (RLS: próprios fechamentos, ou todos para admin). */
export const listarFechamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ limite: z.number().int().min(1).max(1000).optional().default(500) })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: fechs, error } = await context.supabase
      .from("fechamentos")
      .select(
        "id, data, funcionario, user_id, relatorio, total, diferenca, total_inicial, total_final, total_bolao_quant, created_at, pdf_url, dados",
      )
      .order("data", { ascending: false })
      .limit(data.limite);
    if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`);

    const ids = (fechs ?? []).map((f) => f.id);
    const caixasMap = new Map<
      string,
      { id: string; nome: string; situacao: string }
    >();
    if (ids.length > 0) {
      const { data: caixasRows, error: caixasError } = await context.supabase
        .from("caixas")
        .select("id, nome, situacao, fechamento_id")
        .in("fechamento_id", ids);
      if (caixasError) {
        throw new Error(`Não foi possível carregar os caixas: ${caixasError.message}`);
      }
      for (const c of caixasRows ?? []) {
        if (c.fechamento_id) {
          caixasMap.set(c.fechamento_id, {
            id: c.id,
            nome: c.nome,
            situacao: c.situacao,
          });
        }
      }
    }

    return {
      fechamentos: (fechs ?? []).map((f) => {
        const caixa = caixasMap.get(f.id);
        return {
          id: f.id,
          data: f.data,
          funcionario: f.funcionario,
          userId: (f.user_id ?? "") as string,
          caixaNumero: String((f.dados as { caixaNumero?: string } | null)?.caixaNumero ?? ""),
          relatorio: Number(f.relatorio),
          total: Number(f.total),
          diferenca: Number(f.diferenca),
          totalInicial: Number(f.total_inicial),
          totalFinal: Number(f.total_final),
          totalBolaoQuant: Number(f.total_bolao_quant ?? 0),
          temPdf: Boolean(f.pdf_url),
          criadoEm: f.created_at,
          caixaId: caixa?.id ?? null,
          caixaNome: caixa?.nome ?? null,
          caixaSituacao: caixa?.situacao ?? null,
        };
      }),
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

    const { data: caixa } = await context.supabase
      .from("caixas")
      .select("id, situacao")
      .eq("fechamento_id", row.id)
      .maybeSingle();

    return {
      id: row.id,
      data: row.data,
      funcionario: row.funcionario,
      caixaNumero: String((row.dados as { caixaNumero?: string } | null)?.caixaNumero ?? ""),
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
      caixaId: caixa?.id ?? null,
      caixaSituacao: caixa?.situacao ?? null,
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

const exclusaoSchema = z.object({
  id: z.string().uuid("Identificador inválido."),
  motivo: z.string().trim().min(3, "Descreva o motivo (mínimo 3 caracteres).").max(500),
});

/**
 * Exclui um fechamento (somente admin), junto com o caixa vinculado quando existir.
 * Caixa já conferido não pode ser excluído.
 */
export const removerFechamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => exclusaoSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return { ok: false as const, erro: "Apenas administradores podem excluir fechamentos." };
    }

    const { data: fech } = await context.supabase
      .from("fechamentos")
      .select("id, data, funcionario, user_id, dados, total_bolao_taxa")
      .eq("id", data.id)
      .maybeSingle();
    if (!fech) {
      return {
        ok: false as const,
        erro: "Este fechamento já não existe mais. A lista foi atualizada.",
      };
    }

    const { data: caixa } = await context.supabase
      .from("caixas")
      .select("id, nome, data, operador_id, operador_nome, situacao")
      .eq("fechamento_id", data.id)
      .maybeSingle();

    if (caixa?.situacao === "conferido") {
      return {
        ok: false as const,
        erro: "Caixa já conferido pelo administrador: não pode ser excluído.",
      };
    }

    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("nome, email")
      .eq("id", context.userId)
      .maybeSingle();

    const { error: logErro } = await context.supabase.from("caixas_exclusoes").insert({
      caixa_id: caixa?.id ?? null,
      nome: caixa?.nome ?? `Fechamento ${fech.data}`,
      data: caixa?.data ?? fech.data,
      operador_id: caixa?.operador_id ?? null,
      operador_nome: caixa?.operador_nome ?? fech.funcionario ?? null,
      situacao: caixa?.situacao ?? "sem caixa",
      motivo: data.motivo,
      excluido_por: context.userId,
      excluido_por_nome: perfil?.nome || perfil?.email || null,
    });
    if (logErro) {
      return { ok: false as const, erro: `Falha ao registrar a justificativa: ${logErro.message}` };
    }

    // Reverter todos os efeitos colaterais antes de excluir o fechamento
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Reverter lançamentos em contas_loterica (valorNumerico converte
      // "1.234,56" corretamente; Number() virava NaN e a reversão falhava
      // em silêncio, deixando os valores dobrados ao recriar o fechamento).
      const dados = fech.dados as { valores?: Record<string, string>; caixaNumero?: string } | null;
      const v = dados?.valores ?? {};
      const reversao = [
        { conta: "CONTA CARRO FORTE", valor: -(valorNumerico(v["deposito1"]) + valorNumerico(v["deposito2"])) },
        { conta: "CONTA CARTÃO", valor: -valorNumerico(v["cartao"]) },
        { conta: "CONTA MOEDAS", valor: -valorNumerico(v["moedas"]) },
        { conta: "CONTA 043", valor: -(valorNumerico(v["premioRasp"]) + valorNumerico(v["pix"])) },
        { conta: "CONTA RESGATE TELESENA", valor: -valorNumerico(v["premioTS"]) },
        { conta: "CONTA RETAGUARDA", valor: -valorNumerico(v["dinheiro"]) },
        { conta: "CONTA FIADO", valor: -valorNumerico(v["fiado"]) },
        // A comissão (taxa de bolões) também precisa ser desfeita — antes ela
        // só subia e acumulava "órfãs" a cada exclusão.
        { conta: "CONTA COMISSÃO", valor: -Number(fech.total_bolao_taxa ?? 0) },
      ] as const;
      for (const { conta, valor } of reversao) {
        if (!Number.isFinite(valor) || valor === 0) continue;
        const { data: atual } = await supabaseAdmin
          .from("contas_loterica")
          .select("valor")
          .eq("data", fech.data)
          .eq("conta", conta)
          .maybeSingle();
        const novo = Number(atual?.valor ?? 0) + valor;
        const { error: erroReversao } = await supabaseAdmin.from("contas_loterica").upsert(
          { data: fech.data, conta, valor: novo },
          { onConflict: "data,conta" },
        );
        if (erroReversao) {
          console.error(`[fechamentos] Falha ao reverter ${conta}: ${erroReversao.message}`);
        }
      }

      // Excluir lançamentos simples vinculados a esta data e operador —
      // junto com as baixas de estoque que eles geraram (convenção lanc:<id>).
      // Sem o estorno das vendas, o estoque seguia dado como vendido enquanto
      // o fechamento e os relatórios daquele dia desapareciam.
      if (fech.user_id) {
        const fechInfo = fech as { data: string; user_id: string };
        const { data: lancs } = await supabaseAdmin
          .from("lancamentos_simples")
          .select("id")
          .eq("data", fechInfo.data)
          .eq("operador_id", fechInfo.user_id);
        const refs = ((lancs ?? []) as Array<{ id: string }>).map((l) => `lanc:${l.id}`);
        if (refs.length > 0) {
          const { error: vendasErr } = await supabaseAdmin
            .from("estoque_boloes_vendas")
            .delete()
            .in("observacoes", refs);
          if (vendasErr) {
            console.error("[fechamentos] Erro ao estornar vendas do estoque:", vendasErr.message);
          }
        }
        const { error: lancErr } = await supabaseAdmin
          .from("lancamentos_simples")
          .delete()
          .eq("data", fech.data)
          .eq("operador_id", fech.user_id);
        if (lancErr) {
          console.error("[fechamentos] Erro ao excluir lancamentos_simples:", lancErr.message);
        }
      }

      // Excluir fiados criados por este operador nesta data (ON DELETE CASCADE Remove baixas_solicitacoes)
      if (fech.user_id) {
        const { data: fiadosDel, error: fiadosErr } = await supabaseAdmin
          .from("fiados")
          .delete()
          .eq("lancado_por", fech.user_id)
          .eq("data_inicio", fech.data)
          .select("id");
        if (fiadosErr) {
          console.error("[fechamentos] Erro ao excluir fiados:", fiadosErr.message);
        } else if (fiadosDel && fiadosDel.length > 0) {
          console.log(`[fechamentos] ${fiadosDel.length} fiado(s) excluído(s) junto com o fechamento.`);
        }
      }

      // Excluir creditos lançados por este operador nesta data
      if (fech.user_id) {
        const { error: creditosErr } = await supabaseAdmin
          .from("creditos")
          .delete()
          .eq("lancado_por", fech.user_id)
          .eq("data_credito", fech.data);
        if (creditosErr) {
          console.error("[fechamentos] Erro ao excluir creditos:", creditosErr.message);
        }
      }
    } catch (err) {
      console.error("[fechamentos] Erro ao reverter efeitos:", err);
    }

    const { error } = await context.supabase.from("fechamentos").delete().eq("id", data.id);
    if (error) {
      return { ok: false as const, erro: `Falha ao remover o fechamento: ${error.message}` };
    }

    if (caixa?.id) {
      const { error: erroCaixa } = await context.supabase
        .from("caixas")
        .delete()
        .eq("id", caixa.id);
      if (erroCaixa) {
        console.error("[fechamentos] Erro ao remover caixa:", erroCaixa.message);
      }
    }

    return { ok: true as const, erro: "" };
  });
