import { useEffect } from "react";
import { X, CheckCircle2, AlertCircle } from "lucide-react";

interface ToastProps {
  mensagem: string;
  tipo: "sucesso" | "erro";
  onFechar: () => void;
  duracao?: number;
}

export function Toast({ mensagem, tipo, onFechar, duracao = 4000 }: ToastProps) {
  useEffect(() => {
    if (duracao <= 0) return;
    const timer = setTimeout(onFechar, duracao);
    return () => clearTimeout(timer);
  }, [duracao, onFechar]);

  const estilos =
    tipo === "sucesso"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "border-destructive/40 bg-destructive/10 text-destructive";

  const Icone = tipo === "sucesso" ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm transition-all ${estilos}`}
    >
      <Icone className="h-5 w-5 shrink-0" />
      <span>{mensagem}</span>
      <button
        onClick={onFechar}
        className="ml-2 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
