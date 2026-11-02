import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SaldoCliente = { fiado: number; credito: number; saldo: number };

/**
 * Saldos de fiado e de crédito por cliente, calculados no servidor.
 * Usa a sessão do usuário (RLS): cada um continua vendo apenas os seus dados.
 * Substitui o download de todas as linhas de fiados e créditos no navegador.
 */
export const saldosClientes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [fiados, creditos] = await Promise.all([
      context.supabase.from("fiados").select("cliente_id, valor").neq("status", "pago"),
      context.supabase.from("creditos").select("cliente_id, valor"),
    ]);
    if (fiados.error) {
      throw new Error(`Não foi possível carregar os fiados: ${fiados.error.message}`);
    }
    if (creditos.error) {
      throw new Error(`Não foi possível carregar os créditos: ${creditos.error.message}`);
    }

    const saldos: Record<string, SaldoCliente> = {};
    const reg = (id: string): SaldoCliente => {
      const atual = saldos[id];
      if (atual) return atual;
      const novo: SaldoCliente = { fiado: 0, credito: 0, saldo: 0 };
      saldos[id] = novo;
      return novo;
    };

    for (const f of fiados.data ?? []) {
      const r = reg(String(f.cliente_id));
      r.fiado += Number(f.valor ?? 0);
    }
    for (const c of creditos.data ?? []) {
      const r = reg(String(c.cliente_id));
      r.credito += Number(c.valor ?? 0);
    }
    for (const id of Object.keys(saldos)) {
      const r = saldos[id];
      if (!r) continue;
      r.fiado = Math.round(r.fiado * 100) / 100;
      r.credito = Math.round(r.credito * 100) / 100;
      r.saldo = Math.round((r.fiado - r.credito) * 100) / 100;
    }
    return saldos;
  });
