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
    if (!authHeader) throw new Error("Faça login ou crie uma conta para aceitar este convite.");
    const { token } = await req.json();
    if (!token) throw new Error("Token obrigatório.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user?.email) throw new Error("Sessão inválida.");

    const { data: projectId, error } = await client.rpc("accept_project_invitation", {
      _token: token,
      _user: userData.user.id,
      _email: userData.user.email.toLowerCase(),
    });
    if (error) throw mapInviteError(error.message);

    return new Response(JSON.stringify({ project_id: projectId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message ?? "Erro inesperado" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function mapInviteError(message: string) {
  if (message.includes("invite_expired")) return new Error("Este convite expirou. Solicite um novo convite ao responsável pelo projeto.");
  if (message.includes("invite_cancelled")) return new Error("Este convite foi cancelado e não pode mais ser usado.");
  if (message.includes("invite_email_mismatch")) return new Error("Este convite foi enviado para outro e-mail. Entre com o e-mail correto para aceitar o convite.");
  return new Error("Convite inválido ou indisponível.");
}
