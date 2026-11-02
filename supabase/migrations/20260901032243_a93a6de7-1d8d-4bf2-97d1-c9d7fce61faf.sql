CREATE POLICY "caixas_operador_insert" ON public.caixas
FOR INSERT TO authenticated
WITH CHECK (operador_id = auth.uid() AND criado_por = auth.uid());