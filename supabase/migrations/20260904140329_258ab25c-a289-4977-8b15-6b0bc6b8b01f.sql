CREATE TYPE public.tipo_lancamento_simples AS ENUM ('GAVETA', 'CAIXA');

CREATE TABLE public.lancamentos_simples (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo public.tipo_lancamento_simples NOT NULL,
  descricao text,
  valor numeric NOT NULL DEFAULT 0,
  data date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  caixa_numero text,
  operador_id uuid NOT NULL DEFAULT auth.uid(),
  operador_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos_simples TO authenticated;
GRANT ALL ON public.lancamentos_simples TO service_role;

ALTER TABLE public.lancamentos_simples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lancamentos_simples_admin_all" ON public.lancamentos_simples
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "lancamentos_simples_operador_select" ON public.lancamentos_simples
  FOR SELECT TO authenticated USING (operador_id = auth.uid());

CREATE POLICY "lancamentos_simples_operador_insert" ON public.lancamentos_simples
  FOR INSERT TO authenticated WITH CHECK (operador_id = auth.uid());

CREATE POLICY "lancamentos_simples_operador_update" ON public.lancamentos_simples
  FOR UPDATE TO authenticated USING (operador_id = auth.uid()) WITH CHECK (operador_id = auth.uid());

CREATE POLICY "lancamentos_simples_operador_delete" ON public.lancamentos_simples
  FOR DELETE TO authenticated USING (operador_id = auth.uid());

CREATE INDEX lancamentos_simples_data_idx ON public.lancamentos_simples (data DESC, created_at DESC);
CREATE INDEX lancamentos_simples_operador_idx ON public.lancamentos_simples (operador_id);

CREATE TRIGGER update_lancamentos_simples_updated_at
  BEFORE UPDATE ON public.lancamentos_simples
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();