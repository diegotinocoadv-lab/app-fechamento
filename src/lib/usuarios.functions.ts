import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const novoUsuario = z.object({
  email: z.string().email().max(200),
  senha: z.string().min(6).max(72),
  nome: z.string().max(120).optional().default(""),
  admin: z.boolean().optional().default(false),
});

const alvo = z.object({ userId: z.string().uuid() });

const mudarPapel = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "operador"]),
});

/** Papel do usuário logado + seu perfil. */
export const meuAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("id, nome, email")
      .eq("id", context.userId)
      .maybeSingle();
    return { admin: Boolean(isAdmin), perfil: perfil ?? null };
  });

/** Lista usuários (somente admin). */
export const listarUsuarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem ver os usuários.");

    const { data: perfis, error } = await context.supabase
      .from("profiles")
      .select("id, nome, email, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error("Falha ao carregar usuários.");

    const { data: papeis } = await context.supabase.from("user_roles").select("user_id, role");

    return (perfis ?? []).map((p) => ({
      ...p,
      role: papeis?.find((r) => r.user_id === p.id)?.role ?? "operador",
      eu: p.id === context.userId,
    }));
  });

/** Cria um usuário já confirmado (somente admin). */
export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => novoUsuario.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem criar usuários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const criado = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (criado.error || !criado.data.user) {
      throw new Error(criado.error?.message ?? "Falha ao criar usuário.");
    }

    const id = criado.data.user.id;
    await supabaseAdmin.from("profiles").upsert({ id, nome: data.nome, email: data.email });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", id);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: id, role: data.admin ? "admin" : "operador" });

    return { id };
  });

/** Altera o papel de um usuário (somente admin). */
export const definirPapel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mudarPapel.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem alterar permissões.");
    if (data.userId === context.userId) throw new Error("Você não pode alterar seu próprio papel.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error("Falha ao alterar permissão.");
    return { ok: true };
  });

/** Remove um usuário (somente admin). */
export const removerUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alvo.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem remover usuários.");
    if (data.userId === context.userId) throw new Error("Você não pode remover a si mesmo.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error("Falha ao remover usuário.");
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    return { ok: true };
  });
