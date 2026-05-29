import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Usuário não autenticado.");

    const { project_id, invited_email, invited_name, role, message } = await req.json();
    if (!project_id || !invited_email || !role) throw new Error("project_id, invited_email e role são obrigatórios.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Sessão inválida.");

    const { data: canInvite, error: roleError } = await userClient.rpc("has_project_role", {
      _project: project_id,
      _user: userData.user.id,
      _roles: ["manager"],
    });
    if (roleError || !canInvite) throw new Error("Apenas gerente do projeto pode convidar participantes.");

    const { data: project, error: projectError } = await userClient.from("projects").select("id,name").eq("id", project_id).single();
    if (projectError) throw projectError;

    const token = crypto.randomUUID() + "-" + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const email = String(invited_email).trim().toLowerCase();

    const { data: invite, error: inviteError } = await adminClient
      .from("project_invitations")
      .insert({ project_id, invited_by: userData.user.id, invited_email: email, invited_name, role, token, message, expires_at: expiresAt })
      .select("id,token,expires_at")
      .single();
    if (inviteError) throw inviteError;

    const appUrl = Deno.env.get("APP_URL") || req.headers.get("origin") || "";
    const inviteUrl = `${appUrl}/invite/${invite.token}`;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    let email_status = "not_configured";

    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("INVITE_FROM_EMAIL") || "Nexo Projetos <convites@nexoprojetos.app>",
          to: [email],
          subject: "Você foi convidado para participar de um projeto",
          html: `<p>Olá,</p><p>Você foi convidado para participar do projeto <strong>${project.name}</strong> na plataforma Nexo Projetos.</p><p><strong>Papel no projeto:</strong> ${role}</p>${message ? `<p><strong>Mensagem do responsável:</strong> ${message}</p>` : ""}<p><a href="${inviteUrl}">Aceitar convite</a></p><p>Este convite é válido até ${new Date(invite.expires_at).toLocaleDateString("pt-BR")}.</p><p>Importante: este convite dá acesso somente ao projeto <strong>${project.name}</strong>, não ao workspace completo.</p>`,
        }),
      });
      email_status = res.ok ? "sent" : "failed";
    }

    return new Response(JSON.stringify({ invitation_id: invite.id, invite_url: inviteUrl, email_status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message ?? "Erro inesperado" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
