import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Usuário não autenticado.");

    const { project_id, conversation_id, message } = await req.json();
    if (!project_id || !message) throw new Error("project_id e message são obrigatórios.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Sessão inválida.");

    const { data: allowed, error: allowedError } = await userClient.rpc("is_project_member", {
      _project: project_id,
      _user: userData.user.id,
    });
    if (allowedError || !allowed) throw new Error("Você não tem permissão neste projeto.");

    const [projectRes, tasksRes, risksRes, docsRes] = await Promise.all([
      userClient.from("projects").select("id,org_id,name,objective,description,status,health,progress,health_reason,budget_planned,budget_actual,start_date,end_date").eq("id", project_id).single(),
      userClient.from("tasks").select("title,status,priority,due_date,progress,blocked_reason").eq("project_id", project_id).order("due_date", { ascending: true }).limit(50),
      userClient.from("risks").select("title,level,status,preventive_action,response_plan").eq("project_id", project_id).order("created_at", { ascending: false }).limit(20),
      userClient.from("project_documents").select("id,name,file_type,processing_status,ai_enabled").eq("project_id", project_id).eq("ai_enabled", true).limit(20),
    ]);

    if (projectRes.error) throw projectRes.error;

    let currentConversationId = conversation_id;
    if (!currentConversationId) {
      const { data: created, error } = await userClient
        .from("ai_conversations")
        .insert({ project_id, user_id: userData.user.id, title: message.slice(0, 80) })
        .select("id")
        .single();
      if (error) throw error;
      currentConversationId = created.id;
    }

    await userClient.from("ai_messages").insert({
      conversation_id: currentConversationId,
      project_id,
      user_id: userData.user.id,
      role: "user",
      content: message,
    });

    const openTasks = (tasksRes.data ?? []).filter((task) => task.status !== "done");
    const lateTasks = openTasks.filter((task) => task.due_date && new Date(task.due_date) < new Date());
    const criticalRisks = (risksRes.data ?? []).filter((risk) => risk.level === "critical" && risk.status !== "closed");
    const enabledDocs = docsRes.data ?? [];
    const knowledgeRes = await userClient
      .from("knowledge_files")
      .select("name,description,category,processing_status")
      .eq("organization_id", projectRes.data.org_id)
      .eq("ai_enabled", true)
      .limit(5);
    const knowledgeFiles = knowledgeRes.data ?? [];

    const answer = [
      `Dados cadastrados no projeto: ${projectRes.data.name} está com ${projectRes.data.progress ?? 0}% de progresso, saúde ${projectRes.data.health} e status ${projectRes.data.status}.`,
      lateTasks.length
        ? `Tarefas atrasadas neste projeto: ${lateTasks.map((task) => task.title).join(", ")}.`
        : "Não encontrei tarefas atrasadas cadastradas neste projeto.",
      criticalRisks.length
        ? `Riscos críticos neste projeto: ${criticalRisks.map((risk) => risk.title).join(", ")}.`
        : "Não encontrei riscos críticos abertos neste projeto.",
      enabledDocs.length
        ? `Dados de documentos do projeto disponíveis para IA: ${enabledDocs.map((doc) => doc.name).join(", ")}.`
        : "Não encontrei documentos deste projeto habilitados para IA.",
      knowledgeFiles.length
        ? `Base de conhecimento do agente disponível: ${knowledgeFiles.map((file) => `${file.name} (${file.category})`).join(", ")}. Use esses materiais como orientação conceitual antes de aplicar sugestões ao projeto.`
        : "Não encontrei apostilas de Gestão de Projetos habilitadas para este workspace. Para perguntas conceituais, cadastre materiais na Base de Conhecimento do Agente.",
      "Sugestões geradas pela IA: priorize itens atrasados, revise riscos críticos sem ação preventiva e confirme os próximos marcos antes do próximo checkpoint. Para criar tarefa, reunião, invite/e-mail, lembrete ou evento de agenda, use os botões de rascunho e aprove antes de salvar/executar.",
      "Observação: esta resposta foi gerada somente com dados vinculados ao project_id atual. Se uma informação não aparecer aqui, ela não foi encontrada nos dados ou documentos deste projeto.",
    ].join("\n\n");

    await adminClient.from("ai_messages").insert({
      conversation_id: currentConversationId,
      project_id,
      user_id: userData.user.id,
      role: "assistant",
      content: answer,
    });

    return new Response(JSON.stringify({ conversation_id: currentConversationId, answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message ?? "Erro inesperado" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
