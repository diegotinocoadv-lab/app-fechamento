import { supabase } from "@/integrations/supabase/client";

/** Saldo de crédito disponível do cliente (créditos lançados menos créditos já utilizados). */
export async function creditoDisponivel(clienteId: string): Promise<number> {
  const { data, error } = await supabase.from("creditos").select("valor").eq("cliente_id", clienteId);
  if (error) throw error;
  const total = (data ?? []).reduce((s: number, c: any) => s + Number(c.valor), 0);
  return Math.max(0, Math.round(total * 100) / 100);
}

/**
 * Abate o crédito disponível do cliente sobre um valor devido.
 * Registra o consumo como um lançamento negativo em `creditos`.
 * Retorna quanto de crédito foi efetivamente utilizado.
 */
export async function aplicarCredito(params: {
  clienteId: string;
  fiadoId?: string | null;
  devido: number;
  userId: string;
  descricao?: string;
}): Promise<number> {
  // Idempotência: se este fiado já consumiu crédito, não abate de novo.
  if (params.fiadoId) {
    const { data: jaUsado, error: errJa } = await supabase
      .from("creditos")
      .select("valor")
      .eq("fiado_id", params.fiadoId)
      .lt("valor", 0);
    if (errJa) throw errJa;
    if ((jaUsado ?? []).length > 0) {
      return Math.abs((jaUsado ?? []).reduce((s: number, c: any) => s + Number(c.valor), 0));
    }
  }
  const disponivel = await creditoDisponivel(params.clienteId);
  const usado = Math.min(disponivel, Math.max(0, params.devido));
  if (usado <= 0) return 0;
  const { error } = await supabase.from("creditos").insert({
    cliente_id: params.clienteId,
    fiado_id: params.fiadoId ?? null,
    valor: -usado,
    descricao: params.descricao ?? "Crédito utilizado no recebimento",
    data_credito: new Date().toISOString().slice(0, 10),
    lancado_por: params.userId,
  });
  if (error) {
    // 23505 = violação do índice único (outra execução já abateu este fiado)
    if ((error as any).code === "23505") return 0;
    throw error;
  }
  return usado;
}

/**
 * Abate automaticamente o saldo positivo (crédito) do cliente sobre os fiados em aberto,
 * quitando os mais antigos primeiro. Retorna o resumo do abatimento.
 */
type ResumoAbatimento = { usado: number; quitados: number; parciais: number };

// Evita disparos duplicados simultâneos para o mesmo cliente (duplo clique).
const abatimentosEmAndamento = new Map<string, Promise<ResumoAbatimento>>();

export async function abaterCreditoEmFiados(clienteId: string): Promise<ResumoAbatimento> {
  const emAndamento = abatimentosEmAndamento.get(clienteId);
  if (emAndamento) return emAndamento;

  const p = (async () => {
    const { data, error } = await (supabase as any).rpc("aplicar_credito_em_fiados", {
      _cliente_id: clienteId,
    });
    if (error) throw error;
    const r = (data ?? {}) as any;
    return {
      usado: Number(r.usado ?? 0),
      quitados: Number(r.quitados ?? 0),
      parciais: Number(r.parciais ?? 0),
    };
  })().finally(() => abatimentosEmAndamento.delete(clienteId));

  abatimentosEmAndamento.set(clienteId, p);
  return p;
}