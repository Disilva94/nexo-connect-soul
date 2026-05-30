import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { projectsQuery, orgsQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Sparkles, Upload, Users } from "lucide-react";
import { brand } from "@/config/brand";
import { toast } from "sonner";

const db = supabase as any;
type AnyRow = Record<string, any>;
type SmartProjectInput = { name: string; project_type: string; description: string; objective: string; start_date: string; end_date: string; complexity: string; area: string; team: string; notes: string };
type InviteDraft = { invited_email: string; invited_name: string; role: string; message: string };
type DocDraft = { id: string; name: string; file_type: string; description: string; ai_enabled: boolean; file?: File; file_url?: string };

const roleOptions = [
  { value: "manager", label: "Gerente do projeto" },
  { value: "contributor", label: "Membro da equipe" },
  { value: "client", label: "Cliente" },
  { value: "professor", label: "Professor" },
  { value: "observer", label: "Observador" },
] as const;

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: `Projetos — ${brand.fullName}` }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const projects = useQuery(projectsQuery);
  const orgs = useQuery(orgsQuery);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Projetos</h1>
          <p className="mt-1 text-muted-foreground">Crie projetos completos com apoio de IA e convide pessoas somente para cada projeto.</p>
        </div>
        <SmartProjectWizard defaultOrgId={orgs.data?.[0]?.id} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!projects.isLoading && projects.data?.length === 0 && (
          <Card className="col-span-full flex flex-col items-center justify-center p-12 text-center">
            <p className="text-muted-foreground">Nenhum projeto ainda.</p>
            <p className="mt-1 text-sm text-muted-foreground">Use o assistente inteligente para criar seu primeiro projeto completo.</p>
          </Card>
        )}
        {projects.data?.map((p: AnyRow) => (
          <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }}>
            <Card className="h-full p-5 transition-all hover:border-primary/60 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                <HealthDot health={p.health} />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.objective || p.description || "Sem objetivo cadastrado."}</p>
              <div className="mt-4"><Progress value={p.progress ?? 0} /></div>
              <p className="mt-1 text-xs text-muted-foreground">Progresso {p.progress ?? 0}%</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{p.status}</Badge>
                {p.end_date && <span>Entrega: {new Date(`${p.end_date}T00:00:00`).toLocaleDateString("pt-BR")}</span>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SmartProjectWizard({ defaultOrgId }: { defaultOrgId?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState({
    name: "",
    project_type: "",
    description: "",
    objective: "",
    start_date: "",
    end_date: "",
    complexity: "medium",
    area: "software",
    team: "",
    notes: "",
  });
  const [documents, setDocuments] = useState<DocDraft[]>([]);
  const [invites, setInvites] = useState<InviteDraft[]>([]);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>({ invited_email: "", invited_name: "", role: "contributor", message: "" });
  const [structure, setStructure] = useState<AnyRow | null>(null);

  const flattenedTasks = useMemo(() => flattenTasks(structure), [structure]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setDocuments((current) => [
      ...current,
      ...Array.from(files).map((file) => ({ id: crypto.randomUUID(), name: file.name, file_type: file.type || "arquivo", description: "", ai_enabled: true, file })),
    ]);
  }

  function addInvite() {
    if (!inviteDraft.invited_email.trim()) return;
    setInvites((current) => [...current, { ...inviteDraft, invited_email: inviteDraft.invited_email.trim().toLowerCase() }]);
    setInviteDraft({ invited_email: "", invited_name: "", role: "contributor", message: "" });
  }

  async function generateStructure() {
    if (!defaultOrgId || !input.name.trim()) return;
    setLoading(true);
    const payload = {
      organization_id: defaultOrgId,
      ...input,
      participants: invites,
      documents: documents.map(({ name, file_type, ai_enabled }) => ({ name, file_type, ai_enabled })),
    };

    try {
      const { data, error } = await supabase.functions.invoke("smart-project-structure", { body: payload });
      if (error) throw error;
      if (!data?.structure) throw new Error("A função de IA não retornou uma estrutura válida.");
      setStructure(data.structure);
      toast.success("Estrutura gerada com IA.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao chamar a Edge Function.";
      setStructure(buildLocalSmartStructure(payload));
      toast.warning(`Não consegui acessar a Edge Function agora (${message}). Gerei uma prévia estruturada local para você continuar.`);
    } finally {
      setLoading(false);
      setStep(5);
    }
  }

  async function createProjectWithStructure() {
    if (!defaultOrgId || !user || !structure) return;
    setLoading(true);
    const { data: project, error } = await db.from("projects").insert({
      org_id: defaultOrgId,
      owner_id: user.id,
      name: input.name.trim(),
 codex/create-saas-platform-nexo-projetos-tsursl
      description: structure.overview?.objective || input.description || null,

      description: input.description || null,
      objective: structure.overview?.objective || input.objective || null,
 main
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      status: "active",
      health: "green",
 codex/create-saas-platform-nexo-projetos-tsursl

      progress: 0,
      health_reason: "Projeto criado com estrutura inicial gerada por IA e aguardando execução.",
      scope: structure.overview?.scope || null,
      justification: structure.overview?.justification || null,
      assumptions: structure.overview?.assumptions || null,
      constraints_text: structure.overview?.constraints || null,
      success_criteria: structure.overview?.success_criteria || null,
      main_deliverables: (structure.wbs ?? []).map((phase: AnyRow) => phase.title).join("; "),
 main
    }).select("id").single();
    if (error) { setLoading(false); toast.error(error.message); return; }

    const projectId = project.id;
 codex/create-saas-platform-nexo-projetos-tsursl
    const warnings: string[] = [];
    await updateProjectDetails(projectId, input, structure, warnings);
    await createWbsAndTasks(projectId, structure, user.id, warnings);
    await insertRows("risks", projectId, (structure.risks ?? []).map((risk: AnyRow) => ({ title: risk.title, description: risk.description, probability: risk.probability, impact: risk.impact, level: risk.level, preventive_action: risk.preventive_action, response_plan: risk.response_plan, status: "open" })), warnings);
    await insertRows("stakeholders", projectId, (structure.stakeholders ?? []).map((s: AnyRow) => ({ name: s.name, role: s.role, influence: s.influence, interest: s.interest, communication_channel: s.communication_channel, communication_frequency: s.communication_frequency })), warnings);
    await insertRows("communication_plan_items", projectId, structure.communication_plan ?? [], warnings);
    await insertRows("project_org_chart_nodes", projectId, (structure.org_chart ?? []).map((node: AnyRow, index: number) => ({ ...node, order_index: index })), warnings);
    await uploadDocuments(projectId, defaultOrgId, documents, user.id, warnings);
    await insertRows("project_reports", projectId, [{ type: "status", title: "Relatório Inicial do Projeto", created_by: user.id, content: structure.initial_report ?? structure }], warnings);

    for (const invite of invites) {
      const { error: inviteError } = await supabase.functions.invoke("send-project-invite", { body: { project_id: projectId, ...invite } });
      if (inviteError) warnings.push(`Convite ${invite.invited_email}: ${inviteError.message}`);
    }

    await db.rpc("recalculate_project_progress", { _project_id: projectId });
    setLoading(false);
    if (warnings.length) {
      toast.warning(`Projeto criado com estrutura principal. Alguns detalhes não foram salvos porque o banco ainda não está 100% atualizado: ${warnings.slice(0, 2).join("; ")}`);
    } else {
      toast.success("Projeto completo criado com estrutura de IA e convites por projeto.");
    }

    await createWbsAndTasks(projectId, structure, user.id);
    await insertRows("risks", projectId, (structure.risks ?? []).map((risk: AnyRow) => ({ title: risk.title, description: risk.description, probability: risk.probability, impact: risk.impact, level: risk.level, preventive_action: risk.preventive_action, response_plan: risk.response_plan, status: "open" })));
    await insertRows("stakeholders", projectId, (structure.stakeholders ?? []).map((s: AnyRow) => ({ name: s.name, role: s.role, influence: s.influence, interest: s.interest, communication_channel: s.communication_channel, communication_frequency: s.communication_frequency })));
    await insertRows("communication_plan_items", projectId, structure.communication_plan ?? []);
    await insertRows("project_org_chart_nodes", projectId, (structure.org_chart ?? []).map((node: AnyRow, index: number) => ({ ...node, order_index: index })));
    await uploadDocuments(projectId, defaultOrgId, documents, user.id);
    await db.from("project_reports").insert({ project_id: projectId, type: "status", title: "Relatório Inicial do Projeto", created_by: user.id, content: structure.initial_report ?? structure });

    for (const invite of invites) {
      await supabase.functions.invoke("send-project-invite", { body: { project_id: projectId, ...invite } });
    }


    await db.rpc("recalculate_project_progress", { _project_id: projectId });
    setLoading(false);
    toast.success("Projeto completo criado com estrutura de IA e convites por projeto.");
 main
    qc.invalidateQueries({ queryKey: ["projects"] });
    setOpen(false);
    navigate({ to: "/projects/$projectId", params: { projectId } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!defaultOrgId}><Sparkles className="mr-2 h-4 w-4" />Novo projeto com IA</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criação inteligente de projeto</DialogTitle>
        </DialogHeader>
        <div className="mb-4 grid gap-2 md:grid-cols-5">
          {["Informações", "Documentos", "Participantes", "Gerar IA", "Prévia"].map((label, index) => <div key={label} className={`rounded-lg px-3 py-2 text-xs font-medium ${step === index + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index + 1}. {label}</div>)}
        </div>

        {step === 1 && <BasicStep input={input} setInput={setInput} />}
        {step === 2 && <DocumentsStep documents={documents} setDocuments={setDocuments} addFiles={addFiles} />}
        {step === 3 && <ParticipantsStep invites={invites} setInvites={setInvites} inviteDraft={inviteDraft} setInviteDraft={setInviteDraft} addInvite={addInvite} />}
        {step === 4 && <GenerateStep input={input} documents={documents} invites={invites} generateStructure={generateStructure} loading={loading} />}
        {step === 5 && structure && <PreviewStep structure={structure} setStructure={setStructure} documents={documents} invites={invites} tasks={flattenedTasks} />}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1 || loading}>Voltar</Button>
          <div className="flex gap-2">
            {step < 4 && <Button onClick={() => setStep(step + 1)}>Continuar</Button>}
            {step === 4 && <Button onClick={generateStructure} disabled={loading || !input.name.trim()}>{loading ? "Gerando..." : "Gerar estrutura do projeto com IA"}</Button>}
            {step === 5 && <Button onClick={createProjectWithStructure} disabled={loading}>{loading ? "Criando..." : "Criar projeto com esta estrutura"}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BasicStep({ input, setInput }: { input: SmartProjectInput; setInput: Dispatch<SetStateAction<SmartProjectInput>> }) {
  return <div className="grid gap-4 md:grid-cols-2"><Field label="Nome do projeto"><Input required value={input.name} onChange={(e) => setInput({ ...input, name: e.target.value })} /></Field><Field label="Tipo do projeto"><Input value={input.project_type} onChange={(e) => setInput({ ...input, project_type: e.target.value })} /></Field><Field label="Descrição do que será feito"><Textarea value={input.description} onChange={(e) => setInput({ ...input, description: e.target.value })} /></Field><Field label="Objetivo principal"><Textarea value={input.objective} onChange={(e) => setInput({ ...input, objective: e.target.value })} /></Field><Field label="Data de início"><Input type="date" value={input.start_date} onChange={(e) => setInput({ ...input, start_date: e.target.value })} /></Field><Field label="Data final desejada"><Input type="date" value={input.end_date} onChange={(e) => setInput({ ...input, end_date: e.target.value })} /></Field><Field label="Complexidade"><Select value={input.complexity} onValueChange={(complexity) => setInput({ ...input, complexity })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="simple">Simples</SelectItem><SelectItem value="medium">Médio</SelectItem><SelectItem value="advanced">Avançado</SelectItem></SelectContent></Select></Field><Field label="Área do projeto"><Select value={input.area} onValueChange={(area) => setInput({ ...input, area })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["acadêmico","software","marketing","evento","consultoria","implantação","pesquisa","empresarial","outro"].map((area) => <SelectItem key={area} value={area}>{area}</SelectItem>)}</SelectContent></Select></Field><Field label="Equipe inicial"><Textarea value={input.team} onChange={(e) => setInput({ ...input, team: e.target.value })} /></Field><Field label="Observações importantes"><Textarea value={input.notes} onChange={(e) => setInput({ ...input, notes: e.target.value })} /></Field></div>;
}

function DocumentsStep({ documents, setDocuments, addFiles }: { documents: DocDraft[]; setDocuments: (docs: DocDraft[]) => void; addFiles: (files: FileList | null) => void }) {
  const [link, setLink] = useState("");
  return <div className="space-y-4"><div className="rounded-xl border border-dashed p-6 text-center"><Upload className="mx-auto h-8 w-8 text-primary" /><p className="mt-2 font-medium">Anexe PDF, DOCX, TXT, imagens ou planilhas</p><p className="text-sm text-muted-foreground">Os arquivos serão enviados somente após a confirmação, já com project_id e caminho isolado por organização/projeto.</p><Input className="mt-4" type="file" multiple onChange={(e) => addFiles(e.target.files)} /></div><div className="flex gap-2"><Input placeholder="Adicionar link externo" value={link} onChange={(e) => setLink(e.target.value)} /><Button type="button" variant="secondary" onClick={() => { if (!link) return; setDocuments([...documents, { id: crypto.randomUUID(), name: link, file_type: "link", description: "Link externo", ai_enabled: true, file_url: link }]); setLink(""); }}>Adicionar link</Button></div><div className="space-y-2">{documents.map((doc) => <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{doc.name}</span><Button variant="ghost" size="sm" onClick={() => setDocuments(documents.filter((d) => d.id !== doc.id))}>Remover</Button></div>)}</div></div>;
}

function ParticipantsStep({ invites, setInvites, inviteDraft, setInviteDraft, addInvite }: { invites: InviteDraft[]; setInvites: (invites: InviteDraft[]) => void; inviteDraft: InviteDraft; setInviteDraft: (invite: InviteDraft) => void; addInvite: () => void }) {
  return <div className="space-y-4"><div className="rounded-xl bg-primary/5 p-4 text-sm text-muted-foreground"><Users className="mb-2 h-5 w-5 text-primary" />Convide pessoas para participar somente deste projeto. Elas não terão acesso aos outros projetos do seu workspace.</div><div className="grid gap-3 md:grid-cols-[1fr_180px]"><Input type="email" placeholder="E-mail do participante" value={inviteDraft.invited_email} onChange={(e) => setInviteDraft({ ...inviteDraft, invited_email: e.target.value })} /><Select value={inviteDraft.role} onValueChange={(role) => setInviteDraft({ ...inviteDraft, role })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roleOptions.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectContent></Select><Input placeholder="Nome opcional" value={inviteDraft.invited_name} onChange={(e) => setInviteDraft({ ...inviteDraft, invited_name: e.target.value })} /><Input placeholder="Mensagem opcional" value={inviteDraft.message} onChange={(e) => setInviteDraft({ ...inviteDraft, message: e.target.value })} /></div><Button type="button" variant="secondary" onClick={addInvite}><Plus className="mr-2 h-4 w-4" />Adicionar convite</Button><div className="space-y-2">{invites.map((invite, index) => <div key={`${invite.invited_email}-${index}`} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{invite.invited_email} — {roleOptions.find((r) => r.value === invite.role)?.label}</span><Button variant="ghost" size="sm" onClick={() => setInvites(invites.filter((_, i) => i !== index))}>Remover</Button></div>)}</div></div>;
}

function GenerateStep({ input, documents, invites, generateStructure, loading }: { input: AnyRow; documents: DocDraft[]; invites: InviteDraft[]; generateStructure: () => void; loading: boolean }) {
  return <Card className="p-6"><h3 className="font-display text-xl font-semibold">Gerar estrutura do projeto com IA</h3><p className="mt-2 text-sm text-muted-foreground">A Edge Function enviará apenas os dados deste formulário, documentos listados para o project_id em criação e participantes informados. A IA retorna prévia editável, sem criar registros definitivos antes da confirmação.</p><div className="mt-4 grid gap-3 md:grid-cols-3"><Metric label="Projeto" value={input.name || "Sem nome"} /><Metric label="Documentos" value={documents.length} /><Metric label="Convites" value={invites.length} /></div><Button className="mt-5" onClick={generateStructure} disabled={loading || !input.name.trim()}><Sparkles className="mr-2 h-4 w-4" />{loading ? "Gerando prévia..." : "Gerar estrutura com IA"}</Button></Card>;
}

function PreviewStep({ structure, setStructure, documents, invites, tasks }: { structure: AnyRow; setStructure: (s: AnyRow) => void; documents: DocDraft[]; invites: InviteDraft[]; tasks: AnyRow[] }) {
 codex/create-saas-platform-nexo-projetos-tsursl
  const documentItems = (structure.documents ?? documents).map((doc: AnyRow | DocDraft | string) => {
    if (typeof doc === "string") return doc;
    return `${doc.name} — ${doc.category ?? "Outros"}${doc.summary ? `: ${doc.summary}` : ""}`;

  
  const documentItems = (structure.documents ?? documents).map((doc: AnyRow | DocDraft | string) => {
    if (typeof doc === "string") return doc;
    const d = doc as AnyRow;
    return `${d.name} — ${d.category ?? "Outros"}${d.summary ? `: ${d.summary}` : ""}`;
 main
  });

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-display text-xl font-semibold">Prévia da estrutura do projeto</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Revise a prévia completa. Nada definitivo é salvo em EAP, tarefas, riscos, documentos ou convites até você clicar em “Criar projeto com esta estrutura”.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Objetivo estruturado">
            <Textarea rows={3} value={structure.overview?.objective ?? ""} onChange={(e) => setStructure({ ...structure, overview: { ...structure.overview, objective: e.target.value } })} />
          </Field>
          <Field label="Escopo inicial">
            <Textarea rows={3} value={structure.overview?.scope ?? ""} onChange={(e) => setStructure({ ...structure, overview: { ...structure.overview, scope: e.target.value } })} />
          </Field>
        </div>
      </Card>

      {structure.schedule_warning && <p className="rounded-lg bg-warning/20 p-3 text-sm text-warning-foreground">{structure.schedule_warning}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <PreviewList title="Resumo do projeto" items={[structure.overview?.justification, structure.overview?.assumptions, structure.overview?.constraints, structure.overview?.success_criteria].filter(Boolean)} />
        <PreviewList title="EAP sugerida" items={(structure.wbs ?? []).map((phase: AnyRow) => `${phase.code} ${phase.title} — ${phase.weight}% · ${phase.start_date} até ${phase.due_date}`)} />
        <PreviewList title="Tarefas sugeridas" items={tasks.map((task) => `${task.phase} / ${task.package}: ${task.title} — ${task.start_date} até ${task.due_date}`)} />
        <PreviewList title="Cronograma e marcos" items={(structure.milestones ?? []).map((milestone: AnyRow) => `${milestone.title} — ${milestone.due_date}`)} />
        <PreviewList title="Organograma sugerido" items={(structure.org_chart ?? []).map((node: AnyRow) => `${node.title}: ${node.person_name} — ${node.responsibilities}`)} />
        <PreviewList title="Riscos sugeridos" items={(structure.risks ?? []).map((risk: AnyRow) => `${risk.title} — ${risk.level}: ${risk.preventive_action}`)} />
        <PreviewList title="Stakeholders sugeridos" items={(structure.stakeholders ?? []).map((s: AnyRow) => `${s.name} — ${s.role} · influência ${s.influence} · interesse ${s.interest}`)} />
        <PreviewList title="Plano de comunicação inicial" items={(structure.communication_plan ?? []).map((item: AnyRow) => `${item.audience}: ${item.subject} · ${item.channel} · ${item.frequency}`)} />
        <PreviewList title="Documentos analisados e organizados" items={documentItems} />
        <PreviewList title="Participantes convidados" items={invites.map((invite) => `${invite.invited_email} — ${roleOptions.find((role) => role.value === invite.role)?.label ?? invite.role}`)} />
        <PreviewList title="Checklist inicial" items={structure.checklist ?? []} />
        <PreviewList title="Relatório inicial e recomendações" items={[structure.initial_report?.summary, ...(structure.initial_report?.recommendations ?? []), ...(structure.initial_report?.next_steps ?? [])].filter(Boolean)} />
      </div>

      <Card className="p-4">
        <h4 className="font-semibold">Transparência da IA</h4>
        <div className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
          <div><strong>Dados fornecidos:</strong><br />{(structure.source_notes?.user_provided ?? []).join(", ") || "Formulário do usuário"}</div>
          <div><strong>Documentos:</strong><br />{structure.source_notes?.document_extracted ?? "Nenhum documento processado ainda."}</div>
          <div><strong>Sugestões:</strong><br />{structure.source_notes?.ai_suggestions ?? "Estrutura sugerida e editável."}</div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => toast.info("A prévia já está em formato simplificado para revisão. Edite objetivo e escopo antes de criar.")}>Pedir para simplificar</Button>
        <Button variant="secondary" onClick={() => toast.info("Para detalhar mais, volte e gere novamente com mais contexto, documentos ou observações.")}>Pedir para detalhar mais</Button>
      </div>
    </div>
  );
}

type SmartStructurePayload = SmartProjectInput & {
  organization_id: string;
  participants: InviteDraft[];
  documents: Array<{ name: string; file_type: string; ai_enabled: boolean }>;
};

function buildLocalSmartStructure(payload: SmartStructurePayload) {
  const academic = ["acadêmico", "academico", "pesquisa"].includes(payload.area?.toLowerCase?.() ?? "");
  const software = payload.area === "software" || payload.project_type.toLowerCase().includes("software");
  const start = payload.start_date || todayIso();
  const end = payload.end_date || addDays(start, payload.complexity === "advanced" ? 90 : payload.complexity === "medium" ? 45 : 21);
  const phaseTemplates: Array<[string, string, number, string[]]> = academic
    ? [
        ["1.0", "Pesquisa e diagnóstico", 20, ["Levantamento de referências", "Análise dos documentos", "Definição do problema"]],
        ["2.0", "Metodologia e planejamento", 25, ["Definir método", "Planejar cronograma", "Organizar responsabilidades"]],
        ["3.0", "Desenvolvimento do trabalho", 35, ["Produzir entregas principais", "Revisar com orientador", "Consolidar resultados"]],
        ["4.0", "Entrega e apresentação", 20, ["Formatação final", "Preparar apresentação", "Aprovação e encerramento"]],
      ]
    : software
      ? [
          ["1.0", "Descoberta e escopo", 20, ["Briefing e requisitos", "Mapeamento de stakeholders", "Critérios de sucesso"]],
          ["2.0", "Planejamento da solução", 25, ["Arquitetura inicial", "Backlog priorizado", "Plano de entrega"]],
          ["3.0", "Execução e validação", 35, ["Implementação", "Testes e revisão", "Homologação"]],
          ["4.0", "Lançamento e encerramento", 20, ["Preparar entrega", "Treinamento e documentação", "Lições aprendidas"]],
        ]
      : [
          ["1.0", "Iniciação e alinhamento", 20, ["Briefing", "Escopo inicial", "Governança"]],
          ["2.0", "Planejamento", 25, ["Cronograma", "Custos estimados", "Plano de comunicação"]],
          ["3.0", "Execução", 35, ["Produção das entregas", "Controle de qualidade", "Acompanhamento"]],
          ["4.0", "Validação e encerramento", 20, ["Entrega final", "Aprovação", "Relatório final"]],
        ];

  const wbs = phaseTemplates.map(([code, title, weight, packages], phaseIndex) => {
    const phaseStart = interpolateDate(start, end, phaseIndex / phaseTemplates.length);
    const phaseEnd = interpolateDate(start, end, (phaseIndex + 1) / phaseTemplates.length);
    return {
      code,
      title,
      type: "phase",
      weight,
      status: "todo",
      start_date: phaseStart,
      due_date: phaseEnd,
      justification: "Sugestão gerada a partir das informações fornecidas no assistente de criação.",
      packages: (packages as string[]).map((packageTitle, packageIndex) => ({
        code: `${phaseIndex + 1}.${packageIndex + 1}`,
        title: packageTitle,
        type: "package",
        weight: 0,
        status: "todo",
        start_date: phaseStart,
        due_date: phaseEnd,
        justification: "Pacote sugerido para transformar o objetivo em entregas gerenciáveis.",
        tasks: buildPackageTasks(packageTitle, String(title), phaseStart, phaseEnd),
      })),
    };
  });

  const invitedManager = payload.participants.find((participant) => participant.role === "manager");
  const invitedClient = payload.participants.find((participant) => participant.role === "client");
  const invitedProfessor = payload.participants.find((participant) => participant.role === "professor");
  const documentSummaries = payload.documents.map((document) => ({
    name: document.name,
    category: classifyLocalDocument(document.name),
    summary: "Documento incluído no assistente. O processamento completo será feito depois que o projeto existir e o arquivo estiver salvo com project_id.",
    important_points: ["Validar conteúdo", "Relacionar com a EAP", "Confirmar permissão de uso pela IA"],
    possible_tasks: ["Ler documento", "Extrair requisitos", "Vincular pontos relevantes às entregas"],
    risks_identified: ["Informação incompleta ou desatualizada"],
    ai_enabled: document.ai_enabled,
  }));

  const stakeholders = [
    { name: invitedClient?.invited_name || invitedClient?.invited_email || "Cliente/Patrocinador", role: "Aprovação e direcionamento", influence: "high", interest: "high", communication_channel: "E-mail ou reunião", communication_frequency: "Semanal" },
    { name: invitedProfessor?.invited_name || invitedProfessor?.invited_email || "Professor/Orientador", role: "Orientação e avaliação", influence: academic ? "high" : "medium", interest: "high", communication_channel: "Reunião de acompanhamento", communication_frequency: "Quinzenal" },
    { name: "Equipe do projeto", role: "Execução das entregas", influence: "medium", interest: "high", communication_channel: "Kanban e checkpoints", communication_frequency: "2x por semana" },
  ];

  const communication_plan = stakeholders.map((stakeholder) => ({
    audience: stakeholder.name,
    subject: "Status, próximos passos, riscos e decisões pendentes",
    channel: stakeholder.communication_channel,
    frequency: stakeholder.communication_frequency,
    notes: "Plano inicial sugerido; ajuste conforme disponibilidade dos participantes.",
  }));

  const risks = [
    { title: "Escopo insuficientemente detalhado", description: "Algumas entregas podem precisar de refinamento após a primeira reunião.", cause: "Briefing inicial ainda amplo", consequence: "Retrabalho e atraso", probability: "medium", impact: "high", level: "critical", preventive_action: "Validar objetivo, escopo e critérios de sucesso antes da execução.", response_plan: "Revisar EAP e replanejar pacotes afetados." },
    { title: "Prazo incompatível com complexidade", description: "O prazo pode ser apertado para a quantidade de pacotes sugeridos.", cause: "Estimativa inicial sem histórico detalhado", consequence: "Atraso em marcos principais", probability: "medium", impact: "medium", level: "medium", preventive_action: "Revisar cronograma e reduzir escopo se necessário.", response_plan: "Renegociar prazo, recursos ou entregas." },
    { title: "Baixa participação dos envolvidos", description: "Participantes podem não atualizar tarefas, documentos ou decisões.", cause: "Responsabilidades e cadência de comunicação indefinidas", consequence: "Falta de visibilidade e decisões tardias", probability: "low", impact: "medium", level: "low", preventive_action: "Definir responsáveis, canais e frequência de acompanhamento.", response_plan: "Escalar pendências e redistribuir tarefas críticas." },
  ];

  const scheduleWarning = daysBetween(start, end) < (payload.complexity === "advanced" ? 45 : payload.complexity === "medium" ? 21 : 10)
    ? "O prazo informado parece apertado para a quantidade de atividades sugeridas. Recomendo revisar escopo, reduzir entregas ou ajustar a data final."
    : "Cronograma inicial gerado de forma proporcional ao prazo informado.";

  return {
    overview: {
      name: payload.name,
      objective: payload.objective || `Estruturar e executar ${payload.name} com entregas claras, responsáveis e prazos controlados.`,
      scope: payload.description || "Escopo inicial sugerido a partir das informações preenchidas no assistente.",
      justification: `Projeto classificado como ${payload.area || payload.project_type || "geral"}, com estrutura inicial criada para planejamento, execução, controle e encerramento.`,
      assumptions: "Participantes convidados terão disponibilidade para colaborar e os documentos enviados serão validados no início do projeto.",
      constraints: payload.notes || "Nenhuma restrição específica foi informada; revise esta seção antes de aprovar a estrutura.",
      success_criteria: "EAP aprovada, entregas concluídas no prazo, riscos críticos tratados, documentos organizados e relatório final aprovado.",
    },
    wbs,
    risks,
    stakeholders,
    communication_plan,
    org_chart: [
      { title: "Responsável geral do projeto", person_name: invitedManager?.invited_name || invitedManager?.invited_email || "Gerente do projeto", responsibilities: "Decisões, prioridades, riscos, prazos e aprovação da estrutura." },
      { title: "Planejamento", person_name: "Papel sugerido", responsibilities: "Detalhar EAP, dependências, cronograma e critérios de conclusão." },
      { title: "Execução", person_name: "Equipe do projeto", responsibilities: "Executar tarefas, atualizar Kanban e registrar evidências." },
      { title: "Comunicação e aprovação", person_name: invitedClient?.invited_name || invitedProfessor?.invited_name || "Stakeholder principal", responsibilities: "Acompanhar progresso, validar entregas e registrar decisões." },
    ],
    milestones: wbs.map((phase: AnyRow) => ({ title: `Marco: concluir ${phase.title}`, due_date: phase.due_date })),
    documents: documentSummaries,
    participants: payload.participants,
    schedule_warning: scheduleWarning,
    checklist: ["Revisar visão geral", "Aprovar pesos da EAP", "Confirmar responsáveis", "Validar cronograma", "Revisar riscos", "Enviar convites", "Processar documentos", "Salvar relatório inicial"],
    initial_report: {
      title: "Relatório Inicial do Projeto",
      summary: `O projeto ${payload.name} foi estruturado em ${wbs.length} fases, ${wbs.flatMap((phase: AnyRow) => phase.packages).length} pacotes e ${wbs.flatMap((phase: AnyRow) => phase.packages).flatMap((pkg: AnyRow) => pkg.tasks).length} tarefas sugeridas.`,
      recommendations: ["Revise a EAP antes de confirmar", "Confirme se o prazo é realista", "Ajuste responsáveis sugeridos", "Habilite para IA apenas documentos permitidos"],
      next_steps: ["Aprovar prévia", "Criar projeto", "Enviar convites", "Acompanhar primeira semana pelo Kanban"],
    },
    source_notes: {
      user_provided: ["nome", "tipo", "área", "descrição", "objetivo", "datas", "complexidade", "participantes", "documentos"],
      document_extracted: documentSummaries.length ? "Os documentos foram considerados pelos nomes/metadados. O conteúdo será extraído após upload definitivo com project_id." : "Nenhum documento foi informado.",
      ai_suggestions: "EAP, tarefas, cronograma, riscos, stakeholders, organograma, comunicação, checklist e relatório inicial são sugestões editáveis antes da criação definitiva.",
    },
  };
}

function buildPackageTasks(packageTitle: string, phaseTitle: string, startDate: string, dueDate: string) {
  return [
    {
      title: `Planejar ${packageTitle}`,
      description: `Definir abordagem, entradas necessárias, responsáveis e critérios para ${packageTitle}.`,
      priority: "high",
      status: "todo",
      start_date: startDate,
      due_date: interpolateDate(startDate, dueDate, 0.35),
      dependencies: [],
      checklist: ["Confirmar escopo", "Identificar responsáveis", "Validar entradas", "Registrar plano"],
      completion_criteria: "Plano validado e registrado no projeto.",
      related_risk: "Escopo insuficientemente detalhado",
    },
    {
      title: `Executar ${packageTitle}`,
      description: `Produzir as entregas previstas para ${packageTitle}, mantendo evidências e atualizações no Kanban.`,
      priority: "medium",
      status: "todo",
      start_date: interpolateDate(startDate, dueDate, 0.35),
      due_date: interpolateDate(startDate, dueDate, 0.75),
      dependencies: [`Planejar ${packageTitle}`],
      checklist: ["Executar atividades", "Atualizar status", "Anexar evidências", "Sinalizar impedimentos"],
      completion_criteria: "Entrega produzida e pronta para validação.",
      related_risk: "Prazo incompatível com complexidade",
    },
    {
      title: `Validar ${packageTitle}`,
      description: `Revisar qualidade, critérios de conclusão e aderência de ${packageTitle} à fase ${phaseTitle}.`,
      priority: "medium",
      status: "todo",
      start_date: interpolateDate(startDate, dueDate, 0.75),
      due_date: dueDate,
      dependencies: [`Executar ${packageTitle}`],
      checklist: ["Revisar critérios", "Coletar feedback", "Corrigir pendências", "Aprovar entrega"],
      completion_criteria: "Entrega validada pelo responsável ou stakeholder definido.",
      related_risk: "Baixa participação dos envolvidos",
    },
  ];
}

function classifyLocalDocument(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("briefing")) return "Briefing";
  if (lower.includes("contrato")) return "Contrato";
  if (lower.includes("orient")) return "Orientação";
  if (lower.includes("pesquisa") || lower.includes("refer")) return "Pesquisa/Referência";
  if (lower.includes("ata")) return "Ata";
  if (lower.includes("escopo")) return "Escopo";
  if (lower.includes("cronograma")) return "Cronograma";
  if (lower.includes("financeiro") || lower.includes("orc") || lower.includes("orç")) return "Financeiro";
  return "Outros";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, dueDate: string) {
  return Math.ceil((new Date(`${dueDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000);
}

function interpolateDate(startDate: string, dueDate: string, ratio: number) {
  const startTime = new Date(`${startDate}T00:00:00`).getTime();
  const dueTime = new Date(`${dueDate}T00:00:00`).getTime();
  return new Date(startTime + (dueTime - startTime) * ratio).toISOString().slice(0, 10);
}

 codex/create-saas-platform-nexo-projetos-tsursl
async function updateProjectDetails(projectId: string, input: SmartProjectInput, structure: AnyRow, warnings: string[]) {
  const patch = {
    objective: structure.overview?.objective || input.objective || null,
    progress: 0,
    health_reason: "Projeto criado com estrutura inicial gerada por IA e aguardando execução.",
    budget_planned: 0,
    budget_actual: 0,
    scope: structure.overview?.scope || null,
    justification: structure.overview?.justification || null,
    assumptions: structure.overview?.assumptions || null,
    constraints_text: structure.overview?.constraints || null,
    success_criteria: structure.overview?.success_criteria || null,
    main_deliverables: (structure.wbs ?? []).map((phase: AnyRow) => phase.title).join("; "),
  };
  const { error } = await db.from("projects").update(patch).eq("id", projectId);
  if (error) warnings.push(`detalhes do projeto: ${error.message}`);
}

async function createWbsAndTasks(projectId: string, structure: AnyRow, userId: string, warnings: string[] = []) {
  for (const [phaseIndex, phase] of (structure.wbs ?? []).entries()) {
    const { data: phaseRow, error: phaseError } = await db.from("wbs_items").insert({ project_id: projectId, code: phase.code, title: phase.title, type: "phase", weight: phase.weight, start_date: phase.start_date, due_date: phase.due_date, order_index: phaseIndex }).select("id").single();
    if (phaseError) warnings.push(`EAP ${phase.title}: ${phaseError.message}`);
    for (const [pkgIndex, pkg] of (phase.packages ?? []).entries()) {
      const { data: pkgRow, error: pkgError } = phaseRow?.id
        ? await db.from("wbs_items").insert({ project_id: projectId, parent_id: phaseRow.id, code: pkg.code, title: pkg.title, type: "package", start_date: pkg.start_date, due_date: pkg.due_date, order_index: pkgIndex }).select("id").single()
        : { data: null, error: null };
      if (pkgError) warnings.push(`Pacote ${pkg.title}: ${pkgError.message}`);
      const richTaskRows = (pkg.tasks ?? []).map((task: AnyRow, taskIndex: number) => ({ project_id: projectId, wbs_item_id: pkgRow?.id ?? null, created_by: userId, title: task.title, description: `${task.description}

Checklist: ${(task.checklist ?? []).join("; ")}
Critério de conclusão: ${task.completion_criteria}`, priority: task.priority, status: "todo", start_date: task.start_date, due_date: task.due_date, position: taskIndex }));
      if (richTaskRows.length) await insertTaskRowsWithFallback(projectId, richTaskRows, warnings);
    }
  }
}

async function insertTaskRowsWithFallback(projectId: string, rows: AnyRow[], warnings: string[] = []) {
  const { error } = await db.from("tasks").insert(rows);
  if (!error) return;
  const fallbackRows = rows.map((row, index) => ({ project_id: projectId, created_by: row.created_by, title: row.title, description: row.description, priority: row.priority ?? "medium", status: "todo", due_date: row.due_date ?? null, position: row.position ?? index }));
  const { error: fallbackError } = await db.from("tasks").insert(fallbackRows);
  if (fallbackError) warnings.push(`tarefas: ${fallbackError.message}`);
}

async function insertRows(table: string, projectId: string, rows: AnyRow[], warnings: string[] = []) {
  if (!rows.length) return;
  const { error } = await db.from(table).insert(rows.map((row) => ({ ...row, project_id: projectId })));
  if (error) warnings.push(`${table}: ${error.message}`);
}

async function uploadDocuments(projectId: string, orgId: string, documents: DocDraft[], userId: string, warnings: string[] = []) {
  for (const doc of documents) {
    const documentId = doc.id;
    let fileUrl = doc.file_url ?? null;
    let status = "pending";
    if (doc.file) {
      const path = `${orgId}/${projectId}/documents/${documentId}/${doc.file.name}`;
      const { error } = await supabase.storage.from("project-documents").upload(path, doc.file, { upsert: true });
      status = error ? "error" : "pending";
      fileUrl = path;
      if (error) warnings.push(`upload ${doc.name}: ${error.message}`);
    }
    const { error: docError } = await db.from("project_documents").insert({ id: documentId, project_id: projectId, uploaded_by: userId, name: doc.name, file_type: doc.file_type, file_url: fileUrl, description: doc.description, processing_status: status, ai_enabled: doc.ai_enabled });
    if (docError) warnings.push(`documento ${doc.name}: ${docError.message}`);
  }
}


async function createWbsAndTasks(projectId: string, structure: AnyRow, userId: string) {
  for (const [phaseIndex, phase] of (structure.wbs ?? []).entries()) {
    const { data: phaseRow } = await db.from("wbs_items").insert({ project_id: projectId, code: phase.code, title: phase.title, type: "phase", weight: phase.weight, start_date: phase.start_date, due_date: phase.due_date, order_index: phaseIndex }).select("id").single();
    for (const [pkgIndex, pkg] of (phase.packages ?? []).entries()) {
      const { data: pkgRow } = await db.from("wbs_items").insert({ project_id: projectId, parent_id: phaseRow?.id, code: pkg.code, title: pkg.title, type: "package", start_date: pkg.start_date, due_date: pkg.due_date, order_index: pkgIndex }).select("id").single();
      const taskRows = (pkg.tasks ?? []).map((task: AnyRow, taskIndex: number) => ({ project_id: projectId, wbs_item_id: pkgRow?.id, created_by: userId, title: task.title, description: `${task.description}\n\nChecklist: ${(task.checklist ?? []).join("; ")}\nCritério de conclusão: ${task.completion_criteria}`, priority: task.priority, status: "todo", start_date: task.start_date, due_date: task.due_date, position: taskIndex }));
      if (taskRows.length) await db.from("tasks").insert(taskRows);
    }
  }
}
async function insertRows(table: string, projectId: string, rows: AnyRow[]) { if (rows.length) await db.from(table).insert(rows.map((row) => ({ ...row, project_id: projectId }))); }
async function uploadDocuments(projectId: string, orgId: string, documents: DocDraft[], userId: string) { for (const doc of documents) { const documentId = doc.id; let fileUrl = doc.file_url ?? null; let status = "pending"; if (doc.file) { const path = `${orgId}/${projectId}/documents/${documentId}/${doc.file.name}`; const { error } = await supabase.storage.from("project-documents").upload(path, doc.file, { upsert: true }); status = error ? "error" : "pending"; fileUrl = path; } await db.from("project_documents").insert({ id: documentId, project_id: projectId, uploaded_by: userId, name: doc.name, file_type: doc.file_type, file_url: fileUrl, description: doc.description, processing_status: status, ai_enabled: doc.ai_enabled }); } }
 main
function flattenTasks(structure: AnyRow | null) { return (structure?.wbs ?? []).flatMap((phase: AnyRow) => (phase.packages ?? []).flatMap((pkg: AnyRow) => (pkg.tasks ?? []).map((task: AnyRow) => ({ ...task, phase: phase.title, package: pkg.title })))); }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div><Label>{label}</Label>{children}</div>; }
function PreviewList({ title, items }: { title: string; items: string[] }) { return <Card className="p-4"><h4 className="font-semibold">{title}</h4>{items.length ? <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{items.map((item, index) => <li key={index} className="rounded bg-muted/50 p-2">{item}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Nenhum item.</p>}</Card>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-xl font-bold">{value}</p></div>; }
function HealthDot({ health }: { health: "green" | "yellow" | "red" }) { const cls = health === "green" ? "bg-success" : health === "yellow" ? "bg-warning" : "bg-destructive"; return <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />; }
