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
    const { data, error } = await supabase.functions.invoke("smart-project-structure", {
      body: {
        organization_id: defaultOrgId,
        ...input,
        participants: invites,
        documents: documents.map(({ name, file_type, ai_enabled }) => ({ name, file_type, ai_enabled })),
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStructure(data.structure);
    setStep(5);
  }

  async function createProjectWithStructure() {
    if (!defaultOrgId || !user || !structure) return;
    setLoading(true);
    const { data: project, error } = await db.from("projects").insert({
      org_id: defaultOrgId,
      owner_id: user.id,
      name: input.name.trim(),
      description: input.description || null,
      objective: structure.overview?.objective || input.objective || null,
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      status: "active",
      health: "green",
      progress: 0,
      health_reason: "Projeto criado com estrutura inicial gerada por IA e aguardando execução.",
      scope: structure.overview?.scope || null,
      justification: structure.overview?.justification || null,
      assumptions: structure.overview?.assumptions || null,
      constraints_text: structure.overview?.constraints || null,
      success_criteria: structure.overview?.success_criteria || null,
      main_deliverables: (structure.wbs ?? []).map((phase: AnyRow) => phase.title).join("; "),
    }).select("id").single();
    if (error) { setLoading(false); toast.error(error.message); return; }

    const projectId = project.id;
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
  return <div className="space-y-4"><Card className="p-5"><h3 className="font-display text-xl font-semibold">Prévia da estrutura do projeto</h3><p className="mt-2 text-sm text-muted-foreground">Revise a prévia. Registros definitivos só serão criados ao confirmar.</p><Textarea className="mt-3" rows={3} value={structure.overview?.objective ?? ""} onChange={(e) => setStructure({ ...structure, overview: { ...structure.overview, objective: e.target.value } })} /></Card><div className="grid gap-4 lg:grid-cols-2"><PreviewList title="EAP sugerida" items={(structure.wbs ?? []).map((phase: AnyRow) => `${phase.code} ${phase.title} — ${phase.weight}%`)} /><PreviewList title="Tarefas sugeridas" items={tasks.slice(0, 12).map((task) => `${task.title} — ${task.due_date}`)} /><PreviewList title="Riscos sugeridos" items={(structure.risks ?? []).map((risk: AnyRow) => `${risk.title} — ${risk.level}`)} /><PreviewList title="Stakeholders sugeridos" items={(structure.stakeholders ?? []).map((s: AnyRow) => `${s.name} — ${s.role}`)} /><PreviewList title="Organograma sugerido" items={(structure.org_chart ?? []).map((node: AnyRow) => `${node.title}: ${node.person_name}`)} /><PreviewList title="Plano de comunicação" items={(structure.communication_plan ?? []).map((item: AnyRow) => `${item.audience} — ${item.frequency}`)} /><PreviewList title="Documentos analisados" items={documents.map((doc) => doc.name)} /><PreviewList title="Participantes convidados" items={invites.map((invite) => `${invite.invited_email} — ${invite.role}`)} /></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => toast.info("A prévia foi simplificada visualmente. Ajuste campos antes de criar.")}>Pedir para simplificar</Button><Button variant="secondary" onClick={() => toast.info("Para detalhar mais, volte e gere novamente informando mais contexto.")}>Pedir para detalhar mais</Button></div>{structure.schedule_warning && <p className="rounded-lg bg-warning/20 p-3 text-sm text-warning-foreground">{structure.schedule_warning}</p>}</div>;
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
function flattenTasks(structure: AnyRow | null) { return (structure?.wbs ?? []).flatMap((phase: AnyRow) => (phase.packages ?? []).flatMap((pkg: AnyRow) => (pkg.tasks ?? []).map((task: AnyRow) => ({ ...task, phase: phase.title, package: pkg.title })))); }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div><Label>{label}</Label>{children}</div>; }
function PreviewList({ title, items }: { title: string; items: string[] }) { return <Card className="p-4"><h4 className="font-semibold">{title}</h4>{items.length ? <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{items.map((item, index) => <li key={index} className="rounded bg-muted/50 p-2">{item}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Nenhum item.</p>}</Card>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-xl font-bold">{value}</p></div>; }
function HealthDot({ health }: { health: "green" | "yellow" | "red" }) { const cls = health === "green" ? "bg-success" : health === "yellow" ? "bg-warning" : "bg-destructive"; return <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />; }
