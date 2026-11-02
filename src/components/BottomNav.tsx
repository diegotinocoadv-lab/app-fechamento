import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { meuAcesso } from "@/lib/usuarios.functions";
import { meuCaixa, fecharMeuCaixa } from "@/lib/caixas.functions";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LayoutDashboard,
  Wallet,
  PenLine,
  LogOut,
  MoreHorizontal,
  X,
  ClipboardList,
  FileText,
  Users,
  Settings,
  Lock,
  Loader2,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";

const adminMenu = [
  { to: "/fechamentos", label: "Historico", icon: ClipboardList },
  { to: "/controle-boloes", label: "Boloes", icon: Ticket },
  { to: "/criacao-boloes", label: "Criacao", icon: Ticket },
  { to: "/contas", label: "Contas", icon: Settings },
  { to: "/conferencia", label: "Extrato", icon: FileText },
  { to: "/fiado-dashboard", label: "Fiado", icon: FileText },
  { to: "/usuarios", label: "Usuarios", icon: Users },
];

export function BottomNav() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [menuAberto, setMenuAberto] = useState(false);
  const [fecharConfirm, setFecharConfirm] = useState(false);
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const qc = useQueryClient();
  const acessoFn = useServerFn(meuAcesso);
  const meuCaixaFn = useServerFn(meuCaixa);
  const fecharFn = useServerFn(fecharMeuCaixa);

  const { data } = useQuery({
    queryKey: ["meu-acesso"],
    queryFn: () => acessoFn({}),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: caixaData } = useQuery({
    queryKey: ["meu-caixa"],
    queryFn: () => meuCaixaFn({}),
    staleTime: 30_000,
  });

  const fecharMut = useMutation({
    mutationFn: (caixaId: string) => fecharFn({ data: { id: caixaId } }),
    onSuccess: (res) => {
      if (res.erro) { toast.error(res.erro); return; }
      toast.success("Caixa fechado com sucesso!");
      setFecharConfirm(false);
      void qc.invalidateQueries({ queryKey: ["meu-caixa"] });
      void navigate({ to: "/inicio" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao fechar caixa."),
  });

  const isAdmin = Boolean(data?.admin);
  const caixaHoje = caixaData?.caixaHoje ?? null;
  const caixaAberto = caixaHoje?.situacao === "aberto";

  if (!isMobile) return null;

  const sair = async () => {
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  // Operador sem caixa aberto: mostra só Início + Sair (sem ele não há como deslogar no celular).
  if (!isAdmin && !caixaAberto) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border bg-card shadow-lg safe-area-bottom no-print">
        <div className="flex items-center justify-around px-1 py-1">
          <Link
            to="/inicio"
            className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-medium transition-colors active:bg-accent ${
              currentPath === "/inicio"
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Início</span>
          </Link>
          <button
            onClick={sair}
            className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10"
          >
            <LogOut className="h-5 w-5" />
            <span>Sair</span>
          </button>
        </div>
      </nav>
    );
  }

  const itemClass = (path: string) =>
    `flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-medium transition-colors active:bg-accent ${
      currentPath === path
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border bg-card shadow-lg safe-area-bottom no-print">
        <div className="flex items-center justify-around px-1 py-1">
          {isAdmin ? (
            <>
              <Link to="/dashboard" search={{ data: "" }} className={itemClass("/dashboard")}>
                <LayoutDashboard className="h-5 w-5" />
                <span>Home</span>
              </Link>
              <Link to="/fechamento" className={itemClass("/fechamento")}>
                <ClipboardList className="h-5 w-5" />
                <span>Fechamento</span>
              </Link>
              <Link to="/meu-caixa" className={itemClass("/meu-caixa")}>
                <Wallet className="h-5 w-5" />
                <span>Caixa</span>
              </Link>
              <Link to="/lancar" search={{ tipo: "" }} className={itemClass("/lancar")}>
                <PenLine className="h-5 w-5" />
                <span>Lançar</span>
              </Link>
              <button
                onClick={() => setMenuAberto(true)}
                className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent"
              >
                <MoreHorizontal className="h-5 w-5" />
                <span>Mais</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/inicio" className={itemClass("/inicio")}>
                <LayoutDashboard className="h-5 w-5" />
                <span>Início</span>
              </Link>
              <Link to="/lancar" search={{ tipo: "" }} className={itemClass("/lancar")}>
                <PenLine className="h-5 w-5" />
                <span>Lançar</span>
              </Link>
              <button
                onClick={() => setFecharConfirm(true)}
                className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10"
              >
                <Lock className="h-5 w-5" />
                <span>Fechar</span>
              </button>
            </>
          )}

          <button
            onClick={sair}
            className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10"
          >
            <LogOut className="h-5 w-5" />
            <span>Sair</span>
          </button>
        </div>
      </nav>

      {menuAberto && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuAberto(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[60vh] overflow-y-auto rounded-t-2xl bg-card border-t border-border shadow-xl safe-area-bottom">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sticky top-0 bg-card">
              <span className="text-sm font-semibold text-foreground">Mais opções</span>
              <button
                onClick={() => setMenuAberto(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 p-3">
              {adminMenu.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setMenuAberto(false)}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-center text-xs font-medium text-foreground transition-colors hover:bg-accent active:bg-accent"
                >
                  <l.icon className="h-5 w-5 text-muted-foreground" />
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {fecharConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Fechar Caixa</h3>
            {!caixaHoje?.fechamentoId && (
              <p className="mt-2 rounded-md bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-400">
                Nenhum fechamento foi salvo para hoje. Deseja fechar o caixa mesmo assim?
              </p>
            )}
            {caixaHoje?.fechamentoId && (
              <p className="mt-2 text-sm text-muted-foreground">Tem certeza que deseja fechar o caixa?</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setFecharConfirm(false)} className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent">Cancelar</button>
              <button
                onClick={() => { if (caixaHoje) fecharMut.mutate(caixaHoje.id); }}
                disabled={fecharMut.isPending}
                className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {fecharMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fechar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
