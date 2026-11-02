import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { achaModalidade, getModalidade, nomeCanonicoBolao, normBolao, proximaDataSorteioISO, validarDataSorteio } from "@/lib/loterias-sorteio";
import { proximoConcursoOficial } from "@/lib/caixa-loterias.functions";
import {
  distribuirVendaEntreLotes,
  disponivelEntreLotes,
  type LoteDistribuicao,
} from "@/lib/estoque-distribuicao";
import { ehAdmin } from "@/lib/auth-guard";

/** Registra no histórico (activity_logs) uma ação administrativa no estoque. */
async function registrarLog(
  context: { supabase: any; userId: string },
  acao: string,
  detalhes: Record<string, unknown>,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("nome, email")
      .eq("id", context.userId)
      .maybeSingle();
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      user_nome: perfil?.nome || perfil?.email || null,
      acao,
      detalhes: detalhes as never,
    });
  } catch (e) {
    console.error("[estoque] Falha ao registrar log:", e);
  }
}

const novoEstoque = z.object({
  modeloId: z.string().uuid().optional().nullable(),
  nome: z.string().max(120).optional().default(""),
  concurso: z.string().max(120).optional().default(""),
  cotas: z.number().int().min(1).max(100000),
  quantidade: z.number().int().min(1).max(100).default(1),
  valorCota: z.number().min(0),
  taxa: z.number().min(0),
  data: z.string().min(8).max(10),
  modalidade: z.string().max(40).optional().default(""),
  observacoes: z.string().max(300).optional().default(""),
  salvarModelo: z.boolean().optional().default(true),
});

const alvo = z.object({ id: z.string().uuid() });

const novaVenda = z.object({
  estoqueId: z.string().uuid(),
  quantidade: z.number().int().min(1).max(100000),
  canal: z.enum(["LOJA", "MARKETPLACE"]),
  data: z.string().min(8).max(10),
  observacoes: z.string().max(300).optional().default(""),
});

/** Estoques de bolões com cotas vendidas por canal e saldo disponível. */
export const listarEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ situacao: z.enum(["todos", "ativo", "encerrado", "finalizado"]).optional().default("ativo") })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const admin = await ehAdmin(context);

    let q = context.supabase
      .from("estoque_boloes")
      .select("id, nome, concurso, cotas, valor_cota, taxa, data, situacao, observacoes, created_at")
      .order("nome", { ascending: true })
      .order("valor_cota", { ascending: true })
      .limit(500);
    const filtro = admin ? data.situacao : "ativo";
    if (filtro !== "todos") q = q.eq("situacao", filtro);

    const { data: linhas, error } = await q;
    if (error) throw new Error(`Não foi possível carregar o estoque: ${error.message}`);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vendas } = await supabaseAdmin
      .from("estoque_boloes_vendas")
      .select("estoque_id, quantidade, canal");

    const porEstoque = new Map<string, { loja: number; mkp: number }>();
    for (const v of vendas ?? []) {
      const atual = porEstoque.get(v.estoque_id) ?? { loja: 0, mkp: 0 };
      if (v.canal === "MARKETPLACE") atual.mkp += Number(v.quantidade ?? 0);
      else atual.loja += Number(v.quantidade ?? 0);
      porEstoque.set(v.estoque_id, atual);
    }

    return {
      admin,
      estoques: (linhas ?? []).map((e: any) => {
        const vend = porEstoque.get(e.id) ?? { loja: 0, mkp: 0 };
        const vendidas = vend.loja + vend.mkp;
        const cotas = Number(e.cotas ?? 0);
        return {
          id: e.id as string,
          nome: e.nome as string,
          concurso: (e.concurso ?? "") as string,
          cotas,
          valorCota: Number(e.valor_cota ?? 0),
          taxa: Number(e.taxa ?? 0),
          data: (e.data ?? "") as string,
          situacao: e.situacao as string,
          observacoes: (e.observacoes ?? "") as string,
          vendidasLoja: vend.loja,
          vendidasMkp: vend.mkp,
          vendidas,
          disponiveis: Math.max(0, cotas - vendidas),
          created_at: (e.created_at ?? "") as string,
        };
      }),
    };
  });

/**
 * Cria um estoque a partir de um modelo existente ou de um modelo novo
 * informado no cadastro — nesse caso o modelo também é salvo na lista de modelos.
 */
export const criarEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => novoEstoque.parse(input))
  .handler(async ({ data, context }) => {
    if (!(await ehAdmin(context))) {
      return { ok: false as const, erro: "Apenas administradores podem criar estoque." };
    }

    if (data.modalidade) {
      const erroData = validarDataSorteio(getModalidade(data.modalidade), data.data);
      if (erroData) return { ok: false as const, erro: erroData };
    }

    const totalCotas = data.cotas * data.quantidade;
    if (totalCotas > 100000) {
      return { ok: false as const, erro: "Total de cotas acima do permitido (máx. 100.000)." };
    }

    // Nome sempre no padrão canônico ("MEGA SENA" → "Mega-Sena"), para não
    // criar modelos duplicados por diferença de caixa/acentos/hífens.
    let nome = nomeCanonicoBolao(data.nome);
    let valorCota = data.valorCota;
    let taxa = data.taxa;
    let modeloId = data.modeloId || null;
    let modeloCriado = false;

    if (modeloId) {
      const { data: modelo } = await context.supabase
        .from("boloes_estoque")
        .select("id, concurso, valor_cota, taxa")
        .eq("id", modeloId)
        .maybeSingle();
      if (!modelo) return { ok: false as const, erro: "Modelo não encontrado." };
      nome = modelo.concurso as string;
      if (!data.valorCota) valorCota = Number(modelo.valor_cota ?? 0);
      if (!data.taxa) taxa = Number(modelo.taxa ?? 0);
    } else {
      if (!nome) return { ok: false as const, erro: "Informe o nome do bolão." };
      if (data.salvarModelo) {
        // Mesmo nome (ignorando caixa/acentos/hífens) = reaproveita o modelo.
        const { data: existentes } = await context.supabase
          .from("boloes_estoque")
          .select("id, concurso")
          .limit(1000);
        const igual = (existentes ?? []).find(
          (m: { concurso: string | null }) => normBolao(m.concurso) === normBolao(nome),
        );
        if (igual) {
          modeloId = igual.id as string;
        } else {
          const { data: criado, error: erroModelo } = await context.supabase
            .from("boloes_estoque")
            .insert({
              concurso: nome,
              valor_cota: valorCota,
              taxa,
              total_cotas: 0,
              criado_por: context.userId,
            })
            .select("id")
            .single();
          if (erroModelo) {
            return { ok: false as const, erro: `Falha ao criar o modelo: ${erroModelo.message}` };
          }
          modeloId = criado.id as string;
          modeloCriado = true;
        }
      }
    }

    // Uma linha só com o total de cotas (antes: N linhas idênticas por lote).
    const registro = {
      modelo_id: modeloId,
      nome,
      concurso: data.concurso.trim(),
      cotas: totalCotas,
      valor_cota: valorCota,
      taxa,
      data: data.data,
      observacoes: data.observacoes || null,
      criado_por: context.userId,
    };

    const { data: criados, error } = await context.supabase
      .from("estoque_boloes")
      .insert([registro])
      .select("id");
    if (error) return { ok: false as const, erro: `Falha ao criar o estoque: ${error.message}` };
    await registrarLog(context, "estoque_criado", {
      nome,
      concurso: registro.concurso,
      cotas: totalCotas,
      quantidadeLotes: data.quantidade,
      valorCota,
      taxa,
      data: data.data,
    });
    return {
      ok: true as const,
      erro: "",
      ids: (criados ?? []).map((c: any) => c.id as string),
      cotas: totalCotas,
      modeloCriado,
    };
  });

/** Ativa ou encerra estoques em lote (somente admin). */
export const definirSituacaoEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        situacao: z.enum(["ativo", "encerrado"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await ehAdmin(context))) {
      return { ok: false as const, erro: "Apenas administradores podem alterar o estoque." };
    }
    const { data: atuais, error: erroLeitura } = await context.supabase
      .from("estoque_boloes")
      .select("id, situacao")
      .in("id", data.ids);
    if (erroLeitura) {
      return { ok: false as const, erro: `Falha ao ler estoque: ${erroLeitura.message}` };
    }
    if ((atuais ?? []).some((l) => l.situacao === "finalizado")) {
      return { ok: false as const, erro: "Bolão finalizado não muda mais de situação." };
    }
    const { error } = await context.supabase
      .from("estoque_boloes")
      .update({ situacao: data.situacao })
      .in("id", data.ids);
    if (error) return { ok: false as const, erro: `Falha ao atualizar: ${error.message}` };
    await registrarLog(context, "estoque_situacao", { ids: data.ids, situacao: data.situacao });
    return { ok: true as const, erro: "" };
  });

/**
 * Finaliza estoques encerrados (situação vira "finalizado"): o bolão passa a
 * travar de vez — não aceita mais vendas nem reativação. Feito depois que as
 * vendas atrasadas (ex.: marketplace) já foram incluídas. Somente admin.
 */
export const finalizarEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await ehAdmin(context))) {
      return { ok: false as const, erro: "Apenas administradores podem finalizar o estoque." };
    }
    const { data: linhas, error } = await context.supabase
      .from("estoque_boloes")
      .select("id, nome, situacao")
      .in("id", data.ids);
    if (error) return { ok: false as const, erro: `Falha ao ler estoque: ${error.message}` };
    const ativos = (linhas ?? []).filter((l) => l.situacao === "ativo");
    if (ativos.length > 0) {
      return {
        ok: false as const,
        erro: `Encerre antes de finalizar (${ativos.map((l) => l.nome).join(", ")} ainda está(ão) ativo(s)).`,
      };
    }
    const alvos = (linhas ?? []).filter((l) => l.situacao === "encerrado").map((l) => String(l.id));
    if (alvos.length === 0) return { ok: true as const, erro: "", finalizados: 0 };
    const { error: erroUp } = await context.supabase
      .from("estoque_boloes")
      .update({ situacao: "finalizado" })
      .in("id", alvos);
    if (erroUp) return { ok: false as const, erro: `Falha ao finalizar: ${erroUp.message}` };
    await registrarLog(context, "estoque_finalizado", { ids: alvos });
    return { ok: true as const, erro: "", finalizados: alvos.length };
  });

/**
 * Rola os lotes para a rodada atual: atualiza concurso + data do sorteio para o
 * próximo concurso oficial da Caixa (somente admin). Por padrão atua em todos
 * os lotes ATIVOS vencidos (data do sorteio anterior à de hoje); com `ids`,
 * atualiza apenas os lotes escolhidos.
 */
const alvoRolar = z.object({
  ids: z.array(z.string().uuid()).max(500).optional().default([]),
});

export const rolarEstoqueProximaRodada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvoRolar.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!(await ehAdmin(context))) {
      return { ok: false as const, erro: "Apenas administradores podem atualizar o estoque." };
    }

    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    );

    let q = context.supabase
      .from("estoque_boloes")
      .select("id, nome, concurso, data")
      .eq("situacao", "ativo")
      .order("created_at", { ascending: true })
      .limit(500);
    if (data.ids.length > 0) q = q.in("id", data.ids);
    const { data: linhas, error } = await q;
    if (error) return { ok: false as const, erro: `Falha ao ler estoque: ${error.message}` };

    // Sem ids: só lotes vencidos (sorteio já passou). Com ids: os escolhidos.
    const alvo = (linhas ?? []).filter(
      (l) => data.ids.length > 0 || String(l.data ?? "") < hoje,
    );
    const detalhes: string[] = [];
    if (alvo.length === 0) {
      return {
        ok: true as const,
        erro: "",
        atualizados: 0,
        pulados: 0,
        detalhes: ["Nenhum lote vencido — estoque já está na rodada atual."],
      };
    }

    const porModalidade = new Map<string, { ok: true; concurso: number; data: string } | { ok: false; erro: string }>();
    let atualizados = 0;
    let pulados = 0;

    for (const l of alvo) {
      const nome = String(l.nome ?? "");
      const modalidade = achaModalidade(nome);
      if (!modalidade) {
        pulados += 1;
        detalhes.push(`${nome}: modalidade não reconhecida — mantido o concurso ${l.concurso}.`);
        continue;
      }
      let prox = porModalidade.get(modalidade.id);
      if (!prox) {
        prox = await proximoConcursoOficial(modalidade.id);
        porModalidade.set(modalidade.id, prox);
      }
      if (!prox.ok) {
        pulados += 1;
        detalhes.push(`${nome}: ${prox.erro} — mantido o concurso ${l.concurso}.`);
        continue;
      }
      const novoConcurso = String(prox.concurso);
      const novaData =
        /^\d{4}-\d{2}-\d{2}$/.test(prox.data) ? prox.data : (proximaDataSorteioISO(modalidade, hoje) ?? String(l.data ?? ""));
      if (novoConcurso === String(l.concurso ?? "") && novaData === String(l.data ?? "")) {
        pulados += 1;
        detalhes.push(`${nome} ${l.concurso}: já está no concurso vigente ${novoConcurso}.`);
        continue;
      }
      const { error: erroUp } = await context.supabase
        .from("estoque_boloes")
        .update({ concurso: novoConcurso, data: novaData })
        .eq("id", l.id);
      if (erroUp) {
        pulados += 1;
        detalhes.push(`${nome} ${l.concurso}: falha ao atualizar — ${erroUp.message}`);
        continue;
      }
      atualizados += 1;
      detalhes.push(`${nome}: concurso ${l.concurso} → ${novoConcurso} (sorteio ${novaData}).`);
    }

    if (atualizados > 0) {
      await registrarLog(context, "estoque_rolado", { atualizados, pulados, detalhes });
    }
    return { ok: true as const, erro: "", atualizados, pulados, detalhes };
  });

/**
 * Ajusta o TOTAL de cotas de um grupo de lotes (somente admin). Distribui de
 * forma que cada lote cubra o que já foi vendido nele e o excedente fica no
 * primeiro lote.
 */
export const ajustarCotasEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(500), total: z.number().int().min(0).max(100000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await ehAdmin(context))) {
      return { ok: false as const, erro: "Apenas administradores podem alterar o estoque." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: estoques, error: erroEst }, { data: vendas, error: erroVend }] = await Promise.all([
      context.supabase
        .from("estoque_boloes")
        .select("id, cotas, nome")
        .in("id", data.ids),
      supabaseAdmin
        .from("estoque_boloes_vendas")
        .select("estoque_id, quantidade")
        .in("estoque_id", data.ids),
    ]);
    if (erroEst) return { ok: false as const, erro: `Falha ao ler estoque: ${erroEst.message}` };
    if (erroVend) return { ok: false as const, erro: `Falha ao ler vendas: ${erroVend.message}` };

    const vendasPorLote = new Map<string, number>();
    for (const v of vendas ?? []) {
      vendasPorLote.set(
        v.estoque_id as string,
        (vendasPorLote.get(v.estoque_id as string) ?? 0) + Number(v.quantidade ?? 0),
      );
    }
    const linhas = (estoques ?? []).map((e) => ({
      id: e.id as string,
      cotas: Number(e.cotas ?? 0),
      vendidas: vendasPorLote.get(e.id as string) ?? 0,
    }));
    const vendidasTotal = linhas.reduce((s, l) => s + l.vendidas, 0);
    if (data.total < vendidasTotal) {
      return { ok: false as const, erro: `Já foram vendidas ${vendidasTotal} cota(s).` };
    }
    const sobra = data.total - vendidasTotal;
    // Cada lote cobre o que já vendeu; o excedente fica no primeiro lote.
    const updates = linhas.map((l, i) => ({
      id: l.id,
      cotas: l.vendidas + (i === 0 ? sobra : 0),
    }));
    for (const u of updates) {
      const { error } = await context.supabase
        .from("estoque_boloes")
        .update({ cotas: u.cotas })
        .eq("id", u.id);
      if (error) return { ok: false as const, erro: `Falha ao atualizar: ${error.message}` };
    }
    const antes = linhas.reduce((s, l) => s + l.cotas, 0);
    await registrarLog(context, "estoque_cotas", { ids: data.ids, de: antes, para: data.total });
    return { ok: true as const, erro: "" };
  });

/** Editar concurso, valor, taxa e data de um grupo de lotes (somente admin). */
export const editarEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        concurso: z.string().max(120),
        valorCota: z.number().min(0),
        taxa: z.number().min(0),
        data: z.string().min(8).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await ehAdmin(context))) {
      return { ok: false as const, erro: "Apenas administradores podem editar o estoque." };
    }
    const { data: atual } = await context.supabase
      .from("estoque_boloes")
      .select("nome, concurso, valor_cota, taxa, data")
      .in("id", data.ids)
      .limit(1)
      .maybeSingle();
    if (!atual) return { ok: false as const, erro: "Estoque não encontrado." };

    const modalidade = achaModalidade(String(atual.nome ?? ""));
    const erroData = validarDataSorteio(modalidade, data.data);
    if (erroData) return { ok: false as const, erro: erroData };

    const { error } = await context.supabase
      .from("estoque_boloes")
      .update({
        concurso: data.concurso.trim(),
        valor_cota: data.valorCota,
        taxa: data.taxa,
        data: data.data,
      })
      .in("id", data.ids);
    if (error) return { ok: false as const, erro: `Falha ao editar: ${error.message}` };
    await registrarLog(context, "estoque_editado", {
      ids: data.ids,
      nome: atual.nome,
      de: {
        concurso: atual.concurso,
        valorCota: atual.valor_cota,
        taxa: atual.taxa,
        data: atual.data,
      },
      para: { concurso: data.concurso, valorCota: data.valorCota, taxa: data.taxa, data: data.data },
    });
    return { ok: true as const, erro: "" };
  });

/** Remove estoques em lote e suas vendas (somente admin). */
export const removerEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await ehAdmin(context))) {
      return { ok: false as const, erro: "Apenas administradores podem remover estoque." };
    }
    const { data: linhas } = await context.supabase
      .from("estoque_boloes")
      .select("nome, concurso")
      .in("id", data.ids)
      .limit(1);

    // Antes do CASCADE apagar as vendas, levanta o vínculo com os
    // lançamentos (convenção lanc:<id>) para os dois lados não destoarem:
    // sem isto, o dinheiro ficava nos relatórios e o estoque sumia.
    const { data: vendas } = await context.supabase
      .from("estoque_boloes_vendas")
      .select("quantidade, observacoes")
      .in("estoque_id", data.ids)
      .limit(10000);
    const ajustes = new Map<string, number>();
    for (const v of (vendas ?? []) as Array<{ quantidade: number; observacoes: string | null }>) {
      const m = /^lanc:([0-9a-fA-F-]{36})/.exec(String(v.observacoes ?? ""));
      if (m?.[1]) {
        ajustes.set(m[1], (ajustes.get(m[1]) ?? 0) + Number(v.quantidade ?? 0));
      }
    }
    const camposMortos = data.ids.map((id) => `bolao:${id}`);

    const { error } = await context.supabase
      .from("estoque_boloes")
      .delete()
      .in("id", data.ids);
    if (error) return { ok: false as const, erro: `Falha ao remover: ${error.message}` };

    // Ajusta cada lançamento vinculado: reduz a quantidade (mesmo critério do
    // removerVendaEstoque) e o apaga quando zera.
    for (const [lancId, qtd] of ajustes) {
      const { data: lanc } = await context.supabase
        .from("lancamentos_simples")
        .select("quantidade")
        .eq("id", lancId)
        .maybeSingle();
      if (!lanc) continue;
      const novaQtd = Number((lanc as { quantidade?: number }).quantidade ?? 0) - qtd;
      if (novaQtd <= 0) {
        await context.supabase.from("lancamentos_simples").delete().eq("id", lancId);
      } else {
        await context.supabase
          .from("lancamentos_simples")
          .update({ quantidade: novaQtd } as never)
          .eq("id", lancId);
      }
    }
    // Lançamentos que só apontavam estes lotes (sem venda gravada) viram
    // "manual": o id some do banco e a referência deixa de ser órfã — o
    // dinheiro continua no fechamento, agrupado pela descrição digitada.
    if (camposMortos.length > 0) {
      await context.supabase
        .from("lancamentos_simples")
        .update({ campo: "bolao:manual" } as never)
        .in("campo", camposMortos);
    }

    await registrarLog(context, "estoque_excluido", {
      ids: data.ids,
      nome: linhas?.[0]?.nome ?? "",
      concurso: linhas?.[0]?.concurso ?? "",
      lancamentosAjustados: ajustes.size,
    });
    return { ok: true as const, erro: "" };
  });

/** Registra a venda de cotas do estoque, validando o saldo disponível. */
export const registrarVendaEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => novaVenda.parse(input))
  .handler(async ({ data, context }) => {
    const { data: estoque } = await context.supabase
      .from("estoque_boloes")
      .select("id, nome, concurso, valor_cota, taxa, cotas, situacao")
      .eq("id", data.estoqueId)
      .maybeSingle();
    if (!estoque) return { ok: false as const, erro: "Estoque não encontrado." };
    if (estoque.situacao === "finalizado") {
      return { ok: false as const, erro: "Bolão finalizado — não aceita mais vendas." };
    }
    // "encerrado" aceita venda: vendas atrasadas (ex.: marketplace) chegam
    // depois do sorteio, quando o auto-encerrar já encerrou o lote.

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vendas, error: erroVendas } = await supabaseAdmin
      .from("estoque_boloes_vendas")
      .select("quantidade")
      .eq("estoque_id", data.estoqueId);
    if (erroVendas) return { ok: false as const, erro: `Falha ao consultar vendas: ${erroVendas.message}` };
    const vendidas = (vendas ?? []).reduce((s, v) => s + Number(v.quantidade ?? 0), 0);
    const disponiveis = Number(estoque.cotas ?? 0) - vendidas;
    if (data.quantidade > disponiveis) {
      return { ok: false as const, erro: `Estoque insuficiente: restam ${disponiveis} cota(s).` };
    }

    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("nome, email")
      .eq("id", context.userId)
      .maybeSingle();
    const operadorNome = perfil?.nome || perfil?.email || null;

    // Venda direta do /estoque também vira lançamento: assim entra no
    // fechamento, nos relatórios e na lista do dia. O id do lançamento fica
    // em observacoes da venda (lanc:<id>) — mesma convenção usada pela baixa
    // automática — permitindo estornar os dois juntos.
    const { data: lanc, error: erroLanc } = await context.supabase
      .from("lancamentos_simples")
      .insert({
        tipo: "BOLAO",
        valor: Number(estoque.valor_cota ?? 0),
        descricao: estoque.concurso || null,
        campo: `bolao:${estoque.id}`,
        quantidade: data.quantidade,
        taxa: Number(estoque.taxa ?? 0),
        data: data.data,
        operador_id: context.userId,
        operador_nome: operadorNome,
      })
      .select("id")
      .single();
    if (erroLanc) return { ok: false as const, erro: `Falha ao registrar o lançamento: ${erroLanc.message}` };

    const { error } = await supabaseAdmin.from("estoque_boloes_vendas").insert({
      estoque_id: data.estoqueId,
      quantidade: data.quantidade,
      canal: data.canal,
      data: data.data,
      operador_id: context.userId,
      operador_nome: operadorNome,
      observacoes: `lanc:${lanc.id}`,
    });
    if (error) {
      // Não deixa lançamento órfão (sem venda correspondente).
      await context.supabase.from("lancamentos_simples").delete().eq("id", lanc.id);
      return { ok: false as const, erro: `Falha ao registrar a venda: ${error.message}` };
    }

    // Revalida pós-insert: sem lock no banco, duas vendas simultâneas podem
    // passar na checagem de saldo. Se estourou as cotas, desfaze esta venda e
    // o lançamento junto, para o estoque nunca ficar negativo.
    const cotasLote = Number((estoque as { cotas?: number }).cotas ?? 0);
    const lancId = String((lanc as { id: string }).id);
    const { data: depois } = await supabaseAdmin
      .from("estoque_boloes_vendas")
      .select("quantidade")
      .eq("estoque_id", data.estoqueId);
    const vendidasAgora = ((depois ?? []) as Array<{ quantidade: number }>).reduce(
      (s, v) => s + Number(v.quantidade ?? 0),
      0,
    );
    if (vendidasAgora > cotasLote) {
      await supabaseAdmin
        .from("estoque_boloes_vendas")
        .delete()
        .eq("observacoes", `lanc:${lancId}`);
      await context.supabase.from("lancamentos_simples").delete().eq("id", lancId);
      return {
        ok: false as const,
        erro: "Corrida no estoque: outra venda foi registrada ao mesmo tempo. Tente novamente.",
      };
    }
    return { ok: true as const, erro: "", disponiveis: cotasLote - vendidasAgora };
  });

/**
 * Venda a partir de uma linha do Controle de Bolões: distribui as cotas entre
 * os lotes daquele bolão (mesmo nome+concurso+valor+taxa), do lote mais antigo
 * para o mais novo, pulando lotes finalizados. Aceita lote encerrado (vendas
 * atrasadas do marketplace).
 */
export const registrarVendaLinha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(20),
        quantidade: z.number().int().min(1).max(100000),
        canal: z.enum(["LOJA", "MARKETPLACE"]),
        data: z.string().min(8).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: lotes, error: erroLotes } = await context.supabase
      .from("estoque_boloes")
      .select("id, nome, concurso, valor_cota, taxa, cotas, situacao, created_at")
      .in("id", data.ids);
    if (erroLotes) return { ok: false as const, erro: `Falha ao ler o estoque: ${erroLotes.message}` };
    if (!lotes || lotes.length === 0) return { ok: false as const, erro: "Estoque não encontrado." };

    const referencia = lotes[0]!;
    const mesmoBolao = lotes.every(
      (l) =>
        String(l.nome) === String(referencia.nome) &&
        String(l.concurso ?? "") === String(referencia.concurso ?? "") &&
        Number(l.valor_cota) === Number(referencia.valor_cota) &&
        Number(l.taxa) === Number(referencia.taxa),
    );
    if (!mesmoBolao) {
      return { ok: false as const, erro: "Lotes informados não pertencem ao mesmo bolão." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: todasVendas, error: erroVendas } = await supabaseAdmin
      .from("estoque_boloes_vendas")
      .select("estoque_id, quantidade")
      .in("estoque_id", data.ids);
    if (erroVendas) return { ok: false as const, erro: `Falha ao consultar vendas: ${erroVendas.message}` };
    const vendidasPorLote = new Map<string, number>();
    for (const v of (todasVendas ?? []) as Array<{ estoque_id: string; quantidade: number }>) {
      vendidasPorLote.set(v.estoque_id, (vendidasPorLote.get(v.estoque_id) ?? 0) + Number(v.quantidade ?? 0));
    }

    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("nome, email")
      .eq("id", context.userId)
      .maybeSingle();
    const operadorNome = perfil?.nome || perfil?.email || null;

    // Distribui do lote mais antigo para o mais novo (pula finalizados).
    const lotesDis: LoteDistribuicao[] = (lotes ?? []).map((l) => ({
      id: String(l.id),
      cotas: Number(l.cotas ?? 0),
      situacao: String(l.situacao ?? ""),
      created_at: l.created_at ? String(l.created_at) : null,
    }));
    const naoFinalizados = lotesDis.filter((l) => l.situacao !== "finalizado");
    if (naoFinalizados.length === 0) {
      return { ok: false as const, erro: "Bolão finalizado — não aceita mais vendas." };
    }
    const plano = distribuirVendaEntreLotes(lotesDis, vendidasPorLote, data.quantidade);
    const planoQtd = plano.reduce((s, p) => s + p.qtd, 0);
    if (plano.length === 0 || planoQtd < data.quantidade) {
      const totalDisp = disponivelEntreLotes(lotesDis, vendidasPorLote);
      return { ok: false as const, erro: `Estoque insuficiente: restam ${totalDisp} cota(s).` };
    }

    const criados: Array<{ vendaObs: string; lancId: string; estoqueId: string }> = [];
    for (const item of plano) {
      const l = (lotes ?? []).find((x) => String(x.id) === item.loteId)!;
      const { data: lanc, error: erroLanc } = await context.supabase
        .from("lancamentos_simples")
        .insert({
          tipo: "BOLAO",
          valor: Number(l.valor_cota ?? 0),
          descricao: l.concurso || null,
          campo: `bolao:${l.id}`,
          quantidade: item.qtd,
          taxa: Number(l.taxa ?? 0),
          data: data.data,
          operador_id: context.userId,
          operador_nome: operadorNome,
        })
        .select("id")
        .single();
      if (erroLanc) {
        await desfazerVendasLinha(criados);
        return { ok: false as const, erro: `Falha ao registrar o lançamento: ${erroLanc.message}` };
      }
      const obs = `lanc:${lanc.id}`;
      const { error } = await supabaseAdmin.from("estoque_boloes_vendas").insert({
        estoque_id: l.id,
        quantidade: item.qtd,
        canal: data.canal,
        data: data.data,
        operador_id: context.userId,
        operador_nome: operadorNome,
        observacoes: obs,
      });
      if (error) {
        await context.supabase.from("lancamentos_simples").delete().eq("id", lanc.id);
        await desfazerVendasLinha(criados);
        return { ok: false as const, erro: `Falha ao registrar a venda: ${error.message}` };
      }
      criados.push({ vendaObs: obs, lancId: String(lanc.id), estoqueId: String(l.id) });
    }

    // Revalida pós-insert (mesma proteção contra corrida da venda simples).
    let dispTotal = 0;
    for (const l of naoFinalizados) {
      const { data: depois } = await supabaseAdmin
        .from("estoque_boloes_vendas")
        .select("quantidade")
        .eq("estoque_id", l.id);
      const agora = ((depois ?? []) as Array<{ quantidade: number }>).reduce(
        (s, v) => s + Number(v.quantidade ?? 0),
        0,
      );
      if (agora > Number(l.cotas ?? 0)) {
        await desfazerVendasLinha(criados);
        return {
          ok: false as const,
          erro: "Corrida no estoque: outra venda foi registrada ao mesmo tempo. Tente novamente.",
        };
      }
      dispTotal += Math.max(0, Number(l.cotas ?? 0) - agora);
    }
    return { ok: true as const, erro: "", disponiveis: dispTotal };
  });

/** Desfaz vendas/lançamentos já criados por registrarVendaLinha (rollback parcial). */
async function desfazerVendasLinha(
  criados: Array<{ vendaObs: string; lancId: string }>,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (const c of criados) {
    try {
      await supabaseAdmin.from("estoque_boloes_vendas").delete().eq("observacoes", c.vendaObs);
      await supabaseAdmin.from("lancamentos_simples").delete().eq("id", c.lancId);
    } catch (e) {
      console.error("[registrarVendaLinha] rollback falhou:", e);
    }
  }
}

/** Vendas do estoque. Admin vê todas; operador vê apenas as suas (via RLS). */
export const listarVendasEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        estoqueId: z.string().uuid().optional().nullable(),
        de: z.string().optional().default(""),
        ate: z.string().optional().default(""),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("estoque_boloes_vendas")
      .select(
        "id, estoque_id, quantidade, canal, data, operador_nome, observacoes, estoque_boloes(nome, concurso, valor_cota, taxa)",
      )
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.estoqueId) q = q.eq("estoque_id", data.estoqueId);
    if (data.de) q = q.gte("data", data.de);
    if (data.ate) q = q.lte("data", data.ate);

    const { data: linhas, error } = await q;
    if (error) throw new Error(`Não foi possível carregar as vendas: ${error.message}`);

    return (linhas ?? []).map((v: any) => ({
      id: v.id as string,
      estoqueId: v.estoque_id as string,
      nome: (v.estoque_boloes?.nome ?? "") as string,
      concurso: (v.estoque_boloes?.concurso ?? "") as string,
      quantidade: Number(v.quantidade ?? 0),
      canal: v.canal as "LOJA" | "MARKETPLACE",
      data: v.data as string,
      operador: (v.operador_nome ?? "—") as string,
      observacoes: (v.observacoes ?? "") as string,
      valorTotal: Number(v.quantidade ?? 0) * Number(v.estoque_boloes?.valor_cota ?? 0),
      taxaTotal: Number(v.quantidade ?? 0) * Number(v.estoque_boloes?.taxa ?? 0),
    }));
  });

/** Exclui uma venda do estoque, devolvendo as cotas (somente admin). */
export const removerVendaEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvo.parse(input))
  .handler(async ({ data, context }) => {
    if (!(await ehAdmin(context))) {
      return { ok: false as const, erro: "Apenas administradores podem excluir vendas." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: venda } = await supabaseAdmin
      .from("estoque_boloes_vendas")
      .select("observacoes, quantidade, estoque_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("estoque_boloes_vendas")
      .delete()
      .eq("id", data.id);
    if (error) return { ok: false as const, erro: `Falha ao excluir a venda: ${error.message}` };
    // Se a venda tinha lançamento vinculado (lanc:<id>), ajusta junto: o estoque
    // já foi devolvido ao excluir a venda, então o lançamento precisa acompanhar
    // (some quando não sobra quantidade, senão é reduzido).
    const m = /^lanc:([0-9a-fA-F-]{36})/.exec(String(venda?.observacoes ?? ""));
    if (m?.[1]) {
      const lancId = m[1];
      const { data: lanc } = await supabaseAdmin
        .from("lancamentos_simples")
        .select("quantidade")
        .eq("id", lancId)
        .maybeSingle();
      if (lanc) {
        const novaQtd = Number(lanc.quantidade ?? 0) - Number(venda?.quantidade ?? 0);
        if (novaQtd <= 0) {
          await supabaseAdmin.from("lancamentos_simples").delete().eq("id", lancId);
        } else {
          await supabaseAdmin.from("lancamentos_simples").update({ quantidade: novaQtd }).eq("id", lancId);
        }
      }
    }
    // Exclusão de venda é ação crítica: fica no histórico (antes era a única
    // mutação do estoque sem log).
    const vendaInfo = venda as { estoque_id?: string; quantidade?: number } | null;
    await registrarLog(context, "venda_estoque_excluida", {
      vendaId: data.id,
      estoqueId: vendaInfo?.estoque_id ?? null,
      quantidade: vendaInfo?.quantidade ?? null,
      lancamento: m?.[1] ?? null,
    });
    return { ok: true as const, erro: "" };
  });
