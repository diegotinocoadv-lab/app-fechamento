import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ehAdmin } from "@/lib/auth-guard";

/**
 * Integração (somente leitura) com a API oficial do RadarLot.
 * A chave fica apenas no .env do servidor (RADARLOT_CHAVE, começa com rl_live_)
 * e nunca é enviada ao navegador nem gravada em log.
 */
const BASE = "https://api.radarlot.com.br/integracao/v1";

/** Modalidade do RadarLot → modalidade interna do app. */
const MODALIDADES: Record<string, { id: string; nome: string }> = {
  MEGA_SENA: { id: "mega-sena", nome: "Mega-Sena" },
  LOTOFACIL: { id: "lotofacil", nome: "Lotofácil" },
  QUINA: { id: "quina", nome: "Quina" },
  MAIS_MILIONARIA: { id: "+milionaria", nome: "+Milionária" },
  LOTOMANIA: { id: "lotomania", nome: "Lotomania" },
  TIMEMANIA: { id: "timemania", nome: "Timemania" },
  DUPLA_SENA: { id: "dupla-sena", nome: "Dupla Sena" },
  DIA_DE_SORTE: { id: "dia-de-sorte", nome: "Dia de Sorte" },
  SUPER_7: { id: "super-sete", nome: "Super Sete" },
  LOTECA: { id: "loteca", nome: "Loteca" },
};

const ORDEM_MODALIDADE = Object.fromEntries(
  Object.values(MODALIDADES).map((m, i) => [m.id, i]),
) as Record<string, number>;

type LotericaRadar = {
  id: number;
  nome_fantasia?: string | null;
  municipio?: string | null;
  uf?: string | null;
};

type BolaoRadar = {
  codigo_bolao?: unknown;
  modalidade?: unknown;
  concurso?: unknown;
  data_sorteio?: unknown;
  hora_sorteio?: unknown;
  qtd_cota_total?: unknown;
  qtd_cota_disponivel?: unknown;
  cotas_fora_da_vitrine?: unknown;
  valor_cota_sem_tarifa?: unknown;
  tarifa_servico?: unknown;
  valor_cota_com_tarifa?: unknown;
  digital_esgotado?: unknown;
  sorteio_passou?: unknown;
  ativo?: unknown;
  nome_especial?: unknown;
  nome_fantasia?: unknown;
};

type ListaRadar = { boloes?: BolaoRadar[] };

/** Um bolão do RadarLot já no formato que a tela de cadastro entende. */
export type BolaoRadarlot = {
  codigo: string;
  modalidade: string;
  modalidadeId: string;
  modalidadeNome: string;
  concurso: string;
  dataSorteio: string;
  horaSorteio: string;
  totalCotas: number;
  cotasDisponiveis: number;
  cotasForaDaVitrine: number;
  valorSemTarifa: number;
  taxa: number;
  valorComTarifa: number;
  esgotado: boolean;
  nomeEspecial: string;
  loterica: string;
};

export type ResultadoBoloesRadarlot =
  { ok: true; boloes: BolaoRadarlot[]; consultadoEm: string } | { ok: false; erro: string };

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** "MEGA_SENA" → { id: "mega-sena", nome: "Mega-Sena" }; desconhecida vira "outro". */
function modalidadeInterna(bruta: string): { id: string; nome: string } {
  const chave = bruta
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const achada = MODALIDADES[chave];
  if (achada) return achada;
  const nome = bruta
    .trim()
    .toLowerCase()
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(^|\s)\S/g, (l) => l.toUpperCase());
  return { id: "outro", nome: nome || "Bolão" };
}

/** Data ISO do RadarLot; aceita também dd/mm/aaaa por segurança. */
function dataISO(v: unknown): string {
  const s = texto(v);
  if (!s) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : "";
}

function normalizarBolao(b: BolaoRadar, loterica: LotericaRadar): BolaoRadarlot | null {
  if (b.ativo === false || b.sorteio_passou === true) return null;
  const codigo = texto(b.codigo_bolao);
  if (!codigo) return null;

  const bruta = texto(b.modalidade);
  const mod = modalidadeInterna(bruta || "outro");
  const disponiveis = numero(b.qtd_cota_disponivel);
  const total = numero(b.qtd_cota_total);

  return {
    codigo,
    modalidade: bruta,
    modalidadeId: mod.id,
    modalidadeNome: mod.nome,
    concurso: b.concurso === null || b.concurso === undefined ? "" : String(b.concurso),
    dataSorteio: dataISO(b.data_sorteio),
    horaSorteio: texto(b.hora_sorteio),
    totalCotas: total,
    cotasDisponiveis: disponiveis,
    cotasForaDaVitrine: numero(b.cotas_fora_da_vitrine),
    valorSemTarifa: numero(b.valor_cota_sem_tarifa),
    taxa: numero(b.tarifa_servico),
    valorComTarifa: numero(b.valor_cota_com_tarifa),
    esgotado: b.digital_esgotado === true || disponiveis <= 0,
    nomeEspecial: texto(b.nome_especial),
    loterica: texto(loterica.nome_fantasia),
  };
}

function comparar(a: BolaoRadarlot, b: BolaoRadarlot): number {
  const aTem = a.cotasDisponiveis > 0 ? 0 : 1;
  const bTem = b.cotasDisponiveis > 0 ? 0 : 1;
  if (aTem !== bTem) return aTem - bTem;
  const oa = ORDEM_MODALIDADE[a.modalidadeId] ?? 99;
  const ob = ORDEM_MODALIDADE[b.modalidadeId] ?? 99;
  if (oa !== ob) return oa - ob;
  const ca = Number(a.concurso);
  const cb = Number(b.concurso);
  if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return ca - cb;
  return a.codigo.localeCompare(b.codigo);
}

/**
 * Junta as respostas de todas as lotéricas da conta, remove repetidos pelo
 * `codigo_bolao` e ordena: com cota disponível primeiro, depois modalidade e
 * concurso. Função pura — usada pelo server fn e testável sem internet.
 */
export function montarBoloesRadarlot(
  respostas: { loterica: LotericaRadar; lista: ListaRadar }[],
): BolaoRadarlot[] {
  const porCodigo = new Map<string, BolaoRadarlot>();
  for (const { loterica, lista } of respostas) {
    for (const bruto of lista.boloes ?? []) {
      const item = normalizarBolao(bruto, loterica);
      if (item && !porCodigo.has(item.codigo)) porCodigo.set(item.codigo, item);
    }
  }
  return [...porCodigo.values()].sort(comparar);
}

type Falha = { ok: false; erro: string };

/** GET na API do RadarLot. Nunca lança: devolve o motivo em português. */
async function radarGet<T>(caminho: string): Promise<{ ok: true; dados: T } | Falha> {
  const chave = (process.env["RADARLOT_CHAVE"] ?? "").trim();
  if (!chave) {
    return {
      ok: false,
      erro:
        "Integração com o RadarLot ainda não configurada. Adicione RADARLOT_CHAVE no .env " +
        "do servidor e reinicie o sistema.",
    };
  }

  try {
    const r = await fetch(`${BASE}${caminho}`, {
      headers: { Authorization: `Bearer ${chave}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) {
      const motivos: Record<number, string> = {
        400: "O RadarLot recusou os parâmetros da consulta.",
        401: "A chave do RadarLot não foi aceita (inválida ou revogada).",
        403:
          "O RadarLot recusou o acesso: verifique se a assinatura está ativa e se a chave " +
          "é da conta do dono.",
        404: "A lotérica não foi encontrada na sua conta do RadarLot.",
        429: "O RadarLot pediu para esperar: muitas consultas em pouco tempo. Tente em instantes.",
        503: "O RadarLot está ocupado agora. Tente de novo em instantes.",
      };
      return { ok: false, erro: motivos[r.status] ?? `O RadarLot respondeu HTTP ${r.status}.` };
    }
    return { ok: true, dados: (await r.json()) as T };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    if (nome === "TimeoutError" || nome === "AbortError") {
      return { ok: false, erro: "O RadarLot demorou para responder. Tente de novo em instantes." };
    }
    return {
      ok: false,
      erro: "Não foi possível falar com o RadarLot agora. Verifique a internet do servidor.",
    };
  }
}

const cache = new Map<string, { em: number; dados: unknown }>();
const TTL_LISTA = 60_000; // o RadarLot renova os dados a cada ~60 s
const TTL_LOTERICAS = 10 * 60_000;

function doCache<T>(chave: string, ttl: number): T | null {
  const hit = cache.get(chave);
  if (!hit) return null;
  if (Date.now() - hit.em >= ttl) {
    cache.delete(chave);
    return null;
  }
  return hit.dados as T;
}

const alvo = z.object({ forcar: z.boolean().optional().default(false) });

/**
 * Carrega os bolões do RadarLot (somente leitura), sem verificação de admin
 * nem cache de UI. Usado tanto pelo server fn quanto pela sincronização
 * automática em segundo plano.
 */
export async function carregarBoloesRadarlot(
  forcar = false,
): Promise<{ ok: true; boloes: BolaoRadarlot[] } | { ok: false; erro: string }> {
  const chaveCache = "boloes:proximos";
  if (!forcar) {
    const hit = doCache<BolaoRadarlot[]>(chaveCache, TTL_LISTA);
    if (hit) return { ok: true, boloes: hit };
  }

  const lotericas = await radarGet<LotericaRadar[]>("/lotericas");
  if (!lotericas.ok) return lotericas;

  const casas = Array.isArray(lotericas.dados)
    ? lotericas.dados.filter((l) => l && Number.isFinite(Number(l.id)))
    : [];
  if (casas.length === 0) {
    return { ok: false, erro: "Nenhuma lotérica apareceu na conta do RadarLot." };
  }

  // A conta pode acompanhar mais de uma casa; 8 é o teto para não gastar o
  // limite de chamadas da API (2 recargas por segundo).
  const respostas = await Promise.all(
    casas.slice(0, 8).map(async (loterica) => {
      const r = await radarGet<ListaRadar>(`/lotericas/${loterica.id}/boloes?modo=proximos`);
      return { loterica, r };
    }),
  );

  const ok: { loterica: LotericaRadar; lista: ListaRadar }[] = [];
  let primeiroErro = "";
  for (const { loterica, r } of respostas) {
    if (r.ok) ok.push({ loterica, lista: r.dados ?? {} });
    else primeiroErro ||= r.erro;
  }
  if (ok.length === 0) {
    return { ok: false, erro: primeiroErro || "O RadarLot não devolveu nenhum bolão." };
  }

  const boloes = montarBoloesRadarlot(ok);
  cache.set(chaveCache, { em: Date.now(), dados: boloes });
  return { ok: true, boloes };
}

/** Bolões à venda no RadarLot, prontos para importar no cadastro. */
export const listarBoloesRadarlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvo.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<ResultadoBoloesRadarlot> => {
    if (!(await ehAdmin(context))) {
      return { ok: false, erro: "Apenas administradores podem importar bolões do RadarLot." };
    }
    const r = await carregarBoloesRadarlot(data.forcar);
    if (!r.ok) return r;
    return { ok: true, boloes: r.boloes, consultadoEm: new Date().toISOString() };
  });

const alvoManual = z.object({});

/** Dispara a sincronização manual (admin) e devolve quantos bolões novos entraram. */
export const sincronizarRadarlotManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvoManual.parse(input ?? {}))
  .handler(async ({ context }): Promise<{ ok: true; importados: number } | { ok: false; erro: string }> => {
    if (!(await ehAdmin(context))) {
      return { ok: false, erro: "Apenas administradores podem sincronizar o RadarLot." };
    }
    const { sincronizarRadarlotAutomatico } = await import("@/lib/radarlot-sync.server");
    try {
      const n = await sincronizarRadarlotAutomatico();
      return { ok: true, importados: n };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : "Falha na sincronização." };
    }
  });
