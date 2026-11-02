import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Data de hoje no fuso de São Paulo (YYYY-MM-DD). */
const hojeSP = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** Valor padrão de abertura do caixa quando não há fechamento anterior. */
const ABERTURA_PADRAO = 500;

/**
 * Avisa se o operador (usuário logado) ainda não fechou o caixa de hoje,
 * informando a data pendente e o total a fechar (saldo final do último caixa).
 */
export const caixaPendente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const hoje = hojeSP();

    const { data: hojeRow, error: erroHoje } = await context.supabase
      .from("fechamentos")
      .select("id")
      .eq("user_id", context.userId)
      .eq("data", hoje)
      .limit(1);
    if (erroHoje) throw new Error(`Não foi possível verificar o caixa de hoje: ${erroHoje.message}`);

    const { data: ultimoRow } = await context.supabase
      .from("fechamentos")
      .select("data, total_final")
      .eq("user_id", context.userId)
      .lt("data", hoje)
      .order("data", { ascending: false })
      .limit(1);

    const ultimo = ultimoRow?.[0] ?? null;

    return {
      data: hoje,
      pendente: (hojeRow?.length ?? 0) === 0,
      totalAFechar: ultimo ? Number(ultimo.total_final) : ABERTURA_PADRAO,
      ultimaData: ultimo?.data ?? null,
    };
  });
