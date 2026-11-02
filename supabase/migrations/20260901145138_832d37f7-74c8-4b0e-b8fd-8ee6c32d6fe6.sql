CREATE TYPE public.canal_venda AS ENUM ('LOJA', 'MARKETPLACE');

CREATE TABLE public.boloes_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concurso text NOT NULL,
  descricao text,
  valor_cota numeric NOT NULL DEFAULT 0,
  taxa numeric NOT NULL DEFAULT 0,
  total_cotas integer NOT NULL DEFAULT 0,
  situacao text NOT NULL DEFAULT 'ativo',
  data_sorteio date,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boloes_estoque TO authenticated;
GRANT ALL ON public.boloes_estoque TO service_role;
ALTER TABLE public.boloes_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY boloes_estoque_admin_all ON public.boloes_estoque
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY boloes_estoque_select_auth ON public.boloes_estoque
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_boloes_estoque_updated_at
  BEFORE UPDATE ON public.boloes_estoque
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.boloes_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bolao_id uuid NOT NULL REFERENCES public.boloes_estoque(id) ON DELETE CASCADE,
  quantidade integer NOT NULL DEFAULT 1,
  canal public.canal_venda NOT NULL DEFAULT 'LOJA',
  data date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date,
  operador_id uuid,
  operador_nome text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boloes_vendas TO authenticated;
GRANT ALL ON public.boloes_vendas TO service_role;
ALTER TABLE public.boloes_vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY boloes_vendas_admin_all ON public.boloes_vendas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY boloes_vendas_operador_select ON public.boloes_vendas
  FOR SELECT TO authenticated
  USING (operador_id = auth.uid());

CREATE POLICY boloes_vendas_operador_insert ON public.boloes_vendas
  FOR INSERT TO authenticated
  WITH CHECK (operador_id = auth.uid());

CREATE TRIGGER update_boloes_vendas_updated_at
  BEFORE UPDATE ON public.boloes_vendas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX boloes_vendas_bolao_idx ON public.boloes_vendas (bolao_id);
CREATE INDEX boloes_vendas_data_idx ON public.boloes_vendas (data);