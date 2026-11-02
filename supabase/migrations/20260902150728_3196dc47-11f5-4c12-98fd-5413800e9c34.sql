CREATE TABLE public.caixas_exclusoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id uuid NOT NULL,
  nome text,
  data date,
  operador_id uuid,
  operador_nome text,
  situacao text,
  motivo text NOT NULL,
  excluido_por uuid,
  excluido_por_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.caixas_exclusoes TO authenticated;
GRANT ALL ON public.caixas_exclusoes TO service_role;

ALTER TABLE public.caixas_exclusoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY caixas_exclusoes_admin_select ON public.caixas_exclusoes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY caixas_exclusoes_admin_insert ON public.caixas_exclusoes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND excluido_por = auth.uid());