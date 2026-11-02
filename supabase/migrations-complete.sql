-- ============================================
-- LIMPEZA: Remover tabelas antigas que conflitam
-- ============================================

DROP TABLE IF EXISTS public.vendas_boloes CASCADE;
DROP TABLE IF EXISTS public.boloes CASCADE;

-- ============================================
-- MIGRATION 1: 8537f7fe - Tabela fechamentos
-- ============================================

CREATE TABLE IF NOT EXISTS public.fechamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL,
  funcionario TEXT,
  relatorio NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  diferenca NUMERIC NOT NULL DEFAULT 0,
  total_inicial NUMERIC NOT NULL DEFAULT 0,
  total_final NUMERIC NOT NULL DEFAULT 0,
  total_bolao_valor NUMERIC NOT NULL DEFAULT 0,
  total_bolao_taxa NUMERIC NOT NULL DEFAULT 0,
  total_bolao_quant NUMERIC NOT NULL DEFAULT 0,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url TEXT,
  email_enviado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.fechamentos TO service_role;

ALTER TABLE public.fechamentos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS fechamentos_data_idx ON public.fechamentos (data DESC);

-- ============================================
-- MIGRATION 2: 1769030b - Profiles, roles, auth
-- ============================================

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'operador');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  nome text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role::text
  )
$$;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_roles_select_admin" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primeiro boolean;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.raw_user_meta_data ->> 'full_name'), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO primeiro;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN primeiro THEN 'admin'::public.app_role ELSE 'operador'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$ BEGIN
  ALTER TABLE public.fechamentos ADD COLUMN user_id uuid DEFAULT auth.uid();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamentos TO authenticated;
GRANT ALL ON public.fechamentos TO service_role;

DROP POLICY IF EXISTS "fechamentos_own" ON public.fechamentos;
DROP POLICY IF EXISTS "fechamentos_admin" ON public.fechamentos;
CREATE POLICY "fechamentos_own" ON public.fechamentos
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "fechamentos_admin" ON public.fechamentos
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- MIGRATION 3: ad4f0744 - Revokes
-- ============================================

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- ============================================
-- MIGRATION 4: 3ab35adf - Storage policies
-- ============================================

REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated, anon, public;

DROP POLICY IF EXISTS "fechamentos_objects_select" ON storage.objects;
DROP POLICY IF EXISTS "fechamentos_objects_insert" ON storage.objects;
DROP POLICY IF EXISTS "fechamentos_objects_update" ON storage.objects;
DROP POLICY IF EXISTS "fechamentos_objects_delete" ON storage.objects;

CREATE POLICY "fechamentos_objects_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'fechamentos'
    AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

CREATE POLICY "fechamentos_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fechamentos' AND owner = auth.uid());

CREATE POLICY "fechamentos_objects_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'fechamentos' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'fechamentos' AND owner = auth.uid());

CREATE POLICY "fechamentos_objects_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fechamentos'
    AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

-- ============================================
-- MIGRATION 5: abd02c2c - has_role security fix
-- ============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role::text
      AND (auth.uid() IS NULL OR _user_id = auth.uid())
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- ============================================
-- MIGRATION 6: c454c1fb - Tabela caixas
-- ============================================

CREATE TABLE IF NOT EXISTS public.caixas (
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

DROP POLICY IF EXISTS "caixas_admin_all" ON public.caixas;
DROP POLICY IF EXISTS "caixas_operador_select" ON public.caixas;
DROP POLICY IF EXISTS "caixas_operador_update" ON public.caixas;
CREATE POLICY "caixas_admin_all" ON public.caixas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "caixas_operador_select" ON public.caixas FOR SELECT TO authenticated
  USING (operador_id = auth.uid());
CREATE POLICY "caixas_operador_update" ON public.caixas FOR UPDATE TO authenticated
  USING (operador_id = auth.uid())
  WITH CHECK (operador_id = auth.uid());

CREATE INDEX IF NOT EXISTS caixas_data_idx ON public.caixas (data DESC);
CREATE INDEX IF NOT EXISTS caixas_operador_idx ON public.caixas (operador_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_caixas_updated_at ON public.caixas;
CREATE TRIGGER update_caixas_updated_at
  BEFORE UPDATE ON public.caixas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- MIGRATION 7: 41e86271 - Revoke update_updated_at
-- ============================================

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM authenticated;

-- ============================================
-- MIGRATION 8: 29faaf93 - Contas lotérica
-- ============================================

DO $$ BEGIN
  CREATE TYPE public.conta_loterica AS ENUM (
    'CONTA 043','CONTA 003','CONTA RETAGUARDA','CONTA COMISSÃO','CONTA FIADO',
    'CONTA MOEDAS','CONTA CARTÃO','CONTA PREMIO RASP','CONTA RESGATE TELESENA'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.contas_loterica (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  conta public.conta_loterica NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  observacoes text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (data, conta)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_loterica TO authenticated;
GRANT ALL ON public.contas_loterica TO service_role;

ALTER TABLE public.contas_loterica ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contas_loterica_admin_all ON public.contas_loterica;
CREATE POLICY contas_loterica_admin_all ON public.contas_loterica
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_contas_loterica_updated_at ON public.contas_loterica;
CREATE TRIGGER update_contas_loterica_updated_at
  BEFORE UPDATE ON public.contas_loterica
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- MIGRATION 9: b15e33bf - Add CONTA CARRO FORTE
-- ============================================

DO $$ BEGIN
  ALTER TYPE public.conta_loterica ADD VALUE 'CONTA CARRO FORTE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- MIGRATION 10: 0b6fcdc5 - Transferências
-- ============================================

CREATE TABLE IF NOT EXISTS public.transferencias_contas (
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

DROP POLICY IF EXISTS "transferencias_contas_admin_all" ON public.transferencias_contas;
CREATE POLICY "transferencias_contas_admin_all" ON public.transferencias_contas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_transferencias_contas_updated_at ON public.transferencias_contas;
CREATE TRIGGER update_transferencias_contas_updated_at
  BEFORE UPDATE ON public.transferencias_contas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS transferencias_contas_data_idx ON public.transferencias_contas (data);

-- ============================================
-- MIGRATION 11: a93a6de7 - caixas_operador_insert
-- ============================================

DROP POLICY IF EXISTS "caixas_operador_insert" ON public.caixas;
CREATE POLICY "caixas_operador_insert" ON public.caixas
FOR INSERT TO authenticated
WITH CHECK (operador_id = auth.uid() AND criado_por = auth.uid());

-- ============================================
-- MIGRATION 12: 832d37f7 - Bolões estoque + vendas
-- ============================================

DO $$ BEGIN
  CREATE TYPE public.canal_venda AS ENUM ('LOJA', 'MARKETPLACE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.boloes_estoque (
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

DROP POLICY IF EXISTS boloes_estoque_admin_all ON public.boloes_estoque;
DROP POLICY IF EXISTS boloes_estoque_select_auth ON public.boloes_estoque;
CREATE POLICY boloes_estoque_admin_all ON public.boloes_estoque
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY boloes_estoque_select_auth ON public.boloes_estoque
  FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS update_boloes_estoque_updated_at ON public.boloes_estoque;
CREATE TRIGGER update_boloes_estoque_updated_at
  BEFORE UPDATE ON public.boloes_estoque
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.boloes_vendas (
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

DROP POLICY IF EXISTS boloes_vendas_admin_all ON public.boloes_vendas;
DROP POLICY IF EXISTS boloes_vendas_operador_select ON public.boloes_vendas;
DROP POLICY IF EXISTS boloes_vendas_operador_insert ON public.boloes_vendas;
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

DROP TRIGGER IF EXISTS update_boloes_vendas_updated_at ON public.boloes_vendas;
CREATE TRIGGER update_boloes_vendas_updated_at
  BEFORE UPDATE ON public.boloes_vendas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS boloes_vendas_bolao_idx ON public.boloes_vendas (bolao_id);
CREATE INDEX IF NOT EXISTS boloes_vendas_data_idx ON public.boloes_vendas (data);

-- ============================================
-- MIGRATION 13: 3196dc47 - Caixas exclusões
-- ============================================

CREATE TABLE IF NOT EXISTS public.caixas_exclusoes (
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

DROP POLICY IF EXISTS caixas_exclusoes_admin_select ON public.caixas_exclusoes;
DROP POLICY IF EXISTS caixas_exclusoes_admin_insert ON public.caixas_exclusoes;
CREATE POLICY caixas_exclusoes_admin_select ON public.caixas_exclusoes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY caixas_exclusoes_admin_insert ON public.caixas_exclusoes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND excluido_por = auth.uid());

-- ============================================
-- MIGRATION 14: 258ab25c - Lançamentos simples
-- ============================================

DO $$ BEGIN
  CREATE TYPE public.tipo_lancamento_simples AS ENUM ('GAVETA', 'CAIXA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.lancamentos_simples (
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

DROP POLICY IF EXISTS "lancamentos_simples_admin_all" ON public.lancamentos_simples;
DROP POLICY IF EXISTS "lancamentos_simples_operador_select" ON public.lancamentos_simples;
DROP POLICY IF EXISTS "lancamentos_simples_operador_insert" ON public.lancamentos_simples;
DROP POLICY IF EXISTS "lancamentos_simples_operador_update" ON public.lancamentos_simples;
DROP POLICY IF EXISTS "lancamentos_simples_operador_delete" ON public.lancamentos_simples;
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

CREATE INDEX IF NOT EXISTS lancamentos_simples_data_idx ON public.lancamentos_simples (data DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS lancamentos_simples_operador_idx ON public.lancamentos_simples (operador_id);

DROP TRIGGER IF EXISTS update_lancamentos_simples_updated_at ON public.lancamentos_simples;
CREATE TRIGGER update_lancamentos_simples_updated_at
  BEFORE UPDATE ON public.lancamentos_simples
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- MIGRATION 15: e250fb51 - campo column
-- ============================================

ALTER TABLE public.lancamentos_simples ADD COLUMN IF NOT EXISTS campo text;

-- ============================================
-- MIGRATION 16: c32fd1fa - BOLAO enum + quantidade
-- ============================================

DO $$ BEGIN
  ALTER TYPE public.tipo_lancamento_simples ADD VALUE IF NOT EXISTS 'BOLAO';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.lancamentos_simples ADD COLUMN IF NOT EXISTS quantidade integer NOT NULL DEFAULT 1;

-- ============================================
-- MIGRATION 17: e3e8bc0a - RELATORIO enum
-- ============================================

DO $$ BEGIN
  ALTER TYPE public.tipo_lancamento_simples ADD VALUE IF NOT EXISTS 'RELATORIO';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- MIGRATION 18: 90c29de5 - caixa_id nullable
-- ============================================

ALTER TABLE public.caixas_exclusoes ALTER COLUMN caixa_id DROP NOT NULL;

-- ============================================
-- MIGRATION 19: 13631eb3 - Estoque bolões
-- ============================================

CREATE TABLE IF NOT EXISTS public.estoque_boloes (
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
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_boloes TO authenticated;
GRANT ALL ON public.estoque_boloes TO service_role;
ALTER TABLE public.estoque_boloes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estoque_boloes_admin_all ON public.estoque_boloes;
DROP POLICY IF EXISTS estoque_boloes_select_auth ON public.estoque_boloes;
CREATE POLICY estoque_boloes_admin_all ON public.estoque_boloes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY estoque_boloes_select_auth ON public.estoque_boloes FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS update_estoque_boloes_updated_at ON public.estoque_boloes;
CREATE TRIGGER update_estoque_boloes_updated_at BEFORE UPDATE ON public.estoque_boloes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.estoque_boloes_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_id uuid NOT NULL REFERENCES public.estoque_boloes(id) ON DELETE CASCADE,
  quantidade integer NOT NULL DEFAULT 1,
  canal public.canal_venda NOT NULL DEFAULT 'LOJA',
  data date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  operador_id uuid,
  operador_nome text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_boloes_vendas TO authenticated;
GRANT ALL ON public.estoque_boloes_vendas TO service_role;
ALTER TABLE public.estoque_boloes_vendas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estoque_vendas_admin_all ON public.estoque_boloes_vendas;
DROP POLICY IF EXISTS estoque_vendas_operador_insert ON public.estoque_boloes_vendas;
DROP POLICY IF EXISTS estoque_vendas_operador_select ON public.estoque_boloes_vendas;
CREATE POLICY estoque_vendas_admin_all ON public.estoque_boloes_vendas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY estoque_vendas_operador_insert ON public.estoque_boloes_vendas FOR INSERT TO authenticated
  WITH CHECK (operador_id = auth.uid());
CREATE POLICY estoque_vendas_operador_select ON public.estoque_boloes_vendas FOR SELECT TO authenticated
  USING (operador_id = auth.uid());

DROP TRIGGER IF EXISTS update_estoque_vendas_updated_at ON public.estoque_boloes_vendas;
CREATE TRIGGER update_estoque_vendas_updated_at BEFORE UPDATE ON public.estoque_boloes_vendas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS estoque_vendas_estoque_id_idx ON public.estoque_boloes_vendas(estoque_id);

-- ============================================
-- CRIAR BUCKET storage se não existir
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('fechamentos', 'fechamentos', false)
ON CONFLICT (id) DO NOTHING;
