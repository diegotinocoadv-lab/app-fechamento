import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFiadoAuth } from "@/hooks/use-fiado-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate, isVencido } from "@/lib/format";
import {
  Users, FileText, DollarSign, AlertTriangle, Clock, CheckSquare,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { FiadoLayout } from "@/components/FiadoLayout";

export const Route = createFileRoute("/_authenticated/fiado-dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Fiado" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { role, user, nome } = useFiadoAuth();
  const isAdmin = role === "admin";

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats", role, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const fiadosQ = supabase.from("fiados").select("id, valor, status, data_vencimento, cliente_id");
      const [{ data: fiados }, { count: totalClientes }, { count: baixasPend }] = await Promise.all([
        fiadosQ,
        supabase.from("clientes").select("*", { count: "exact", head: true }),
        supabase.from("baixas_solicitacoes").select("*", { count: "exact", head: true })
          .eq("status", "pendente"),
      ]);

      const abertos = (fiados ?? []).filter((f) => f.status !== "pago");
      const valorAberto = abertos.reduce((s, f) => s + Number(f.valor), 0);
      const vencidos = abertos.filter((f) => isVencido(f.data_vencimento, f.status));
      return {
        totalClientes: totalClientes ?? 0,
        totalAbertos: abertos.length,
        valorAberto,
        vencidos: vencidos.length,
        baixasPendentes: baixasPend ?? 0,
      };
    },
  });

  const { data: ultimos } = useQuery({
    queryKey: ["dashboard-ultimos", role, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const { data } = await supabase.from("fiados").select(
        "id, valor, descricao, data_inicio, data_vencimento, status, cliente_id"
      ).order("created_at", { ascending: false }).limit(8);
      const rows = data ?? [];
      const cidSet = new Set(rows.map((r: any) => r.cliente_id).filter(Boolean));
      const cliRes = cidSet.size > 0
        ? await supabase.from("clientes").select("id, nome").in("id", [...cidSet])
        : { data: [] as any[] };
      const cmap = new Map((cliRes.data ?? []).map((c: any) => [c.id, c]));
      return rows.map((r: any) => ({ ...r, cliente: cmap.get(r.cliente_id) ?? null }));
    },
  });

  const { data: baixas } = useQuery({
    queryKey: ["dashboard-baixas"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("baixas_solicitacoes")
        .select("id, observacao, created_at, solicitado_por, fiado_id")
        .eq("status", "pendente")
        .order("created_at", { ascending: false }).limit(5);
      const rows = data ?? [];
      const fiadoIds = [...new Set(rows.map((b: any) => b.fiado_id).filter(Boolean))];
      const fiadosRes = fiadoIds.length > 0
        ? await supabase.from("fiados").select("id, valor, descricao, cliente_id").in("id", fiadoIds)
        : { data: [] as any[] };
      const clienteIds = [...new Set((fiadosRes.data ?? []).map((f: any) => f.cliente_id).filter(Boolean))];
      const clientesRes = clienteIds.length > 0
        ? await supabase.from("clientes").select("id, nome").in("id", clienteIds)
        : { data: [] as any[] };
      const fmap = new Map((fiadosRes.data ?? []).map((f: any) => [f.id, f]));
      const cmap = new Map((clientesRes.data ?? []).map((c: any) => [c.id, c]));
      return rows.map((b: any) => {
        const fiado = fmap.get(b.fiado_id) ?? null;
        const cliente = fiado ? cmap.get(fiado.cliente_id) ?? null : null;
        return { ...b, fiado: fiado ? { ...fiado, cliente } : null };
      });
    },
  });

  const pendingCount = (ultimos ?? []).filter((f) => f.status === "aguardando_aprovacao").length;

  return (
    <FiadoLayout
      title={`Olá, ${nome?.split(" ")[0] ?? ""}`}
      subtitle={isAdmin ? "Visão geral do sistema de fiado" : "Seus lançamentos"}
    >
      <div className="space-y-4">
        {statsLoading ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-16" />
              </CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard icon={FileText} label="Em aberto" value={stats?.totalAbertos ?? 0} tone="primary" />
            <StatCard icon={DollarSign} label="Valor em aberto" value={brl(stats?.valorAberto ?? 0)} tone="accent" />
            <StatCard icon={AlertTriangle} label="Vencidos" value={stats?.vencidos ?? 0} tone="destructive" />
            {isAdmin ? (
              <StatCard
                icon={CheckSquare}
                label="Baixas pendentes"
                value={stats?.baixasPendentes ?? 0}
                tone="warning"
                highlight={Boolean(stats?.baixasPendentes)}
              />
            ) : (
              <StatCard icon={Clock} label="Aguardando" value={pendingCount} tone="warning" />
            )}
          </div>
        )}

        {isAdmin && baixas && baixas.length > 0 && (
          <Link to="/fiado-baixas" className="block">
            <Card className="border-warning/40 bg-warning/5 transition-colors hover:border-warning/60 hover:bg-warning/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-warning" />
                    Baixas pendentes ({baixas.length})
                  </span>
                  <span className="text-xs text-primary">Ver todas →</span>
                </div>
                <div className="divide-y divide-border/50">
                  {baixas.map((b: any) => (
                    <div key={b.id} className="py-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{b.fiado?.cliente?.nome} — {brl(b.fiado?.valor)}</span>
                      <Badge variant="outline" className="border-warning text-warning shrink-0 text-xs">Pendente</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">Últimos fiados</h2>
              <Link to="/fiado-fiados" className="text-xs text-primary hover:underline">Ver todos →</Link>
            </div>
            {(ultimos === undefined && statsLoading) ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead className="hidden sm:table-cell">Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ultimos ?? []).map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.cliente?.nome ?? "—"}</TableCell>
                      <TableCell className="font-semibold">{brl(f.valor)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">{fmtDate(f.data_vencimento)}</TableCell>
                      <TableCell><StatusBadge status={f.status} dataVencimento={f.data_vencimento} /></TableCell>
                    </TableRow>
                  ))}
                  {(ultimos ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhum fiado registrado ainda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/fiado-novo">
            <Card className="transition-colors hover:border-primary/40 hover:bg-primary/5 cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Novo fiado</div>
                  <div className="text-xs text-muted-foreground">Lançar fiado para um cliente</div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/fiado-clientes">
            <Card className="transition-colors hover:border-primary/40 hover:bg-primary/5 cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Clientes</div>
                  <div className="text-xs text-muted-foreground">Gerenciar cadastro de clientes</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </FiadoLayout>
  );
}

function StatCard({
  icon: Icon, label, value, tone, highlight,
}: { icon: any; label: string; value: any; tone: string; highlight?: boolean }) {
  const tones: Record<string, string> = {
    primary: "text-primary",
    accent: "text-accent-foreground",
    info: "text-info",
    destructive: "text-destructive",
    warning: "text-warning-foreground",
    success: "text-success",
  };
  return (
    <Card className={highlight ? "ring-2 ring-warning/50" : ""}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-4 w-4 ${tones[tone]}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
