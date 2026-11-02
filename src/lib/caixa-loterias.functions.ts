import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  achaModalidade,
  concursoParaData,
  dataDoConcursoAritmetica,
  getModalidade,
} from "@/lib/loterias-sorteio";

/** Modalidade do app → slug da API oficial da Caixa (testados em 07/10/2026). */
const SLUG_CAIXA: Record<string, string> = {
  "mega-sena": "megasena",
  lotofacil: "lotofacil",
  quina: "quina",
  lotomania: "lotomania",
  "dupla-sena": "duplasena",
  timemania: "timemania",
  "dia-de-sorte": "diadesorte",
  "super-sete": "supersete",
  "+milionaria": "maismilionaria",
  federal: "federal",
  loteca: "loteca",
};

export type ResultadoConcurso =
  | { ok: true; concurso: number; data: string }
  | { ok: false; erro: string };

type Resultado = ResultadoConcurso;

type RespostaCaixa = {
  numeroConcursoProximo?: unknown;
  dataProximoConcurso?: unknown;
  numero?: unknown;
  dataApuracao?: unknown;
  listaDezenas?: unknown;
  dezenasSorteadasOrdemSorteio?: unknown;
};

const cache = new Map<string, { em: number; res: Resultado }>();
const TTL_OK = 5 * 60_000;
const TTL_ERRO = 60_000;

const CABECALHOS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

/**
 * Fontes em ordem: direto na Caixa (funciona na maioria das redes) e, se o
 * IP for bloqueado (403 da Azion, como na VPS), via leitor público r.jina.ai
 * — que responde 403 se mandarmos cabeçalho de navegador falso, por isso vai sem.
 */
const fontes = (slug: string) => {
  const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/${slug}`;
  return [
    { url, cabecalhos: CABECALHOS },
    { url: `https://r.jina.ai/${url}`, cabecalhos: undefined },
  ];
};

/** Aceita JSON puro ou o formato do leitor (cabeçalho + JSON). */
function extrairJson(txt: string): RespostaCaixa {
  try {
    return JSON.parse(txt) as RespostaCaixa;
  } catch {
    /* tenta extrair abaixo */
  }
  const i = txt.indexOf("{");
  if (i < 0) throw new Error("resposta sem JSON");
  const limpo = txt.slice(i).replace(/```[a-z]*/gi, "");
  try {
    return JSON.parse(limpo) as RespostaCaixa;
  } catch {
    /* tenta recortar o último bloco */
  }
  const f = limpo.lastIndexOf("}");
  if (f < 0) throw new Error("resposta sem JSON");
  return JSON.parse(limpo.slice(0, f + 1)) as RespostaCaixa;
}

const alvo = z.object({
  modalidade: z.string().max(40),
  forcar: z.boolean().optional().default(false),
});

async function consultar(slug: string): Promise<Resultado> {
  let motivo = "falha na consulta";
  let ordem = 0;
  for (const fonte of fontes(slug)) {
    const primeira = ordem === 0;
    ordem++;
    try {
      const init: RequestInit = { signal: AbortSignal.timeout(15000) };
      if (fonte.cabecalhos) init.headers = fonte.cabecalhos;
      const r = await fetch(fonte.url, init);
      if (!r.ok) {
        motivo = `HTTP ${r.status}`;
        if (primeira) console.warn(`[caixa] ${slug} direto: HTTP ${r.status} — tentando leitor`);
        continue;
      }
      const j = extrairJson(await r.text());
      const prox = Number(j.numeroConcursoProximo);
      if (!Number.isFinite(prox) || prox <= 0) throw new Error("sem numeroConcursoProximo");
      let dataISO = "";
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(j.dataProximoConcurso ?? "").trim());
      if (m) dataISO = `${m[3]}-${m[2]}-${m[1]}`;
      return { ok: true, concurso: prox, data: dataISO };
    } catch (e) {
      motivo =
        e instanceof Error
          ? e.name === "TimeoutError" || e.name === "AbortError"
            ? "tempo esgotado"
            : e.message
          : "falha na consulta";
      if (primeira) console.warn(`[caixa] ${slug} direto: ${motivo} — tentando leitor`);
    }
  }
  return { ok: false, erro: motivo };
}

/**
 * Consulta o próximo concurso oficial da Caixa (com cache) — função pura,
 * reutilizável tanto pelo server fn quanto por outros server fns internos
 * (ex.: rolarEstoqueProximaRodada), sem passar pelo middleware de auth.
 */
export async function proximoConcursoOficial(modalidade: string, forcar = false): Promise<Resultado> {
  const slug = SLUG_CAIXA[modalidade];
  if (!slug) return { ok: false, erro: "Modalidade sem consulta automática." };

  if (!forcar) {
    const hit = cache.get(slug);
    if (hit && Date.now() - hit.em < (hit.res.ok ? TTL_OK : TTL_ERRO)) return hit.res;
  }

  const res = await consultar(slug);
  if (!res.ok) {
    console.error(`[caixa] ${slug}: ${res.erro}`);
    cache.set(slug, { em: Date.now(), res });
    return res;
  }
  const ajustado = await refAntiAtraso(slug, { concurso: res.concurso, data: res.data });
  const fim: Resultado = { ok: true, ...ajustado };
  cache.set(slug, { em: Date.now(), res: fim });
  return fim;
}

/** Próximo concurso oficial da Caixa (e data do sorteio) para uma modalidade. */
export const buscarProximoConcurso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvo.parse(input ?? {}))
  .handler(async ({ data }): Promise<Resultado> => proximoConcursoOficial(data.modalidade, data.forcar));

type Ponto = { concurso: number; data: string };

// Sorteios já apurados nunca mudam de data — cache longo evita refazer o
// caminhão de consultas do caminhão histórico a cada fechamento.
const cacheConcurso = new Map<string, { em: number; j: RespostaCaixa }>();
const TTL_CONCURSO = 7 * 24 * 60 * 60_000;
const MAX_RETROCEDER = 8;

/**
 * Resposta bruta da API para um concurso específico (com cache de 7 dias).
 * Nula quando a API não entrega por número (HTTP 500 — concursos futuros —
 * ou Super Sete, que não responde assim em 18/10/2026).
 */
async function buscarConcurso(slug: string, n: number): Promise<RespostaCaixa | null> {
  const chave = `${slug}:${n}`;
  const hit = cacheConcurso.get(chave);
  if (hit && Date.now() - hit.em < TTL_CONCURSO) return hit.j;
  for (const fonte of fontes(`${slug}/${n}`)) {
    try {
      const init: RequestInit = { signal: AbortSignal.timeout(12000) };
      if (fonte.cabecalhos) init.headers = fonte.cabecalhos;
      const r = await fetch(fonte.url, init);
      if (!r.ok) continue;
      const j = extrairJson(await r.text());
      cacheConcurso.set(chave, { em: Date.now(), j });
      return j;
    } catch {
      /* tenta a próxima fonte */
    }
  }
  return null;
}

/**
 * Data (ISO) de um concurso JÁ SORTEADO, consultando a API da Caixa.
 * Concursos futuros devolvem HTTP 500 (testado em 18/10/2026) — por isso a
 * função só deve ser chamada para números menores que o próximo concurso.
 * Nula quando a API não entrega (ex.: Super Sete, que não responde por número).
 */
async function consultarConcurso(slug: string, n: number): Promise<string | null> {
  const j = await buscarConcurso(slug, n);
  if (!j) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(j.dataApuracao ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Hoje em Brasília (America/Sao_Paulo) em ISO YYYY-MM-DD — sem DST desde 2019 (UTC-3 fixo). */
function hojeBrasilia(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Concluído = tem dezenas no próprio registro do concurso. */
function concursoConcluido(j: RespostaCaixa): boolean {
  const a = j.listaDezenas;
  const b = j.dezenasSorteadasOrdemSorteio;
  return (Array.isArray(a) && a.length > 0) || (Array.isArray(b) && b.length > 0);
}

const dataIso = (br: unknown): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

/**
 * Corrige o atraso da API base após o sorteio: ela costuma continuar
 * anunciando como "próximo" o concurso que já saiu (testado em 18/10/2026 às
 * 16h: `/megasena` ainda dizia 3071@18/10, com o sorteio das 11h concluído,
 * enquanto `/megasena/3071` já tinha as dezenas e apontava 20/10).
 *
 * Enquanto a data anunciada for hoje (ou antes), sonda o concurso anunciado:
 * concluído → avança para n+1 com a data do próprio registro (`dataProximoConcurso`).
 * No máximo 3 passos (um atraso maior foge do padrão e não vale arriscar).
 * (Exportada para o teste de comportamento exercitar o probe ao vivo.)
 */
export async function refAntiAtraso(slug: string, ref: Ponto): Promise<Ponto> {
  const hoje = hojeBrasilia();
  if (!ref.data || ref.data > hoje) return ref;
  let atual = ref;
  for (let i = 0; i < 3; i++) {
    const j = await buscarConcurso(slug, atual.concurso);
    if (!j || !concursoConcluido(j)) return atual;
    const proxData = dataIso(j.dataProximoConcurso);
    if (!proxData) return atual;
    atual = { concurso: atual.concurso + 1, data: proxData };
    if (atual.data > hoje) return atual;
  }
  return atual;
}

/**
 * Par (concurso, data) do próximo sorteio anunciado + sorteios já apurados,
 * caminhando para TRÁS na API até cobrir a data alvo (inclusive).
 */
async function pontosConhecidos(modalidade: string, ref: Ponto, alvo: string): Promise<Ponto[]> {
  const slug = SLUG_CAIXA[modalidade];
  const pontos: Ponto[] = [ref];
  if (!slug || ref.data <= alvo) return pontos;
  while (pontos.length <= MAX_RETROCEDER + 1) {
    const ultimo = pontos[pontos.length - 1]!;
    if (ultimo.data <= alvo) break;
    const n = ultimo.concurso - 1;
    if (n <= 0) break;
    const iso = await consultarConcurso(slug, n);
    if (!iso) break;
    pontos.push({ concurso: n, data: iso });
    await new Promise((r) => setTimeout(r, 120));
  }
  return pontos;
}

/**
 * Concurso oficial em vigência numa DATA: usa a data real de sorteio dos
 * concursos da API (caminhando para trás a partir do próximo anunciado) —
 * correto até em calendários especiais (feriados, eleições, Mega Semana).
 * Quando o alvo está além do anunciado (ou a API não responde por número),
 * cai no cálculo pelos dias regulares de sorteio.
 *
 * Se a API base da modalidade estiver fora do ar (ex.: Super Sete em
 * 18/10/2026), usa o maior concurso do estoque local como âncora — mesmo
 * em isso, o fechamento continua preenchendo o Nº do concurso.
 */
export async function concursoNaData(
  modalidade: string,
  alvo: string,
  context?: { supabase: any },
): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(alvo)) return { ok: false, erro: "Data inválida." };
  const mod = getModalidade(modalidade);
  if (!mod?.dias?.length) return { ok: false, erro: "Modalidade sem cálculo automático." };
  let ref = await proximoConcursoOficial(modalidade);
  if (!ref.ok) {
    const alternativa = context ? await refPeloEstoque(context, modalidade) : null;
    if (!alternativa) return ref;
    ref = alternativa;
  }

  // Data de HOJE: a ref (já corrigida pelo refAntiAtraso) É o concurso que está
  // sendo vendido agora — antes do sorteio de hoje é o próprio de hoje; depois
  // que ele sai (mesmo com a base ainda atrasada), é o seguinte (ex.: Mega
  // 3072 e Dupla 3022 no domingo 18/10/2026 após as 11h).
  if (alvo === hojeBrasilia()) return { ok: true, concurso: ref.concurso, data: ref.data };

  const porAritmetica = (): Resultado => {
    const n = concursoParaData(mod, ref.concurso, ref.data, alvo);
    return n
      ? { ok: true, concurso: Number(n), data: alvo }
      : { ok: false, erro: "Não foi possível calcular o concurso da data." };
  };

  if (alvo === ref.data) return { ok: true, concurso: ref.concurso, data: ref.data };
  if (alvo > ref.data) return porAritmetica();

  const pontos = await pontosConhecidos(modalidade, ref, alvo);
  const coberto = pontos[pontos.length - 1]!.data <= alvo;
  if (coberto) {
    let melhor: Ponto | null = null;
    for (const p of pontos) {
      if (p.data >= alvo && (!melhor || p.data < melhor.data)) melhor = p;
    }
    if (melhor) return { ok: true, concurso: melhor.concurso, data: melhor.data };
  }
  return porAritmetica();
}

/**
 * Data oficial do sorteio de um concurso: exata para concursos já sorteados
 * (caminhão na API) e para o próximo anunciado; nos demais (ainda não
 * anunciados, endpoint indisponível) calcula pelos dias regulares.
 */
export async function dataOficialDoConcurso(
  modalidade: string,
  concurso: number,
  context?: { supabase: any },
): Promise<Resultado> {
  if (!Number.isFinite(concurso) || concurso <= 0) return { ok: false, erro: "Concurso inválido." };
  let ref = await proximoConcursoOficial(modalidade);
  if (!ref.ok) {
    const alternativa = context ? await refPeloEstoque(context, modalidade) : null;
    if (!alternativa) return ref;
    ref = alternativa;
  }
  if (concurso === ref.concurso) return { ok: true, concurso, data: ref.data };

  const slug = SLUG_CAIXA[modalidade];
  if (slug && concurso < ref.concurso) {
    for (let n = ref.concurso - 1, i = 0; n > 0 && i < MAX_RETROCEDER + 4; n--, i++) {
      const iso = await consultarConcurso(slug, n);
      if (!iso) break;
      if (n === concurso) return { ok: true, concurso, data: iso };
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const iso = dataDoConcursoAritmetica(getModalidade(modalidade), ref.concurso, ref.data, concurso);
  return iso
    ? { ok: true, concurso, data: iso }
    : { ok: false, erro: "Não foi possível calcular a data do concurso." };
}

/**
 * Âncora alternativa quando a API base da modalidade falha: o maior concurso
 * da modalidade no estoque local, com a data registrada na abertura.
 */
async function refPeloEstoque(
  context: { supabase: any },
  modalidade: string,
): Promise<Extract<Resultado, { ok: true }> | null> {
  try {
    const { data: linhas } = await context.supabase
      .from("estoque_boloes")
      .select("nome, concurso, data")
      .limit(500);
    let melhor: Ponto | null = null;
    for (const l of linhas ?? []) {
      if (achaModalidade(String(l.nome ?? ""))?.id !== modalidade) continue;
      const n = Number(String(l.concurso ?? "").replace(/\D+/g, ""));
      const d = String(l.data ?? "");
      if (!Number.isFinite(n) || n <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      if (!melhor || n > melhor.concurso) melhor = { concurso: n, data: d };
    }
    if (melhor) {
      console.warn(`[caixa] ${modalidade}: API base indisponível — usando estoque como âncora (${melhor.concurso}@${melhor.data})`);
      return { ok: true, ...melhor };
    }
    return null;
  } catch {
    return null;
  }
}

const alvoData = z.object({
  modalidade: z.string().max(40),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const alvoConcurso = z.object({
  modalidade: z.string().max(40),
  concurso: z.number().int().min(1).max(9999999),
});

/** Concurso oficial em vigência numa data específica (com data do sorteio). */
export const concursoPorData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvoData.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<Resultado> =>
    concursoNaData(data.modalidade, data.data, { supabase: context.supabase }),
  );

/** Data oficial do sorteio de um concurso. */
export const dataDoConcurso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvoConcurso.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<Resultado> =>
    dataOficialDoConcurso(data.modalidade, data.concurso, { supabase: context.supabase }),
  );
