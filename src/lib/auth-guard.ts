import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ContextoAutenticado = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

/** Verifica se o usuário autenticado tem o papel de administrador. */
export async function ehAdmin(context: ContextoAutenticado): Promise<boolean> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(`Falha ao verificar permissões: ${error.message}`);
  return Boolean(data);
}

/** Interrompe a execução quando o usuário não é administrador. */
export async function exigirAdmin(context: ContextoAutenticado): Promise<void> {
  if (!(await ehAdmin(context))) {
    throw new Error("Acesso restrito aos administradores.");
  }
}
