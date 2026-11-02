import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { logActivity } from "@/lib/log";
import { Plus, Loader2 } from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFiadoAuth } from "@/hooks/use-fiado-auth";
import { abaterCreditoEmFiados } from "@/lib/fiado-creditos";
import { brl } from "@/lib/format";
import { FiadoLayout } from "@/components/FiadoLayout";

export const Route = createFileRoute("/_authenticated/fiado-novo")({
  head: () => ({ meta: [{ title: "Novo Fiado" }] }),
  component: NovoFiado,
});

function NovoFiado() {
  const navigate = useNavigate();
  const { user } = useFiadoAuth();
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [search, setSearch] = useState("");
  const [openCli, setOpenCli] = useState(false);
  const [openNovoCli, setOpenNovoCli] = useState(false);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [dataVenc, setDataVenc] = useState("");
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: clientes, refetch: refetchClientes } = useQuery({
    queryKey: ["clientes-autocomplete", search],
    queryFn: async () => {
      let q = supabase.from("clientes").select("id, nome").order("nome").limit(20);
      if (search.trim()) q = q.ilike("nome", `%${search.trim()}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  const hoje = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const dataInicioFutura = dataInicio > hoje;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) { toast.error("Selecione um cliente"); return; }
    const v = parseFloat(valor.replace(",", "."));
    if (!(v > 0)) { toast.error("Valor deve ser maior que zero"); return; }
    if (!descricao.trim()) { toast.error("Informe a descrição"); return; }
    if (dataInicioFutura) {
      toast.error("A data de início não pode ser no futuro"); return;
    }
    if (new Date(dataVenc) < new Date(dataInicio)) {
      toast.error("Vencimento não pode ser anterior à data de início"); return;
    }
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("fiados").insert({
      cliente_id: clienteId, valor: v, descricao: descricao.trim(),
      data_inicio: dataInicio, data_vencimento: dataVenc,
      observacao: observacao.trim() || null, lancado_por: user.id,
    });
    if (error) { setSubmitting(false); toast.error(error.message); return; }

    try {
      const { data: perfil } = await supabase.from("profiles").select("nome, email").eq("id", user.id).maybeSingle();
      await supabase.from("lancamentos_simples").insert({
        tipo: "CAIXA",
        valor: v,
        descricao: `Fiado — ${clienteNome} — ${descricao.trim()}`,
        campo: "fiado",
        data: dataInicio,
        operador_id: user.id,
        operador_nome: perfil?.nome || perfil?.email || null,
      });
    } catch {
      // lancamentos_simples insert failed — fiado already created, continue
    }
    logActivity("fiado_criado", { cliente_id: clienteId, valor: v });
    try {
      const r = await abaterCreditoEmFiados(clienteId);
      if (r.usado > 0) {
        toast.success(`Fiado lançado! ${brl(r.usado)} abatidos do crédito do cliente.`);
      } else {
        toast.success("Fiado lançado!");
      }
    } catch {
      toast.success("Fiado lançado!");
    }
    setSubmitting(false);
    navigate({ to: "/fiado-fiados" });
  }

  return (
    <FiadoLayout title="Novo fiado" subtitle="Registre um fiado para um cliente">
      <Card>
        <CardHeader>
          <CardTitle>Novo fiado</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cliente *</Label>
              <div className="flex gap-2">
                <Popover open={openCli} onOpenChange={setOpenCli}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="flex-1 justify-start">
                      {clienteNome || "Buscar cliente…"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="Digite o nome…" value={search} onValueChange={setSearch} />
                      <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        <CommandGroup>
                          {(clientes ?? []).map((c) => (
                            <CommandItem key={c.id} value={c.id}
                              onSelect={() => { setClienteId(c.id); setClienteNome(c.nome); setOpenCli(false); }}>
                              {c.nome}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button type="button" variant="secondary" onClick={() => setOpenNovoCli(true)} className="gap-1">
                  <Plus className="h-4 w-4" /> Novo
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="valor">Valor (R$) *</Label>
                <Input id="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ini">Data de início *</Label>
                <Input id="ini" type="date" value={dataInicio} max={hoje}
                  onChange={(e) => setDataInicio(e.target.value)} required
                  aria-invalid={dataInicioFutura}
                  className={dataInicioFutura ? "border-destructive focus-visible:ring-destructive" : ""} />
                {dataInicioFutura && (
                  <p className="text-xs text-destructive">A data de início não pode ser no futuro.</p>
                )}
              </div>
            </div>

              <div className="space-y-1.5">
                <Label htmlFor="venc">Data de pagamento (vencimento) *</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { dias: 7, rotulo: "7 dias" },
                    { dias: 15, rotulo: "15 dias" },
                    { dias: 30, rotulo: "30 dias" },
                  ].map((c) => (
                    <Button
                      key={c.dias}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + c.dias);
                        setDataVenc(
                          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                        );
                      }}
                    >
                      Daqui a {c.rotulo}
                    </Button>
                  ))}
                </div>
                <Input id="venc" type="date" value={dataVenc} onChange={(e) => setDataVenc(e.target.value)} required />
              </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">Descrição *</Label>
              <Input id="desc" value={descricao} onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: 5 raspadinhas + 1 Quina" required maxLength={200} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="obs">Observação</Label>
              <Textarea id="obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} />
            </div>

            <Button type="submit" disabled={submitting || dataInicioFutura} className="w-full" size="lg">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lançar fiado"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <NovoClienteRapido open={openNovoCli} onClose={() => setOpenNovoCli(false)}
        onCreated={(c) => { setClienteId(c.id); setClienteNome(c.nome); refetchClientes(); }} />
    </FiadoLayout>
  );
}

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function NovoClienteRapido({ open, onClose, onCreated }:
  { open: boolean; onClose: () => void; onCreated: (c: { id: string; nome: string }) => void }) {
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setNome(""); setTel(""); } }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setBusy(true);
    const { data: existing } = await supabase.from("clientes").select("id, nome")
      .eq("nome_lower", nome.trim().toLowerCase()).maybeSingle();
    if (existing) {
      toast.info("Cliente já existia — selecionado");
      onCreated(existing); onClose(); setBusy(false); return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("clientes")
      .insert({ nome: nome.trim(), telefone: tel.trim() || null, created_by: user?.id ?? null })
      .select("id, nome").single();
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? "Erro"); return; }
    logActivity("cliente_criado", { nome: data.nome });
    toast.success("Cliente cadastrado");
    onCreated(data); onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cadastrar cliente</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>Cadastrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
