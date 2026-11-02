import { supabase } from "@/integrations/supabase/client";

export async function logActivity(acao: string, detalhes?: Record<string, unknown>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: p } = await supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle();
  await supabase.from("activity_logs").insert({
    user_id: user.id,
    user_nome: p?.nome ?? user.email ?? null,
    acao,
    detalhes: detalhes ?? null,
  });
}
