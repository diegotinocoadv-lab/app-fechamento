CREATE TABLE public.caixas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  operador_id uuid,
  operador_nome text,
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  situacao text NOT NULL DEFAULT 'aberto',
  observacoes text,
  fechamento_id uuid REFERENCES public.fechamentos(id) ON DELETE SET NULL,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.caixas TO authenticated;
GRANT ALL ON public.caixas TO service_role;

ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caixas_admin_all" ON public.caixas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "caixas_operador_select" ON public.caixas FOR SELECT TO authenticated
  USING (operador_id = auth.uid());

CREATE POLICY "caixas_operador_update" ON public.caixas FOR UPDATE TO authenticated
  USING (operador_id = auth.uid())
  WITH CHECK (operador_id = auth.uid());

CREATE INDEX caixas_data_idx ON public.caixas (data DESC);
CREATE INDEX caixas_operador_idx ON public.caixas (operador_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_caixas_updated_at
  BEFORE UPDATE ON public.caixas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();