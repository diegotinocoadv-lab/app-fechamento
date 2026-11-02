/**
 * Encerra automaticamente lotes de estoque vencidos (sorteio já passou).
 * Roda como intervalo no processo do servidor (Node) — sem cron externo.
 * Mesma regra do botão "Encerrar vencidos": situacao "ativo" + data do sorteio
 * anterior à de hoje (America/Sao_Paulo). Idempotente e limitado a 500 por rodada.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const INTERVALO_MS = 15 * 60 * 1000;
const LIMITE_LOTES = 500;

function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Encerra (situacao → "encerrado") todos os lotes ATIVOS com sorteio anterior a hoje. */
export async function encerrarVencidosAutomatico(): Promise<number> {
  const hoje = hojeBrasilia();
  const { data: lotes, error } = await (supabaseAdmin as any)
    .from("estoque_boloes")
    .select("id, nome, concurso, data")
    .eq("situacao", "ativo")
    .lt("data", hoje)
    .order("data", { ascending: true })
    .limit(LIMITE_LOTES);
  if (error) throw new Error(`Falha ao ler estoque: ${error.message}`);
  if (!lotes || lotes.length === 0) return 0;

  const ids = lotes.map((l: any) => l.id as string);
  const { error: erroUp } = await (supabaseAdmin as any)
    .from("estoque_boloes")
    .update({ situacao: "encerrado" })
    .in("id", ids);
  if (erroUp) throw new Error(`Falha ao encerrar lotes: ${erroUp.message}`);

  try {
    await (supabaseAdmin as any).from("activity_logs").insert({
      user_id: null,
      user_nome: "Sistema (automático)",
      acao: "estoque_encerrado_auto",
      detalhes: {
        quantidade: ids.length,
        ids,
        corte: hoje,
        lotes: lotes.map((l: any) => `${l.nome} concurso ${l.concurso} (sorteio ${l.data})`),
      },
    });
  } catch (e) {
    console.error("[auto-encerrar] Falha ao registrar log:", e);
  }

  console.log(`[auto-encerrar] ${ids.length} lote(s) vencido(s) encerrado(s) (corte ${hoje}).`);
  return ids.length;
}

let iniciado = false;

/**
 * Agenda a verificação periódica (uma vez no boot + a cada 15 min).
 * Idempotente: chamadas repetidas não criam intervalos extras.
 */
export function iniciarAutoEncerrar(): void {
  if (iniciado) return;
  iniciado = true;

  const rodar = () => {
    encerrarVencidosAutomatico().catch((e) =>
      console.error("[auto-encerrar] Verificação falhou:", e),
    );
  };

  // Primeira verificação logo após o boot (pequeno atraso p/ o servidor subir).
  setTimeout(rodar, 10_000);
  setInterval(rodar, INTERVALO_MS);
  console.log(
    `[auto-encerrar] Ativo — verifica lotes vencidos no boot e a cada ${INTERVALO_MS / 60000} min.`,
  );
}
