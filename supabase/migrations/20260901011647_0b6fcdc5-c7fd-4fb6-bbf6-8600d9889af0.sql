CREATE TABLE public.transferencias_contas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date,
  conta_origem public.conta_loterica NOT NULL,
  conta_destino public.conta_loterica NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  observacoes text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT transferencias_contas_distintas CHECK (conta_origem <> conta_destino),
  CONSTRAINT transferencias_contas_valor_positivo CHECK (valor > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transferencias_contas TO authenticated;
GRANT ALL ON public.transferencias_contas TO service_role;

ALTER TABLE public.transferencias_contas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transferencias_contas_admin_all" ON public.transferencias_contas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_transferencias_contas_updated_at
  BEFORE UPDATE ON public.transferencias_contas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX transferencias_contas_data_idx ON public.transferencias_contas (data);