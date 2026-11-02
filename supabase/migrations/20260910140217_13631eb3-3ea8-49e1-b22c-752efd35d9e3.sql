CREATE TABLE public.estoque_boloes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid REFERENCES public.boloes_estoque(id) ON DELETE SET NULL,
  nome text NOT NULL,
  concurso text NOT NULL DEFAULT '',
  cotas integer NOT NULL DEFAULT 0,
  valor_cota numeric NOT NULL DEFAULT 0,
  taxa numeric NOT NULL DEFAULT 0,
  data date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  situacao text NOT NULL DEFAULT 'ativo',
  observacoes text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_boloes TO authenticated;
GRANT ALL ON public.estoque_boloes TO service_role;
ALTER TABLE public.estoque_boloes ENABLE ROW LEVEL SECURITY;

CREATE POLICY estoque_boloes_admin_all ON public.estoque_boloes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY estoque_boloes_select_auth ON public.estoque_boloes FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_estoque_boloes_updated_at BEFORE UPDATE ON public.estoque_boloes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.estoque_boloes_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_id uuid NOT NULL REFERENCES public.estoque_boloes(id) ON DELETE CASCADE,
  quantidade integer NOT NULL DEFAULT 1,
  canal public.canal_venda NOT NULL DEFAULT 'LOJA',
  data date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  operador_id uuid,
  operador_nome text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_boloes_vendas TO authenticated;
GRANT ALL ON public.estoque_boloes_vendas TO service_role;
ALTER TABLE public.estoque_boloes_vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY estoque_vendas_admin_all ON public.estoque_boloes_vendas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY estoque_vendas_operador_insert ON public.estoque_boloes_vendas FOR INSERT TO authenticated
  WITH CHECK (operador_id = auth.uid());
CREATE POLICY estoque_vendas_operador_select ON public.estoque_boloes_vendas FOR SELECT TO authenticated
  USING (operador_id = auth.uid());

CREATE TRIGGER update_estoque_vendas_updated_at BEFORE UPDATE ON public.estoque_boloes_vendas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX estoque_vendas_estoque_id_idx ON public.estoque_boloes_vendas(estoque_id);