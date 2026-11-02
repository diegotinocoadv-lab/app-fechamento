import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { achaModalidade, compararBoloes, normBolao } from "@/lib/loterias-sorteio";

/**
 * Controle de bolões: matriz de vendas por bolão × funcionário/canal, no período.
 *
 * Linha = bolão (nome + concurso + valor da cota), somando os lotes iguais.
 * Coluna = funcionário (com o canal entre parênteses quando for marketplace).
 * Célula = cotas vendidas no período. "finalizado" = sem cotas disponíveis.
 *
 * A consulta de vendas usa a sessão do usuário (RLS): o administrador vê todas
 * as vendas; cada operador vê apenas as próprias.
 */
export const controleBoloes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        de: z.string().min(8).max(10),
        ate: z.string().min(8).max(10),
        modalidade: z.string().optional().default(""),
        situacao: z.enum(["ativo", "todos"]).optional().default("ativo"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [est, vend] = await Promise.all([
      context.supabase
        .from("estoque_boloes")
      .select("id, nome, concurso, cotas, valor_cota, taxa, data, situacao, observacoes, created_at")
      .limit(2000),
      context.supabase
        .from("estoque_boloes_vendas")
        .select("estoque_id, quantidade, canal, data, operador_nome")
        .gte("data", data.de)
        .lte("data", data.ate)
        .limit(5000),
    ]);
    if (est.error) {
      throw new Error(`Não foi possível carregar o estoque: ${est.error.message}`);
    }
    if (vend.error) {
      throw new Error(`Não foi possível carregar as vendas: ${vend.error.message}`);
    }

    type Estoque = {
      id: string;
      nome: string;
      concurso: string | null;
      cotas: number | string | null;
      valor_cota: number | string | null;
      taxa: number | string | null;
      data: string | null;
      situacao: string;
      observacoes: string | null;
      created_at: string | null;
    };
    type Venda = {
      estoque_id: string;
      quantidade: number | string | null;
      canal: string | null;
      data: string | null;
      operador_nome: string | null;
    };

    const estoques = (est.data ?? []) as unknown as Estoque[];
    const vendas = (vend.data ?? []) as unknown as Venda[];

    const modalidadeOk = (nome: string) => {
      if (!data.modalidade) return true;
      const m = achaModalidade(nome);
      return data.modalidade === "outro" ? !m : m?.id === data.modalidade;
    };

    // --- Linhas: bolões (nome + concurso + valor + taxa), somando lotes ---
    type Grupo = {
      nome: string;
      concurso: string;
      valorCota: number;
      taxa: number;
      data: string;
      observacoes: string;
      cotas: number;
      todosEncerrados: boolean;
      todosFinalizados: boolean;
      ids: Set<string>;
    };
    const grupos = new Map<string, Grupo>();
    const idParaGrupo = new Map<string, string>();
    for (const e of estoques) {
      if (data.situacao === "ativo" && e.situacao !== "ativo") continue;
      const nome = String(e.nome ?? "");
      const concurso = String(e.concurso ?? "").trim();
      const valorCota = Number(e.valor_cota ?? 0);
      const taxa = Number(e.taxa ?? 0);
      const chave = `${normBolao(nome)}|${concurso}|${valorCota}|${taxa}`;
      let g = grupos.get(chave);
      if (!g) {
        g = {
          nome,
          concurso,
          valorCota,
          taxa,
          data: String(e.data ?? ""),
          observacoes: String(e.observacoes ?? "").trim(),
          cotas: 0,
          todosEncerrados: true,
          todosFinalizados: true,
          ids: new Set<string>(),
        };
        grupos.set(chave, g);
      }
      g.cotas += Number(e.cotas ?? 0);
      g.ids.add(e.id);
      idParaGrupo.set(e.id, chave);
      if (e.situacao === "ativo") g.todosEncerrados = false;
      if (e.situacao !== "finalizado") g.todosFinalizados = false;
      if (!g.observacoes && String(e.observacoes ?? "").trim()) {
        g.observacoes = String(e.observacoes ?? "").trim();
      }
      if (String(e.data ?? "") && (!g.data || String(e.data) < g.data)) g.data = String(e.data);
    }

    // --- Colunas: funcionário × canal ---
    const colunasMap = new Map<string, { id: string; rotulo: string; canal: string }>();
    const garantirColuna = (canal: string, operador: string) => {
      const id = `${canal}|${operador}`;
      if (!colunasMap.has(id)) {
        colunasMap.set(id, {
          id,
          rotulo: canal === "MARKETPLACE" ? `${operador} (MKP)` : operador,
          canal,
        });
      }
      return id;
    };

    // --- Vendas: por grupo/coluna e por dia (para o detalhe) ---
    type DetalheDia = { data: string; coluna: string; cotas: number; operador: string; canal: string };
    const celulas = new Map<string, Map<string, number>>();
    const detalhe = new Map<string, DetalheDia[]>();
    const totaisColunas = new Map<string, number>();
    const valorColunas = new Map<string, number>();
    const ultimaVenda = new Map<string, string>();
    const canalGrupo = new Map<string, { loja: number; mkp: number }>();
    let valorVendido = 0;
    let taxaVendida = 0;

    for (const v of vendas) {
      const chave = idParaGrupo.get(v.estoque_id);
      if (!chave) continue;
      const qtd = Number(v.quantidade ?? 0);
      if (qtd <= 0) continue;
      const operador = String(v.operador_nome ?? "").trim() || "—";
      const canal = v.canal === "MARKETPLACE" ? "MARKETPLACE" : "LOJA";
      const colunaId = garantirColuna(canal, operador);
      const g = grupos.get(chave);
      if (!g) continue;
      const cg = canalGrupo.get(chave) ?? { loja: 0, mkp: 0 };
      if (canal === "MARKETPLACE") cg.mkp += qtd;
      else cg.loja += qtd;
      canalGrupo.set(chave, cg);
      valorVendido += qtd * g.valorCota;
      taxaVendida += qtd * g.taxa;
      valorColunas.set(colunaId, (valorColunas.get(colunaId) ?? 0) + qtd * g.valorCota);
      const dia = String(v.data ?? "");
      const atualUltima = ultimaVenda.get(chave) ?? "";
      if (dia > atualUltima) ultimaVenda.set(chave, dia);

      let porColuna = celulas.get(chave);
      if (!porColuna) {
        porColuna = new Map<string, number>();
        celulas.set(chave, porColuna);
      }
      porColuna.set(colunaId, (porColuna.get(colunaId) ?? 0) + qtd);
      totaisColunas.set(colunaId, (totaisColunas.get(colunaId) ?? 0) + qtd);

      let dias = detalhe.get(chave);
      if (!dias) {
        dias = [];
        detalhe.set(chave, dias);
      }
      const existente = dias.find((d) => d.data === dia && d.coluna === colunaId);
      if (existente) existente.cotas += qtd;
      else dias.push({ data: dia, coluna: colunaId, cotas: qtd, operador, canal });
    }

    // --- Monta as linhas na ordem oficial das modalidades ---
    const linhas = [...grupos.entries()]
      .filter(([chave]) => modalidadeOk(grupos.get(chave)?.nome ?? ""))
      .map(([chave, g]) => {
        const porColuna = celulas.get(chave) ?? new Map<string, number>();
        const vendidas = [...porColuna.values()].reduce((s, n) => s + n, 0);
        const disponiveis = Math.max(0, g.cotas - vendidas);
        const celulasObj: Record<string, number> = {};
        for (const [k, n] of porColuna) celulasObj[k] = n;
        return {
          nome: g.nome,
          concurso: g.concurso,
          valorCota: g.valorCota,
          taxa: g.taxa,
          data: g.data,
          observacoes: g.observacoes,
          cotas: g.cotas,
          vendidas,
          disponiveis,
          situacao: g.todosFinalizados
            ? "finalizado"
            : g.todosEncerrados
              ? "encerrado"
              : "ativo",
          finalizado: disponiveis === 0,
          ids: [...g.ids],
          vendidasLoja: canalGrupo.get(chave)?.loja ?? 0,
          vendidasMkp: canalGrupo.get(chave)?.mkp ?? 0,
          ultimaVenda: ultimaVenda.get(chave) ?? "",
          celulas: celulasObj,
          porDia: (detalhe.get(chave) ?? [])
            .slice()
            .sort((a, b) => a.data.localeCompare(b.data) || a.coluna.localeCompare(b.coluna)),
        };
      })
      .sort((a, b) => compararBoloes(a, b));

    const colunas = [...colunasMap.values()].sort((a, b) =>
      a.rotulo.localeCompare(b.rotulo, "pt-BR"),
    );

    const resumo = {
      cotasVendidas: [...totaisColunas.values()].reduce((s, n) => s + n, 0),
      cotasDisponiveis: linhas.reduce((s, l) => s + l.disponiveis, 0),
      cotasAbertas: linhas.reduce((s, l) => s + l.cotas, 0),
      valorVendido: Math.round(valorVendido * 100) / 100,
      taxaVendida: Math.round(taxaVendida * 100) / 100,
      finalizados: linhas.filter((l) => l.finalizado).length,
    };

    const totais = {
      cotas: Object.fromEntries(
        [...totaisColunas.entries()].sort((a, b) => b[1] - a[1]),
      ),
      valor: Object.fromEntries(
        [...valorColunas.entries()]
          .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
          .map(([k, v]) => [k, Math.round(v * 100) / 100]),
      ),
    };

    return { de: data.de, ate: data.ate, colunas, linhas, totais, resumo };
  });
