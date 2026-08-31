-- 1) Trigger-only function must not be callable by API roles
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated, anon, public;

-- 2) Ownership-based policies on the private "fechamentos" bucket
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