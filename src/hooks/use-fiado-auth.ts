import { useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/auth";

export function useFiadoAuth() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const [role, setRole] = useState<AppRole | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle(),
      ]);
      if (!cancelled) {
        setRole((r?.role as AppRole) ?? null);
        setNome(p?.nome ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return { user, role, nome, loading };
}
