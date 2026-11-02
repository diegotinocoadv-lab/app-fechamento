import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { caixaPendente } from "@/lib/pendencia.functions";
import { brl } from "@/lib/fechamento-campos";
import { AlertTriangle } from "lucide-react";

const dataBr = (d: string) => d.split("-").reverse().join("/");

/** Notificação para o operador que ainda não fechou o caixa do dia. */
export function AvisoCaixaPendente() {
  const pendenteFn = useServerFn(caixaPendente);
  const { data } = useQuery({
    queryKey: ["caixa-pendente"],
    queryFn: () => pendenteFn({}),
    staleTime: 60_000,
  });

  if (!data?.pendente) return null;

  return (
    <div
      role="status"
      className="mb-3 overflow-hidden rounded-lg border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/5"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 text-sm">
          <strong className="font-semibold text-foreground">
            Caixa de {dataBr(data.data)} em aberto.
          </strong>{" "}
          <span className="text-muted-foreground">
            Total a fechar:{" "}
            <span className="font-semibold text-foreground">{brl(data.totalAFechar)}</span>
            {data.ultimaData
              ? ` (saldo final de ${dataBr(data.ultimaData)})`
              : " (abertura padrão)"}
          </span>
        </div>
        <Link
          to="/fechamento"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
        >
          Fechar agora
        </Link>
      </div>
    </div>
  );
}
