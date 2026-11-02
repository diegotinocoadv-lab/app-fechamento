CREATE TYPE public.conta_loterica AS ENUM (
  'CONTA 043','CONTA 003','CONTA RETAGUARDA','CONTA COMISSÃO','CONTA FIADO',
  'CONTA MOEDAS','CONTA CARTÃO','CONTA PREMIO RASP','CONTA RESGATE TELESENA'
);

CREATE TABLE public.contas_loterica (
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

CREATE POLICY contas_loterica_admin_all ON public.contas_loterica
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_contas_loterica_updated_at
  BEFORE UPDATE ON public.contas_loterica
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();