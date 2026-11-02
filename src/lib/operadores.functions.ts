import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listarOperadoresAtivos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("operadores")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome");
    if (error) throw error;
    return data ?? [];
  });
