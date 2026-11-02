import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { valorNumerico } from "@/lib/fechamento-campos";
import { exigirAdmin } from "@/lib/auth-guard";

export const CONTAS_LOTERICA = [
  "CONTA 043",
  "CONTA 003",
  "CONTA RETAGUARDA",
  "CONTA COMISSÃO",
  "CONTA FIADO",
  "CONTA MOEDAS",
  "CONTA CARTÃO",
  "CONTA PREMIO RASP",
  "CONTA RESGATE TELESENA",
  "CONTA CARRO FORTE",
] as const;

export type ContaLoterica = (typeof CONTAS_LOTERICA)[number];

/**
 * Rótulos de exibição: no banco só 003 e 043 são contas reais; as demais
 * são controles internos (cofre, fiado, cartão, prêmios etc.).
 * Os valores gravados no banco continuam os mesmos do enum.
 */
export const ROTULOS_CONTAS: Record<ContaLoterica, string> = {
  "CONTA 043": "Banco 043",
  "CONTA 003": "Banco 003",
  "CONTA RETAGUARDA": "Cofre retaguarda (espécie)",
  "CONTA MOEDAS": "Cofre retaguarda (moedas)",
  "CONTA COMISSÃO": "Comissão (controle)",
  "CONTA FIADO": "Fiado de clientes (controle)",
  "CONTA CARTÃO": "Cartão PagBank · a receber D+1",
  "CONTA PREMIO RASP": "Prêmio Rasp · reembolso D+1",
  "CONTA RESGATE TELESENA": "Resgate Telesena (controle)",
  "CONTA CARRO FORTE": "Carro forte · trânsito",
};

export const rotuloConta = (c: string): string =>
  ROTULOS_CONTAS[c as ContaLoterica] ?? c;

const contaEnum = z.enum(CONTAS_LOTERICA);

const filtro = z.object({ data: z.string().min(8).max(10) });

const salvar = z.object({
  data: z.string().min(8).max(10),
  conta: contaEnum,
  valor: z.number(),
  observacoes: z.string().max(500).optional().default(""),
});

const alvo = z.object({ id: z.string().uuid() });

/** Registra no histórico (activity_logs) uma alteração manual feita nas contas. */
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
    console.error("[contas] Falha ao registrar log:", e);
  }
}

/** Lista os valores das contas da lotérica de uma data (somente admin). */
export const listarContas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => filtro.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);

    const { data: linhas, error } = await context.supabase
      .from("contas_loterica")
      .select("id, data, conta, valor, observacoes, updated_at")
      .eq("data", data.data)
      .order("conta");
    if (error) throw new Error(`Não foi possível carregar as contas: ${error.message}`);

    return {
      data: data.data,
      contas: CONTAS_LOTERICA.map((conta) => {
        const l = (linhas ?? []).find((r) => r.conta === conta);
        return {
          conta,
          id: (l?.id as string | undefined) ?? null,
          valor: Number(l?.valor ?? 0),
          observacoes: (l?.observacoes as string | null) ?? "",
        };
      }),
    };
  });

/** Grava (ou atualiza) o valor de uma conta em uma data (somente admin). */
export const salvarConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => salvar.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);

    const { data: anterior } = await context.supabase
      .from("contas_loterica")
      .select("valor")
      .eq("data", data.data)
      .eq("conta", data.conta)
      .maybeSingle();
    const valorAnterior = Number(anterior?.valor ?? 0);

    const { error } = await context.supabase.from("contas_loterica").upsert(
      {
        data: data.data,
        conta: data.conta,
        valor: data.valor,
        observacoes: data.observacoes || null,
        criado_por: context.userId,
      },
      { onConflict: "data,conta" },
    );
    if (error) throw new Error(`Falha ao salvar a conta: ${error.message}`);

    if (!anterior || valorAnterior !== data.valor) {
      await registrarLog(context, "conta_salva", {
        data: data.data,
        conta: data.conta,
        de: valorAnterior,
        para: data.valor,
        observacoes: data.observacoes || "",
      });
    }
    return { ok: true };
  });

/** Remove o lançamento de uma conta (somente admin). */
export const removerConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvo.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { data: anterior } = await context.supabase
      .from("contas_loterica")
      .select("data, conta, valor")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase
      .from("contas_loterica")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error("Falha ao remover o lançamento.");
    if (anterior) {
      await registrarLog(context, "conta_limpa", {
        data: anterior.data,
        conta: anterior.conta,
        valor: Number(anterior.valor ?? 0),
      });
    }
    return { ok: true };
  });

const transferencia = z.object({
  data: z.string().min(8).max(10),
  origem: contaEnum,
  destino: contaEnum,
  valor: z.number().positive("Informe um valor maior que zero."),
  observacoes: z.string().max(500).optional().default(""),
});

/** Lista as transferências entre contas de uma data (somente admin). */
export const listarTransferencias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => filtro.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { data: linhas, error } = await context.supabase
      .from("transferencias_contas")
      .select("id, data, conta_origem, conta_destino, valor, observacoes, created_at")
      .eq("data", data.data)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Não foi possível carregar as transferências: ${error.message}`);
    return (linhas ?? []).map((l) => ({
      id: l.id as string,
      origem: l.conta_origem as string,
      destino: l.conta_destino as string,
      valor: Number(l.valor ?? 0),
      observacoes: (l.observacoes as string | null) ?? "",
    }));
  });

async function ajustarSaldo(
  context: { supabase: any; userId: string },
  dataRef: string,
  conta: string,
  delta: number,
) {
  const { data: atual } = await context.supabase
    .from("contas_loterica")
    .select("valor")
    .eq("data", dataRef)
    .eq("conta", conta)
    .maybeSingle();
  const novo = Number(atual?.valor ?? 0) + delta;
  const { error } = await context.supabase.from("contas_loterica").upsert(
    { data: dataRef, conta, valor: novo, criado_por: context.userId },
    { onConflict: "data,conta" },
  );
  if (error) throw new Error(`Falha ao atualizar a conta ${conta}: ${error.message}`);
}

/** Registra uma transferência entre contas e ajusta os saldos do dia (somente admin). */
export const transferirEntreContas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => transferencia.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    if (data.origem === data.destino) {
      throw new Error("Escolha contas diferentes para origem e destino.");
    }

    const { error } = await context.supabase.from("transferencias_contas").insert({
      data: data.data,
      conta_origem: data.origem,
      conta_destino: data.destino,
      valor: data.valor,
      observacoes: data.observacoes || null,
      criado_por: context.userId,
    });
    if (error) throw new Error(`Falha ao registrar a transferência: ${error.message}`);

    await ajustarSaldo(context, data.data, data.origem, -data.valor);
    await ajustarSaldo(context, data.data, data.destino, data.valor);
    await registrarLog(context, "conta_transferencia", {
      data: data.data,
      origem: data.origem,
      destino: data.destino,
      valor: data.valor,
      observacoes: data.observacoes || "",
    });
    return { ok: true };
  });

const aporte = z.object({
  data: z.string().min(8).max(10),
  conta: contaEnum,
  valor: z.number().positive("Informe um valor maior que zero."),
  observacoes: z.string().max(500).optional().default(""),
});

/** Aporte: soma um valor ao saldo de uma conta na data, sem sair de outra conta (somente admin). */
export const aportarConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => aporte.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    await ajustarSaldo(context, data.data, data.conta, data.valor);
    if (data.observacoes) {
      const { data: atual } = await context.supabase
        .from("contas_loterica")
        .select("observacoes")
        .eq("data", data.data)
        .eq("conta", data.conta)
        .maybeSingle();
      const anterior = (atual?.observacoes as string | null) ?? "";
      const nota = `Aporte: ${data.observacoes}`;
      await context.supabase
        .from("contas_loterica")
        .update({ observacoes: anterior ? `${anterior} · ${nota}` : nota })
        .eq("data", data.data)
        .eq("conta", data.conta);
    }
    await registrarLog(context, "conta_aporte", {
      data: data.data,
      conta: data.conta,
      valor: data.valor,
      observacoes: data.observacoes || "",
    });
    return { ok: true };
  });

/** Estorna (remove) uma transferência e devolve os valores às contas (somente admin). */
export const estornarTransferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvo.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { data: t, error: erroBusca } = await context.supabase
      .from("transferencias_contas")
      .select("id, data, conta_origem, conta_destino, valor")
      .eq("id", data.id)
      .maybeSingle();
    if (erroBusca || !t) throw new Error("Transferência não encontrada.");

    const { error } = await context.supabase
      .from("transferencias_contas")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error("Falha ao estornar a transferência.");

    await ajustarSaldo(context, t.data as string, t.conta_origem as string, Number(t.valor));
    await ajustarSaldo(context, t.data as string, t.conta_destino as string, -Number(t.valor));
    await registrarLog(context, "conta_estorno", {
      data: t.data,
      origem: t.conta_origem,
      destino: t.conta_destino,
      valor: Number(t.valor),
    });
    return { ok: true };
  });

/** Histórico de alterações manuais nas contas de uma data (somente admin). */
export const listarHistoricoContas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => filtro.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: linhas, error } = await supabaseAdmin
      .from("activity_logs")
      .select("created_at, user_nome, acao, detalhes")
      .like("acao", "conta_%")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`);
    const eventos = (linhas ?? [])
      .map((l) => ({
        quando: String(l.created_at),
        quem: String(l.user_nome ?? ""),
        acao: String(l.acao),
        detalhes: (l.detalhes ?? {}) as Record<string, string | number | boolean | null>,
      }))
      .filter((e) => String(e.detalhes["data"] ?? "") === data.data);
    return { eventos };
  });

/* ------------------------------------------------------------------ *
 * Conferência com o extrato bancário (043 e 003)                      *
 * ------------------------------------------------------------------ */

const contasBancarias = z.enum(["CONTA 043", "CONTA 003"]);

const movimentoBancario = z.object({
  data: z.string().min(8).max(10),
  conta: contasBancarias,
  sentido: z.enum(["entrada", "saida"]),
  valor: z.number().positive("Informe um valor maior que zero."),
  descricao: z.string().max(200).optional().default(""),
});

const extratoBancario = z.object({
  data: z.string().min(8).max(10),
  conta: contasBancarias,
  saldoInicial: z.number(),
  saldoFinal: z.number(),
});

type ItemValor = { rotulo: string; valor: number };

/**
 * Monta o quadro de entradas/saídas do dia para as contas bancárias,
 * a partir dos fechamentos, linhas das contas, transferências e
 * lançamentos manuais — para conferir contra o extrato do banco.
 */
export const conferenciaBancaria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => filtro.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const dia = data.data;
    const d = new Date(`${dia}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const diaAnterior = d.toISOString().slice(0, 10);

    const { data: fechamentos, error: erroFech } = await context.supabase
      .from("fechamentos")
      .select("data, relatorio, dados")
      .in("data", [dia, diaAnterior]);
    if (erroFech) {
      throw new Error(`Não foi possível carregar os fechamentos: ${erroFech.message}`);
    }

    const fechDoDia = (dt: string) =>
      (fechamentos ?? []).filter((f: { data: string }) => f.data === dt);
    const somaValores = (dt: string, campo: string) =>
      fechDoDia(dt).reduce(
        (s: number, f: { dados: unknown; relatorio: unknown }) => {
          const v = (f.dados as { valores?: Record<string, unknown> } | null)?.valores;
          return s + valorNumerico(v?.[campo]);
        },
        0,
      );
    const somaRelatorio = (dt: string) =>
      fechDoDia(dt).reduce(
        (s: number, f: { relatorio: unknown }) => s + valorNumerico(f.relatorio),
        0,
      );

    const { data: linhas, error: erroLinhas } = await context.supabase
      .from("contas_loterica")
      .select("data, conta, valor")
      .in("data", [dia, diaAnterior])
      .in("conta", ["CONTA CARRO FORTE", "CONTA CARTÃO"]);
    if (erroLinhas) {
      throw new Error(`Não foi possível carregar as contas: ${erroLinhas.message}`);
    }
    const valorLinha = (dt: string, conta: string) =>
      Number(
        (linhas ?? []).find(
          (l: { data: string; conta: string }) => l.data === dt && l.conta === conta,
        )?.valor ?? 0,
      );

    const { data: transferencias, error: erroTransf } = await context.supabase
      .from("transferencias_contas")
      .select("conta_origem, conta_destino, valor")
      .eq("data", dia);
    if (erroTransf) {
      throw new Error(`Não foi possível carregar as transferências: ${erroTransf.message}`);
    }
    const somaTransf = (campo: "conta_origem" | "conta_destino", conta: string) =>
      (transferencias ?? [])
        .filter((t: Record<string, unknown>) => t[campo] === conta)
        .reduce((s: number, t: { valor: unknown }) => s + Number(t.valor ?? 0), 0);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: logs, error: erroLogs } = await supabaseAdmin
      .from("activity_logs")
      .select("id, created_at, user_nome, acao, detalhes")
      .in("acao", ["conta_movimento", "conta_aporte", "extrato_informado"])
      .order("created_at", { ascending: false })
      .limit(500);
    if (erroLogs) {
      throw new Error(`Não foi possível carregar os lançamentos manuais: ${erroLogs.message}`);
    }

    type Det = {
      data?: string;
      conta?: string;
      sentido?: string;
      valor?: number;
      descricao?: string;
      observacoes?: string;
      saldoInicial?: number;
      saldoFinal?: number;
    };
    const doDia = (logs ?? [])
      .map((l: { id: unknown; created_at: unknown; user_nome: unknown; acao: unknown; detalhes: unknown }) => ({
        id: String(l.id),
        quando: String(l.created_at),
        quem: String(l.user_nome ?? ""),
        acao: String(l.acao),
        det: (l.detalhes ?? {}) as Det,
      }))
      .filter((e) => e.det.data === dia);

    const push = (arr: ItemValor[], rotulo: string, valor: number) => {
      if (Math.abs(valor) > 0.004) arr.push({ rotulo, valor });
    };

    const montar = (conta: string): {
      conta: string;
      rotulo: string;
      entradas: ItemValor[];
      saidas: ItemValor[];
      liquido: number;
      movimentos: { id: string; removivel: boolean; quando: string; quem: string; texto: string; valor: number }[];
      extrato: { saldoInicial: number | null; saldoFinal: number | null; quando: string | null };
    } => {
      const entradas: ItemValor[] = [];
      const saidas: ItemValor[] = [];

      if (conta === "CONTA 043") {
        push(entradas, `Pix do fechamento (${dia})`, somaValores(dia, "pix"));
        push(entradas, `Depósito carro forte (${dia})`, valorLinha(dia, "CONTA CARRO FORTE"));
        push(
          entradas,
          `Reembolso prêmio Rasp (${diaAnterior})`,
          somaValores(diaAnterior, "premioRasp"),
        );
        push(entradas, "Transferências recebidas (Banco 003)", somaTransf("conta_destino", conta));
        push(saidas, `Prestação de conta · relatórios (${diaAnterior})`, somaRelatorio(diaAnterior));
        push(saidas, "Transferências enviadas", somaTransf("conta_origem", conta));
      } else {
        push(
          entradas,
          `Cartão PagBank repassado (${diaAnterior})`,
          valorLinha(diaAnterior, "CONTA CARTÃO"),
        );
        push(entradas, "Transferências recebidas", somaTransf("conta_destino", conta));
        push(saidas, "Transferências para o Banco 043", somaTransf("conta_origem", conta));
      }

      const movimentos: { id: string; removivel: boolean; quando: string; quem: string; texto: string; valor: number }[] = [];
      for (const e of doDia) {
        if (e.det.conta !== conta) continue;
        const valor = Math.abs(Number(e.det.valor ?? 0));
        if (e.acao === "conta_aporte") {
          const rot = `Aporte manual${e.det.observacoes ? ` (${e.det.observacoes})` : ""}`;
          push(entradas, rot, valor);
          movimentos.push({ id: e.id, removivel: false, quando: e.quando, quem: e.quem, texto: rot, valor });
        } else if (e.acao === "conta_movimento") {
          const rot = e.det.descricao || "Lançamento manual";
          push(e.det.sentido === "saida" ? saidas : entradas, rot, valor);
          movimentos.push({
            id: e.id,
            removivel: true,
            quando: e.quando,
            quem: e.quem,
            texto: `${e.det.sentido === "saida" ? "Saída" : "Entrada"}: ${rot}`,
            valor,
          });
        }
      }

      const extratoLog = doDia.find((e) => e.acao === "extrato_informado" && e.det.conta === conta);
      const extrato = extratoLog
        ? {
            saldoInicial: Number(extratoLog.det.saldoInicial ?? 0),
            saldoFinal: Number(extratoLog.det.saldoFinal ?? 0),
            quando: extratoLog.quando,
          }
        : { saldoInicial: null, saldoFinal: null, quando: null };

      const liquido = entradas.reduce((s, i) => s + i.valor, 0) - saidas.reduce((s, i) => s + i.valor, 0);
      return {
        conta,
        rotulo: rotuloConta(conta),
        entradas,
        saidas,
        liquido,
        movimentos,
        extrato,
      };
    };

    return {
      data: dia,
      diaAnterior,
      contas: [montar("CONTA 043"), montar("CONTA 003")],
    };
  });

/** Registra um lançamento manual (entrada/saída) em conta bancária. */
export const registrarMovimentoBancario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => movimentoBancario.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    await registrarLog(context, "conta_movimento", {
      data: data.data,
      conta: data.conta,
      sentido: data.sentido,
      valor: data.valor,
      descricao: data.descricao || "",
    });
    return { ok: true };
  });

/** Guarda os saldos informados do extrato para a conferência do dia. */
export const salvarExtratoBancario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => extratoBancario.parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    await registrarLog(context, "extrato_informado", {
      data: data.data,
      conta: data.conta,
      saldoInicial: data.saldoInicial,
      saldoFinal: data.saldoFinal,
    });
    return { ok: true };
  });

/**
 * Exclui um lançamento manual (entrada/saída) da conferência (somente admin).
 * O lançamento só existe no log de auditoria — a exclusão também fica
 * registrada, para não perder o rastro do que foi desfeito.
 */
export const removerMovimentoBancario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: log, error: erroBusca } = await supabaseAdmin
      .from("activity_logs")
      .select("id, acao, detalhes")
      .eq("id", data.id)
      .maybeSingle();
    if (erroBusca) {
      return { ok: false as const, erro: `Não foi possível localizar o lançamento: ${erroBusca.message}` };
    }
    if (!log || log.acao !== "conta_movimento") {
      return { ok: false as const, erro: "Lançamento não encontrado." };
    }
    const { error } = await supabaseAdmin.from("activity_logs").delete().eq("id", data.id);
    if (error) {
      return { ok: false as const, erro: `Não foi possível excluir: ${error.message}` };
    }
    await registrarLog(context, "conta_movimento_removido", {
      removido: (log.detalhes as Record<string, unknown>) ?? {},
    });
    return { ok: true as const, erro: "" };
  });
