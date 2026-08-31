-- =============================================
-- MIGRAÇÕES DO BANCO DE DADOS - SUPABASE
-- Lotérica Brasil da Sorte - Fechamento de Caixa
-- =============================================

-- 1) Criar tabela de fechamentos
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
  user_id uuid DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.fechamentos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamentos TO authenticated;

ALTER TABLE public.fechamentos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS fechamentos_data_idx ON public.fechamentos (data DESC);

-- 2) Criar tipos e tabelas de perfil/roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'operador');
EXCEPTION
  WHEN duplicate_object THEN NULL;
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

-- 3) Função para verificar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4) Policies de segurança
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_roles_select_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_admin" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "fechamentos_own" ON public.fechamentos;
CREATE POLICY "fechamentos_own" ON public.fechamentos
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fechamentos_admin" ON public.fechamentos;
CREATE POLICY "fechamentos_admin" ON public.fechamentos
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Trigger para criar perfil automaticamente
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

-- 6) Bucket de storage para PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('fechamentos', 'fechamentos', false)
ON CONFLICT (id) DO NOTHING;

-- Policies de storage
DROP POLICY IF EXISTS "fechamentos_objects_select" ON storage.objects;
CREATE POLICY "fechamentos_objects_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'fechamentos'
    AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

DROP POLICY IF EXISTS "fechamentos_objects_insert" ON storage.objects;
CREATE POLICY "fechamentos_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fechamentos' AND owner = auth.uid());

DROP POLICY IF EXISTS "fechamentos_objects_update" ON storage.objects;
CREATE POLICY "fechamentos_objects_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'fechamentos' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'fechamentos' AND owner = auth.uid());

DROP POLICY IF EXISTS "fechamentos_objects_delete" ON storage.objects;
CREATE POLICY "fechamentos_objects_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fechamentos'
    AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

-- 7) Permissões finais
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
