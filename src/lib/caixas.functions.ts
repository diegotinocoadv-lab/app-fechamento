import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSupabaseAdmin } from "@/integrations/supabase/admin-middleware";
import { ehAdmin } from "@/lib/auth-guard";

const filtro = z.object({
  de: z.string().optional().default(""),
  ate: z.string().optional().default(""),
  situacao: z.enum(["todos", "aberto", "fechado", "conferido"]).optional().default("todos"),
});

const novoCaixa = z.object({
  nome: z.string().min(1).max(120),
  operadorId: z.string().uuid().optional().nullable(),
  data: z.string().min(8).max(10),
  observacoes: z.string().max(500).optional().default(""),
});

const alterar = z.object({
  id: z.string().uuid(),
  situacao: z.enum(["aberto", "fechado", "conferido"]),
});

const alvo = z.object({ id: z.string().uuid() });

/** Lista os caixas cadastrados. Admin vê todos; operador vê apenas os seus (via RLS). */
export const listarCaixas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => filtro.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("caixas")
      .select("id, nome, operador_id, operador_nome, data, situacao, observacoes, fechamento_id, created_at")
      .order("data", { ascending: false })
      .limit(500);
    if (data.de) q = q.gte("data", data.de);
    if (data.ate) q = q.lte("data", data.ate);
    if (data.situacao !== "todos") q = q.eq("situacao", data.situacao);

    const { data: linhas, error } = await q;
    if (error) throw new Error(`Não foi possível carregar os caixas: ${error.message}`);

    return {
      admin: await ehAdmin(context),
      caixas: (linhas ?? []).map((c) => ({
        id: c.id,
        nome: c.nome,
        operadorId: c.operador_id,
        operador: c.operador_nome ?? "Sem operador",
        data: c.data,
        situacao: c.situacao,
        observacoes: c.observacoes ?? "",
        fechamentoId: c.fechamento_id,
      })),
    };
  });

/** Cadastra um caixa antes do fechamento (somente admin). */
export const criarCaixa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAdmin])
  .inputValidator((input: unknown) => novoCaixa.parse(input))
  .handler(async ({ data, context }) => {
    let operadorNome: string | null = null;
    if (data.operadorId) {
      const { data: perfil } = await context.supabase
        .from("profiles")
        .select("nome, email")
        .eq("id", data.operadorId)
        .maybeSingle();
      operadorNome = perfil?.nome || perfil?.email || null;
    }

    const { data: criado, error } = await context.supabase
      .from("caixas")
      .insert({
        nome: data.nome,
        operador_id: data.operadorId ?? null,
        operador_nome: operadorNome,
        data: data.data,
        observacoes: data.observacoes || null,
        criado_por: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Falha ao cadastrar o caixa: ${error.message}`);
    return { id: criado.id as string };
  });

/** Marca o caixa como aberto ou fechado. */
export const definirSituacaoCaixa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alterar.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await ehAdmin(context);

    const { data: atual } = await context.supabase
      .from("caixas")
      .select("situacao")
      .eq("id", data.id)
      .maybeSingle();

    if (atual?.situacao === "conferido") {
      throw new Error("Caixa já conferido pelo administrador: não pode mais ser reaberto.");
    }
    if (data.situacao === "conferido" && !admin) {
      throw new Error("Apenas administradores podem conferir um caixa.");
    }

    const { error } = await context.supabase
      .from("caixas")
      .update({ situacao: data.situacao })
      .eq("id", data.id);
    if (error) throw new Error("Falha ao atualizar a situação do caixa.");
    return { ok: true };
  });

const exclusao = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().min(5, "Informe uma justificativa com pelo menos 5 caracteres.").max(500),
});

/** Remove um caixa cadastrado, exigindo justificativa (somente admin). */
export const removerCaixa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAdmin])
  .inputValidator((input: unknown) => exclusao.parse(input))
  .handler(async ({ data, context }) => {
    const { data: atual } = await context.supabase
      .from("caixas")
      .select("id, nome, data, operador_id, operador_nome, situacao")
      .eq("id", data.id)
      .maybeSingle();
    if (!atual) throw new Error("Caixa não encontrado.");
    if (atual.situacao === "conferido") {
      throw new Error("Caixa já conferido pelo administrador: não pode ser excluído.");
    }

    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("nome, email")
      .eq("id", context.userId)
      .maybeSingle();

    const { error: logErro } = await context.supabase.from("caixas_exclusoes").insert({
      caixa_id: atual.id,
      nome: atual.nome,
      data: atual.data,
      operador_id: atual.operador_id,
      operador_nome: atual.operador_nome,
      situacao: atual.situacao,
      motivo: data.motivo,
      excluido_por: context.userId,
      excluido_por_nome: perfil?.nome || perfil?.email || null,
    });
    if (logErro) throw new Error(`Falha ao registrar a justificativa: ${logErro.message}`);

    const { error } = await context.supabase.from("caixas").delete().eq("id", data.id);
    if (error) throw new Error("Falha ao remover o caixa.");
    return { ok: true };
  });


const edicao = z.object({
  id: z.string().uuid(),
  nome: z.string().min(1, "Informe o nome ou número do caixa.").max(120),
  operadorId: z.string().uuid().optional().nullable(),
  data: z.string().min(8).max(10),
  observacoes: z.string().max(500).optional().default(""),
  situacao: z.enum(["aberto", "fechado", "conferido"]),
});

/** Corrige os dados de um caixa já cadastrado (somente admin). */
export const editarCaixa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAdmin])
  .inputValidator((input: unknown) => edicao.parse(input))
  .handler(async ({ data, context }) => {
    const { data: atual } = await context.supabase
      .from("caixas")
      .select("situacao")
      .eq("id", data.id)
      .maybeSingle();
    if (atual?.situacao === "conferido" && data.situacao !== "conferido") {
      throw new Error("Caixa já conferido pelo administrador: não pode mais ser reaberto.");
    }

    let operadorNome: string | null = null;
    if (data.operadorId) {
      const { data: perfil } = await context.supabase
        .from("profiles")
        .select("nome, email")
        .eq("id", data.operadorId)
        .maybeSingle();
      operadorNome = perfil?.nome || perfil?.email || null;
    }

    const { error } = await context.supabase
      .from("caixas")
      .update({
        nome: data.nome,
        operador_id: data.operadorId ?? null,
        operador_nome: operadorNome,
        data: data.data,
        observacoes: data.observacoes || null,
        situacao: data.situacao,
      })
      .eq("id", data.id);
    if (error) throw new Error(`Falha ao corrigir o caixa: ${error.message}`);
    return { ok: true };
  });



const abrir = z.object({
  nome: z.string().max(120).optional().default(""),
  data: z.string().min(8).max(10),
  observacoes: z.string().max(500).optional().default(""),
});

/** Data de hoje no fuso de São Paulo (YYYY-MM-DD). */
const hojeSP = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

async function nomeDoOperador(context: { supabase: any; userId: string }) {
  const { data: perfil } = await context.supabase
    .from("profiles")
    .select("nome, email")
    .eq("id", context.userId)
    .maybeSingle();
  return (perfil?.nome as string | null) || (perfil?.email as string | null) || null;
}

/**
 * Caixa do operador logado: mostra o caixa do dia (se houver), o histórico
 * dos seus caixas e se o fechamento do dia já foi registrado.
 */
export const meuCaixa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const hoje = hojeSP();

    const { data: linhas, error } = await context.supabase
      .from("caixas")
      .select("id, nome, data, situacao, observacoes, fechamento_id, operador_nome")
      .eq("operador_id", context.userId)
      .order("data", { ascending: false })
      .limit(60);
    if (error) throw new Error(`Não foi possível carregar seus caixas: ${error.message}`);

    const { data: fechRows } = await context.supabase
      .from("fechamentos")
      .select("id, data, relatorio, total, diferenca, total_final, pdf_url")
      .eq("user_id", context.userId)
      .order("data", { ascending: false })
      .limit(60);

    const fechamentos = fechRows ?? [];
    const caixas = (linhas ?? []).map((c) => {
      const f = fechamentos.find((x) => x.data === c.data) ?? null;
      return {
        id: c.id as string,
        nome: c.nome as string,
        data: c.data as string,
        situacao: c.situacao as string,
        observacoes: (c.observacoes as string | null) ?? "",
        fechamentoId: (c.fechamento_id as string | null) ?? f?.id ?? null,
        relatorio: f ? Number(f.relatorio) : null,
        total: f ? Number(f.total) : null,
        diferenca: f ? Number(f.diferenca) : null,
      };
    });

    const fechamentoHoje = fechamentos.find((f) => f.data === hoje) ?? null;
    const ultimoAnterior = fechamentos.find((f) => f.data < hoje) ?? null;

    return {
      hoje,
      operador: await nomeDoOperador(context),
      caixaHoje: caixas.find((c) => c.data === hoje) ?? null,
      fechouHoje: Boolean(fechamentoHoje),
      saldoAbertura: ultimoAnterior ? Number(ultimoAnterior.total_final) : 500,
      caixas,
    };
  });

const dataParam = z.object({
  data: z.string().min(8).max(10).optional().default(""),
});

/** Caixa aberto do operador logado em uma data específica (hoje por padrão). */
export const caixaDoOperador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dataParam.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const dataFiltro = data.data || hojeSP();
    const { data: linhas, error } = await context.supabase
      .from("caixas")
      .select("id, nome, situacao")
      .eq("operador_id", context.userId)
      .eq("data", dataFiltro)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Não foi possível carregar o caixa: ${error.message}`);
    const caixa = linhas?.[0] ?? null;
    return {
      operador: await nomeDoOperador(context),
      caixa: caixa
        ? {
            id: caixa.id as string,
            nome: caixa.nome as string,
            situacao: caixa.situacao as string,
          }
        : null,
    };
  });

/** O próprio operador abre seu caixa do dia, sem depender do administrador. */
export const abrirMeuCaixa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => abrir.parse(input))
  .handler(async ({ data, context }) => {
    const operadorNome = await nomeDoOperador(context);
    const nomeFinal = data.nome.trim() || `Caixa ${operadorNome ?? ""}`.trim();

    const { data: existentes } = await context.supabase
      .from("caixas")
      .select("id, nome")
      .eq("operador_id", context.userId)
      .eq("data", data.data);
    if ((existentes ?? []).some((c: { nome: string }) => c.nome === nomeFinal)) {
      throw new Error(`Você já tem o ${nomeFinal} nesta data.`);
    }

    const { data: criado, error } = await context.supabase
      .from("caixas")
      .insert({
        nome: nomeFinal,
        operador_id: context.userId,
        operador_nome: operadorNome,
        data: data.data,
        situacao: "aberto",
        observacoes: data.observacoes || null,
        criado_por: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Falha ao abrir o caixa: ${error.message}`);
    return { id: criado.id as string };
  });

/**
 * O operador fecha o próprio caixa: exige que o fechamento da data já esteja
 * salvo e vincula esse fechamento ao caixa.
 */
export const fecharMeuCaixa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvo.parse(input))
  .handler(async ({ data, context }) => {
    const { data: caixa, error: erroBusca } = await context.supabase
      .from("caixas")
      .select("id, data, operador_id")
      .eq("id", data.id)
      .maybeSingle();
    if (erroBusca || !caixa) {
      return { ok: false as const, erro: "Caixa não encontrado." };
    }
    if (caixa.operador_id !== context.userId) {
      return { ok: false as const, erro: "Você só pode fechar o seu próprio caixa." };
    }

    const { data: fech } = await context.supabase
      .from("fechamentos")
      .select("id")
      .eq("user_id", context.userId)
      .eq("data", caixa.data)
      .order("created_at", { ascending: false })
      .limit(1);
    const fechamentoId = fech?.[0]?.id as string | undefined;
    if (!fechamentoId) {
      return {
        ok: false as const,
        erro: "Salve o fechamento desta data antes de fechar o caixa.",
      };
    }

    const { error } = await context.supabase
      .from("caixas")
      .update({ situacao: "fechado", fechamento_id: fechamentoId })
      .eq("id", data.id);
    if (error) {
      return { ok: false as const, erro: `Falha ao fechar o caixa: ${error.message}` };
    }
    return { ok: true as const, fechamentoId };
  });
