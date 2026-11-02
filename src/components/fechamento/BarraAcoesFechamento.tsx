type Props = {
  salvando: boolean;
  gerandoPdf: boolean;
  isAdmin: boolean;
  onImprimir: () => void;
  onCompartilhar: () => void;
  onLimpar: () => void;
  onSalvar: () => void;
};

/** Barra fixa de ações do fechamento (imprimir, PDF, limpar, salvar). */
export function BarraAcoesFechamento({
  salvando,
  gerandoPdf,
  isAdmin,
  onImprimir,
  onCompartilhar,
  onLimpar,
  onSalvar,
}: Props) {
  return (
    <div className="fixed left-0 right-0 z-40 bottom-[60px] md:bottom-0 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-lg">
      {(salvando || gerandoPdf) && (
        <div className="mx-auto max-w-3xl px-4 pt-2">
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {salvando ? "Gerando o PDF e salvando no historico..." : "Montando o PDF..."}
          </p>
        </div>
      )}

      {/* Desktop layout */}
      <div className="hidden md:flex mx-auto max-w-3xl items-center justify-between gap-2 px-4 py-2">
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={onImprimir}
              className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Imprimir
            </button>
            <button
              onClick={onCompartilhar}
              disabled={gerandoPdf || salvando}
              className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {gerandoPdf ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Gerando PDF...
                </span>
              ) : (
                "Compartilhar PDF"
              )}
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onLimpar}
            className="inline-flex h-10 items-center rounded-md border border-destructive/30 bg-destructive/5 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            Limpar
          </button>
          <button
            onClick={onSalvar}
            disabled={salvando || gerandoPdf}
            className="inline-flex h-11 items-center rounded-md bg-emerald-600 px-6 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 shadow-md"
          >
            {salvando ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Salvando...
              </span>
            ) : (
              "Salvar e enviar"
            )}
          </button>
        </div>
      </div>

      {/* Mobile layout - save + limpar side by side */}
      <div className="flex md:hidden items-center gap-2 px-4 py-3">
        <button
          onClick={onSalvar}
          disabled={salvando || gerandoPdf}
          className="flex-[2] h-12 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-base font-bold text-white transition-colors hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 shadow-md"
        >
          {salvando ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Salvando...
            </>
          ) : (
            "Salvar e enviar"
          )}
        </button>
        <button
          onClick={onLimpar}
          className="flex-1 h-10 flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10"
        >
          Limpar
        </button>
      </div>
    </div>
  );
}
