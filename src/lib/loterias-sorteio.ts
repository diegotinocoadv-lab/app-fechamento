export type ModalidadeLoteria = {
  id: string;
  nome: string;
  dias: number[] | null;
};

export const MODALIDADES_LOTERIA: ModalidadeLoteria[] = [
  { id: "mega-sena", nome: "Mega-Sena", dias: [0, 2, 4] },
  { id: "lotofacil", nome: "Lotofácil", dias: [0, 1, 2, 3, 4, 5] },
  { id: "quina", nome: "Quina", dias: [0, 1, 2, 3, 4, 5] },
  { id: "lotomania", nome: "Lotomania", dias: [1, 3, 5] },
  { id: "dupla-sena", nome: "Dupla Sena", dias: [1, 3, 5] },
  { id: "timemania", nome: "Timemania", dias: [0, 2, 4] },
  { id: "dia-de-sorte", nome: "Dia de Sorte", dias: [0, 1, 2, 3, 4, 5] },
  { id: "super-sete", nome: "Super Sete", dias: [1, 3, 5] },
  { id: "+milionaria", nome: "+Milionária", dias: [0, 3] },
  { id: "federal", nome: "Federal", dias: [0, 3] },
  { id: "loteca", nome: "Loteca", dias: [1, 4] },
  { id: "outro", nome: "Outro (sem validação)", dias: null },
];

const NOMES_DIA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const ABREV_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function diaSemanaData(data: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function achaModalidade(nome: string): ModalidadeLoteria | null {
  const n = normalizar(nome ?? "");
  if (!n) return null;
  for (const m of MODALIDADES_LOTERIA) {
    if (m.id === "outro") continue;
    if (n.includes(normalizar(m.nome))) return m;
  }
  if (n.includes("milionaria")) return MODALIDADES_LOTERIA.find((m) => m.id === "+milionaria") ?? null;
  return null;
}

export function getModalidade(id: string): ModalidadeLoteria | null {
  return MODALIDADES_LOTERIA.find((m) => m.id === id) ?? null;
}

/**
 * Ordem oficial de exibição das modalidades (segue MODALIDADES_LOTERIA).
 * Nomes que não batem com nenhuma modalidade ficam no fim, em ordem alfabética.
 */
export function ordemModalidade(nome: string | null | undefined): number {
  const m = achaModalidade(String(nome ?? ""));
  if (!m) return MODALIDADES_LOTERIA.length + 1;
  const idx = MODALIDADES_LOTERIA.findIndex((x) => x.id === m.id);
  return idx < 0 ? MODALIDADES_LOTERIA.length + 1 : idx;
}

const numConcurso = (s: unknown): number => {
  const txt = String(s ?? "").trim();
  if (!txt) return Number.NaN;
  const n = Number(txt.replace(/\D+/g, ""));
  return txt.replace(/\D+/g, "") && Number.isFinite(n) ? n : Number.NaN;
};

/**
 * Compara dois bolões para exibição: modalidade (ordem oficial da Caixa),
 * depois concurso numérico (2820 antes de 3000, nunca alfabético), depois nome.
 */
export function compararBoloes(
  a: { nome: string; concurso?: string | null },
  b: { nome: string; concurso?: string | null },
): number {
  const oa = ordemModalidade(a.nome);
  const ob = ordemModalidade(b.nome);
  if (oa !== ob) return oa - ob;
  const na = numConcurso(a.concurso);
  const nb = numConcurso(b.concurso);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
  const porNome = a.nome.localeCompare(b.nome, "pt-BR");
  if (porNome !== 0) return porNome;
  return String(a.concurso ?? "").localeCompare(String(b.concurso ?? ""), "pt-BR");
}

/** Normaliza para comparar nomes de bolão (acentos, caixa, espaços e hífens). */
export function normBolao(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** "MEGA-SENA" → "Mega-Sena"; "BOLAO MEGA SENA 10 COTAS" → "Bolão Mega-Sena 10 Cotas". */
export function nomeCanonicoBolao(nome: string | null | undefined): string {
  const original = String(nome ?? "").trim().replace(/\s+/g, " ");
  if (!original) return "";

  const titulo = (s: string) =>
    s
      .toLowerCase()
      .replace(/(^|[\s(])(\p{L})/gu, (_, esp: string, c: string) => esp + c.toUpperCase());

  const m = achaModalidade(original);
  if (!m) {
    const semEspaco = original.replace(/\s+/g, " ").trim();
    const caixaAlta = semEspaco === semEspaco.toUpperCase();
    return caixaAlta ? titulo(semEspaco) : semEspaco;
  }

  // Regex tolerante: entre as letras aceita espaços/hífens (ou nada), e o
  // próprio hífen do nome da modalidade também é opcional.
  const flexivel = m.nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("")
    .map((c) => (/[\s-]/.test(c) ? "[\\s\\-]*" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("[\\s\\-]*");
  const re = new RegExp(flexivel, "i");
  const trocado = original.replace(re, m.nome);
  // O que sobrou em CAIXA ALTA vira título (números e a modalidade ficam como estão).
  const partes = trocado
    .split(" ")
    .map((p) => {
      if (p === m.nome) return p;
      if (p && p === p.toUpperCase() && /\p{L}/u.test(p)) return titulo(p);
      return p;
    })
    .filter(Boolean);
  return partes.join(" ").replace(/\s+/g, " ").trim() || m.nome;
}

/** Apelidos curtos que achaModalidade não pega ("MEGA 3071", "Dupla 3021"). */
const APELIDOS_MODALIDADE: Record<string, string> = {
  MEGA: "mega-sena",
  DUPLA: "dupla-sena",
  SUPER: "super-sete",
  MILIONARIA: "+milionaria",
};

function modalidadePorApelido(desc: string): ModalidadeLoteria | null {
  const n = normBolao(desc);
  if (!n) return null;
  for (const [apelido, id] of Object.entries(APELIDOS_MODALIDADE)) {
    if (n.startsWith(apelido)) return getModalidade(id);
  }
  return null;
}

/**
 * Interpreta descrições livres do /lancar, tipo "MEGA 3071" ou "Dupla 3021":
 * devolve o nome canônico da modalidade e o concurso (único número do texto),
 * quando houver. Retorna null quando não dá para reconhecer nenh modalidade.
 */
export function resolverAlvoBolaoLivre(
  desc: string | null | undefined,
): { nome: string; concurso: string } | null {
  const texto = String(desc ?? "");
  if (!texto.trim()) return null;
  const m = achaModalidade(texto) ?? modalidadePorApelido(texto);
  if (!m) return null;
  const nums = texto.match(/\d+/g) ?? [];
  return { nome: m.nome, concurso: nums.length === 1 ? (nums[0] ?? "") : "" };
}

export function diasTexto(dias: number[] | null): string {
  if (!dias?.length) return "";
  const nomes = [...dias].sort((a, b) => a - b).map((d) => ABREV_DIA[d] ?? "");
  if (nomes.length === 1) return nomes[0] ?? "";
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

export function proximoDiaSorteio(dias: number[], data: string): string | null {
  const atual = diaSemanaData(data);
  if (atual === null) return null;
  const base = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!base) return null;
  const inicio = Date.UTC(Number(base[1]), Number(base[2]) - 1, Number(base[3]));
  for (let i = 1; i <= 14; i++) {
    const d = new Date(inicio + i * 86400000);
    if (dias.includes(d.getUTCDay())) {
      return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }
  }
  return null;
}

/** Retorna mensagem de erro se a data não for dia de sorteio da modalidade; null se válida. */
export function validarDataSorteio(
  modalidade: ModalidadeLoteria | null,
  data: string,
): string | null {
  if (!modalidade?.dias?.length) return null;
  const dia = diaSemanaData(data);
  if (dia === null) {
    if (!data) return "Informe a data do sorteio.";
    return "Data inválida.";
  }
  if (modalidade.dias.includes(dia)) return null;
  const nomeDia = NOMES_DIA[dia] ?? "";
  const prox = proximoDiaSorteio(modalidade.dias, data);
  return (
    `${modalidade.nome} não sorteia em ${nomeDia}. ` +
    `Dias válidos: ${diasTexto(modalidade.dias)}` +
    (prox ? `. Próximo sorteio: ${prox}` : "")
  );
}

/**
 * Próxima data de sorteio em ISO (YYYY-MM-DD): hoje se for dia de sorteio,
 * senão o próximo dia válido em até 14 dias. Sem modalidade ou sem dias
 * definidos, devolve `hoje`.
 */
export function proximaDataSorteioISO(modalidade: ModalidadeLoteria | null, hoje: string): string {
  if (!modalidade?.dias?.length) return hoje;
  if (!validarDataSorteio(modalidade, hoje)) return hoje;
  const base = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoje);
  if (!base) return hoje;
  const inicio = Date.UTC(Number(base[1]), Number(base[2]) - 1, Number(base[3]));
  for (let i = 0; i <= 14; i++) {
    const d = new Date(inicio + i * 86400000);
    if (modalidade.dias.includes(d.getUTCDay())) {
      return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
  }
  return hoje;
}

/**
 * Concurso oficial vigente em uma DATA específica (ex.: a data do fechamento),
 * a partir do concurso de referência e da data do sorteio dele (API da Caixa).
 *
 * A venda de um concurso ocorre entre o sorteio anterior e o sorteio do
 * concurso — então o concurso "em jogo" numa data D é o do primeiro sorteio
 * em ou após D. Ex.: Mega-Sena 3071 sorteia sáb 18/10; no dia 16/10 (qui) o
 * concurso vendido é o 3070 (sorteado na própria quinta).
 */
export function concursoParaData(
  modalidade: ModalidadeLoteria | null,
  concursoRef: number,
  dataSorteioRef: string,
  data: string,
): string | null {
  if (!modalidade?.dias?.length || !Number.isFinite(concursoRef) || concursoRef <= 0) return null;
  const t = Date.parse(`${dataSorteioRef}T00:00:00Z`);
  const d = Date.parse(`${data}T00:00:00Z`);
  if (!Number.isFinite(t) || !Number.isFinite(d)) return null;
  const DAY = 86400000;
  const ehSorteio = (ms: number) => modalidade.dias!.includes(new Date(ms).getUTCDay());

  if (d === t) return String(concursoRef);
  if (d < t) {
    // Sorteios em [d, t): cada um deles já passou → menos 1 concurso cada.
    let k = 0;
    for (let ms = d; ms < t; ms += DAY) if (ehSorteio(ms)) k++;
    return String(concursoRef - k);
  }
  // d > t: primeiro sorteio em ou após d (até 14 dias).
  let fd = -1;
  for (let i = 0; i <= 14; i++) {
    const ms = d + i * DAY;
    if (ehSorteio(ms)) { fd = ms; break; }
  }
  if (fd < 0) return null;
  let k = 1; // o próprio fd
  for (let ms = t + DAY; ms < fd; ms += DAY) if (ehSorteio(ms)) k++;
  return String(concursoRef + k);
}

/**
 * Próxima data de sorteio em ISO (YYYY-MM-DD) ESTRITAMENTE depois de `data`.
 * Usada ao abrir o próximo concurso no estoque: o próximo dia de sorteio
 * contado a partir de "hoje" pega a data errada quando o concurso recém-criado
 * sorteia em outro dia (ex.: criar a Dupla 3022 na segunda e o formulário
 * abrir a 3023 ainda na segunda, quando ela sorteia na quarta).
 */
export function diaSorteioDepoisDe(
  modalidade: ModalidadeLoteria | null,
  data: string,
): string | null {
  if (!modalidade?.dias?.length) return null;
  const base = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data ?? "");
  if (!base) return null;
  const inicio = Date.UTC(Number(base[1]), Number(base[2]) - 1, Number(base[3]));
  for (let i = 1; i <= 14; i++) {
    const d = new Date(inicio + i * 86400000);
    if (modalidade.dias.includes(d.getUTCDay())) {
      return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Data do sorteio de um concurso por aritmética de dias regulares, a partir
 * de um par de referência (concurso, data) vindo da API da Caixa. Usada quando
 * a API não devolve a data do concurso pedido (ainda não sorteado ou endpoint
 * indisponível, como o da Super Sete).
 */
export function dataDoConcursoAritmetica(
  modalidade: ModalidadeLoteria | null,
  refConcurso: number,
  refData: string,
  concurso: number,
): string | null {
  if (!modalidade?.dias?.length) return null;
  if (!Number.isFinite(refConcurso) || refConcurso <= 0) return null;
  if (!Number.isFinite(concurso) || concurso <= 0) return null;
  const base = /^(\d{4})-(\d{2})-(\d{2})$/.exec(refData ?? "");
  if (!base) return null;
  const k = Math.trunc(concurso - refConcurso);
  if (k === 0) return refData;
  const DAY = 86400000;
  const ini = Date.UTC(Number(base[1]), Number(base[2]) - 1, Number(base[3]));
  const passo = k > 0 ? DAY : -DAY;
  const alvo = Math.abs(k);
  let cont = 0;
  let ms = ini;
  for (let i = 0; i < 400; i++) {
    ms += passo;
    if (!modalidade.dias.includes(new Date(ms).getUTCDay())) continue;
    cont++;
    if (cont === alvo) {
      const d = new Date(ms);
      return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
  }
  return null;
}
