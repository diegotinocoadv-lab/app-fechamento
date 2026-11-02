import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { linhasManuaisDoFechamento, valorNumerico } from "@/lib/fechamento-campos";
import { baixarEstoqueOperador } from "@/lib/lancamentos-simples.functions";

const schema = z.object({
  id: z.string().uuid().optional(),
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
 * Sincroniza as linhas manuais da tabela "Controle de Bolões" do fechamento
 * com o estoque: cada linha vira um lançamento BOLAO (campo bolao:fech:<id>,
 * para idempotência) e dá baixa automática no estoque — o mesmo que o /lancar
 * faz. Linhas marcadas com `lanc` (auto-preenchidas do /lancar) são ignoradas.
 * A cada re-salvar, os lançamentos antigos do fechamento são apagados (com
 * estorno das vendas) e recriados a partir das linhas atuais.
 */
async function sincronizarBoloesFechamento(opts: {
  supabaseAdmin: any;
  fechamentoId: string;
  data: string;
  operadorId: string;
  operadorNome: string | null;
  dados: unknown;
}): Promise<{ sincronizados: number; cotas: number; avisos: string[] }> {
  const campoTag = `bolao:fech:${opts.fechamentoId}`;

  const { data: antigos } = await opts.supabaseAdmin
    .from("lancamentos_simples")
    .select("id")
    .eq("campo", campoTag);
  const idsAntigos = ((antigos ?? []) as Array<{ id: string }>).map((a) => String(a.id));
  if (idsAntigos.length > 0) {
    const refs = idsAntigos.map((id) => `lanc:${id}`);
    const { data: vendasAntigas } = await opts.supabaseAdmin
      .from("estoque_boloes_vendas")
      .select("id")
      .in("observacoes", refs)
      .limit(5000);
    const idsVendas = ((vendasAntigas ?? []) as Array<{ id: string }>).map((v) => String(v.id));
    if (idsVendas.length > 0) {
      await opts.supabaseAdmin.from("estoque_boloes_vendas").delete().in("id", idsVendas);
    }
    await opts.supabaseAdmin.from("lancamentos_simples").delete().in("id", idsAntigos);
  }

  const avisos: string[] = [];
  let sincronizados = 0;
  let cotas = 0;
  for (const linha of linhasManuaisDoFechamento(opts.dados)) {
    const { data: criado, error } = await opts.supabaseAdmin
      .from("lancamentos_simples")
      .insert({
        tipo: "BOLAO",
        valor: linha.valor,
        descricao: linha.numero || linha.rotulo,
        campo: campoTag,
        quantidade: linha.quantidade,
        taxa: linha.taxa,
        data: opts.data,
        operador_id: opts.operadorId,
        operador_nome: opts.operadorNome,
      })
      .select("id")
      .single();
    if (error || !criado) {
      avisos.push(
        `Falha ao lançar "${linha.rotulo}": ${error?.message ?? "erro desconhecido"}`,
      );
      continue;
    }
    const lancamentoId = String((criado as { id: string }).id);
    const baixa = await baixarEstoqueOperador({
      modeloId: null,
      nome: linha.rotulo,
      concurso: linha.numero,
      quantidade: linha.quantidade,
      data: opts.data,
      operadorId: opts.operadorId,
      operadorNome: opts.operadorNome,
      lancamentoId,
      valor: linha.valor,
      taxa: linha.taxa,
    });
    if (baixa.aviso && !baixa.aviso.startsWith("Baixa automática")) {
      avisos.push(`"${linha.rotulo}": ${baixa.aviso}`);
      try {
        await opts.supabaseAdmin.from("activity_logs").insert({
          user_id: opts.operadorId,
          user_nome: opts.operadorNome,
          acao: "baixa_estoque_falhou",
          detalhes: {
            origem: "fechamento",
            fechamentoId: opts.fechamentoId,
            nome: linha.rotulo,
            concurso: linha.numero,
            quantidade: linha.quantidade,
            aviso: baixa.aviso,
          },
        });
      } catch {
        // log é best-effort; a baixa em si já falhou e o aviso vai no toast
      }
    }
    sincronizados += 1;
    cotas += linha.quantidade;
  }
  return { sincronizados, cotas, avisos };
}

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

    // Ao corrigir um fechamento existente, guarda os valores antigos para
    // desfazer os lançamentos nas contas antes de aplicar os novos, e usa o
    // dono original (user_id) para depósitos/vínculo de caixa — não o admin logado.
    let anterior: { dados: unknown; total_bolao_taxa: number } | null = null;
    let ownerUserId = context.userId;
    if (data.id) {
      // Correção de fechamento já salvo: o dono (operador que salvou) ou admin.
      const { data: row, error } = await context.supabase
        .from("fechamentos")
        .select("id, dados, total_bolao_taxa, user_id")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(`Falha ao abrir o fechamento: ${error.message}`);
      if (!row) throw new Error("Fechamento não encontrado ou sem permissão para editar.");
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin && row.user_id !== context.userId) {
        throw new Error(
          "Somente administradores podem corrigir fechamentos de outros funcionários.",
        );
      }
      anterior = { dados: row.dados, total_bolao_taxa: Number(row.total_bolao_taxa) };
      if (row.user_id) ownerUserId = row.user_id as string;
    }

    const campos = {
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
    };

    const insert = data.id
      ? await supabaseAdmin
          .from("fechamentos")
          .update(campos)
          .eq("id", data.id)
          .select("id")
          .single()
      : await supabaseAdmin
          .from("fechamentos")
          .insert({ ...campos, user_id: context.userId })
          .select("id")
          .single();
    if (insert.error) throw new Error(`Falha ao gravar o fechamento: ${insert.error.message}`);

    // Bolões digitados na tabela do fechamento: baixa automática no estoque.
    let boloesSincronizados = 0;
    let boloesCotas = 0;
    let boloesAvisos: string[] = [];
    try {
      const sinc = await sincronizarBoloesFechamento({
        supabaseAdmin,
        fechamentoId: String((insert.data as { id: string }).id),
        data: data.data,
        operadorId: ownerUserId,
        operadorNome: (data.funcionario || "").trim() || null,
        dados: data.dados,
      });
      boloesSincronizados = sinc.sincronizados;
      boloesCotas = sinc.cotas;
      boloesAvisos = sinc.avisos;
    } catch (err) {
      boloesAvisos = [
        `Falha ao sincronizar bolões com o estoque: ${err instanceof Error ? err.message : String(err)}`,
      ];
    }

    // Campos do fechamento lançados automaticamente nas contas da lotérica do dia:
    // Depósito 1 + Depósito 2 → CONTA CARRO FORTE; Cartão → CONTA CARTÃO;
    // Moedas → CONTA MOEDAS; Prêmio Rasp + Pix → CONTA 043; Prêmio TS → CONTA RESGATE TELESENA;
    // Dinheiro → CONTA RETAGUARDA; Fiado → CONTA FIADO; Taxa de bolões → CONTA COMISSÃO.
    // Depósitos lançados em "Lançar valores" já entram direto no carro forte;
    // aqui entra apenas o excedente digitado manualmente no fechamento.
    const { data: lancDep } = await supabaseAdmin
      .from("lancamentos_simples")
      .select("valor")
      .eq("data", data.data)
      .eq("operador_id", ownerUserId)
      .in("campo", ["deposito1", "deposito2"]);
    const depositosLancados = (lancDep ?? []).reduce(
      (s, l) => s + Number((l as { valor: number }).valor ?? 0),
      0,
    );

    const mapear = (dados: unknown, taxaBolao: number) => {
      const valores = (dados as { valores?: Record<string, unknown> } | null)?.valores;
      return [
        {
          conta: "CONTA CARRO FORTE",
          valor:
            valorNumerico(valores?.["deposito1"]) +
            valorNumerico(valores?.["deposito2"]) -
            depositosLancados,
        },
        { conta: "CONTA CARTÃO", valor: valorNumerico(valores?.["cartao"]) },
        { conta: "CONTA MOEDAS", valor: valorNumerico(valores?.["moedas"]) },
        {
          conta: "CONTA 043",
          valor: valorNumerico(valores?.["premioRasp"]) + valorNumerico(valores?.["pix"]),
        },
        { conta: "CONTA RESGATE TELESENA", valor: valorNumerico(valores?.["premioTS"]) },
        { conta: "CONTA RETAGUARDA", valor: valorNumerico(valores?.["dinheiro"]) },
        { conta: "CONTA FIADO", valor: valorNumerico(valores?.["fiado"]) },
        { conta: "CONTA COMISSÃO", valor: taxaBolao },
      ] as const;
    };

    const novos = mapear(data.dados, data.totalBolaoTaxa);
    const antigos = anterior ? mapear(anterior.dados, anterior.total_bolao_taxa) : null;
    // Na correção, aplica apenas a diferença entre o valor novo e o antigo.
    const lancamentos = novos.map((n, i) => ({
      conta: n.conta,
      valor: n.valor - (antigos?.[i]?.valor ?? 0),
    }));

    for (const { conta, valor } of lancamentos) {
      if (valor === 0) continue;

      const { data: atual } = await supabaseAdmin
        .from("contas_loterica")
        .select("valor")
        .eq("data", data.data)
        .eq("conta", conta)
        .maybeSingle();
      const novo = Number(atual?.valor ?? 0) + valor;
      const { error: erroConta } = await supabaseAdmin.from("contas_loterica").upsert(
        {
          data: data.data,
          conta,
          valor: novo,
          criado_por: context.userId,
        },
        { onConflict: "data,conta" },
      );
      if (erroConta) {
        throw new Error(`Falha ao lançar na ${conta}: ${erroConta.message}`);
      }
    }

    // Vincula o fechamento a um caixa: reaproveita o caixa aberto do operador
    // (mesma data e mesmo nº de caixa) ou cria um já fechado, para que o
    // Histórico, a tela Caixas e Meu caixa fiquem sempre consistentes.
    try {
      const caixaNumero = String(
        (data.dados as { caixaNumero?: unknown }).caixaNumero ?? "",
      ).trim();
      const { data: perfil } = await supabaseAdmin
        .from("profiles")
        .select("nome, email")
        .eq("id", ownerUserId)
        .maybeSingle();
      const operadorNome =
        (data.funcionario || perfil?.nome || perfil?.email || "").trim() || "Operador";
      const nomeCaixa = caixaNumero || `Caixa ${operadorNome}`;

      const { data: existentes } = await supabaseAdmin
        .from("caixas")
        .select("id, nome, situacao")
        .eq("operador_id", ownerUserId)
        .eq("data", data.data);

      const alvo =
        existentes?.find((c) => c.nome === nomeCaixa) ??
        (caixaNumero ? undefined : existentes?.[0]);

      if (alvo) {
        if (alvo.situacao !== "conferido") {
          await supabaseAdmin
            .from("caixas")
            .update({ situacao: "fechado", fechamento_id: insert.data.id })
            .eq("id", alvo.id);
        }
      } else {
        await supabaseAdmin.from("caixas").insert({
          nome: nomeCaixa,
          operador_id: ownerUserId,
          operador_nome: operadorNome,
          data: data.data,
          situacao: "fechado",
          fechamento_id: insert.data.id,
          criado_por: context.userId,
        });
      }
    } catch (err) {
      console.error("[fechamento] Erro ao vincular caixa:", err);
    }

    // Enviar e-mails para administradores
    let emailEnviado = false;
    let emailAviso = "";
    try {
      const { enviarEmail, emailHtmlFechamento } = await import("@/lib/email.server");
      const { data: admins } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        const ids = admins.map((a) => a.user_id);
        const { data: perfis } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .in("id", ids);

        const emails = (perfis ?? []).map((p) => p.email).filter(Boolean) as string[];
        if (emails.length > 0) {
          const resultado = await enviarEmail({
            para: emails,
            assunto: `Fechamento ${data.data.split("-").reverse().join("/")} - ${data.funcionario || "Caixa"}`,
            html: emailHtmlFechamento({
              data: data.data,
              funcionario: data.funcionario || "",
              total: data.total,
              diferenca: data.diferenca,
              relatorio: data.relatorio,
              pdfUrl,
            }),
          });
          emailEnviado = resultado.ok && !resultado.ignorado;
          if (resultado.ignorado) {
            emailAviso = "E-mail não configurado (RESEND_API_KEY ausente).";
          } else if (!resultado.ok) {
            emailAviso = `Falha no e-mail: ${resultado.erro}`;
          }
        }
      }
    } catch (err) {
      emailAviso = `Erro ao enviar e-mail: ${err instanceof Error ? err.message : String(err)}`;
    }

    return {
      id: insert.data.id,
      pdfUrl,
      emailEnviado,
      emailAviso: emailAviso || (emailEnviado ? "E-mail enviado com sucesso!" : ""),
      boloesSincronizados,
      boloesCotas,
      boloesAvisos,
    };
  });

