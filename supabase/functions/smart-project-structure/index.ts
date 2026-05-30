import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Participant = { email: string; name?: string; role: string; message?: string };
type DocumentInput = { name: string; file_type?: string; ai_enabled?: boolean; category?: string };

type SmartInput = {
  organization_id: string;
  name: string;
  project_type?: string;
  area?: string;
  description?: string;
  objective?: string;
  start_date?: string;
  end_date?: string;
  complexity?: "simple" | "medium" | "advanced";
  team?: string;
  notes?: string;
  participants?: Participant[];
  documents?: DocumentInput[];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Usuário não autenticado.");

    const input = (await req.json()) as SmartInput;
    if (!input.organization_id || !input.name?.trim()) {
      throw new Error("organization_id e name são obrigatórios.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) throw new Error("Sessão inválida.");

    const { data: isMember, error: memberError } = await client.rpc("is_org_member", {
      _org: input.organization_id,
      _user: userData.user.id,
    });
    if (memberError || !isMember) throw new Error("Você não tem permissão neste workspace.");

    const structure = buildStructure(input);

    const { data: preview, error: previewError } = await client
      .from("smart_project_previews")
      .insert({
        organization_id: input.organization_id,
        created_by: userData.user.id,
        status: "generated",
        input,
        generated_structure: structure,
      })
      .select("id")
      .single();
 codex/create-saas-platform-nexo-projetos-8ui7wb

    return new Response(JSON.stringify({ preview_id: preview?.id ?? null, preview_warning: previewError?.message ?? null, structure }), {

 codex/create-saas-platform-nexo-projetos-tsursl

    return new Response(JSON.stringify({ preview_id: preview?.id ?? null, preview_warning: previewError?.message ?? null, structure }), {

 codex/create-saas-platform-nexo-projetos-mxpyiv

    return new Response(JSON.stringify({ preview_id: preview?.id ?? null, preview_warning: previewError?.message ?? null, structure }), {

    if (previewError) throw previewError;

    return new Response(JSON.stringify({ preview_id: preview.id, structure }), {
 main
 main
 main
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message ?? "Erro inesperado" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildStructure(input: SmartInput) {
  const isAcademic = input.area === "academic" || input.area === "pesquisa" || input.area === "acadêmico";
  const phases = isAcademic
    ? [
        { code: "1.0", title: "Pesquisa e entendimento", weight: 20 },
        { code: "2.0", title: "Planejamento e metodologia", weight: 25 },
        { code: "3.0", title: "Execução e desenvolvimento", weight: 35 },
        { code: "4.0", title: "Revisão, entrega e apresentação", weight: 20 },
      ]
    : [
        { code: "1.0", title: "Descoberta e escopo", weight: 20 },
        { code: "2.0", title: "Planejamento", weight: 25 },
        { code: "3.0", title: "Execução", weight: 35 },
        { code: "4.0", title: "Validação e encerramento", weight: 20 },
      ];

  const start = input.start_date || new Date().toISOString().slice(0, 10);
  const end = input.end_date || addDays(start, input.complexity === "advanced" ? 90 : input.complexity === "medium" ? 45 : 21);
  const scheduleWarning = daysBetween(start, end) < (input.complexity === "advanced" ? 45 : input.complexity === "medium" ? 21 : 10)
    ? "O prazo informado parece apertado para a quantidade de atividades sugeridas. Recomendo revisar escopo, reduzir entregas ou ajustar a data final."
    : "Cronograma inicial plausível para revisão do usuário.";

  const wbs = phases.map((phase, index) => {
    const phaseStart = interpolateDate(start, end, index / phases.length);
    const phaseEnd = interpolateDate(start, end, (index + 1) / phases.length);
    const packages = defaultPackages(phase.title, isAcademic).map((pkg, pkgIndex) => ({
      code: `${index + 1}.${pkgIndex + 1}`,
      title: pkg,
      type: "package",
      weight: 0,
      start_date: phaseStart,
      due_date: phaseEnd,
      status: "todo",
      justification: "Sugestão gerada pela IA com base no tipo, objetivo e descrição informados.",
      tasks: defaultTasks(pkg, phase.title).map((task, taskIndex) => ({
        title: task,
        description: `Executar ${task.toLowerCase()} considerando o objetivo do projeto: ${input.objective || input.description || "não informado"}.`,
        priority: taskIndex === 0 ? "high" : "medium",
        status: "todo",
        start_date: phaseStart,
        due_date: phaseEnd,
        dependencies: taskIndex > 0 ? [`${pkg} — tarefa anterior`] : [],
        checklist: ["Confirmar escopo", "Executar atividade", "Registrar evidências", "Validar conclusão"],
        completion_criteria: "Atividade concluída, evidências registradas e entrega validada.",
      })),
    }));
    return {
      ...phase,
      type: "phase",
      start_date: phaseStart,
      due_date: phaseEnd,
      status: "todo",
      justification: "Peso percentual sugerido para equilibrar planejamento, execução e encerramento.",
      packages,
    };
  });

  const participants = input.participants ?? [];
  const orgChart = [
    { title: "Responsável geral do projeto", person_name: participants.find((p) => p.role === "manager")?.name || "Gerente do projeto", responsibilities: "Coordenação, decisões, riscos e aprovações." },
    { title: "Planejamento", person_name: "Papel sugerido", responsibilities: "Detalhar EAP, cronograma e critérios de sucesso." },
    { title: "Execução", person_name: "Papel sugerido", responsibilities: "Realizar entregas, atualizar tarefas e reportar impedimentos." },
    { title: "Comunicação e aprovação", person_name: "Papel sugerido", responsibilities: "Alinhar stakeholders, registrar decisões e coletar aprovações." },
  ];

  const risks = [
    { title: "Escopo mal definido", description: "O objetivo pode precisar de detalhamento adicional.", cause: "Informações iniciais insuficientes", consequence: "Retrabalho e atraso", probability: "medium", impact: "high", level: "critical", preventive_action: "Validar escopo e critérios de sucesso na abertura.", response_plan: "Revisar EAP com stakeholders." },
    { title: "Prazo incompatível", description: "O prazo desejado pode ser apertado dependendo da disponibilidade da equipe.", cause: "Estimativa inicial otimista", consequence: "Atrasos em entregas principais", probability: "medium", impact: "medium", level: "medium", preventive_action: "Revisar cronograma semanalmente.", response_plan: "Reduzir escopo ou renegociar prazo." },
    { title: "Baixa participação da equipe", description: "Participantes podem não atualizar tarefas ou documentos.", cause: "Papéis e rituais indefinidos", consequence: "Perda de visibilidade", probability: "low", impact: "medium", level: "low", preventive_action: "Definir responsáveis por fase e rotina de acompanhamento.", response_plan: "Redistribuir tarefas e escalar impedimentos." },
  ];

  const stakeholders = [
    { name: participants.find((p) => p.role === "client")?.name || "Cliente/Patrocinador", role: "Aprovação e direcionamento", influence: "high", interest: "high", communication_channel: "Reunião ou e-mail", communication_frequency: "Semanal" },
    { name: participants.find((p) => p.role === "professor")?.name || "Professor/Orientador", role: "Acompanhamento técnico/acadêmico", influence: "medium", interest: "high", communication_channel: "Reunião de acompanhamento", communication_frequency: "Quinzenal" },
    { name: "Equipe do projeto", role: "Execução", influence: "medium", interest: "high", communication_channel: "Kanban e checkpoints", communication_frequency: "2x por semana" },
  ];

  const communication_plan = stakeholders.map((stakeholder) => ({
    audience: stakeholder.name,
    subject: "Status, decisões pendentes e próximos passos",
    channel: stakeholder.communication_channel,
    frequency: stakeholder.communication_frequency,
    notes: "Plano inicial sugerido pela IA; revise conforme governança do projeto.",
  }));

  const documents = (input.documents ?? []).map((doc) => ({
    name: doc.name,
    category: doc.category || classifyDocument(doc.name),
    summary: "Documento informado na criação. O resumo detalhado depende do processamento de texto/chunks após upload definitivo.",
    important_points: ["Validar conteúdo", "Relacionar às fases da EAP", "Permitir uso pela IA somente se autorizado"],
    ai_enabled: doc.ai_enabled ?? true,
  }));

  return {
    overview: {
      name: input.name,
      objective: input.objective || "Objetivo a refinar com base na prévia gerada.",
      scope: input.description || "Escopo inicial sugerido com base nas informações fornecidas.",
      justification: `Projeto do tipo ${input.project_type || input.area || "não informado"} criado a partir do briefing inicial do usuário.`,
      assumptions: "Disponibilidade dos participantes convidados e acesso aos documentos enviados.",
      constraints: input.notes || "Restrições não informadas; revisar na prévia.",
      success_criteria: "Entregas concluídas no prazo, riscos tratados e aprovação final registrada.",
    },
    wbs,
    risks,
    stakeholders,
    communication_plan,
    org_chart: orgChart,
    milestones: phases.map((phase) => ({ title: `Concluir ${phase.title}`, due_date: interpolateDate(start, end, phases.indexOf(phase) / phases.length + 1 / phases.length) })),
    documents,
    participants,
    schedule_warning: scheduleWarning,
    checklist: ["Validar objetivo", "Aprovar EAP", "Confirmar responsáveis", "Revisar riscos", "Enviar convites", "Processar documentos"],
    initial_report: {
      title: "Relatório Inicial do Projeto",
      summary: `Projeto ${input.name} estruturado automaticamente em modo de prévia.`,
      recommendations: ["Revise pesos da EAP", "Confirme prazos e responsáveis", "Aprove apenas itens coerentes", "Use IA do projeto somente com documentos autorizados"],
    },
    source_notes: {
      user_provided: ["nome", "descrição", "objetivo", "prazo", "participantes", "documentos"],
      document_extracted: documents.length ? "Documentos foram listados; extração/chunking ocorrerá após upload definitivo vinculado ao project_id." : "Nenhum documento informado.",
      ai_suggestions: "EAP, tarefas, riscos, stakeholders, comunicação, organograma e relatório inicial são sugestões editáveis.",
    },
  };
}

function defaultPackages(phase: string, academic: boolean) {
  if (academic && phase.includes("Pesquisa")) return ["Levantamento de referências", "Síntese teórica"];
  if (phase.includes("Descoberta") || phase.includes("Pesquisa")) return ["Briefing e diagnóstico", "Definição de escopo"];
  if (phase.includes("Planejamento")) return ["Plano de trabalho", "Cronograma e responsabilidades"];
  if (phase.includes("Execução") || phase.includes("desenvolvimento")) return ["Produção das entregas", "Controle de qualidade"];
  return ["Revisão final", "Entrega e aprovação"];
}

function defaultTasks(pkg: string, phase: string) {
  return [
    `Planejar ${pkg}`,
    `Executar ${pkg}`,
    `Validar ${pkg}`,
    `Registrar evidências de ${phase}`,
  ];
}

function classifyDocument(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("contrato")) return "Contrato";
  if (lower.includes("briefing")) return "Briefing";
  if (lower.includes("cronograma")) return "Cronograma";
  if (lower.includes("financeiro") || lower.includes("orçamento")) return "Financeiro";
  if (lower.includes("pesquisa") || lower.includes("refer")) return "Pesquisa/Referência";
  return "Outros";
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  return Math.ceil((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000);
}

function interpolateDate(start: string, end: string, ratio: number) {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return new Date(a + (b - a) * ratio).toISOString().slice(0, 10);
}
