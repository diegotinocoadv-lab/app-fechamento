import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Apenas administradores podem acessar esta funcionalidade.");
  return Boolean(isAdmin);
}

const registrarSchema = z.object({
  data: z.string().min(8),
  valor: z.number().positive("O valor deve ser maior que zero."),
  observacao: z.string().max(500).optional().default(""),
});

export const listarColetas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);

    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    const { data, error } = await context.supabase
      .from("coletas_carro_forte")
      .select("id, data, valor, observacao, created_at")
      .gte("data", inicioMes)
      .lte("data", fimMes)
      .order("data", { ascending: false });

    if (error) throw new Error(`Não foi possível carregar as coletas: ${error.message}`);

    const coletas = (data ?? []).map((c: any) => ({
      id: c.id,
      data: c.data,
      valor: Number(c.valor),
      observacao: c.observacao ?? "",
      criadoEm: c.created_at,
    }));

    const totalColetado = coletas.reduce((acc: number, c: any) => acc + c.valor, 0);
    const quantidadeColetas = coletas.length;

    return { coletas, totalColetado, quantidadeColetas };
  });

export const registrarColeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registrarSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);

    const { error } = await context.supabase.from("coletas_carro_forte").insert({
      data: data.data,
      valor: data.valor,
      observacao: data.observacao,
      user_id: context.userId,
    });

    if (error) throw new Error(`Não foi possível registrar a coleta: ${error.message}`);
    return { ok: true };
  });

export const removerColeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);

    const { error } = await context.supabase
      .from("coletas_carro_forte")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(`Não foi possível remover a coleta: ${error.message}`);
    return { ok: true };
  });

export const saldoCofre = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);

    const { data: fechamentos, error: err1 } = await context.supabase
      .from("fechamentos")
      .select("dados");

    if (err1) throw new Error(`Erro ao buscar fechamentos: ${err1.message}`);

    let totalDepositos = 0;
    for (const f of fechamentos ?? []) {
      const dados = f.dados as any;
      const valores = dados?.valores ?? {};
      const dep1 = Number(String(valores.deposito1 ?? "0").replace(",", ".")) || 0;
      const dep2 = Number(String(valores.deposito2 ?? "0").replace(",", ".")) || 0;
      totalDepositos += dep1 + dep2;
    }

    const { data: coletas, error: err2 } = await context.supabase
      .from("coletas_carro_forte")
      .select("valor");

    if (err2) throw new Error(`Erro ao buscar coletas: ${err2.message}`);

    const totalColetado = (coletas ?? []).reduce(
      (acc: number, c: any) => acc + Number(c.valor),
      0,
    );

    const saldo = totalDepositos - totalColetado;

    return { totalDepositos, totalColetado, saldo };
  });
