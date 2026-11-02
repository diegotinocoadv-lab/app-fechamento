import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiadoAuth } from "@/hooks/use-fiado-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, Check, X, Eye, Sparkles } from "lucide-react";
import { brl, fmtDate, fmtDateTime, isVencido } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { logActivity } from "@/lib/log";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { creditoDisponivel, aplicarCredito } from "@/lib/fiado-creditos";
import { Skeleton } from "@/components/ui/skeleton";
import { FiadoLayout } from "@/components/FiadoLayout";

type Filter = "todos" | "pendentes" | "vencidos" | "aguardando" | "pagos";

export const Route = createFileRoute("/_authenticated/fiado-fiados")({
  head: () => ({ meta: [{ title: "Fiados" }] }),
  validateSearch: (s: Record<string, unknown>): { filtro?: Filter } => {
    const valor = s["filtro"];
    const filtro = (["todos", "pendentes", "vencidos", "aguardando", "pagos"] as const)
      .includes(valor as Filter) ? (valor as Filter) : undefined;
    return filtro ? { filtro } : {};
  },
  component: FiadosPage,
});

function FiadosPage() {
  const { role, user } = useFiadoAuth();
  const isAdmin = role === "admin";
  const { filtro } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<{ id: string; nome: string } | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [filter, setFilter] = useState<Filter>(filtro ?? "todos");
  const qc = useQueryClient();

  const { data: sugestoes } = useQuery({
    queryKey: ["fiados-sugestoes", search],
    enabled: !selectedCliente && search.trim().length >= 1,
    queryFn: async () => {
      const s = search.trim().replace(/[%,]/g, "");
      const { data } = await supabase.from("clientes")
        .select("id, nome").ilike("nome", `%${s}%`).order("nome").limit(8);
      return data ?? [];
    },
  });

  const { data: fiados, isLoading: fiadosLoading } = useQuery({
    queryKey: ["fiados", role, user?.id, search, selectedCliente?.id],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("fiados").select(
        "id, valor, descricao, observacao, data_inicio, data_vencimento, status, baixa_em, created_at, cliente_id, lancado_por, baixa_por"
      ).order("created_at", { ascending: false });

      if (selectedCliente) {
        q = q.eq("cliente_id", selectedCliente.id);
      } else {
        const s = search.trim().replace(/[%,]/g, "");
        if (s) {
          const { data: cs } = await supabase.from("clientes")
            .select("id").ilike("nome", `%${s}%`).limit(500);
          const clienteIds = (cs ?? []).map((c: any) => c.id);
          const like = `%${s}%`;
          const orParts = [`descricao.ilike.${like}`];
          if (clienteIds.length > 0) orParts.push(`cliente_id.in.(${clienteIds.join(",")})`);
          q = q.or(orParts.join(","));
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      const cidSet = new Set(rows.map((r: any) => r.cliente_id).filter(Boolean));
      const pids = [...new Set([...rows.map((r: any) => r.lancado_por).filter(Boolean), ...rows.map((r: any) => r.baixa_por).filter(Boolean)])];
      let pmap = new Map<string, any>();
      let cmap = new Map<string, any>();
      try {
        const [profis, cliRes] = await Promise.all([
          pids.length > 0
            ? supabase.from("profiles").select("id, nome, email").in("id", pids)
            : { data: [] as any[] },
          cidSet.size > 0
            ? supabase.from("clientes").select("id, nome").in("id", [...cidSet])
            : { data: [] as any[] },
        ]);
        pmap = new Map((profis.data ?? []).map((p: any) => [p.id, p]));
        cmap = new Map((cliRes.data ?? []).map((c: any) => [c.id, c]));
      } catch {
        // lookup failed — continue without names
      }
      return rows.map((r: any) => ({
        ...r,
        cliente: cmap.get(r.cliente_id) ?? null,
        profile: pmap.get(r.lancado_por) ?? null,
        baixa_profile: pmap.get(r.baixa_por) ?? null,
      }));
    },
  });

  const idsFiados = (fiados ?? []).map((f: any) => f.id);
  const { data: abatimentos } = useQuery({
    queryKey: ["fiados-abatimentos", idsFiados.join(",")],
    enabled: idsFiados.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("creditos")
        .select("fiado_id, valor, observacao, descricao, data_credito")
        .in("fiado_id", idsFiados).lt("valor", 0);
      if (error) throw error;
      return data ?? [];
    },
  });
  const abatimentoPorFiado = new Map<string, any>(
    (abatimentos ?? []).map((a: any) => [a.fiado_id, a])
  );

  const filtered = (fiados ?? []).filter((f: any) => {
    switch (filter) {
      case "pendentes": return f.status === "pendente" && !isVencido(f.data_vencimento, f.status);
      case "vencidos": return f.status === "vencido" || isVencido(f.data_vencimento, f.status);
      case "aguardando": return f.status === "aguardando_aprovacao";
      case "pagos": return f.status === "pago";
      default: return true;
    }
  });

  const historico = selectedCliente ? (fiados ?? []) : [];
  const resumo = {
    aberto: historico.filter((f: any) => f.status !== "pago").reduce((s: number, f: any) => s + Number(f.valor), 0),
    pago: historico.filter((f: any) => f.status === "pago").reduce((s: number, f: any) => s + Number(f.valor), 0),
    vencidos: historico.filter((f: any) => f.status === "vencido" || isVencido(f.data_vencimento, f.status)).length,
    qtdAberto: historico.filter((f: any) => f.status !== "pago").length,
    qtdPago: historico.filter((f: any) => f.status === "pago").length,
  };
  const totalAberto = resumo.aberto;

  const { data: creditoCliente = 0 } = useQuery({
    queryKey: ["cliente-credito-disp", selectedCliente?.id],
    enabled: !!selectedCliente,
    queryFn: () => creditoDisponivel(selectedCliente!.id),
  });
  const saldoAtual = resumo.aberto - creditoCliente;


  const [solicitar, setSolicitar] = useState<any | null>(null);
  const [detalhes, setDetalhes] = useState<any | null>(null);
  const [decisao, setDecisao] = useState<{ fiado: any; tipo: "aprovar" | "rejeitar" } | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [baixaLote, setBaixaLote] = useState(false);

  function toggleSel(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    const visiveis = filtered.map((f: any) => f.id);
    const allSel = visiveis.length > 0 && visiveis.every((id: string) => selecionados.has(id));
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (allSel) visiveis.forEach((id: string) => next.delete(id));
      else visiveis.forEach((id: string) => next.add(id));
      return next;
    });
  }
  const totalSelecionado = filtered
    .filter((f: any) => selecionados.has(f.id))
    .reduce((s: number, f: any) => s + Number(f.valor), 0);
  const qtdSelecionada = filtered.filter((f: any) => selecionados.has(f.id)).length;
  const todosVisiveisSelecionados =
    filtered.length > 0 && filtered.every((f: any) => selecionados.has(f.id));

  function pickCliente(c: { id: string; nome: string }) {
    setSelectedCliente(c);
    setSearch(c.nome);
    setShowSuggest(false);
  }

  function clearCliente() {
    setSelectedCliente(null);
    setSearch("");
  }

  return (
    <TooltipProvider delayDuration={100}>
    <FiadoLayout title="Fiados" subtitle="Controle de fiados do sistema">
      {selectedCliente && (
        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Saldo atual"
              value={brl(Math.abs(saldoAtual))}
              tone={saldoAtual > 0 ? "destructive" : saldoAtual < 0 ? "success" : "muted"}
              hint={saldoAtual > 0 ? "devedor" : saldoAtual < 0 ? "a favor (crédito)" : "zerado"} />
            <Stat label="Total em aberto" value={brl(resumo.aberto)} tone="destructive"
              hint={`${resumo.qtdAberto} lançamento(s)`} />
            <Stat label="Total já pago" value={brl(resumo.pago)} tone="success"
              hint={`${resumo.qtdPago} lançamento(s)`} />
            <Stat label="Vencidos" value={String(resumo.vencidos)} tone={resumo.vencidos > 0 ? "destructive" : "muted"} />
            <Stat label="Histórico" value={String(historico.length)} tone="muted" hint="lançamentos totais" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-col md:flex-row gap-2 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por cliente ou descrição…" value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedCliente(null); setShowSuggest(true); }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              className="pl-9 pr-9" />
            {(search || selectedCliente) && (
              <button type="button" onClick={clearCliente}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                aria-label="Limpar">
                <X className="h-4 w-4" />
              </button>
            )}
            {showSuggest && !selectedCliente && (sugestoes ?? []).length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
                {sugestoes!.map((c: any) => (
                  <button key={c.id} type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickCliente(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                    {c.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendentes">Pendentes</SelectItem>
              <SelectItem value="vencidos">Vencidos</SelectItem>
              <SelectItem value="aguardando">Aguardando aprovação</SelectItem>
              <SelectItem value="pagos">Pagos</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={todosVisiveisSelecionados}
                    onCheckedChange={() => toggleAll()}
                    aria-label="Selecionar todos" />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Descrição</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="hidden md:table-cell">Vencimento</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="hidden lg:table-cell">Lançado por</TableHead>}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fiadosLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    {isAdmin && <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>}
                    <TableCell className="text-right"><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.map((f: any) => (
                <TableRow key={f.id} className="cursor-pointer" onClick={() => setDetalhes(f)}
                  data-state={selecionados.has(f.id) ? "selected" : undefined}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selecionados.has(f.id)}
                      onCheckedChange={() => toggleSel(f.id)}
                      aria-label={`Selecionar ${f.cliente?.nome}`} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(f.data_inicio)}</TableCell>
                  <TableCell className="font-medium">{f.cliente?.nome}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{f.descricao}</TableCell>
                  <TableCell className="font-semibold">{brl(f.valor)}</TableCell>
                  <TableCell className="hidden md:table-cell">{fmtDate(f.data_vencimento)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={f.status} dataVencimento={f.data_vencimento} />
                      {abatimentoPorFiado.has(f.id) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success text-[11px] font-medium px-2 py-0.5 cursor-help">
                              <Sparkles className="h-3 w-3" /> Quitado com crédito
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            {(() => {
                              const a = abatimentoPorFiado.get(f.id);
                              return (
                                <span>
                                  {a.observacao ||
                                    `Abatido ${brl(Math.abs(Number(a.valor)))} do saldo positivo do cliente`}
                                  {a.data_credito ? ` — em ${fmtDate(a.data_credito)}` : ""}
                                </span>
                              );
                            })()}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  {isAdmin && <TableCell className="hidden lg:table-cell text-muted-foreground">{f.profile?.nome ?? "—"}</TableCell>}
                  <TableCell className="text-right space-x-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {!isAdmin && (f.status === "pendente" || f.status === "vencido") && (
                      <Button size="sm" variant="outline" onClick={() => setSolicitar(f)}>Receber fiado</Button>
                    )}
                    {isAdmin && (f.status === "pendente" || f.status === "vencido") && (
                      <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => setSolicitar(f)}>
                        Receber fiado
                      </Button>
                    )}
                    {isAdmin && f.status === "aguardando_aprovacao" && (
                      <>
                        <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90"
                          onClick={() => setDecisao({ fiado: f, tipo: "aprovar" })}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDecisao({ fiado: f, tipo: "rejeitar" })}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setDetalhes(f)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>

                </TableRow>
              ))}
              {!fiadosLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-10 text-muted-foreground">
                  Nenhum fiado encontrado.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="sticky bottom-2 z-10">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-4 py-3 shadow-sm">
          <div className="text-sm">
            <span className="text-muted-foreground">Selecionados:</span>{" "}
            <strong>{qtdSelecionada}</strong> de {filtered.length} lançamento(s)
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Total selecionado:</span>{" "}
            <strong className="text-lg">{brl(totalSelecionado)}</strong>
          </div>
          <div className="flex items-center gap-2">
            {qtdSelecionada > 0 && (() => {
              const baixaveis = filtered.filter((f: any) =>
                selecionados.has(f.id) && (f.status === "pendente" || f.status === "vencido"));
              return (
                <Button size="sm" disabled={baixaveis.length === 0}
                  className={isAdmin ? "bg-success text-success-foreground hover:bg-success/90" : ""}
                  variant={isAdmin ? "default" : "outline"}
                  onClick={() => setBaixaLote(true)}>
                  Receber fiado ({baixaveis.length})
                </Button>
              );
            })()}
            {qtdSelecionada > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
                Limpar
              </Button>
            )}
          </div>
        </div>
      </div>

      {solicitar && (
        <SolicitarBaixaDialog fiado={solicitar} direto={isAdmin} onClose={(reload) => {
          setSolicitar(null);
          if (reload) qc.invalidateQueries({ queryKey: ["fiados"] });
        }} />
      )}

      {detalhes && <DetalhesDialog fiado={detalhes} onClose={() => setDetalhes(null)} />}
      {decisao && (
        <DecisaoDialog fiado={decisao.fiado} tipo={decisao.tipo} onClose={(reload) => {
          setDecisao(null);
          if (reload) qc.invalidateQueries({ queryKey: ["fiados"] });
        }} />
      )}
      {baixaLote && (
        <BaixaLoteDialog
          fiados={filtered.filter((f: any) =>
            selecionados.has(f.id) && (f.status === "pendente" || f.status === "vencido"))}
          direto={isAdmin}
          onClose={(reload?: boolean) => {
            setBaixaLote(false);
            if (reload) {
              setSelecionados(new Set());
              qc.invalidateQueries({ queryKey: ["fiados"] });
            }
          }} />
      )}
    </FiadoLayout>
    </TooltipProvider>
  );
}

function SolicitarBaixaDialog({ fiado, direto = false, onClose }:
  { fiado: any; direto?: boolean; onClose: (r?: boolean) => void }) {
  const [obs, setObs] = useState("");
  const [tipo, setTipo] = useState<"total" | "parcial">("total");
  const [valorPago, setValorPago] = useState("");
  const [usarCredito, setUsarCredito] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: credito = 0 } = useQuery({
    queryKey: ["credito-disponivel", fiado.cliente_id],
    queryFn: () => creditoDisponivel(fiado.cliente_id),
  });

  const valorFiado = Number(fiado.valor);
  const dinheiro = tipo === "parcial" ? (parseFloat(valorPago.replace(",", ".")) || 0) : 0;
  const creditoUsado = usarCredito ? Math.min(credito, Math.max(0, valorFiado - dinheiro)) : 0;
  const totalQuitado = Math.min(valorFiado, dinheiro + creditoUsado);
  const restante = Math.max(0, valorFiado - totalQuitado);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!obs.trim()) { toast.error("Informe a observação"); return; }
    if (tipo === "parcial") {
      if (!dinheiro || dinheiro <= 0) { toast.error("Informe um valor pago válido"); return; }
      if (dinheiro >= valorFiado) { toast.error("Para o valor total, use 'Pagamento total'"); return; }
    }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();

    const vp: number | null = totalQuitado >= valorFiado ? null : Number(totalQuitado.toFixed(2));

    const { data: inserted, error } = await supabase.from("baixas_solicitacoes").insert({
      fiado_id: fiado.id, solicitado_por: user!.id, observacao: obs.trim(), valor_pago: vp,
    }).select("id").single();
    if (error) { setBusy(false); toast.error(error.message); return; }

    if (direto) {
      const { error: e2 } = await supabase.from("baixas_solicitacoes").update({
        status: "aprovada", decidido_por: user!.id, decidido_em: new Date().toISOString(),
      }).eq("id", inserted!.id);
      if (e2) { setBusy(false); toast.error(e2.message); return; }
      if (creditoUsado > 0) {
        try {
          await aplicarCredito({
            clienteId: fiado.cliente_id, fiadoId: fiado.id, devido: creditoUsado,
            userId: user!.id, descricao: `Crédito utilizado no recebimento — ${fiado.descricao ?? "fiado"}`,
          });
        } catch (err: any) { toast.error(err.message ?? "Falha ao abater o crédito"); }
      }
      setBusy(false);
      logActivity("baixa_direta_admin", {
        fiado_id: fiado.id, valor: valorFiado, valor_pago: vp, credito_usado: creditoUsado,
      });

      const valorEstorno = totalQuitado >= valorFiado ? valorFiado : totalQuitado;
      if (valorEstorno > 0) {
        const { data: perf } = await supabase.from("profiles").select("nome, email").eq("id", user!.id).maybeSingle();
        await supabase.from("lancamentos_simples").insert({
          tipo: "CAIXA", valor: -valorEstorno,
          descricao: `Estorno fiado — ${fiado.cliente?.nome} — ${fiado.descricao ?? ""}`,
          campo: "fiado", data: new Date().toISOString().slice(0, 10),
          operador_id: user!.id, operador_nome: perf?.nome || perf?.email || null,
        });
      }
      toast.success(
        creditoUsado > 0
          ? `Recebimento registrado — ${brl(creditoUsado)} abatido do crédito`
          : vp ? "Baixa parcial registrada" : "Baixa registrada",
      );
    } else {
      setBusy(false);
      logActivity("baixa_solicitada", { fiado_id: fiado.id, valor: valorFiado, valor_pago: vp });
      toast.success("Solicitação enviada");
    }
    onClose(true);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Receber fiado</DialogTitle></DialogHeader>

        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <div><strong>Cliente:</strong> {fiado.cliente?.nome}</div>
          <div><strong>Valor:</strong> {brl(valorFiado)}</div>
          <div><strong>Descrição:</strong> {fiado.descricao}</div>
          <div><strong>Crédito disponível:</strong> <span className="text-success font-semibold">{brl(credito)}</span></div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo de recebimento</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as "total" | "parcial")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="total">Pagamento total ({brl(valorFiado)})</SelectItem>
                <SelectItem value="parcial">Pagamento parcial (cliente pagou menos)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {credito > 0 && (
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
              <Checkbox checked={usarCredito} onCheckedChange={(v) => setUsarCredito(!!v)} />
              <span>
                Usar primeiro o crédito disponível do cliente
                <span className="block text-xs text-muted-foreground">
                  Serão abatidos {brl(creditoUsado)} do crédito antes do saldo devedor.
                </span>
              </span>
            </label>
          )}

          {tipo === "parcial" && (
            <div className="space-y-1.5">
              <Label>Valor pago em dinheiro pelo cliente *</Label>
              <Input inputMode="decimal" value={valorPago} onChange={(e) => setValorPago(e.target.value)} required
                placeholder="0,00" />
            </div>
          )}

          <div className="rounded-md border p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Crédito abatido</span><strong className="text-success">{brl(creditoUsado)}</strong></div>
            <div className="flex justify-between"><span>Pago em dinheiro</span><strong>{brl(dinheiro)}</strong></div>
            <div className="flex justify-between border-t pt-1">
              <span>Saldo restante</span>
              <strong className={restante > 0 ? "text-destructive" : "text-success"}>{brl(restante)}</strong>
            </div>
            {restante > 0 && (
              <p className="text-xs text-muted-foreground">
                O saldo restante {direto ? "será registrado" : "será registrado após aprovação"} como novo fiado.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Observação / motivo do pagamento *</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} required maxLength={500}
              placeholder="Ex: Cliente pagou em dinheiro" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>{direto ? "Confirmar recebimento" : "Enviar solicitação"}</Button>
          </DialogFooter>

        </form>
      </DialogContent>
    </Dialog>
  );
}


function DecisaoDialog({ fiado, tipo, onClose }:
  { fiado: any; tipo: "aprovar" | "rejeitar"; onClose: (r?: boolean) => void }) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tipo === "rejeitar" && !motivo.trim()) { toast.error("Informe o motivo"); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: solic } = await supabase.from("baixas_solicitacoes").select("id, valor_pago")
      .eq("fiado_id", fiado.id).eq("status", "pendente").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!solic) { toast.error("Solicitação não encontrada"); setBusy(false); return; }

    let creditoUsado = 0;
    let novoValorPago: number | null | undefined = undefined;
    if (tipo === "aprovar" && solic.valor_pago != null) {
      const restante = Number(fiado.valor) - Number(solic.valor_pago);
      if (restante > 0) {
        try {
          const disponivel = await creditoDisponivel(fiado.cliente_id);
          creditoUsado = Math.min(disponivel, restante);
        } catch { creditoUsado = 0; }
        if (creditoUsado > 0) {
          const total = Number(solic.valor_pago) + creditoUsado;
          novoValorPago = total >= Number(fiado.valor) ? null : Number(total.toFixed(2));
        }
      }
    }

    const { error } = await supabase.from("baixas_solicitacoes").update({
      status: tipo === "aprovar" ? "aprovada" : "rejeitada",
      decidido_por: user!.id, decidido_em: new Date().toISOString(),
      motivo_rejeicao: tipo === "rejeitar" ? motivo.trim() : null,
      ...(novoValorPago !== undefined ? { valor_pago: novoValorPago } : {}),
    }).eq("id", solic.id);
    if (error) { setBusy(false); toast.error(error.message); return; }

    if (creditoUsado > 0) {
      try {
        await aplicarCredito({
          clienteId: fiado.cliente_id, fiadoId: fiado.id, devido: creditoUsado, userId: user!.id,
          descricao: "Crédito utilizado no recebimento aprovado",
        });
      } catch (err: any) { toast.error(err.message ?? "Falha ao abater o crédito"); }
    }
    setBusy(false);
    logActivity(tipo === "aprovar" ? "baixa_aprovada" : "baixa_rejeitada",
      { fiado_id: fiado.id, motivo: motivo.trim() || undefined });

    if (tipo === "aprovar") {
      const valorEstorno = solic.valor_pago != null ? Number(solic.valor_pago) : Number(fiado.valor);
      if (valorEstorno > 0) {
        const { data: perf } = await supabase.from("profiles").select("nome, email").eq("id", user!.id).maybeSingle();
        await supabase.from("lancamentos_simples").insert({
          tipo: "CAIXA", valor: -valorEstorno,
          descricao: `Estorno fiado — ${fiado.cliente?.nome} — ${fiado.descricao ?? ""}`,
          campo: "fiado", data: new Date().toISOString().slice(0, 10),
          operador_id: user!.id, operador_nome: perf?.nome || perf?.email || null,
        });
      }
    }

    toast.success(tipo === "aprovar" ? "Baixa aprovada" : "Baixa rejeitada");
    onClose(true);
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tipo === "aprovar" ? "Aprovar baixa" : "Rejeitar baixa"}</DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <div><strong>Cliente:</strong> {fiado.cliente?.nome}</div>
          <div><strong>Valor:</strong> {brl(fiado.valor)}</div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {tipo === "rejeitar" && (
            <div className="space-y-1.5">
              <Label>Motivo da rejeição *</Label>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required maxLength={500} />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}
              variant={tipo === "rejeitar" ? "destructive" : "default"}
              className={tipo === "aprovar" ? "bg-success text-success-foreground hover:bg-success/90" : ""}>
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DetalhesDialog({ fiado, onClose }: { fiado: any; onClose: () => void }) {
  const { data: baixas } = useQuery({
    queryKey: ["fiado-baixas", fiado.id],
    queryFn: async () => {
      const { data } = await supabase.from("baixas_solicitacoes")
        .select("id, status, observacao, valor_pago, motivo_rejeicao, created_at, decidido_em, solicitado_por, decidido_por")
        .eq("fiado_id", fiado.id)
        .order("created_at", { ascending: false });
      if (!data || data.length === 0) return [];
      const ids = [...new Set([...data.map((b: any) => b.solicitado_por).filter(Boolean), ...data.map((b: any) => b.decidido_por).filter(Boolean)])];
      const { data: profis } = ids.length > 0
        ? await supabase.from("profiles").select("id, nome").in("id", ids)
        : { data: [] };
      const pmap = new Map((profis ?? []).map((p: any) => [p.id, p.nome]));
      return data.map((b: any) => ({
        ...b,
        solicitante: pmap.get(b.solicitado_por) ?? null,
        decisor: pmap.get(b.decidido_por) ?? null,
      }));
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do fiado</DialogTitle>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados do fiado</h3>
          <dl className="text-sm space-y-1.5">
            <Row label="Cliente" value={fiado.cliente?.nome} />
            <Row label="Valor" value={brl(fiado.valor)} />
            <Row label="Descrição" value={fiado.descricao || "—"} />
            <Row label="Data de início" value={fmtDate(fiado.data_inicio)} />
            <Row label="Vencimento" value={fmtDate(fiado.data_vencimento)} />
            <Row label="Status" value={<StatusBadge status={fiado.status} dataVencimento={fiado.data_vencimento} />} />
            {fiado.observacao && <Row label="Observação" value={fiado.observacao} />}
          </dl>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Auditoria</h3>
          <dl className="text-sm space-y-1.5">
            <Row label="Criado por" value={fiado.profile?.nome ?? "—"} />
            {fiado.profile?.email && <Row label="E-mail do criador" value={fiado.profile.email} />}
            <Row label="Criado em" value={fmtDateTime(fiado.created_at)} />
            <Row label="ID do fiado" value={<code className="text-xs">{fiado.id}</code>} />
            {fiado.baixa_em && (
              <>
                <Row label="Baixa dada por" value={fiado.baixa_profile?.nome ?? "—"} />
                <Row label="Baixa em" value={fmtDateTime(fiado.baixa_em)} />
              </>
            )}
          </dl>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Histórico de baixas ({baixas?.length ?? 0})
          </h3>
          {!baixas || baixas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação de baixa registrada.</p>
          ) : (
            <ul className="space-y-2">
              {baixas.map((b: any) => (
                <li key={b.id} className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">{b.status}</span>
                    <span className="text-xs text-muted-foreground">{fmtDateTime(b.created_at)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    Solicitado por <strong className="text-foreground">{b.solicitante?.nome ?? "—"}</strong>
                    {b.valor_pago != null && <> — valor pago: <strong className="text-foreground">{brl(b.valor_pago)}</strong></>}
                  </div>
                  {b.observacao && <div><span className="text-muted-foreground">Observação:</span> {b.observacao}</div>}
                  {b.decidido_em && (
                    <div className="text-muted-foreground">
                      Decidido por <strong className="text-foreground">{b.decisor?.nome ?? "—"}</strong> em {fmtDateTime(b.decidido_em)}
                    </div>
                  )}
                  {b.motivo_rejeicao && (
                    <div><span className="text-muted-foreground">Motivo da rejeição:</span> {b.motivo_rejeicao}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}

function Stat({ label, value, hint, tone = "muted" }:
  { label: string; value: string; hint?: string; tone?: "muted" | "success" | "destructive" }) {
  const toneClass = tone === "success" ? "text-success"
    : tone === "destructive" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function BaixaLoteDialog({ fiados, direto = false, onClose }:
  { fiados: any[]; direto?: boolean; onClose: (r?: boolean) => void }) {
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const total = fiados.reduce((s, f: any) => s + Number(f.valor), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!obs.trim()) { toast.error("Informe a observação"); return; }
    if (fiados.length === 0) { toast.error("Nenhum lançamento elegível"); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();

    const rows = fiados.map((f) => ({
      fiado_id: f.id,
      solicitado_por: user!.id,
      observacao: obs.trim(),
      valor_pago: null as number | null,
    }));
    const { data: inserted, error } = await supabase.from("baixas_solicitacoes")
      .insert(rows).select("id");
    if (error) { setBusy(false); toast.error(error.message); return; }

    if (direto && inserted) {
      const ids = inserted.map((r: any) => r.id);
      const { error: e2 } = await supabase.from("baixas_solicitacoes").update({
        status: "aprovada", decidido_por: user!.id, decidido_em: new Date().toISOString(),
      }).in("id", ids);
      setBusy(false);
      if (e2) { toast.error(e2.message); return; }
      logActivity("baixa_lote_admin", { qtd: fiados.length, total });
      const { data: perf } = await supabase.from("profiles").select("nome, email").eq("id", user!.id).maybeSingle();
      for (const f of fiados) {
        await supabase.from("lancamentos_simples").insert({
          tipo: "CAIXA", valor: -Number(f.valor),
          descricao: `Estorno fiado — ${f.cliente?.nome} — ${f.descricao ?? ""}`,
          campo: "fiado", data: new Date().toISOString().slice(0, 10),
          operador_id: user!.id, operador_nome: perf?.nome || perf?.email || null,
        });
      }
      toast.success(`${fiados.length} baixa(s) registrada(s) — ${brl(total)}`);
    } else {
      setBusy(false);
      logActivity("baixa_lote_solicitada", { qtd: fiados.length, total });
      toast.success(`${fiados.length} solicitação(ões) enviada(s)`);
    }
    onClose(true);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Receber fiado em lote</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <div><strong>{fiados.length}</strong> lançamento(s) selecionado(s)</div>
          <div>Valor total: <strong>{brl(total)}</strong></div>
        </div>

        <div className="max-h-48 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <tbody>
              {fiados.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="px-2 py-1 whitespace-nowrap">{fmtDate(f.data_inicio)}</td>
                  <td className="px-2 py-1">{f.cliente?.nome}</td>
                  <td className="px-2 py-1 text-muted-foreground truncate max-w-[180px]">{f.descricao}</td>
                  <td className="px-2 py-1 text-right font-semibold whitespace-nowrap">{brl(f.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Observação / motivo do pagamento *</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} required maxLength={500}
              placeholder="Ex: Cliente pagou tudo em dinheiro" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {direto ? `Receber ${fiados.length} — ${brl(total)}` : `Solicitar ${fiados.length} recebimento(s)`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
