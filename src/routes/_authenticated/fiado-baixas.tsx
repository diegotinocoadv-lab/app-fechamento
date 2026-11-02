import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { brl, fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { logActivity } from "@/lib/log";
import { Check, X, Inbox } from "lucide-react";
import { useFiadoAuth } from "@/hooks/use-fiado-auth";
import { FiadoLayout } from "@/components/FiadoLayout";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/fiado-baixas")({
  head: () => ({ meta: [{ title: "Baixas pendentes" }] }),
  component: BaixasPage,
});

function BaixasPage() {
  const { role, loading } = useFiadoAuth();
  const qc = useQueryClient();
  const [rejeitar, setRejeitar] = useState<any | null>(null);
  const [aprovando, setAprovando] = useState<any | null>(null);

  const { data: items } = useQuery({
    queryKey: ["baixas-pendentes"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data } = await supabase.from("baixas_solicitacoes")
        .select("id, observacao, valor_pago, created_at, status, solicitado_por, fiado_id")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      const rows = data ?? [];
      const fiadoIds = [...new Set(rows.map((b: any) => b.fiado_id).filter(Boolean))];
      const pids = [...new Set(rows.map((b: any) => b.solicitado_por).filter(Boolean))];
      const [fiadosRes, profisRes] = await Promise.all([
        fiadoIds.length > 0
          ? supabase.from("fiados").select("id, valor, descricao, cliente_id").in("id", fiadoIds)
          : { data: [] as any[] },
        pids.length > 0
          ? supabase.from("profiles").select("id, nome").in("id", pids)
          : { data: [] as any[] },
      ]);
      const clienteIds = [...new Set((fiadosRes.data ?? []).map((f: any) => f.cliente_id).filter(Boolean))];
      const clientesRes = clienteIds.length > 0
        ? await supabase.from("clientes").select("id, nome").in("id", clienteIds)
        : { data: [] as any[] };
      const fmap = new Map((fiadosRes.data ?? []).map((f: any) => [f.id, f]));
      const cmap = new Map((clientesRes.data ?? []).map((c: any) => [c.id, c]));
      const pmap = new Map((profisRes.data ?? []).map((p: any) => [p.id, p.nome]));
      return rows.map((b: any) => {
        const fiado = fmap.get(b.fiado_id) ?? null;
        const cliente = fiado ? cmap.get(fiado.cliente_id) ?? null : null;
        return { ...b, fiado: fiado ? { ...fiado, cliente } : null, nome_solicitante: pmap.get(b.solicitado_por) ?? "—" };
      });
    },
  });

  const { data: saldosPorCliente } = useQuery({
    queryKey: ["baixas-saldos"],
    enabled: role === "admin",
    queryFn: async () => {
      const [{ data: fiados }, { data: creditos }] = await Promise.all([
        supabase.from("fiados").select("cliente_id, valor").neq("status", "pago"),
        supabase.from("creditos").select("cliente_id, valor"),
      ]);
      const aberto = new Map<string, number>();
      for (const f of fiados ?? []) aberto.set(f.cliente_id, (aberto.get(f.cliente_id) ?? 0) + Number(f.valor));
      const cred = new Map<string, number>();
      for (const c of creditos ?? []) cred.set(c.cliente_id, (cred.get(c.cliente_id) ?? 0) + Number(c.valor));
      const map = new Map<string, number>();
      for (const [id, v] of aberto) map.set(id, v - Math.max(0, cred.get(id) ?? 0));
      return map;
    },
  });

  if (!loading && role !== "admin") {
    return (
      <FiadoLayout title="Baixas" subtitle="Solicitações e aprovação de baixas">
        <div className="text-center py-10 text-muted-foreground">Acesso restrito a administradores.</div>
      </FiadoLayout>
    );
  }

  async function aprovar(b: any) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("baixas_solicitacoes").update({
      status: "aprovada", decidido_por: user!.id, decidido_em: new Date().toISOString(),
    }).eq("id", b.id);
    if (error) { toast.error(error.message); return; }
    logActivity("baixa_aprovada", { fiado_id: b.fiado?.id });
    toast.success("Baixa aprovada");
    qc.invalidateQueries({ queryKey: ["baixas-pendentes"] });
  }

  return (
    <FiadoLayout title="Baixas" subtitle="Solicitações e aprovação de baixas">
      <div className="mx-auto max-w-5xl px-4 pb-6 pt-4 space-y-4">
        {items === undefined ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i}><CardContent className="p-4 space-y-3">
                <div className="flex justify-between"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-20" /></div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-2 pt-1"><Skeleton className="h-8 flex-1" /><Skeleton className="h-8 flex-1" /></div>
              </CardContent></Card>
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Nenhuma solicitação pendente.
          </CardContent></Card>
        ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(items ?? []).map((b: any) => (
            <Card key={b.id} className="border-warning/40">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{b.fiado?.cliente?.nome}</CardTitle>
                  <Badge className="bg-warning text-warning-foreground">{brl(b.fiado?.valor)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(() => {
                  const saldo = saldosPorCliente?.get(b.fiado?.cliente_id) ?? 0;
                  return (
                    <div className={`rounded-md px-2 py-1.5 text-xs font-semibold flex items-center justify-between ${
                      saldo > 0 ? "bg-destructive/10 text-destructive"
                        : saldo < 0 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    }`}>
                      <span>Saldo atual do cliente</span>
                      <span>{brl(Math.abs(saldo))} {saldo > 0 ? "devedor" : saldo < 0 ? "a favor" : "zerado"}</span>
                    </div>
                  );
                })()}
                <div><span className="text-muted-foreground">Descrição:</span> {b.fiado?.descricao}</div>
                {b.valor_pago != null && (
                  <div className="rounded-md border border-info/40 bg-info/5 p-2 text-xs space-y-0.5">
                    <div className="font-semibold text-info">Baixa parcial</div>
                    <div>Valor pago: <strong>{brl(b.valor_pago)}</strong></div>
                    <div>Saldo remanescente: <strong>{brl(Number(b.fiado?.valor) - Number(b.valor_pago))}</strong> (novo fiado será criado)</div>
                  </div>
                )}
                <div className="rounded bg-muted p-2 text-xs">
                  <div className="text-muted-foreground mb-0.5">Observação do operador:</div>
                  <div>{b.observacao}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Solicitado por <strong>{b.nome_solicitante}</strong> em {fmtDateTime(b.created_at)}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                    onClick={() => setAprovando(b)}>
                    <Check className="h-4 w-4 mr-1" /> Aprovar
                  </Button>
                  <Button size="sm" variant="destructive" className="flex-1" onClick={() => setRejeitar(b)}>
                    <X className="h-4 w-4 mr-1" /> Rejeitar
                  </Button>
                </div>
              </CardContent>
            </Card>

          ))}
        </div>
      )}

      {aprovando && (
        <AprovarDialog baixa={aprovando} onClose={(r) => {
          setAprovando(null);
          if (r) qc.invalidateQueries({ queryKey: ["baixas-pendentes"] });
        }} />
      )}

      {rejeitar && (
        <RejeitarDialog baixa={rejeitar} onClose={(r) => {
          setRejeitar(null);
          if (r) qc.invalidateQueries({ queryKey: ["baixas-pendentes"] });
        }} />
      )}
      </div>
    </FiadoLayout>
  );
}

function RejeitarDialog({ baixa, onClose }: { baixa: any; onClose: (r?: boolean) => void }) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) { toast.error("Informe o motivo"); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("baixas_solicitacoes").update({
      status: "rejeitada", decidido_por: user!.id, decidido_em: new Date().toISOString(),
      motivo_rejeicao: motivo.trim(),
    }).eq("id", baixa.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    logActivity("baixa_rejeitada", { fiado_id: baixa.fiado?.id, motivo: motivo.trim() });
    toast.success("Baixa rejeitada");
    onClose(true);
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rejeitar baixa</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Motivo da rejeição *</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required autoFocus maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={busy}>Rejeitar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AprovarDialog({ baixa, onClose }: { baixa: any; onClose: (r?: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("baixas_solicitacoes").update({
      status: "aprovada", decidido_por: user!.id, decidido_em: new Date().toISOString(),
    }).eq("id", baixa.id);
    if (error) { toast.error(error.message); setBusy(false); return; }
    logActivity("baixa_aprovada", { fiado_id: baixa.fiado?.id, motivo: motivo.trim() || undefined });

    const valorEstorno = baixa.valor_pago != null ? Number(baixa.valor_pago) : Number(baixa.fiado?.valor ?? 0);
    if (valorEstorno > 0) {
      const { data: perf } = await supabase.from("profiles").select("nome, email").eq("id", user!.id).maybeSingle();
      await supabase.from("lancamentos_simples").insert({
        tipo: "CAIXA", valor: -valorEstorno,
        descricao: `Estorno fiado — ${baixa.fiado?.cliente?.nome} — ${baixa.fiado?.descricao ?? ""}`,
        campo: "fiado", data: new Date().toISOString().slice(0, 10),
        operador_id: user!.id, operador_nome: perf?.nome || perf?.email || null,
      });
    }

    toast.success("Baixa aprovada");
    setBusy(false);
    onClose(true);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-success" /> Aprovar baixa
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <div><strong>Cliente:</strong> {baixa.fiado?.cliente?.nome}</div>
          <div><strong>Valor:</strong> {brl(baixa.fiado?.valor)}</div>
          <div><strong>Solicitado por:</strong> {baixa.nome_solicitante}</div>
        </div>
        <div className="space-y-1.5">
          <Label>Observação (opcional)</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500}
            placeholder="Motivo da aprovação" />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onClose()}>Cancelar</Button>
          <Button onClick={submit} disabled={busy} className="bg-success text-success-foreground hover:bg-success/90">
            <Check className="h-4 w-4 mr-1" /> Aprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
