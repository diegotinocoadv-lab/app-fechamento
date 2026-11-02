import { Badge } from "@/components/ui/badge";
import { isVencido } from "@/lib/format";

export function StatusBadge({ status, dataVencimento }: { status: string; dataVencimento?: string }) {
  if (status === "pago") {
    return <Badge className="bg-emerald-500 text-white hover:bg-emerald-600">Pago</Badge>;
  }
  if (status === "aguardando_aprovacao") {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-600">Aguardando</Badge>;
  }
  if (status === "vencido" || (dataVencimento && isVencido(dataVencimento, status))) {
    return <Badge className="bg-red-500 text-white hover:bg-red-600">Vencido</Badge>;
  }
  return <Badge variant="outline" className="border-blue-400 text-blue-600 dark:text-blue-400">Pendente</Badge>;
}
