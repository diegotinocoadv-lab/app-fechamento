import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { brl, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { logActivity } from "@/lib/log";
import { Plus, Search, Phone, FileText, Trash2, AlertTriangle, Wallet } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useFiadoAuth } from "@/hooks/use-fiado-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { abaterCreditoEmFiados } from "@/lib/fiado-creditos";
import { saldosClientes } from "@/lib/fiado-saldos.functions";
import { FiadoLayout } from "@/components/FiadoLayout";


export const Route = createFileRoute("/_authenticated/fiado-clientes")({
  head: () => ({ meta: [{ title: "Clientes — Fiado" }] }),
  component: ClientesPage,
});

function ClientesPage() {
  const { user, role } = useFiadoAuth();
  const isAdmin = role === "admin";
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [creditoPara, setCreditoPara] = useState<any | null>(null);
  const [creditoPicker, setCreditoPicker] = useState(false);
  const qc = useQueryClient();
  const saldosFn = useServerFn(saldosClientes);


  const { data: clientes, isLoading: clientesLoading } = useQuery({
    queryKey: ["clientes", search, user?.id],
    enabled: !!user,
    queryFn: async () => {
      let q: any = supabase.from("clientes")
        .select("id, nome, telefone, observacao, created_at").order("nome");
      if (search.trim()) q = q.ilike("nome", `%${search.trim().replace(/[%,]/g, "")}%`);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: saldosMap } = useQuery({
    queryKey: ["clientes-saldos"],
    enabled: !!user,
    queryFn: () => saldosFn({}),
  });


  return (
    <FiadoLayout title="Clientes" subtitle="Cadastro de clientes fiado">
      <div className="flex gap-2 mb-4">
        <Button variant="outline" className="gap-2" onClick={() => setCreditoPicker(true)}>
          <Wallet className="h-4 w-4" /> Lançar crédito
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Novo cliente</Button>
          </DialogTrigger>
          <NovoClienteDialog onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["clientes"] }); }} />
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={(clientes ?? []).length > 0 && (clientes ?? []).every((c: any) => selecionados.has(c.id))}
                      onCheckedChange={(v) => {
                        setSelecionados(v ? new Set((clientes ?? []).map((c: any) => c.id)) : new Set());
                      }}
                      aria-label="Selecionar todos" />
                  </TableHead>
                )}
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">Telefone</TableHead>
                <TableHead>Saldo atual</TableHead>
                <TableHead>Em aberto</TableHead>
                <TableHead>Crédito</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Cadastrado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {isAdmin && <TableCell><Skeleton className="h-4 w-4" /></TableCell>}
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : (clientes ?? []).map((c: any) => {
                const divida = saldosMap?.[c.id]?.fiado ?? 0;
                const credito = Math.max(0, saldosMap?.[c.id]?.credito ?? 0);
                const saldo = saldosMap?.[c.id]?.saldo ?? divida - credito;
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetalhe(c)}>
                    {isAdmin && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selecionados.has(c.id)}
                          onCheckedChange={(v) => {
                            setSelecionados((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(c.id); else next.delete(c.id);
                              return next;
                            });
                          }}
                          aria-label={`Selecionar ${c.nome}`} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {c.telefone ? (
                        <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.telefone}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex flex-col rounded-md px-2 py-1 font-semibold ${
                        saldo > 0
                          ? "bg-destructive/10 text-destructive"
                          : saldo < 0
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                      }`}>
                        {brl(Math.abs(saldo))}
                        <span className="text-[10px] font-normal">
                          {saldo > 0 ? "devedor" : saldo < 0 ? "a favor" : "zerado"}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold">{brl(divida)}</TableCell>
                    <TableCell className="font-semibold text-success">{brl(credito)}</TableCell>
                    <TableCell>
                      {saldo > 0
                        ? <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">Devendo</Badge>
                        : <Badge className="bg-success text-success-foreground hover:bg-success">Quite</Badge>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{fmtDate(c.created_at)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="gap-1"
                        onClick={(e) => { e.stopPropagation(); setCreditoPara(c); }}>
                        <Wallet className="h-4 w-4" /> Crédito
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetalhe(c); }}>
                        Ver lançamentos
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!clientesLoading && (clientes ?? []).length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-10 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhum cliente encontrado.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAdmin && selecionados.size > 0 && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3 shadow-lg">
          <div className="text-sm">
            <strong>{selecionados.size}</strong> cliente(s) selecionado(s)
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>Limpar</Button>
            <Button size="sm" variant="destructive" className="gap-2" onClick={() => setConfirmarExclusao(true)}>
              <Trash2 className="h-4 w-4" /> Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      {confirmarExclusao && (
        <ExcluirClientesDialog
          clientes={(clientes ?? []).filter((c: any) => selecionados.has(c.id))}
          saldos={saldosMap ?? {}}
          onClose={(ok) => {
            setConfirmarExclusao(false);
            if (ok) {
              setSelecionados(new Set());
              qc.invalidateQueries({ queryKey: ["clientes"] });
              qc.invalidateQueries({ queryKey: ["clientes-saldos"] });
            }
          }} />
      )}

      {creditoPara && (
        <NovoCreditoDialog
          cliente={creditoPara}
          onClose={(ok) => {
            setCreditoPara(null);
            if (ok) {
              qc.invalidateQueries({ queryKey: ["clientes-saldos"] });
              qc.invalidateQueries({ queryKey: ["cliente-creditos"] });
            }
          }} />
      )}

      {creditoPicker && (
        <SelecionarClienteCreditoDialog
          clientes={clientes ?? []}
          onClose={(cliente) => {
            setCreditoPicker(false);
            if (cliente) setCreditoPara(cliente);
          }} />
      )}

      {detalhe && <LancamentosDialog cliente={detalhe} onClose={() => setDetalhe(null)} />}
    </FiadoLayout>
  );
}

function SelecionarClienteCreditoDialog({ clientes, onClose }: {
  clientes: any[];
  onClose: (cliente: any | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const filtrados = (clientes ?? []).filter((c) =>
    c.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Lançar crédito — selecionar cliente
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar cliente por nome…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9" />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {filtrados.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum cliente encontrado.
              </p>
            ) : (
              <ul className="divide-y">
                {filtrados.slice(0, 50).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent"
                      onClick={() => onClose(c)}>
                      <span className="font-medium">{c.nome}</span>
                      {c.telefone && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.telefone}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onClose(null)}>Cancelar</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExcluirClientesDialog({ clientes, saldos, onClose }: {
  clientes: any[];
  saldos?: Record<string, { fiado: number; credito: number; saldo: number }>;
  onClose: (ok?: boolean) => void;
}) {
  const [confirmacao, setConfirmacao] = useState("");
  const [busy, setBusy] = useState(false);
  const comDivida = clientes.filter((c) => (saldos?.[c.id]?.saldo ?? 0) > 0);
  const podeExcluir = confirmacao.trim().toUpperCase() === "EXCLUIR" && !busy;

  async function excluir() {
    setBusy(true);
    const ids = clientes.map((c) => c.id);

    const { data: comFiados, error: errFiados } = await supabase
      .from("fiados").select("cliente_id").in("cliente_id", ids);
    if (errFiados) { setBusy(false); toast.error(errFiados.message); return; }
    const bloqueados = new Set((comFiados ?? []).map((f: any) => f.cliente_id));
    const excluiveis = ids.filter((id) => !bloqueados.has(id));

    if (excluiveis.length === 0) {
      setBusy(false);
      toast.error("Nenhum cliente pode ser excluído: todos possuem lançamentos vinculados.");
      return;
    }

    const { error } = await supabase.from("clientes").delete().in("id", excluiveis);
    setBusy(false);
    if (error) { toast.error(error.message); return; }

    await logActivity("clientes_excluidos_em_massa", {
      quantidade: excluiveis.length,
      clientes: clientes.filter((c) => excluiveis.includes(c.id)).map((c) => ({ id: c.id, nome: c.nome })),
      bloqueados_com_lancamentos: clientes.filter((c) => bloqueados.has(c.id)).map((c) => c.nome),
    });

    toast.success(
      bloqueados.size > 0
        ? `${excluiveis.length} cliente(s) excluído(s). ${bloqueados.size} mantido(s) por ter lançamentos.`
        : `${excluiveis.length} cliente(s) excluído(s)`,
    );
    onClose(true);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Excluir clientes em massa
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted p-3 text-sm">
          Você está prestes a excluir <strong>{clientes.length}</strong> cliente(s).
          Esta ação é permanente e será registrada no log de atividades.
        </div>

        {comDivida.length > 0 && (
          <div className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
            {comDivida.length} cliente(s) selecionado(s) possuem valores em aberto. Clientes com
            lançamentos vinculados não serão excluídos.
          </div>
        )}

        <div className="max-h-48 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-2 py-1">{c.nome}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap text-muted-foreground">
                    {brl(saldos?.[c.id]?.saldo ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1.5">
          <Label>Digite <strong>EXCLUIR</strong> para confirmar</Label>
          <Input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder="EXCLUIR" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose()}>Cancelar</Button>
          <Button variant="destructive" disabled={!podeExcluir} onClick={excluir} className="gap-2">
            <Trash2 className="h-4 w-4" /> Excluir definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TIPOS: { value: string; label: string }[] = [
  { value: "fiado", label: "Fiado" },
  { value: "credito", label: "Crédito" },
  { value: "credito_usado", label: "Abatimento de crédito" },
  { value: "recebimento", label: "Recebimento" },
  { value: "baixa_parcial", label: "Baixa parcial" },
];

const PAGE_SIZE = 10;

function LancamentosDialog({ cliente, onClose }: { cliente: any; onClose: () => void }) {
  const [tipo, setTipo] = useState<string>("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [page, setPage] = useState(0);

  const { data: lancamentos, isLoading } = useQuery({
    queryKey: ["cliente-lancamentos", cliente.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fiados")
        .select("id, valor, descricao, data_inicio, data_vencimento, status, baixa_em")
        .eq("cliente_id", cliente.id)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: creditosCliente } = useQuery({
    queryKey: ["cliente-creditos", cliente.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("creditos")
        .select("id, valor, descricao, observacao, data_credito, fiado_id")
        .eq("cliente_id", cliente.id)
        .order("data_credito", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const fiadoIds = (lancamentos ?? []).map((f: any) => f.id);
  const { data: baixas } = useQuery({
    queryKey: ["cliente-baixas", cliente.id, fiadoIds.length],
    enabled: fiadoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("baixas_solicitacoes")
        .select("id, fiado_id, valor_pago, observacao, decidido_em")
        .in("fiado_id", fiadoIds).eq("status", "aprovada");
      if (error) throw error;
      return data ?? [];
    },
  });

  const eventos = [
    ...(lancamentos ?? []).map((f: any) => ({
      id: `f-${f.id}`, tipo: "fiado", data: f.data_inicio,
      descricao: f.descricao || "Fiado", valor: Number(f.valor), sinal: 1,
    })),
    ...(creditosCliente ?? []).map((c: any) => {
      const usado = Number(c.valor) < 0;
      const origem = usado && c.fiado_id
        ? (lancamentos ?? []).find((f: any) => f.id === c.fiado_id)
        : null;
      const descricao = usado
        ? c.observacao ||
          `Abatimento automático de R$ ${Math.abs(Number(c.valor)).toFixed(2).replace(".", ",")} do saldo positivo` +
            (origem
              ? ` no fiado "${origem.descricao || "Fiado"}" de ${fmtDate(origem.data_inicio)} (valor original ${brl(origem.valor)})`
              : "")
        : c.descricao || "Crédito";
      return {
        id: `c-${c.id}`, tipo: usado ? "credito_usado" : "credito",
        data: c.data_credito, descricao,
        valor: Math.abs(Number(c.valor)), sinal: -1,
      };
    }),
    ...(baixas ?? []).map((b: any) => {
      const f = (lancamentos ?? []).find((x: any) => x.id === b.fiado_id);
      return {
        id: `b-${b.id}`,
        tipo: b.valor_pago == null ? "recebimento" : "baixa_parcial",
        data: (b.decidido_em ?? "").slice(0, 10),
        descricao: b.observacao || (b.valor_pago == null ? "Recebimento total" : "Baixa parcial"),
        valor: Number(b.valor_pago ?? f?.valor ?? 0), sinal: -1,
      };
    }),
  ].sort((a, b) => (a.data < b.data ? 1 : -1));

  const dentroPeriodo = (d: string) => (!de || d >= de) && (!ate || d <= ate);
  const filtrados = eventos.filter((e) => (tipo === "todos" || e.tipo === tipo) && dentroPeriodo(e.data));
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pagina = Math.min(page, totalPaginas - 1);
  const visiveis = filtrados.slice(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE);

  const fiadosPeriodo = (lancamentos ?? []).filter((f: any) => dentroPeriodo(f.data_inicio));
  const abertos = fiadosPeriodo.filter((f: any) => f.status !== "pago");
  const pagos = fiadosPeriodo.filter((f: any) => f.status === "pago");
  const vencidos = fiadosPeriodo.filter((f: any) => f.status === "vencido");
  const creditosPeriodo = (creditosCliente ?? []).filter((c: any) => dentroPeriodo(c.data_credito));

  const totalAberto = abertos.reduce((s, f: any) => s + Number(f.valor), 0);
  const totalPago = pagos.reduce((s, f: any) => s + Number(f.valor), 0);
  const totalVencido = vencidos.reduce((s, f: any) => s + Number(f.valor), 0);
  const totalCredito = creditosPeriodo.reduce((s, c: any) => s + Number(c.valor), 0);
  const creditoDisp = Math.max(0, (creditosCliente ?? []).reduce((s, c: any) => s + Number(c.valor), 0));
  const saldoFinal = totalAberto - creditoDisp;
  const temPeriodo = !!de || !!ate;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Histórico — {cliente.nome}</DialogTitle></DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => { setTipo(v); setPage(0); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPage(0); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPage(0); }} />
          </div>
          <Button variant="ghost" onClick={() => { setTipo("todos"); setDe(""); setAte(""); setPage(0); }}>
            Limpar filtros
          </Button>
        </div>

        <div className="rounded-md border">
          <div className="px-3 py-2 text-sm font-medium border-b">
            Resumo financeiro {temPeriodo ? `— período ${de ? fmtDate(de) : "início"} a ${ate ? fmtDate(ate) : "hoje"}` : "— total geral"}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3">
            <div className={`rounded-md p-2 -m-1 ${
              saldoFinal > 0 ? "bg-destructive/10" : saldoFinal < 0 ? "bg-success/10" : "bg-muted"
            }`}>
              <div className="text-xs text-muted-foreground">Saldo atual</div>
              <div className={`text-lg font-bold ${
                saldoFinal > 0 ? "text-destructive" : saldoFinal < 0 ? "text-success" : "text-foreground"
              }`}>
                {brl(Math.abs(saldoFinal))}
              </div>
              <div className="text-xs text-muted-foreground">
                {saldoFinal > 0 ? "devedor" : saldoFinal < 0 ? "a favor (crédito)" : "zerado"}
                {saldoFinal > 0 && creditoDisp > 0 ? ` · após ${brl(creditoDisp)} de crédito` : ""}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Fiado em aberto</div>
              <div className="text-lg font-semibold text-destructive">{brl(totalAberto)}</div>
              <div className="text-xs text-muted-foreground">{abertos.length} lançamento(s)</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Vencido</div>
              <div className="text-lg font-semibold text-destructive">{brl(totalVencido)}</div>
              <div className="text-xs text-muted-foreground">{vencidos.length} lançamento(s)</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Créditos</div>
              <div className="text-lg font-semibold text-success">{brl(totalCredito)}</div>
              <div className="text-xs text-muted-foreground">{creditosPeriodo.length} lançamento(s)</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Já pago</div>
              <div className="text-lg font-semibold text-success">{brl(totalPago)}</div>
              <div className="text-xs text-muted-foreground">{pagos.length} lançamento(s)</div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lançamento para os filtros aplicados.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{e.data ? fmtDate(e.data) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={e.sinal > 0 ? "destructive" : "secondary"}>
                        {TIPOS.find((t) => t.value === e.tipo)?.label ?? e.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[260px] truncate" title={e.descricao}>{e.descricao}</TableCell>
                    <TableCell className={`text-right font-semibold whitespace-nowrap ${e.sinal > 0 ? "text-destructive" : "text-success"}`}>
                      {e.sinal > 0 ? "+ " : "- "}{brl(e.valor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {filtrados.length} registro(s) — página {pagina + 1} de {totalPaginas}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={pagina === 0}
                  onClick={() => setPage(pagina - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={pagina >= totalPaginas - 1}
                  onClick={() => setPage(pagina + 1)}>Próxima</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NovoClienteDialog({ onClose }: { onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome"); return; }
    setSubmitting(true);

    const { data: existing } = await supabase.from("clientes").select("id")
      .eq("nome_lower", nome.trim().toLowerCase()).maybeSingle();
    if (existing) {
      toast.error("Já existe um cliente com esse nome");
      setSubmitting(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("clientes").insert({
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      observacao: observacao.trim() || null,
      created_by: user?.id ?? null,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    logActivity("cliente_criado", { nome: nome.trim() });
    toast.success("Cliente cadastrado");
    onClose();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome completo *</Label>
          <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tel">Telefone</Label>
          <Input id="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="obs">Observação</Label>
          <Textarea id="obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>Cadastrar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function NovoCreditoDialog({ cliente, onClose }: { cliente: any; onClose: (ok?: boolean) => void }) {
  const { user } = useFiadoAuth();
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("Crédito do cliente");
  const [data, setData] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [observacao, setObservacao] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(valor.replace(",", "."));
    if (!v || v <= 0) { toast.error("Informe um valor maior que zero"); return; }
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("creditos").insert({
      cliente_id: cliente.id,
      valor: v,
      descricao: descricao.trim() || "Crédito",
      observacao: observacao.trim() || null,
      data_credito: data,
      lancado_por: user.id,
    });
    if (error) { setBusy(false); toast.error(error.message); return; }
    await logActivity("credito_lancado", { cliente: cliente.nome, valor: v, data });
    let extra = "";
    try {
      const r = await abaterCreditoEmFiados(cliente.id);
      if (r.usado > 0) {
        extra = ` — ${brl(r.usado)} abatidos em ${r.quitados + r.parciais} fiado(s)`;
        await logActivity("credito_abatido_automatico", { cliente: cliente.nome, ...r });
      }
    } catch { /* ignora falha de abatimento automático */ }
    setBusy(false);
    toast.success(`Crédito de ${brl(v)} lançado para ${cliente.nome}${extra}`);
    onClose(true);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Lançar crédito — {cliente.nome}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cred-valor">Valor do crédito *</Label>
            <Input id="cred-valor" inputMode="decimal" value={valor}
              onChange={(e) => setValor(e.target.value)} placeholder="0,00" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cred-data">Data</Label>
            <Input id="cred-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cred-desc">Descrição</Label>
            <Input id="cred-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cred-obs">Observação</Label>
            <Textarea id="cred-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onClose()}>Cancelar</Button>
            <Button type="submit" disabled={busy}>Lançar crédito</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
