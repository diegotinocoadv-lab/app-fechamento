import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ehAdmin } from "@/lib/auth-guard";

/** Estoque de bolões com cotas vendidas por canal e saldo disponível. */
export const listarEstoqueBoloes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ situacao: z.enum(["todos", "ativo", "encerrado"]).optional().default("ativo") })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const admin = await ehAdmin(context);

    let q = context.supabase
      .from("boloes_estoque")
      .select(
        "id, concurso, descricao, valor_cota, taxa, total_cotas, situacao, data_sorteio, created_at",
      )
      .order("concurso", { ascending: true })
      .order("valor_cota", { ascending: true })
      .limit(500);
    const filtroSituacao = admin ? data.situacao : "ativo";
    if (filtroSituacao !== "todos") q = q.eq("situacao", filtroSituacao);

    const { data: linhas, error } = await q;
    if (error) throw new Error(`Não foi possível carregar o estoque: ${error.message}`);

    // Totais de cotas vendidas por bolão (visão consolidada do estoque, sem dados pessoais).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vendas } = await supabaseAdmin
      .from("boloes_vendas")
      .select("bolao_id, quantidade, canal");

    const porBolao = new Map<string, { loja: number; mkp: number }>();
    for (const v of vendas ?? []) {
      const atual = porBolao.get(v.bolao_id) ?? { loja: 0, mkp: 0 };
      if (v.canal === "MARKETPLACE") atual.mkp += Number(v.quantidade ?? 0);
      else atual.loja += Number(v.quantidade ?? 0);
      porBolao.set(v.bolao_id, atual);
    }

    return {
      admin,
      boloes: (linhas ?? []).map((b) => {
        const vend = porBolao.get(b.id) ?? { loja: 0, mkp: 0 };
        const vendidas = vend.loja + vend.mkp;
        return {
          id: b.id as string,
          concurso: b.concurso as string,
          descricao: (b.descricao ?? "") as string,
          valorCota: Number(b.valor_cota ?? 0),
          taxa: Number(b.taxa ?? 0),
          totalCotas: Number(b.total_cotas ?? 0),
          situacao: b.situacao as string,
          dataSorteio: (b.data_sorteio ?? "") as string,
          vendidasLoja: vend.loja,
          vendidasMkp: vend.mkp,
          vendidas,
          disponiveis: Math.max(0, Number(b.total_cotas ?? 0) - vendidas),
        };
      }),
    };
  });

/**
 * Saldo de bolões numa data: cotas vendidas por canal (Loja e Marketplace)
 * e o que sobrou no estoque. Usado no PDF do fechamento.
 * Fonte: estoque_boloes + estoque_boloes_vendas (sistema atual), agrupado
 * por bolão (nome + concurso) somando os lotes.
 */
export const resumoBoloesDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ data: z.string().min(8).max(10) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: estoque, error } = await supabaseAdmin
      .from("estoque_boloes")
      .select("id, nome, concurso, valor_cota, taxa, cotas, situacao")
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(`Não foi possível carregar o estoque: ${error.message}`);

    const { data: vendas } = await supabaseAdmin
      .from("estoque_boloes_vendas")
      .select("estoque_id, quantidade, canal, data");

    const norm = (s: unknown) =>
      String(s ?? "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
    const rotulo = (nome: unknown, concurso: unknown) => {
      const n = String(nome ?? "").trim();
      const c = String(concurso ?? "").trim();
      return `${n}${c ? ` ${c}` : ""}`.trim();
    };

    type Grupo = {
      concurso: string;
      valorCota: number;
      taxa: number;
      totalCotas: number;
      lojaDia: number;
      mkpDia: number;
      vendidas: number;
      situacao: string;
      ids: Set<string>;
    };
    const porBolao = new Map<string, Grupo>();
    const idParaChave = new Map<string, string>();

    for (const e of estoque ?? []) {
      const chave = `${norm(e.nome)}|${String(e.concurso ?? "").replace(/\D+/g, "")}`;
      idParaChave.set(e.id as string, chave);
      let g = porBolao.get(chave);
      if (!g) {
        g = {
          concurso: rotulo(e.nome, e.concurso),
          valorCota: Number(e.valor_cota ?? 0),
          taxa: Number(e.taxa ?? 0),
          totalCotas: 0,
          lojaDia: 0,
          mkpDia: 0,
          vendidas: 0,
          situacao: e.situacao as string,
          ids: new Set<string>(),
        };
        porBolao.set(chave, g);
      }
      g.totalCotas += Number(e.cotas ?? 0);
      g.ids.add(e.id as string);
      if (e.situacao !== "ativo") g.situacao = e.situacao as string;
    }

    for (const v of vendas ?? []) {
      const chave = idParaChave.get(v.estoque_id as string);
      if (!chave) continue;
      const g = porBolao.get(chave);
      if (!g) continue;
      const qtd = Number(v.quantidade ?? 0);
      g.vendidas += qtd;
      if (v.data === data.data) {
        if (v.canal === "MARKETPLACE") g.mkpDia += qtd;
        else g.lojaDia += qtd;
      }
    }

    const linhas = [...porBolao.values()].map((g) => ({
      concurso: g.concurso,
      valorCota: g.valorCota,
      taxa: g.taxa,
      totalCotas: g.totalCotas,
      lojaDia: g.lojaDia,
      mkpDia: g.mkpDia,
      vendidasDia: g.lojaDia + g.mkpDia,
      vendidas: g.vendidas,
      disponiveis: Math.max(0, g.totalCotas - g.vendidas),
      situacao: g.situacao,
    }));

    const comMovimento = linhas.filter((l) => l.vendidasDia > 0 || l.disponiveis > 0);

    return {
      data: data.data,
      boloes: comMovimento,
      resumo: {
        lojaDia: comMovimento.reduce<number>((s, l) => s + l.lojaDia, 0),
        mkpDia: comMovimento.reduce<number>((s, l) => s + l.mkpDia, 0),
        vendidasDia: comMovimento.reduce<number>((s, l) => s + l.vendidasDia, 0),
        valorDia: comMovimento.reduce<number>((s, l) => s + l.vendidasDia * l.valorCota, 0),
        taxaDia: comMovimento.reduce<number>((s, l) => s + l.vendidasDia * l.taxa, 0),
        disponiveis: comMovimento.reduce<number>((s, l) => s + l.disponiveis, 0),
        valorDisponivel: comMovimento.reduce<number>((s, l) => s + l.disponiveis * l.valorCota, 0),
      },
    };
  });
