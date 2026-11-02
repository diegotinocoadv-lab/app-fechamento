/**
 * Cores oficiais das loterias da Caixa Econômica Federal (manual de marca
 * das Loterias CAIXA). Usado para identificar modalidades por cor em
 * dropdowns, tabelas e linhas.
 */
const LOTERIA_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "mega-sena":   { bg: "bg-emerald-100 dark:bg-emerald-950", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-700" },
  "mega":        { bg: "bg-emerald-100 dark:bg-emerald-950", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-700" },
  "lotofacil":   { bg: "bg-purple-100 dark:bg-purple-950", text: "text-purple-800 dark:text-purple-300", border: "border-purple-300 dark:border-purple-700" },
  "lotofácil":   { bg: "bg-purple-100 dark:bg-purple-950", text: "text-purple-800 dark:text-purple-300", border: "border-purple-300 dark:border-purple-700" },
  "quina":       { bg: "bg-violet-100 dark:bg-violet-950", text: "text-violet-800 dark:text-violet-300", border: "border-violet-300 dark:border-violet-700" },
  "lotomania":   { bg: "bg-orange-100 dark:bg-orange-950", text: "text-orange-800 dark:text-orange-300", border: "border-orange-300 dark:border-orange-700" },
  "dupla sena":  { bg: "bg-red-100 dark:bg-red-950", text: "text-red-800 dark:text-red-300", border: "border-red-300 dark:border-red-700" },
  "dupla-sena":  { bg: "bg-red-100 dark:bg-red-950", text: "text-red-800 dark:text-red-300", border: "border-red-300 dark:border-red-700" },
  "timemania":   { bg: "bg-green-100 dark:bg-green-950", text: "text-green-800 dark:text-green-300", border: "border-green-300 dark:border-green-700" },
  "dia de sorte":{ bg: "bg-yellow-100 dark:bg-yellow-950", text: "text-yellow-800 dark:text-yellow-300", border: "border-yellow-300 dark:border-yellow-700" },
  "super sete":  { bg: "bg-lime-100 dark:bg-lime-950", text: "text-lime-800 dark:text-lime-300", border: "border-lime-300 dark:border-lime-700" },
  "+milionaria": { bg: "bg-indigo-100 dark:bg-indigo-950", text: "text-indigo-800 dark:text-indigo-300", border: "border-indigo-300 dark:border-indigo-700" },
  "milionaria":  { bg: "bg-indigo-100 dark:bg-indigo-950", text: "text-indigo-800 dark:text-indigo-300", border: "border-indigo-300 dark:border-indigo-700" },
  "federal":     { bg: "bg-blue-100 dark:bg-blue-950", text: "text-blue-800 dark:text-blue-300", border: "border-blue-300 dark:border-blue-700" },
  "loteca":      { bg: "bg-emerald-100 dark:bg-emerald-950", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-700" },
  "lotogol":     { bg: "bg-green-100 dark:bg-green-950", text: "text-green-800 dark:text-green-300", border: "border-green-300 dark:border-green-700" },
  "instantanea": { bg: "bg-pink-100 dark:bg-pink-950", text: "text-pink-800 dark:text-pink-300", border: "border-pink-300 dark:border-pink-700" },
  "instantânea": { bg: "bg-pink-100 dark:bg-pink-950", text: "text-pink-800 dark:text-pink-300", border: "border-pink-300 dark:border-pink-700" },
};

const DEFAULT_COLOR = { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-800 dark:text-slate-300", border: "border-slate-300 dark:border-slate-600" };

/** Hex oficiais de cada modalidade (manual de marca das Loterias CAIXA). */
export const LOTERIA_HEX: Record<string, string> = {
  "mega-sena": "#209869",
  "lotofacil": "#930089",
  "quina": "#260085",
  "lotomania": "#F78100",
  "dupla-sena": "#A61324",
  "timemania": "#00FF48",
  "dia-de-sorte": "#D3B315",
  "super-sete": "#A3C41B",
  "+milionaria": "#2B2C66",
  "federal": "#003DA5",
  "loteca": "#1B7B3A",
};

const hexRgb = (hex: string): string => {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

const ROW_BG_RGB: Record<string, string> = Object.fromEntries(
  Object.entries(LOTERIA_HEX).map(([id, hex]) => [id, `rgba(${hexRgb(hex)},0.13)`]),
);

const normKey = (nome: string) =>
  nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Chave estável da modalidade para as tabelas de cor (id oficial da Caixa). */
function chaveModalidade(nome: string): string {
  const k = normKey(nome);
  const mapaDireto: Record<string, string> = {
    "mega-sena": "mega-sena", mega: "mega-sena",
    lotofacil: "lotofacil", "lotofácil": "lotofacil",
    quina: "quina",
    lotomania: "lotomania",
    "dupla sena": "dupla-sena", "dupla-sena": "dupla-sena",
    timemania: "timemania",
    "dia de sorte": "dia-de-sorte", "dia-de-sorte": "dia-de-sorte",
    "super sete": "super-sete", "super-sete": "super-sete",
    "+milionaria": "+milionaria", milionaria: "+milionaria", "+ milionária": "+milionaria",
    federal: "federal",
    loteca: "loteca",
    lotogol: "lotogol",
    instantanea: "instantanea", "instantânea": "instantanea",
  };
  return mapaDireto[k] ?? k;
}

export function getLoteriaColor(nome: string): { bg: string; text: string; border: string } {
  const k = chaveModalidade(nome ?? "");
  return LOTERIA_COLORS[k] ?? LOTERIA_COLORS[k.replace(/-/g, " ")] ?? DEFAULT_COLOR;
}

export function getLoteriaDotColor(nome: string): string {
  const k = chaveModalidade(nome ?? "");
  return LOTERIA_HEX[k] ?? "#6B7280";
}

export function getLoteriaRowStyle(nome: string): React.CSSProperties | undefined {
  const k = chaveModalidade(nome ?? "");
  const bg = ROW_BG_RGB[k];
  if (!bg) return undefined;
  return { backgroundColor: bg };
}
