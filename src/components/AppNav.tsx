import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { meuAcesso } from "@/lib/usuarios.functions";
import { meuCaixa, fecharMeuCaixa } from "@/lib/caixas.functions";
import { AvisoCaixaPendente } from "@/components/AvisoCaixaPendente";
import { LogOut, ChevronDown, Wallet, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AppNav() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [adminAberto, setAdminAberto] = useState(false);
  const [fiadoAberto, setFiadoAberto] = useState(false);
  const [fecharConfirm, setFecharConfirm] = useState(false);
  const [fiadoPos, setFiadoPos] = useState<{ top: number; left: number } | null>(null);
  const [adminPos, setAdminPos] = useState<{ top: number; left: number } | null>(null);
  const fiadoBtnRef = useRef<HTMLButtonElement>(null);
  const adminBtnRef = useRef<HTMLButtonElement>(null);

  const posDoBotao = (ref: React.RefObject<HTMLButtonElement | null>, larguraMenu: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - larguraMenu - 8)),
    };
  };

  const alternarFiado = () => {
    if (fiadoAberto) {
      setFiadoAberto(false);
      return;
    }
    setFiadoPos(posDoBotao(fiadoBtnRef, 208));
    setFiadoAberto(true);
    setAdminAberto(false);
  };

  const alternarAdmin = () => {
    if (adminAberto) {
      setAdminAberto(false);
      return;
    }
    setAdminPos(posDoBotao(adminBtnRef, 224));
    setAdminAberto(true);
    setFiadoAberto(false);
  };

  useEffect(() => {
    if (!fiadoAberto && !adminAberto) return;
    const fechar = () => {
      setFiadoAberto(false);
      setAdminAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("keydown", tecla);
    };
  }, [fiadoAberto, adminAberto]);
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

  const sair = async () => {
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const linkBase = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0";
  const linkNormal = `${linkBase} text-muted-foreground hover:bg-accent hover:text-foreground`;
  const linkAtivo = `${linkBase} bg-primary/10 text-primary font-semibold`;

  const isAdmin = Boolean(data?.admin);
  const caixaHoje = caixaData?.caixaHoje ?? null;
  const caixaAberto = caixaHoje?.situacao === "aberto";

  const adminLinks = [
    { to: "/fechamentos", label: "Historico de Fechamentos" },
    { to: "/controle-boloes", label: "Boloes" },
    { to: "/criacao-boloes", label: "Criacao de Boloes" },
    { to: "/contas", label: "Contas da Loterica" },
    { to: "/conferencia", label: "Conferencia com Extrato" },
    { to: "/usuarios", label: "Usuarios" },
  ];

  const fiadoLinks = [
    { to: "/fiado-dashboard", label: "Painel Fiado" },
    { to: "/fiado-clientes", label: "Clientes" },
    { to: "/fiado-novo", label: "Novo Fiado" },
    { to: "/fiado-fiados", label: "Fiados" },
    { to: "/fiado-baixas", label: "Baixas" },
  ];

  const nomeOperador = data?.perfil?.nome || data?.perfil?.email || "Operador";

  return (
    <>
      <AvisoCaixaPendente />
      <nav aria-label="Navegacao principal" className="mb-3 hidden md:block no-print">
        <div className="hidden md:flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <div className="flex items-center gap-1 flex-nowrap overflow-x-auto min-w-0 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {isAdmin ? (
              <>
                <Link to="/dashboard" search={{ data: "" }} className={linkNormal} activeProps={{ className: linkAtivo }}>Dashboard</Link>
                <Link to="/fechamento" className={linkNormal} activeProps={{ className: linkAtivo }}>Fechamento</Link>
                <Link to="/meu-caixa" className={linkNormal} activeProps={{ className: linkAtivo }}>Meu Caixa</Link>
                <Link to="/lancar" search={{ tipo: "" }} className={linkNormal} activeProps={{ className: linkAtivo }}>Lançar</Link>
                <Link to="/controle-boloes" search={{ de: "", ate: "", modalidade: "", situacao: "ativo" }} className={linkNormal} activeProps={{ className: linkAtivo }}>Bolões</Link>
                <Link to="/criacao-boloes" className={linkNormal} activeProps={{ className: linkAtivo }}>Criação</Link>
              </>
            ) : (
              <>
                <Link to="/inicio" className={linkNormal} activeProps={{ className: linkAtivo }}>Início</Link>
                {caixaAberto && (
                  <Link to="/lancar" search={{ tipo: "" }} className={linkNormal} activeProps={{ className: linkAtivo }}>Lançar</Link>
                )}
              </>
            )}

            {isAdmin && (
              <>
                <span className="mx-1 text-border">|</span>
                <button
                  ref={fiadoBtnRef}
                  onClick={alternarFiado}
                  className={`${linkNormal} inline-flex items-center gap-1.5`}
                >
                  <Wallet className="h-4 w-4" />
                  Fiado
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            {isAdmin && (
              <>
                <span className="mx-1 text-border">|</span>
                <button
                  ref={adminBtnRef}
                  onClick={alternarAdmin}
                  className={`${linkNormal} inline-flex items-center gap-1`}
                >
                  Administrativo
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {caixaAberto && (
              <button
                onClick={() => setFecharConfirm(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                <Lock className="h-3.5 w-3.5" />
                Fechar Caixa
              </button>
            )}
            <span className="text-xs text-muted-foreground max-w-[140px] truncate">{nomeOperador}</span>
            <button
              onClick={sair}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </nav>

      {fiadoAberto && fiadoPos && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setFiadoAberto(false)} />
          <div
            className="fixed z-[71] w-52 rounded-lg border border-border bg-card p-1 shadow-lg"
            style={{ top: fiadoPos.top, left: fiadoPos.left }}
          >
            {fiadoLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-primary/10 text-primary font-semibold" }}
                onClick={() => setFiadoAberto(false)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}

      {adminAberto && adminPos && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setAdminAberto(false)} />
          <div
            className="fixed z-[71] w-56 rounded-lg border border-border bg-card p-1 shadow-lg"
            style={{ top: adminPos.top, left: adminPos.left }}
          >
            {adminLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-primary/10 text-primary font-semibold" }}
                onClick={() => setAdminAberto(false)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </>
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
