import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nomeCanonicoBolao, normBolao } from "@/lib/loterias-sorteio";

/**
 * Padroniza os nomes dos bolões e une modelos duplicados.
 *
 * Sem `aplicar`, apenas calcula e devolve o plano (pré-visualização) —
 * nada é alterado. Com `aplicar: true`, renomeia modelos/estoques para o
 * nome canônico, reaponta os estoques dos modelos repetidos e exclui os
 * modelos que sobrarem (sem estoques vinculados).
 *
 * Somente administrador. Nomes são usados para exibição e agrupamento —
 * nenhum valor financeiro depende do texto do nome.
 */
export const padronizarBoloes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ aplicar: z.boolean().optional().default(false) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return { ok: false as const, erro: "Apenas administradores podem padronizar." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: modelos, error: erroMod }, { data: estoques, error: erroEst }] = await Promise.all([
      supabaseAdmin
        .from("boloes_estoque")
        .select("id, concurso, valor_cota, taxa, created_at")
        .order("created_at", { ascending: true })
        .limit(1000),
      supabaseAdmin
        .from("estoque_boloes")
        .select("id, modelo_id, nome")
        .limit(2000),
    ]);
    if (erroMod) return { ok: false as const, erro: `Falha ao ler modelos: ${erroMod.message}` };
    if (erroEst) return { ok: false as const, erro: `Falha ao ler estoque: ${erroEst.message}` };

    type Modelo = {
      id: string;
      concurso: string;
      valorCota: number;
      taxa: number;
      createdAt: string;
    };
    type Estoque = { id: string; modeloId: string | null; nome: string };

    const listaModelos = (modelos ?? []) as unknown as Modelo[];
    const listaEstoques = (estoques ?? []) as unknown as Estoque[];

    // Quantos estoques usam cada modelo.
    const usoModelo = new Map<string, number>();
    for (const e of listaEstoques) {
      if (!e.modeloId) continue;
      usoModelo.set(e.modeloId, (usoModelo.get(e.modeloId) ?? 0) + 1);
    }

    // Nome canônico de cada modelo, agrupado pelo nome normalizado.
    const porNome = new Map<
      string,
      { manter: Modelo; apagar: Modelo[]; estoques: number; canonico: string }
    >();
    const renomear: Array<{ id: string; de: string; para: string }> = [];

    for (const m of listaModelos) {
      const canonico = nomeCanonicoBolao(m.concurso);
      if (canonico && canonico !== m.concurso) {
        renomear.push({ id: m.id, de: m.concurso, para: canonico });
      }
      const chave = normBolao(canonico || m.concurso);
      const grupo = porNome.get(chave);
      if (!grupo) {
        porNome.set(chave, {
          manter: { ...m, concurso: canonico || m.concurso },
          apagar: [],
          estoques: usoModelo.get(m.id) ?? 0,
          canonico: canonico || m.concurso,
        });
        continue;
      }
      grupo.apagar.push(m);
      grupo.estoques += usoModelo.get(m.id) ?? 0;
    }

    // Grupos com mais de um modelo = duplicatas a unir.
    const fusoes = [...porNome.values()].filter((g) => g.apagar.length > 0);
    const renomearModelos = renomear.filter((r) =>
      !fusoes.some((f) => f.apagar.some((a) => a.id === r.id)),
    );

    // Estoques com nome diferente do canônico (por grupo de nome).
    const porNomeEstoque = new Map<string, { nome: string; canonico: string; ids: string[] }>();
    for (const e of listaEstoques) {
      const canonico = nomeCanonicoBolao(e.nome);
      const chave = normBolao(e.nome);
      const grupo = porNomeEstoque.get(chave);
      if (!grupo) {
        porNomeEstoque.set(chave, { nome: e.nome, canonico: canonico || e.nome, ids: [e.id] });
        continue;
      }
      grupo.ids.push(e.id);
      if (canonico && !grupo.canonico) grupo.canonico = canonico;
    }
    const renomearEstoques = [...porNomeEstoque.values()].filter(
      (g) => g.canonico && g.canonico !== g.nome,
    );

    const plano = {
      renomearModelos: renomearModelos.map((r) => ({ ...r })),
      renomearEstoques: renomearEstoques.map((g) => ({
        de: g.nome,
        para: g.canonico,
        lotes: g.ids.length,
      })),
      fusoes: fusoes.map((f) => ({
        nome: f.canonico,
        manter: f.manter.id,
        apagar: f.apagar.map((a) => ({ id: a.id, nome: a.concurso })),
        estoques: f.estoques,
      })),
    };

    const resumo = {
      modelosRenomeados: plano.renomearModelos.length,
      estoquesRenomeados: plano.renomearEstoques.reduce((s, g) => s + g.lotes, 0),
      modelosUnidos: plano.fusoes.reduce((s, f) => s + f.apagar.length, 0),
      modelosRestantes: listaModelos.length - plano.fusoes.reduce((s, f) => s + f.apagar.length, 0),
    };

    // Pré-visualização: nada é gravado.
    if (!data.aplicar) {
      return { ok: true as const, aplicado: false as const, plano, resumo, erro: "" };
    }

    // 1) Renomear modelos para o nome canônico.
    for (const r of plano.renomearModelos) {
      const { error } = await supabaseAdmin
        .from("boloes_estoque")
        .update({ concurso: r.para })
        .eq("id", r.id);
      if (error) return { ok: false as const, erro: `Falha ao renomear modelo: ${error.message}` };
    }

    // 2) Reaponta os estoques dos modelos duplicados para o modelo que fica.
    for (const f of plano.fusoes) {
      const ids = f.apagar.map((a) => a.id);
      if (ids.length === 0) continue;
      const { error } = await supabaseAdmin
        .from("estoque_boloes")
        .update({ modelo_id: f.manter })
        .in("modelo_id", ids);
      if (error) return { ok: false as const, erro: `Falha ao unir modelos: ${error.message}` };
    }

    // 3) Exclui os modelos duplicados (só os que não têm mais estoque vinculado).
    for (const f of plano.fusoes) {
      for (const a of f.apagar) {
        const { count } = await supabaseAdmin
          .from("estoque_boloes")
          .select("id", { count: "exact", head: true })
          .eq("modelo_id", a.id);
        if ((count ?? 0) > 0) continue;
        const { error } = await supabaseAdmin.from("boloes_estoque").delete().eq("id", a.id);
        if (error) return { ok: false as const, erro: `Falha ao remover duplicata: ${error.message}` };
      }
    }

    // 4) Renomeia os estoques (lotes) para o nome canônico.
    for (const g of plano.renomearEstoques) {
      const ids = (porNomeEstoque.get(normBolao(g.de))?.ids ?? []).slice(0, 2000);
      for (let i = 0; i < ids.length; i += 200) {
        const parte = ids.slice(i, i + 200);
        const { error } = await supabaseAdmin
          .from("estoque_boloes")
          .update({ nome: g.para })
          .in("id", parte);
        if (error) return { ok: false as const, erro: `Falha ao renomear estoque: ${error.message}` };
      }
    }

    // 5) Registra a padronização no histórico.
    try {
      const { data: perfil } = await context.supabase
        .from("profiles")
        .select("nome, email")
        .eq("id", context.userId)
        .maybeSingle();
      await supabaseAdmin.from("activity_logs").insert({
        user_id: context.userId,
        user_nome: perfil?.nome || perfil?.email || null,
        acao: "boloes_padronizados",
        detalhes: { resumo } as never,
      });
    } catch (e) {
      console.error("[boloes] Falha ao registrar log da padronização:", e);
    }

    return { ok: true as const, aplicado: true as const, plano, resumo, erro: "" };
  });
