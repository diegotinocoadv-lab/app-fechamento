CREATE TABLE public.fechamentos (
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

CREATE INDEX fechamentos_data_idx ON public.fechamentos (data DESC);