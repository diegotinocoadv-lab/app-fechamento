import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ehAdmin } from "@/lib/auth-guard";
import { resolverAlvoBolaoLivre } from "@/lib/loterias-sorteio";

export const TIPOS_LANCAMENTO = ["GAVETA", "CAIXA", "BOLAO", "RELATORIO"] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];

const novo = z.object({
  tipo: z.enum(TIPOS_LANCAMENTO),
  valor: z.number().finite(),
  descricao: z.string().max(200).optional().default(""),
  campo: z.string().max(60).optional().default(""),
  caixaNumero: z.string().max(20).optional().default(""),
  quantidade: z.number().int().min(1).max(10000).optional().default(1),
  taxa: z.number().finite().optional().default(0),
  data: z.string().min(8).max(10).optional().default(""),
  /** Lotes do grupo escolhido no /lancar (mesmo bolão/preço) — baixa neles primeiro. */
  estoqueIds: z.array(z.string().uuid()).max(50).optional().default([]),
  /** Confirma dar baixa no estoque atual quando o concurso não tem lote próprio. */
  confirmarConcurso: z.boolean().optional().default(false),
  /** Administrador: mantém o lançamento mesmo sem baixa (venda atrasada). */
  permitirSemEstoque: z.boolean().optional().default(false),
});

const filtro = z.object({
  data: z.string().max(10).optional().default(""),
  operadorId: z.string().uuid().or(z.literal("")).optional().default(""),
});

const alvo = z.object({ id: z.string().uuid() });

const periodoVendasBoloes = z.object({
  de: z.string().min(8).max(10),
  ate: z.string().min(8).max(10),
  operadorId: z.string().uuid().or(z.literal("")).optional().default(""),
});

/** Campos de depósito que alimentam diretamente a CONTA CARRO FORTE. */
const CAMPOS_DEPOSITO = new Set(["deposito1", "deposito2"]);

/** Soma (ou subtrai, com valor negativo) o valor na conta carro forte da data. */
async function ajustarCarroForte(dataLanc: string, valor: number) {
  if (valor === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: atual } = await supabaseAdmin
    .from("contas_loterica")
    .select("valor")
    .eq("data", dataLanc)
    .eq("conta", "CONTA CARRO FORTE")
    .maybeSingle();
  const novoValor = Number(atual?.valor ?? 0) + valor;
  await supabaseAdmin.from("contas_loterica").upsert(
    {
      data: dataLanc,
      conta: "CONTA CARRO FORTE",
      valor: novoValor,
    },
    { onConflict: "data,conta" },
  );
}

function hoje() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function normNome(s: string | null | undefined) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normConcurso(s: string | null | undefined) {
  return String(s ?? "").replace(/\D+/g, "").replace(/^0+(?=\d)/, "");
}

/**
 * Entende valores numéricos e strings em formato pt-BR ("3,5", "1.234,56").
 * Corrige o caso "1234.56" (ponto decimal sem vírgula), que a leitura antiga
 * transformava em 123456 ao remover todos os pontos.
 */
export function numSrv(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  let n: number;
  if (s.includes(",")) {
    n = Number(s.replace(/\./g, "").replace(",", ".")); // "1.234,56" → 1234.56
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    n = Number(s.replace(/\./g, "")); // "1.234" (milhar) → 1234
  } else {
    n = Number(s); // "1234.56" fica como está
  }
  return Number.isFinite(n) ? n : 0;
}

export type CandidatoLoteBolao = {
  id: string;
  modelo_id?: string | null;
  created_at?: string | null;
  valor_cota?: number | string | null;
  taxa?: number | string | null;
  situacao?: string | null;
};

const mesmoPreco = (a: number | string | null | undefined, b: number) =>
  Math.abs(Number(String(a ?? "").replace(",", ".")) - b) < 0.005;

/** Resultado da baixa automática de estoque. */
export type ResultadoBaixaEstoque = {
  /** Mensagem para exibir/registrar. */
  aviso: string;
  /** Cotas efetivamente baixadas. */
  baixadas: number;
  /** `false` = a baixa não foi aplicada (nada foi gravado). */
  aplicada: boolean;
  /** Motivo quando a baixa não foi aplicada ou merece atenção. */
  falha:
    | "nome_vazio"
    | "sem_estoque"
    | "esgotado"
    | "varios_concursos"
    | "concurso_diferente"
    | "corrida"
    | "erro"
    | "preco_sem_lote"
    | null;
};

/**
 * Ordem dos lotes candidatos para a baixa de estoque:
 * 1. lotes escolhidos explicitamente no /lancar (prioridadeIds/prioridadeId);
 * 2. lote com o MESMO PREÇO da cota (valor; taxa como desempate) — sem isso,
 *    cotas de preços diferentes (10,12 / 121,50 / 154,63...) caem todas no
 *    lote mais antigo e o Controle de Bolões mostra preço errado;
 * 3. lote ATIVO antes do encerrado (mesmo preço);
 * 4. mesmo modelo; 5. mais antigo. Sem valor informado, vale o comportamento
 *    antigo (modelo → antigo).
 */
export function ordemCandidatosLote(
  cands: CandidatoLoteBolao[],
  opts: {
    prioridadeId?: string | null;
    prioridadeIds?: string[] | null;
    modeloId?: string | null;
    valor?: number | null;
    taxa?: number | null;
  },
): number[] {
  const temValor = typeof opts.valor === "number" && Number.isFinite(opts.valor) && opts.valor > 0;
  const temTaxa = typeof opts.taxa === "number" && Number.isFinite(opts.taxa) && opts.taxa > 0;
  const prioridades = new Set<string>([
    ...(opts.prioridadeIds ?? []),
    ...(opts.prioridadeId ? [opts.prioridadeId] : []),
  ]);
  const nivelPreco = (i: number): number => {
    if (!temValor) return 2;
    const c = cands[i];
    if (!c || !mesmoPreco(c.valor_cota, opts.valor as number)) return 2;
    if (temTaxa && mesmoPreco(c.taxa, opts.taxa as number)) return 0;
    return 1;
  };
  return cands
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = cands[a]?.id && prioridades.has(String(cands[a]?.id)) ? 0 : 1;
      const pb = cands[b]?.id && prioridades.has(String(cands[b]?.id)) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const na = nivelPreco(a);
      const nb = nivelPreco(b);
      if (na !== nb) return na - nb;
      const sa = cands[a]?.situacao === "encerrado" ? 1 : 0;
      const sb = cands[b]?.situacao === "encerrado" ? 1 : 0;
      if (sa !== sb) return sa - sb;
      const ma = cands[a]?.modelo_id === opts.modeloId ? 0 : 1;
      const mb = cands[b]?.modelo_id === opts.modeloId ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return String(cands[a]?.created_at ?? "").localeCompare(
        String(cands[b]?.created_at ?? ""),
      );
    });
}

/** Exportado: o fechamento também baixa o estoque das linhas manuais da tabela. */
export async function baixarEstoqueOperador(opts: {
  modeloId: string | null;
  nome: string;
  concurso: string;
  quantidade: number;
  data: string;
  operadorId: string;
  operadorNome: string | null;
  lancamentoId: string;
  /** Lote de estoque escolhido no /lancar — baixa primeiro nele. */
  prioridadeId?: string | null;
  /** Todos os lotes do grupo escolhido no /lancar (mesmo bolão/preço). */
  prioridadeIds?: string[] | null;
  /** Valor da cota lançado — a baixa vai no lote com esse preço. */
  valor?: number | null;
  /** Taxa da cota lançada — desempate entre lotes com o mesmo valor. */
  taxa?: number | null;
  /** Confirma baixar no estoque atual quando o concurso informado não tem lote. */
  confirmarConcursoDiferente?: boolean;
}): Promise<ResultadoBaixaEstoque> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let alvoNome = normNome(opts.nome);
  let alvoConcurso = normConcurso(opts.concurso);
  let sufixo = alvoConcurso ? ` (concurso ${alvoConcurso})` : "";

  const falhou = (
    aviso: string,
    falha: ResultadoBaixaEstoque["falha"],
  ): ResultadoBaixaEstoque => ({ aviso, baixadas: 0, aplicada: false, falha });

  if (!alvoNome) return falhou("Descrição do bolão vazia.", "nome_vazio");
  const { data: linhas } = await supabaseAdmin
    .from("estoque_boloes")
    .select("id, modelo_id, nome, concurso, cotas, created_at, valor_cota, taxa, situacao")
    .in("situacao", ["ativo", "encerrado"])
    .order("created_at", { ascending: true });
  let cands = (linhas ?? []).filter((l) => normNome(l.nome) === alvoNome);
  if (cands.length === 0) {
    // Descrição livre do /lancar ("MEGA 3071", "Dupla 3021"): reconhece a
    // modalidade pelo texto e o concurso pelos dígitos, para dar baixa mesmo
    // quando o operador digita nome + concurso em um campo só.
    const livre = resolverAlvoBolaoLivre(opts.nome);
    if (livre) {
      alvoNome = normNome(livre.nome);
      if (!alvoConcurso) alvoConcurso = normConcurso(livre.concurso);
      sufixo = alvoConcurso ? ` (concurso ${alvoConcurso})` : "";
      cands = (linhas ?? []).filter(
        (l) => normNome((l as { nome: string }).nome) === alvoNome,
      );
    }
  }
  if (cands.length === 0) {
    return falhou(`Sem estoque de ${opts.nome}${sufixo}.`, "sem_estoque");
  }

  let concursoFallback = false;
  if (alvoConcurso) {
    const porConcurso = cands.filter((l) => normConcurso(l.concurso) === alvoConcurso);
    if (porConcurso.length === 0) {
      // O lote pode estar com um concurso antigo (estoque ainda não rolado para
      // a rodada atual). Só dá baixa no estoque atual depois da confirmação.
      if (!opts.confirmarConcursoDiferente) {
        const concursos = [
          ...new Set(cands.map((l) => String(l.concurso ?? "").trim()).filter(Boolean)),
        ];
        const nota = concursos.length ? ` Lotes disponíveis: ${concursos.join(", ")}.` : "";
        return falhou(
          `O concurso ${alvoConcurso} não tem lote de ${opts.nome}.${nota} ` +
            "Confirme para dar baixa no estoque atual.",
          "concurso_diferente",
        );
      }
      concursoFallback = true;
    } else {
      cands = porConcurso;
    }
  } else {
    const concursos = new Set(cands.map((l) => normConcurso(l.concurso)).filter(Boolean));
    if (concursos.size > 1) {
      return falhou(
        `Vários concursos ativos de ${opts.nome} — informe o concurso para dar baixa no estoque.`,
        "varios_concursos",
      );
    }
  }

  const { data: vendas } = await supabaseAdmin
    .from("estoque_boloes_vendas")
    .select("estoque_id, quantidade")
    .limit(10000);
  const vendidasPorEstoque = new Map<string, number>();
  for (const v of vendas ?? []) {
    vendidasPorEstoque.set(
      v.estoque_id as string,
      (vendidasPorEstoque.get(v.estoque_id as string) ?? 0) + Number(v.quantidade ?? 0),
    );
  }
  const disponiveis = cands.map((l) =>
    Math.max(0, Number(l.cotas ?? 0) - (vendidasPorEstoque.get(l.id as string) ?? 0)),
  );
  const totalDisponivel = disponiveis.reduce((s, d) => s + d, 0);
  if (totalDisponivel === 0) {
    return falhou(`Estoque esgotado de ${opts.nome}${sufixo}.`, "esgotado");
  }
  if (opts.quantidade > totalDisponivel) {
    return falhou(
      `Estoque insuficiente de ${opts.nome}${sufixo}: restam ${totalDisponivel} cota(s).`,
      "esgotado",
    );
  }

  const temValor = typeof opts.valor === "number" && Number.isFinite(opts.valor) && opts.valor > 0;
  const semLotePreco =
    temValor &&
    !cands.some((l) => mesmoPreco(l.valor_cota, opts.valor as number));
  const brlNum = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
  const notaPreco = semLotePreco
    ? ` Nenhum lote de ${opts.nome}${sufixo} com valor ${brlNum(opts.valor as number)} — baixado no lote mais antigo.`
    : "";

  const ordem = ordemCandidatosLote(cands, opts);

  let restante = opts.quantidade;
  let baixadas = 0;
  type VendaEstoqueInsert = {
    estoque_id: string;
    quantidade: number;
    canal: "LOJA";
    data: string;
    operador_id: string;
    operador_nome: string | null;
    observacoes: string;
  };
  const inserts: VendaEstoqueInsert[] = [];
  for (const i of ordem) {
    if (restante <= 0) break;
    const linha = cands[i];
    const disp = disponiveis[i] ?? 0;
    if (!linha || disp <= 0) continue;
    const take = Math.min(disp, restante);
    inserts.push({
      estoque_id: linha.id,
      quantidade: take,
      canal: "LOJA",
      data: opts.data,
      operador_id: opts.operadorId,
      operador_nome: opts.operadorNome,
      observacoes: `lanc:${opts.lancamentoId}`,
    });
    restante -= take;
    baixadas += take;
  }

  if (restante > 0) {
    return falhou(
      `Estoque insuficiente de ${opts.nome}${sufixo}: restam ${baixadas} cota(s).`,
      "esgotado",
    );
  }

  if (inserts.length > 0) {
    const { data: criadas, error } = await supabaseAdmin
      .from("estoque_boloes_vendas")
      .insert(inserts)
      .select("id");
    if (error) return falhou(`Falha ao dar baixa no estoque: ${error.message}`, "erro");
    // Revalida depois de inserir: não há lock no banco, então duas vendas
    // simultâneas podem passar na checagem de saldo. Se o total estourou as
    // cotas, desfaz as linhas desta baixa para o estoque nunca ficar negativo.
    const idsLote = Array.from(new Set(inserts.map((i) => i.estoque_id)));
    const { data: depois } = await supabaseAdmin
      .from("estoque_boloes_vendas")
      .select("estoque_id, quantidade")
      .in("estoque_id", idsLote);
    const soma = new Map<string, number>();
    for (const d of (depois ?? []) as Array<{ estoque_id: string; quantidade: number }>) {
      const k = String(d.estoque_id);
      soma.set(k, (soma.get(k) ?? 0) + Number(d.quantidade ?? 0));
    }
    const estourou = (cands as Array<{ id: string; cotas: number }>).some(
      (l) => (soma.get(String(l.id)) ?? 0) > Number(l.cotas ?? 0),
    );
    if (estourou) {
      const idsCriadas = ((criadas ?? []) as Array<{ id: string }>).map((c) => String(c.id));
      if (idsCriadas.length > 0) {
        await supabaseAdmin.from("estoque_boloes_vendas").delete().in("id", idsCriadas);
      }
      return falhou(
        `Corrida no estoque de ${opts.nome}${sufixo} — baixa não aplicada, tente novamente.`,
        "corrida",
      );
    }
  }

  if (concursoFallback) {
    return {
      aviso:
        `Baixa no estoque do bolão ${opts.nome}: ${baixadas} cota(s) ` +
        `(o concurso ${alvoConcurso} não tinha lote próprio).` +
        notaPreco,
      baixadas,
      aplicada: true,
      falha: null,
    };
  }
  if (semLotePreco) {
    // Prefixo diferente de "Baixa automática": vira log auditável + toast,
    // para o preço digitado sem lote correspondente não passar despercebido.
    const usado = cands.find((c) => c.id === inserts[0]?.estoque_id);
    return {
      aviso:
        `Preço sem lote: ${baixadas} cota(s) de ${opts.nome}${sufixo} baixadas no lote de ` +
        `${brlNum(Number(usado?.valor_cota ?? 0))} — nenhum lote com ${brlNum(opts.valor as number)}.`,
      baixadas,
      aplicada: true,
      falha: "preco_sem_lote",
    };
  }
  return {
    aviso: `Baixa automática no estoque: ${baixadas} cota(s).`,
    baixadas,
    aplicada: true,
    falha: null,
  };
}

async function estornarEstoqueOperador(lancamentoId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("estoque_boloes_vendas")
    .delete()
    .eq("observacoes", `lanc:${lancamentoId}`);
}

/**
 * Persiste em activity_logs quando a baixa automática de estoque não saiu
 * limpa (sem estoque, esgotado, corrida, baixa parcial...). O aviso exibido no
 * toast some; este registro é o rastro auditável da falha.
 */
async function registrarLogBaixa(opts: {
  userId: string;
  userName: string | null;
  lancamentoId: string;
  aviso: string;
  nome: string;
  concurso: string;
  quantidade: number;
  data: string;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("activity_logs").insert({
      user_id: opts.userId,
      user_nome: opts.userName,
      acao: "baixa_estoque_falhou",
      detalhes: {
        lancamentoId: opts.lancamentoId,
        aviso: opts.aviso,
        nome: opts.nome,
        concurso: opts.concurso,
        quantidade: opts.quantidade,
        data: opts.data,
      } as never,
    } as never);
  } catch (e) {
    console.error("[lancamentos] Falha ao registrar log de baixa:", e);
  }
}

/** Registra um lançamento rápido (gaveta ou caixa) do operador logado. */
export const registrarLancamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => novo.parse(input))
  .handler(async ({ data, context }) => {
    if (!Number.isFinite(data.valor) || data.valor === 0) {
      return { ok: false as const, erro: "Informe um valor diferente de zero." };
    }

    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("nome, email")
      .eq("id", context.userId)
      .maybeSingle();

    const dataLanc = data.data || hoje();
    const { data: criado, error } = await context.supabase
      .from("lancamentos_simples")
      .insert({
        tipo: data.tipo,
        valor: data.valor,
        descricao: data.descricao || null,
        campo: data.campo || null,
        caixa_numero: data.caixaNumero || null,
        quantidade: data.quantidade,
        taxa: data.taxa || 0,
        data: dataLanc,
        operador_id: context.userId,
        operador_nome: perfil?.nome || perfil?.email || null,
      })
      .select("id")
      .single();
    if (error) return { ok: false as const, erro: `Não foi possível lançar: ${error.message}` };

    // Depósito 1 e 2 entram direto no carro forte do dia.
    if (CAMPOS_DEPOSITO.has(data.campo)) {
      await ajustarCarroForte(dataLanc, data.valor);
    }

    if (data.tipo === "BOLAO") {
      const porModelo = data.campo.startsWith("bolao:") && data.campo !== "bolao:manual";
      let nome = "";
      let concurso = "";
      let prioridadeId: string | null = null;
      if (porModelo) {
        const modeloId = data.campo.slice("bolao:".length);
        // Estoque novo (sistema atual): o id é do lote em estoque_boloes.
        const { data: est } = await context.supabase
          .from("estoque_boloes")
          .select("id, nome, concurso")
          .eq("id", modeloId)
          .maybeSingle();
        if (est) {
          nome = String(est.nome ?? "");
          concurso = data.descricao || String(est.concurso ?? "");
          prioridadeId = est.id as string;
        } else {
          // Modelo antigo (boloes_estoque): baixa por nome + concurso digitado.
          const { data: modelo } = await context.supabase
            .from("boloes_estoque")
            .select("concurso")
            .eq("id", modeloId)
            .maybeSingle();
          if (!modelo) {
            await context.supabase
              .from("lancamentos_simples")
              .delete()
              .eq("id", String((criado as { id: string }).id));
            return {
              ok: false as const,
              erro: "Modelo do bolão não encontrado. Atualize a lista e tente novamente.",
              falha: "sem_estoque" as const,
            };
          }
          nome = String(modelo.concurso ?? "");
          concurso = data.descricao;
        }
      } else {
        nome = data.descricao;
      }
      const baixa = await baixarEstoqueOperador({
        modeloId: porModelo ? data.campo.slice("bolao:".length) : null,
        nome,
        concurso,
        quantidade: data.quantidade,
        data: dataLanc,
        operadorId: context.userId,
        operadorNome: perfil?.nome || perfil?.email || null,
        lancamentoId: String((criado as { id: string }).id),
        prioridadeId,
        prioridadeIds: data.estoqueIds,
        valor: data.valor,
        taxa: data.taxa,
        confirmarConcursoDiferente: data.confirmarConcurso,
      });
      const perfilInfo = perfil as { nome?: string; email?: string } | null;
      if (!baixa.aplicada) {
        // Sem estoque / esgotado / concurso diferente / corrida: a venda não
        // fica "solta". Remove o lançamento e devolve o motivo para a tela.
        let permitir = false;
        if (data.permitirSemEstoque) {
          permitir = await ehAdmin(context);
        }
        const manterSemBaixa =
          permitir && baixa.falha !== "erro" && baixa.falha !== "corrida";
        if (!manterSemBaixa) {
          await context.supabase
            .from("lancamentos_simples")
            .delete()
            .eq("id", String((criado as { id: string }).id));
          return { ok: false as const, erro: baixa.aviso, falha: baixa.falha };
        }
        await registrarLogBaixa({
          userId: context.userId,
          userName: perfilInfo?.nome || perfilInfo?.email || null,
          lancamentoId: String((criado as { id: string }).id),
          aviso: baixa.aviso,
          nome,
          concurso,
          quantidade: data.quantidade,
          data: dataLanc,
        });
        return { ok: true as const, aviso: baixa.aviso, semBaixa: true };
      }
      // Toda baixa que não foi limpa ("Baixa automática no estoque: N")
      // vira registro auditável — o toast sozinho se perde.
      if (baixa.aviso && !baixa.aviso.startsWith("Baixa automática")) {
        await registrarLogBaixa({
          userId: context.userId,
          userName: perfilInfo?.nome || perfilInfo?.email || null,
          lancamentoId: String((criado as { id: string }).id),
          aviso: baixa.aviso,
          nome,
          concurso,
          quantidade: data.quantidade,
          data: dataLanc,
        });
      }
      return { ok: true as const, aviso: baixa.aviso };
    }

    return { ok: true as const, aviso: "" };
  });

/** Lista os lançamentos rápidos do dia (operador vê os seus; admin vê todos). */
export const listarLancamentosSimples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => filtro.parse(input))
  .handler(async ({ data, context }) => {
    const dia = data.data || hoje();

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const admin = Boolean(isAdmin);

    let query = context.supabase
      .from("lancamentos_simples")
      .select(
        "id, tipo, valor, descricao, campo, caixa_numero, quantidade, taxa, data, operador_nome, operador_id",
      )
      .eq("data", dia);
    if (!admin) {
      query = query.eq("operador_id", context.userId);
    } else if (data.operadorId) {
      // Admin pode filtrar por operador para conferir um caixa sem misturar os demais.
      query = query.eq("operador_id", data.operadorId);
    }
    const { data: linhas, error } = await query
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(`Não foi possível carregar os lançamentos: ${error.message}`);

    const lancamentos = (linhas ?? []).map((l) => ({
      id: l.id as string,
      tipo: l.tipo as TipoLancamento,
      valor: Number(l.valor ?? 0),
      descricao: (l.descricao as string | null) ?? "",
      campo: (l.campo as string | null) ?? "",
      caixaNumero: (l.caixa_numero as string | null) ?? "",
      quantidade: Number(l.quantidade ?? 1),
      taxa: Number(l.taxa ?? 0),
      data: l.data as string,
      operador: (l.operador_nome as string | null) ?? "—",
      operadorId: (l.operador_id as string | null) ?? "",
      meu: l.operador_id === context.userId,
    }));

    return {
      data: dia,
      admin,
      lancamentos,
      totalGaveta: lancamentos
        .filter((l) => l.tipo === "GAVETA")
        .reduce((s, l) => s + l.valor, 0),
      totalCaixa: lancamentos.filter((l) => l.tipo === "CAIXA").reduce((s, l) => s + l.valor, 0),
      totalBolaoCotas: lancamentos
        .filter((l) => l.tipo === "BOLAO")
        .reduce((s, l) => s + l.quantidade, 0),
      totalRelatorio: lancamentos
        .filter((l) => l.tipo === "RELATORIO")
        .reduce((s, l) => s + l.valor, 0),
    };
  });

/**
 * Relatório de vendas de bolões por operador.
 * Fontes: fechamentos do período (totais manuais + rápidos) e, apenas para
 * dias sem fechamento do operador, lançamentos tipo BOLAO do /lancar.
 * Evita duplicar o que já entrou no fechamento.
 */
export const relatorioVendasBoloes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoVendasBoloes.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const admin = Boolean(isAdmin);

    const normNome = (s: string | null | undefined) =>
      String(s ?? "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");

    // Resolve o filtro de operador (id + nome normalizado) para casar fechamentos
    // gravados com "funcionario" quando o user_id do fechamento é do admin.
    let filtroId = "";
    let filtroNome = "";
    if (!admin) {
      filtroId = context.userId;
      const { data: meu } = await context.supabase
        .from("profiles")
        .select("nome")
        .eq("id", context.userId)
        .maybeSingle();
      filtroNome = normNome(meu?.nome);
    } else if (data.operadorId) {
      filtroId = data.operadorId;
      const { data: perf } = await context.supabase
        .from("profiles")
        .select("nome")
        .eq("id", data.operadorId)
        .maybeSingle();
      filtroNome = normNome(perf?.nome);
    }

    const { data: perfis } = await context.supabase.from("profiles").select("id, nome");
    const nomeParaId = new Map<string, string>();
    for (const p of (perfis ?? []) as Array<{ id: string; nome: string | null }>) {
      const n = normNome(p.nome);
      if (n) nomeParaId.set(n, p.id);
    }

    type Dia = { data: string; cotas: number; valor: number; taxa: number; mkpCotas: number; mkpValor: number };
    type Op = {
      operadorId: string;
      operador: string;
      cotas: number;
      valor: number;
      taxa: number;
      dias: Dia[];
    };

    const ops = new Map<string, Op>();
    const porDia = new Map<string, Dia>();
    type BolaoMes = { bolao: string; cotas: number; valor: number; taxa: number };
    const porBolao = new Map<string, BolaoMes>();
    const somaBolao = (rotulo: string, cotas: number, valor: number, taxa: number) => {
      if (cotas <= 0 && valor <= 0 && taxa <= 0) return;
      const chave = normNome(rotulo);
      if (!chave) return;
      let b = porBolao.get(chave);
      if (!b) {
        b = { bolao: rotulo.trim(), cotas: 0, valor: 0, taxa: 0 };
        porBolao.set(chave, b);
      }
      b.cotas += cotas;
      b.valor += valor;
      b.taxa += taxa;
    };
    let totalCotas = 0;
    let totalValor = 0;
    let totalTaxa = 0;
    let fontes = 0;

    // 0) Vendas MKP do período: o marketplace é uma "operadora à parte" —
    //    não soma nos totais de loja. Os lançamentos ligados a vendas MKP
    //    (observacoes lanc:<id>) ficam de fora do passo 2 e o MKP entra
    //    como operador próprio no passo 3.
    const { data: vendsCanal } = await context.supabase
      .from("estoque_boloes_vendas")
      .select("canal, quantidade, data, observacoes, estoque_boloes(valor_cota, taxa)")
      .gte("data", data.de)
      .lte("data", data.ate)
      .limit(10000);
    type VendaCanal = {
      canal: string | null;
      quantidade: number | string | null;
      data: string | null;
      observacoes: string | null;
      estoque_boloes: { valor_cota?: number | string; taxa?: number | string } | null;
    };
    const mkpLancIds = new Set<string>();
    const vendasMkp: Array<{ data: string; qtd: number; valor: number; taxa: number }> = [];
    for (const v of (vendsCanal ?? []) as VendaCanal[]) {
      if (v.canal !== "MARKETPLACE") continue;
      const m = /^lanc:([0-9a-fA-F-]{36})/.exec(String(v.observacoes ?? ""));
      if (m) mkpLancIds.add(String(m[1]).toLowerCase());
      const qtd = Number(v.quantidade ?? 0);
      if (qtd <= 0) continue;
      vendasMkp.push({
        data: String(v.data ?? ""),
        qtd,
        valor: qtd * Number(v.estoque_boloes?.valor_cota ?? 0),
        taxa: qtd * Number(v.estoque_boloes?.taxa ?? 0),
      });
    }

    const acumular = (opId: string, opNome: string, dia: string, cotas: number, valor: number, taxa: number) => {
      if (cotas <= 0 && valor <= 0 && taxa <= 0) return;
      totalCotas += cotas;
      totalValor += valor;
      totalTaxa += taxa;

      let diaGeral = porDia.get(dia);
      if (!diaGeral) {
        diaGeral = { data: dia, cotas: 0, valor: 0, taxa: 0, mkpCotas: 0, mkpValor: 0 };
        porDia.set(dia, diaGeral);
      }
      diaGeral.cotas += cotas;
      diaGeral.valor += valor;
      diaGeral.taxa += taxa;

      let op = ops.get(opId);
      if (!op) {
        op = { operadorId: opId, operador: opNome, cotas: 0, valor: 0, taxa: 0, dias: [] };
        ops.set(opId, op);
      }
      op.cotas += cotas;
      op.valor += valor;
      op.taxa += taxa;

      let diaOp = op.dias.find((d) => d.data === dia);
      if (!diaOp) {
        diaOp = { data: dia, cotas: 0, valor: 0, taxa: 0, mkpCotas: 0, mkpValor: 0 };
        op.dias.push(diaOp);
      }
      diaOp.cotas += cotas;
      diaOp.valor += valor;
      diaOp.taxa += taxa;
    };

    // 1) Fechamentos do período (já somam bolões manuais + rápidos do dia).
    let fq = context.supabase
      .from("fechamentos")
      .select(
        "id, data, funcionario, user_id, total_bolao_quant, total_bolao_valor, total_bolao_taxa, dados",
      )
      .gte("data", data.de)
      .lte("data", data.ate)
      .limit(1000);
    const { data: fecs, error: erroFec } = await fq;
    if (erroFec) throw new Error(`Não foi possível carregar os fechamentos: ${erroFec.message}`);

    const coberto = new Set<string>(); // `${data}|${nomeFuncionario}`
    for (const f of (fecs ?? []) as Array<{
      data: string;
      funcionario: string | null;
      user_id: string | null;
      total_bolao_quant: number | string | null;
      total_bolao_valor: number | string | null;
      total_bolao_taxa: number | string | null;
      dados: unknown;
    }>) {
      const nome = String(f.funcionario ?? "").trim() || "Operador";
      const nNome = normNome(nome);
      if (filtroId) {
        const idMatch = f.user_id === filtroId;
        const nomeMatch = filtroNome ? nNome === filtroNome : false;
        if (!idMatch && !nomeMatch) continue;
      }
      coberto.add(`${f.data}|${nNome}`);
      const opId = nomeParaId.get(nNome) || f.user_id || `fn:${nNome}`;
      acumular(
        opId,
        nome,
        f.data,
        Number(f.total_bolao_quant ?? 0),
        Number(f.total_bolao_valor ?? 0),
        Number(f.total_bolao_taxa ?? 0),
      );
      // Detalhe por bolão gravado no fechamento (dados.boloes: concurso/valor/taxa/quant).
      const boloesDados = (f.dados as { boloes?: Array<Record<string, unknown>> } | null)?.boloes;
      for (const b of boloesDados ?? []) {
        const rot = String(b?.["concurso"] ?? "").trim();
        if (!rot) continue;
        const cq = numSrv(b?.["quant"]);
        somaBolao(rot, cq, numSrv(b?.["valor"]) * cq, numSrv(b?.["taxa"]) * cq);
      }
      fontes += 1;
    }

    // 2) Lançamentos BOLAO: apenas dias/operadores sem fechamento no período.
    let lq = context.supabase
      .from("lancamentos_simples")
      .select("id, data, valor, quantidade, taxa, operador_id, operador_nome, campo, descricao")
      .eq("tipo", "BOLAO")
      .gte("data", data.de)
      .lte("data", data.ate)
      .limit(5000);
    if (filtroId) lq = lq.eq("operador_id", filtroId);
    const { data: linhas, error: erroL } = await lq.order("data", { ascending: true });
    if (erroL) throw new Error(`Não foi possível carregar o relatório: ${erroL.message}`);

    type LancBolao = {
      id: string | null;
      data: string | null;
      valor: number | string | null;
      quantidade: number | string | null;
      taxa: number | string | null;
      operador_id: string | null;
      operador_nome: string | null;
      campo: string | null;
      descricao: string | null;
    };
    const pendentes: LancBolao[] = [];
    for (const l of (linhas ?? []) as LancBolao[]) {
      // Lançamento de venda MKP: não pertence à operadora de loja.
      if (l.id && mkpLancIds.has(String(l.id).toLowerCase())) continue;
      const nome = String(l.operador_nome ?? "").trim() || "—";
      const nNome = normNome(nome);
      if (coberto.has(`${l.data}|${nNome}`)) continue;
      if (filtroNome && nNome !== filtroNome && l.operador_id !== filtroId) continue;
      pendentes.push(l);
    }

    // Rótulos dos estoques referenciados (campo bolao:<id>) para o detalhe por bolão.
    const idsEstoque = new Set<string>();
    for (const l of pendentes) {
      const campo = String(l.campo ?? "");
      if (campo.startsWith("bolao:") && campo !== "bolao:manual") idsEstoque.add(campo.slice(6));
    }
    const rotuloEstoque = new Map<string, string>();
    if (idsEstoque.size > 0) {
      const { data: ests } = await context.supabase
        .from("estoque_boloes")
        .select("id, nome, concurso")
        .in("id", [...idsEstoque]);
      for (const e of (ests ?? []) as Array<{
        id: string;
        nome: string | null;
        concurso: string | null;
      }>) {
        const nome = String(e.nome ?? "").trim();
        const conc = String(e.concurso ?? "").trim();
        rotuloEstoque.set(e.id, `${nome}${conc ? ` — ${conc}` : ""}`.trim());
      }
    }

    for (const l of pendentes) {
      const nome = String(l.operador_nome ?? "").trim() || "—";
      const nNome = normNome(nome);
      const quant = Number(l.quantidade ?? 1);
      const valor = Number(l.valor ?? 0) * quant;
      const taxa = Number(l.taxa ?? 0) * quant;
      const opId = String(l.operador_id || nomeParaId.get(nNome) || `lanc:${nNome}`);
      acumular(opId, nome, String(l.data ?? ""), quant, valor, taxa);
      const campo = String(l.campo ?? "");
      const rotulo =
        campo === "bolao:manual"
          ? String(l.descricao ?? "").trim() || "Bolão manual"
          : rotuloEstoque.get(campo.slice(6)) || String(l.descricao ?? "").trim() || "Bolão";
      somaBolao(rotulo, quant, valor, taxa);
      fontes += 1;
    }

    // 3) MKP como operadora à parte (visão "Todas"): entra com cotas, valor,
    //    taxa e dias próprios, sem somar nas operadoras de loja.
    if (!filtroId) {
      for (const v of vendasMkp) {
        acumular("__mkp__", "MKP", v.data, v.qtd, v.valor, v.taxa);
        const diaGeral = porDia.get(v.data);
        if (diaGeral) {
          diaGeral.mkpCotas += v.qtd;
          diaGeral.mkpValor += v.valor;
        }
        fontes += 1;
      }
    }

    let totalMkpCotas = 0;
    let totalMkpValor = 0;
    let totalMkpTaxa = 0;
    const opMkp = ops.get("__mkp__");
    if (opMkp) {
      totalMkpCotas = opMkp.cotas;
      totalMkpValor = opMkp.valor;
      totalMkpTaxa = opMkp.taxa;
    }

    return {
      admin,
      de: data.de,
      ate: data.ate,
      lancamentos: fontes,
      operadores: [...ops.values()].sort((a, b) => b.valor - a.valor),
      dias: [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data)),
      porBolao: [...porBolao.values()].sort((a, b) => b.valor - a.valor),
      total: {
        cotas: totalCotas,
        valor: totalValor,
        taxa: totalTaxa,
        mkpCotas: totalMkpCotas,
        mkpValor: totalMkpValor,
        mkpTaxa: totalMkpTaxa,
      },
    };
  });

/** Exclui um lançamento rápido (o próprio, ou qualquer um se administrador). */
export const removerLancamentoSimples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvo.parse(input))
  .handler(async ({ data, context }) => {
    // Lê o lançamento antes de excluir para estornar o carro forte, se for depósito.
    const { data: lanc } = await context.supabase
      .from("lancamentos_simples")
      .select("campo, valor, data, operador_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!lanc) return { ok: false as const, erro: "Lançamento não encontrado." };

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin && lanc.operador_id !== context.userId) {
      return { ok: false as const, erro: "Você só pode excluir seus próprios lançamentos." };
    }

    const { error } = await context.supabase
      .from("lancamentos_simples")
      .delete()
      .eq("id", data.id);
    if (error) return { ok: false as const, erro: `Não foi possível excluir: ${error.message}` };

    if (lanc && CAMPOS_DEPOSITO.has(String(lanc.campo ?? ""))) {
      await ajustarCarroForte(String(lanc.data), -Number(lanc.valor ?? 0));
    }
    await estornarEstoqueOperador(data.id);
    return { ok: true as const, erro: "" };
  });
