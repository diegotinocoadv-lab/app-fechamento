ALTER TYPE public.tipo_lancamento_simples ADD VALUE IF NOT EXISTS 'BOLAO';
ALTER TABLE public.lancamentos_simples ADD COLUMN IF NOT EXISTS quantidade integer NOT NULL DEFAULT 1;