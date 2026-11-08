import { carregarBoloesRadarlot } from "@/lib/radarlot.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Sincronização automática (somente leitura) do RadarLot para o estoque local.
 * Roda no processo do servidor (Node) — sem cron externo, igual ao auto-encerrar.
 *
 * Regra: cada bolão do RadarLot vira uma linha em estoque_boloes, identificada
 * pelo código (guardado em observacoes como "RadarLot <codigo>"). Lotes já
 * existentes não são sobrescritos — assim as cotas vendidas aqui não são
 * resetadas. Lotes novos entram como "ativo" e passam a aparecer para os
 * operadores na tela de lançamento.
 */
const INTERVALO_MS = 10 * 60 * 1000;
const LIMITE_POR_RODADA = 200;

let iniciado = false;

export async function sincronizarRadarlotAutomatico(): Promise<number> {
  if (!process.env["RADARLOT_CHAVE"]) return 0;

  const r = await carregarBoloesRadarlot(true);
  if (!r.ok) {
    console.error("[radarlot-sync] Falha ao carregar RadarLot:", r.erro);
    return 0;
  }

  const boloes = r.boloes.slice(0, LIMITE_POR_RODADA);
  let inseridos = 0;

  for (const b of boloes) {
    if (!(b.totalCotas > 0) || !(b.valorSemTarifa > 0) || !b.dataSorteio) continue;

    // Já existe um lote para este código do RadarLot? Pula para não duplicar
    // nem sobrescrever cotas já vendidas aqui.
    const { data: existentes, error: erroBusca } = await (supabaseAdmin as any)
      .from("estoque_boloes")
      .select("id")
      .eq("observacoes", `RadarLot ${b.codigo}`)
      .limit(1);
    if (erroBusca) {
      console.error("[radarlot-sync] Falha ao consultar estoque:", erroBusca.message);
      continue;
    }
    if (existentes && existentes.length > 0) continue;

    const { error: erroIns } = await (supabaseAdmin as any).from("estoque_boloes").insert({
      modelo_id: null,
      nome: b.modalidadeNome,
      concurso: b.concurso || "",
      cotas: b.totalCotas,
      valor_cota: b.valorSemTarifa,
      taxa: b.taxa,
      data: b.dataSorteio,
      situacao: "ativo",
      observacoes: `RadarLot ${b.codigo}`,
      criado_por: null,
    });
    if (erroIns) {
      console.error("[radarlot-sync] Falha ao inserir bolão:", erroIns.message);
      continue;
    }
    inseridos++;
  }

  if (inseridos > 0) {
    console.log(`[radarlot-sync] ${inseridos} bolão(ões) novo(s) importado(s) do RadarLot.`);
  }
  return inseridos;
}

/**
 * Agenda a sincronização periódica (uma vez no boot + a cada 10 min).
 * Idempotente: chamadas repetidas não criam intervalos extras.
 */
export function iniciarSyncRadarlot(): void {
  if (iniciado) return;
  iniciado = true;

  if (!process.env["RADARLOT_CHAVE"]) {
    console.log("[radarlot-sync] RADARLOT_CHAVE ausente — sincronização desativada.");
    return;
  }

  const rodar = () => {
    sincronizarRadarlotAutomatico().catch((e) =>
      console.error("[radarlot-sync] Sincronização falhou:", e),
    );
  };

  // Primeira sincronização após o boot (atraso para o servidor subir).
  setTimeout(rodar, 30_000);
  setInterval(rodar, INTERVALO_MS);
  console.log(
    `[radarlot-sync] Ativo — sincroniza a cada ${INTERVALO_MS / 60000} min.`,
  );
}
