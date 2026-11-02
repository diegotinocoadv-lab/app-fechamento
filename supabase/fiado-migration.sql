-- =============================================================================
-- FIADO (Store Credit) System Migration
-- Adds fiado management to the existing lottery cashier database.
--
-- Assumes existing: profiles, user_roles, app_role ('admin','operador'),
-- has_role(), handle_new_user(), update_updated_at_column()
-- =============================================================================

-- =============================================================================
-- 0. CLEANUP (safe to re-run)
-- =============================================================================
DROP TRIGGER IF EXISTS trg_baixa_decisao ON public.baixas_solicitacoes CASCADE;
DROP TRIGGER IF EXISTS trg_notify_solicitacao ON public.baixas_solicitacoes CASCADE;
DROP TRIGGER IF EXISTS trg_notify_novo_fiado ON public.fiados CASCADE;
DROP TRIGGER IF EXISTS validate_baixa_valor ON public.baixas_solicitacoes CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP FUNCTION IF EXISTS public.handle_baixa_decisao() CASCADE;
DROP FUNCTION IF EXISTS public.notify_admins_solicitacao() CASCADE;
DROP FUNCTION IF EXISTS public.notify_admins_novo_fiado() CASCADE;
DROP FUNCTION IF EXISTS public.validate_baixa_valor() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.marcar_fiados_vencidos() CASCADE;
DROP FUNCTION IF EXISTS public.notify_fiados_vencidos() CASCADE;
DROP FUNCTION IF EXISTS public.aplicar_credito_em_fiados(UUID) CASCADE;
-- has_role: recreate with correct signature
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
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

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.notificacoes CASCADE;
DROP TABLE IF EXISTS public.creditos CASCADE;
DROP TABLE IF EXISTS public.baixas_solicitacoes CASCADE;
DROP TABLE IF EXISTS public.fiados CASCADE;
DROP TABLE IF EXISTS public.clientes CASCADE;

DROP TYPE IF EXISTS public.notif_tipo CASCADE;
DROP TYPE IF EXISTS public.solicitacao_status CASCADE;
DROP TYPE IF EXISTS public.fiado_status CASCADE;

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.fiado_status AS ENUM ('pendente', 'aguardando_aprovacao', 'pago', 'vencido');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.solicitacao_status AS ENUM ('pendente', 'aprovada', 'rejeitada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notif_tipo AS ENUM (
    'novo_fiado', 'solicitacao_baixa', 'baixa_aprovada', 'baixa_rejeitada', 'fiado_vencido'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. TABLES
-- =============================================================================

-- 2.1 Clientes
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nome_lower TEXT GENERATED ALWAYS AS (lower(nome)) STORED UNIQUE,
  telefone TEXT,
  observacao TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- 2.2 Fiados
CREATE TABLE IF NOT EXISTS public.fiados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  descricao TEXT NOT NULL,
  observacao TEXT,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  status public.fiado_status NOT NULL DEFAULT 'pendente',
  lancado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  baixa_em TIMESTAMPTZ,
  baixa_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_vencimento >= data_inicio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiados TO authenticated;
GRANT ALL ON public.fiados TO service_role;
ALTER TABLE public.fiados ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fiados_cliente ON public.fiados(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fiados_lancado_por ON public.fiados(lancado_por);
CREATE INDEX IF NOT EXISTS idx_fiados_status ON public.fiados(status);

-- 2.3 Solicitações de baixa
CREATE TABLE IF NOT EXISTS public.baixas_solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiado_id UUID NOT NULL REFERENCES public.fiados(id) ON DELETE CASCADE,
  solicitado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  observacao TEXT NOT NULL,
  status public.solicitacao_status NOT NULL DEFAULT 'pendente',
  decidido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decidido_em TIMESTAMPTZ,
  motivo_rejeicao TEXT,
  valor_pago NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.baixas_solicitacoes TO authenticated;
GRANT ALL ON public.baixas_solicitacoes TO service_role;
ALTER TABLE public.baixas_solicitacoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_baixas_fiado ON public.baixas_solicitacoes(fiado_id);
CREATE INDEX IF NOT EXISTS idx_baixas_status ON public.baixas_solicitacoes(status);

-- 2.4 Creditos
CREATE TABLE IF NOT EXISTS public.creditos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  valor NUMERIC NOT NULL CHECK (valor <> 0),
  descricao TEXT NOT NULL DEFAULT 'Crédito',
  observacao TEXT,
  data_credito DATE NOT NULL DEFAULT CURRENT_DATE,
  fiado_id UUID REFERENCES public.fiados(id) ON DELETE SET NULL,
  lancado_por UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creditos TO authenticated;
GRANT ALL ON public.creditos TO service_role;
ALTER TABLE public.creditos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS creditos_cliente_id_idx ON public.creditos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_creditos_cliente_data ON public.creditos (cliente_id, data_credito DESC);

DO $$ BEGIN
  ALTER TABLE public.creditos
    ADD CONSTRAINT creditos_lancado_por_profiles_fkey
    FOREIGN KEY (lancado_por) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX creditos_uso_unico_por_fiado
    ON public.creditos (fiado_id)
    WHERE fiado_id IS NOT NULL AND valor < 0;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2.5 Notificações
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo public.notif_tipo NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  link TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notificacoes(user_id, lida);

-- 2.6 Activity logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_nome TEXT,
  acao TEXT NOT NULL,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity_logs(created_at DESC);

-- =============================================================================
-- 3. RLS POLICIES (DROP IF EXISTS + CREATE for idempotency)
-- =============================================================================

-- 3.1 profiles (add fiado-specific policies; existing own/admin policies remain)
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3.2 user_roles
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3.3 clientes
DROP POLICY IF EXISTS "clientes_select_authenticated" ON public.clientes;
DROP POLICY IF EXISTS "clientes_select_all" ON public.clientes;
CREATE POLICY "clientes_select_authenticated" ON public.clientes
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "clientes_insert_authenticated" ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert_all" ON public.clientes;
CREATE POLICY "clientes_insert_authenticated" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "clientes_update_admin" ON public.clientes;
CREATE POLICY "clientes_update_admin" ON public.clientes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "clientes_delete_admin" ON public.clientes;
CREATE POLICY "clientes_delete_admin" ON public.clientes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3.4 fiados
DROP POLICY IF EXISTS "fiados_select_own_or_admin" ON public.fiados;
DROP POLICY IF EXISTS "fiados_select_authenticated" ON public.fiados;
CREATE POLICY "fiados_select_authenticated" ON public.fiados
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "fiados_insert_self" ON public.fiados;
CREATE POLICY "fiados_insert_self" ON public.fiados
  FOR INSERT TO authenticated
  WITH CHECK (lancado_por = auth.uid());

DROP POLICY IF EXISTS "fiados_update_own_or_admin" ON public.fiados;
DROP POLICY IF EXISTS "fiados_update_admin" ON public.fiados;
CREATE POLICY "fiados_update_admin" ON public.fiados
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3.5 baixas_solicitacoes
DROP POLICY IF EXISTS "baixas_select_own_or_admin" ON public.baixas_solicitacoes;
DROP POLICY IF EXISTS "baixas_select_authenticated" ON public.baixas_solicitacoes;
DROP POLICY IF EXISTS "baixas_select_admin_or_owner" ON public.baixas_solicitacoes;
CREATE POLICY "baixas_select_admin_or_owner" ON public.baixas_solicitacoes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR solicitado_por = auth.uid()
  );

DROP POLICY IF EXISTS "baixas_insert_self" ON public.baixas_solicitacoes;
DROP POLICY IF EXISTS "baixas_insert_authenticated" ON public.baixas_solicitacoes;
CREATE POLICY "baixas_insert_authenticated" ON public.baixas_solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    solicitado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.fiados f
      WHERE f.id = fiado_id
        AND f.status IN ('pendente','vencido','aguardando_aprovacao')
    )
  );

DROP POLICY IF EXISTS "baixas_update_admin" ON public.baixas_solicitacoes;
CREATE POLICY "baixas_update_admin" ON public.baixas_solicitacoes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND status IN ('aprovada','rejeitada')
    AND decidido_por = auth.uid()
  );

-- 3.6 notificacoes
DROP POLICY IF EXISTS "notif_select_own" ON public.notificacoes;
CREATE POLICY "notif_select_own" ON public.notificacoes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_update_own" ON public.notificacoes;
CREATE POLICY "notif_update_own" ON public.notificacoes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_insert_authenticated" ON public.notificacoes;
DROP POLICY IF EXISTS "notif_insert_admin" ON public.notificacoes;
CREATE POLICY "notif_insert_admin" ON public.notificacoes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "notif_delete_own" ON public.notificacoes;
CREATE POLICY "notif_delete_own" ON public.notificacoes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3.7 creditos
DROP POLICY IF EXISTS "creditos_select_authenticated" ON public.creditos;
CREATE POLICY "creditos_select_authenticated" ON public.creditos
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "creditos_insert_self" ON public.creditos;
CREATE POLICY "creditos_insert_self" ON public.creditos
  FOR INSERT TO authenticated
  WITH CHECK (lancado_por = auth.uid());

DROP POLICY IF EXISTS "creditos_update_admin" ON public.creditos;
CREATE POLICY "creditos_update_admin" ON public.creditos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "creditos_delete_admin" ON public.creditos;
CREATE POLICY "creditos_delete_admin" ON public.creditos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3.8 activity_logs
DROP POLICY IF EXISTS "logs_select_admin" ON public.activity_logs;
CREATE POLICY "logs_select_admin" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "logs_insert_authenticated" ON public.activity_logs;
DROP POLICY IF EXISTS "logs_insert_self" ON public.activity_logs;
CREATE POLICY "logs_insert_self" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- 4. FUNCTIONS
-- =============================================================================

-- 4.1 handle_new_user (updated to handle 'operador' and 'fiado' role from metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primeiro BOOLEAN;
  v_role TEXT;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO primeiro;

  IF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    v_role := NEW.raw_user_meta_data->>'role';
  ELSIF primeiro THEN
    v_role := 'admin';
  ELSE
    v_role := 'operador';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4.3 marcar_fiados_vencidos
CREATE OR REPLACE FUNCTION public.marcar_fiados_vencidos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.fiados
  SET status = 'vencido'
  WHERE status = 'pendente'
    AND data_vencimento IS NOT NULL
    AND data_vencimento < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_fiados_vencidos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_fiados_vencidos() TO service_role;

-- 4.4 notify_fiados_vencidos
CREATE OR REPLACE FUNCTION public.notify_fiados_vencidos()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  admin_rec RECORD;
  v_today DATE := CURRENT_DATE;
  v_dias INT;
  v_link TEXT;
  v_titulo TEXT;
  v_msg TEXT;
BEGIN
  PERFORM public.marcar_fiados_vencidos();

  FOR rec IN
    SELECT f.id, f.valor, f.data_vencimento, c.nome AS cliente_nome
    FROM public.fiados f
    JOIN public.clientes c ON c.id = f.cliente_id
    WHERE f.status = 'vencido'
  LOOP
    v_dias := v_today - rec.data_vencimento;
    v_link := '/fiados?filtro=vencidos';
    v_titulo := 'Fiado vencido';
    v_msg := rec.cliente_nome || ' - R$ ' || rec.valor || ' venceu há ' || v_dias || ' dia(s)';

    FOR admin_rec IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes n
        WHERE n.user_id = admin_rec.user_id
          AND n.tipo = 'fiado_vencido'
          AND n.mensagem = v_msg
          AND n.created_at::date = v_today
      ) THEN
        INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, link)
        VALUES (admin_rec.user_id, 'fiado_vencido', v_titulo, v_msg, v_link);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_fiados_vencidos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_fiados_vencidos() TO service_role;

-- 4.5 notify_admins_novo_fiado
CREATE OR REPLACE FUNCTION public.notify_admins_novo_fiado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente TEXT;
  v_lancador TEXT;
  admin_rec RECORD;
BEGIN
  SELECT nome INTO v_cliente FROM public.clientes WHERE id = NEW.cliente_id;
  SELECT nome INTO v_lancador FROM public.profiles WHERE id = NEW.lancado_por;
  FOR admin_rec IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, link)
    VALUES (admin_rec.user_id, 'novo_fiado',
      'Novo fiado lançado',
      v_lancador || ' lançou R$ ' || NEW.valor || ' para ' || v_cliente,
      '/fiados');
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admins_novo_fiado() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_novo_fiado ON public.fiados;
CREATE TRIGGER trg_notify_novo_fiado
AFTER INSERT ON public.fiados
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_novo_fiado();

-- 4.6 notify_admins_solicitacao
CREATE OR REPLACE FUNCTION public.notify_admins_solicitacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente TEXT;
  v_solicitante TEXT;
  v_valor NUMERIC;
  admin_rec RECORD;
BEGIN
  SELECT c.nome, f.valor INTO v_cliente, v_valor
  FROM public.fiados f
  JOIN public.clientes c ON c.id = f.cliente_id
  WHERE f.id = NEW.fiado_id;

  SELECT nome INTO v_solicitante FROM public.profiles WHERE id = NEW.solicitado_por;

  UPDATE public.fiados SET status = 'aguardando_aprovacao' WHERE id = NEW.fiado_id;

  FOR admin_rec IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, link)
    VALUES (admin_rec.user_id, 'solicitacao_baixa',
      'Nova solicitação de baixa',
      v_solicitante || ' solicitou baixa de R$ ' || v_valor || ' (' || v_cliente || ')',
      '/baixas');
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admins_solicitacao() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_solicitacao ON public.baixas_solicitacoes;
CREATE TRIGGER trg_notify_solicitacao
AFTER INSERT ON public.baixas_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_solicitacao();

-- 4.7 validate_baixa_valor
CREATE OR REPLACE FUNCTION public.validate_baixa_valor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valor NUMERIC;
BEGIN
  IF NEW.valor_pago IS NULL THEN RETURN NEW; END IF;
  IF NEW.valor_pago <= 0 THEN
    RAISE EXCEPTION 'valor_pago deve ser maior que zero';
  END IF;
  SELECT valor INTO v_valor FROM public.fiados WHERE id = NEW.fiado_id;
  IF NEW.valor_pago > v_valor THEN
    RAISE EXCEPTION 'valor_pago (%) não pode ser maior que o valor do fiado (%)', NEW.valor_pago, v_valor;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_baixa_valor() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_baixa_valor ON public.baixas_solicitacoes;
CREATE TRIGGER trg_validate_baixa_valor
BEFORE INSERT OR UPDATE OF valor_pago ON public.baixas_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.validate_baixa_valor();

-- 4.8 handle_baixa_decisao
CREATE OR REPLACE FUNCTION public.handle_baixa_decisao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_nome TEXT;
  v_cliente_id UUID;
  v_valor NUMERIC;
  v_venc DATE;
  v_lancador UUID;
  v_desc TEXT;
  v_novo_status public.fiado_status;
  v_diferenca NUMERIC;
  v_novo_id UUID;
  v_inicio DATE;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  SELECT c.nome, c.id, f.valor, f.data_vencimento, f.lancado_por, f.descricao
    INTO v_cliente_nome, v_cliente_id, v_valor, v_venc, v_lancador, v_desc
  FROM public.fiados f
  JOIN public.clientes c ON c.id = f.cliente_id
  WHERE f.id = NEW.fiado_id;

  IF NEW.status = 'aprovada' THEN
    UPDATE public.fiados
       SET status = 'pago', baixa_em = now(), baixa_por = NEW.decidido_por
     WHERE id = NEW.fiado_id;

    IF NEW.valor_pago IS NOT NULL AND NEW.valor_pago < v_valor THEN
      v_diferenca := v_valor - NEW.valor_pago;
      v_inicio := LEAST(CURRENT_DATE, COALESCE(v_venc, CURRENT_DATE));
      INSERT INTO public.fiados (
        cliente_id, valor, descricao, data_inicio, data_vencimento, status, lancado_por, observacao
      )
      VALUES (
        v_cliente_id,
        v_diferenca,
        'Saldo remanescente de: ' || COALESCE(v_desc, ''),
        v_inicio,
        COALESCE(v_venc, CURRENT_DATE),
        CASE WHEN v_venc IS NOT NULL AND v_venc < CURRENT_DATE
          THEN 'vencido'::public.fiado_status
          ELSE 'pendente'::public.fiado_status
        END,
        v_lancador,
        'Gerado automaticamente após baixa parcial do fiado ' || NEW.fiado_id::text
      )
      RETURNING id INTO v_novo_id;

      INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, link)
      VALUES (NEW.solicitado_por, 'baixa_aprovada',
        'Baixa parcial aprovada',
        'Pagamento de R$ ' || NEW.valor_pago || ' aprovado para ' || v_cliente_nome ||
        '. Saldo remanescente de R$ ' || v_diferenca || ' gerado.',
        '/fiados');
    ELSE
      INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, link)
      VALUES (NEW.solicitado_por, 'baixa_aprovada',
        'Baixa aprovada',
        'Sua solicitação para ' || v_cliente_nome || ' (R$ ' || v_valor || ') foi aprovada',
        '/fiados');
    END IF;

  ELSIF NEW.status = 'rejeitada' THEN
    v_novo_status := CASE
      WHEN v_venc IS NOT NULL AND v_venc < CURRENT_DATE THEN 'vencido'::public.fiado_status
      ELSE 'pendente'::public.fiado_status
    END;
    UPDATE public.fiados SET status = v_novo_status WHERE id = NEW.fiado_id;
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, link)
    VALUES (NEW.solicitado_por, 'baixa_rejeitada',
      'Baixa rejeitada',
      'Sua solicitação para ' || v_cliente_nome || ' foi rejeitada. Motivo: ' || COALESCE(NEW.motivo_rejeicao, '-'),
      '/fiados');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_baixa_decisao() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_baixa_decisao ON public.baixas_solicitacoes;
CREATE TRIGGER trg_baixa_decisao
AFTER UPDATE ON public.baixas_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.handle_baixa_decisao();

-- 4.9 aplicar_credito_em_fiados
CREATE OR REPLACE FUNCTION public.aplicar_credito_em_fiados(_cliente_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _saldo NUMERIC;
  _f RECORD;
  _usar NUMERIC;
  _ja_usado NUMERIC;
  _total_usado NUMERIC := 0;
  _quitados INT := 0;
  _parciais INT := 0;
  _inseriu INT;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text, 0));

  SELECT COALESCE(SUM(valor), 0) INTO _saldo FROM public.creditos WHERE cliente_id = _cliente_id;
  IF _saldo <= 0 THEN
    RETURN jsonb_build_object('usado', 0, 'quitados', 0, 'parciais', 0);
  END IF;

  FOR _f IN
    SELECT id, valor, descricao, data_inicio, data_vencimento, lancado_por
    FROM public.fiados
    WHERE cliente_id = _cliente_id
      AND status IN ('pendente', 'vencido', 'aguardando_aprovacao')
    ORDER BY data_inicio ASC, data_vencimento ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN _saldo <= 0;

    SELECT COALESCE(SUM(-valor), 0) INTO _ja_usado
    FROM public.creditos
    WHERE fiado_id = _f.id AND valor < 0;
    IF _ja_usado > 0 THEN
      CONTINUE;
    END IF;

    _usar := LEAST(_saldo, _f.valor);

    INSERT INTO public.creditos (cliente_id, fiado_id, valor, descricao, observacao, data_credito, lancado_por)
    VALUES (
      _cliente_id, _f.id, -_usar,
      'Abatimento automático de saldo positivo',
      'Abatido R$ ' || TO_CHAR(_usar, 'FM999999990.00') ||
      ' do saldo positivo no fiado "' || COALESCE(_f.descricao, 'Fiado') ||
      '" de ' || TO_CHAR(_f.data_inicio, 'DD/MM/YYYY') ||
      ' (valor original R$ ' || TO_CHAR(_f.valor, 'FM999999990.00') || ')',
      CURRENT_DATE, _uid
    )
    ON CONFLICT (fiado_id) WHERE (fiado_id IS NOT NULL AND valor < 0) DO NOTHING;

    GET DIAGNOSTICS _inseriu = ROW_COUNT;
    IF _inseriu = 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.fiados
       SET status = 'pago', baixa_em = now(), baixa_por = _uid
     WHERE id = _f.id
       AND status IN ('pendente', 'vencido', 'aguardando_aprovacao');

    IF _usar < _f.valor THEN
      INSERT INTO public.fiados (
        cliente_id, valor, descricao, observacao, data_inicio, data_vencimento, status, lancado_por
      )
      VALUES (
        _cliente_id, ROUND(_f.valor - _usar, 2), _f.descricao || ' (saldo restante)',
        'Gerado após abatimento automático de crédito do fiado ' || _f.id::text,
        CURRENT_DATE, _f.data_vencimento, 'pendente', _f.lancador
      );
      _parciais := _parciais + 1;
    ELSE
      _quitados := _quitados + 1;
    END IF;

    _saldo := ROUND(_saldo - _usar, 2);
    _total_usado := ROUND(_total_usado + _usar, 2);
  END LOOP;

  RETURN jsonb_build_object('usado', _total_usado, 'quitados', _quitados, 'parciais', _parciais);
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_credito_em_fiados(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_credito_em_fiados(UUID) TO authenticated;

-- 4.10 update_updated_at_column (already exists in existing DB, but ensure for creditos)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 5. TRIGGERS (creditos updated_at)
-- =============================================================================

DROP TRIGGER IF EXISTS update_creditos_updated_at ON public.creditos;
CREATE TRIGGER update_creditos_updated_at
BEFORE UPDATE ON public.creditos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 6. REALTIME
-- =============================================================================

-- Add tables to supabase_realtime publication (ignore if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fiados;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.baixas_solicitacoes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 7. INITIAL DATA: Mark overdue fiados
-- =============================================================================
SELECT public.marcar_fiados_vencidos();
