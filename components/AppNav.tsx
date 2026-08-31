import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { meuAcesso } from "@/lib/usuarios.functions";

export function AppNav() {
  const navigate = useNavigate();
  const acessoFn = useServerFn(meuAcesso);
  const { data } = useQuery({
    queryKey: ["meu-acesso"],
    queryFn: () => acessoFn({}),
  });

  const sair = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const linkCls =
    "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <nav className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <Link
          to="/fechamento"
          className={linkCls}
          activeProps={{ className: `${linkCls} bg-secondary text-foreground` }}
        >
          Fechamento
        </Link>
        <Link
          to="/importar"
          className={linkCls}
          activeProps={{ className: `${linkCls} bg-secondary text-foreground` }}
        >
          Importar imagem
        </Link>
        <Link
          to="/fechamentos"
          className={linkCls}
          activeProps={{ className: `${linkCls} bg-secondary text-foreground` }}
        >
          Histórico
        </Link>
        {data?.admin && (
          <Link
            to="/usuarios"
            className={linkCls}
            activeProps={{ className: `${linkCls} bg-secondary text-foreground` }}
          >
            Usuários
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2 px-2">
        <span className="text-xs text-muted-foreground">
          {data?.perfil?.nome || data?.perfil?.email}
        </span>
        <button
          onClick={sair}
          className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          Sair
        </button>
      </div>
    </nav>
  );
}
