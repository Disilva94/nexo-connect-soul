import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { projectQuery, tasksQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, FileText, Plus, Send, ShieldCheck, Sparkles, Users } from "lucide-react";
import { brand } from "@/config/brand";
import { toast } from "sonner";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";

const db = supabase as any;

type TaskStatus = "todo" | "in_progress" | "review" | "blocked" | "done";
type Priority = "low" | "medium" | "high" | "urgent";
type AnyRow = Record<string, any>;

const COLUMNS: { id: TaskStatus; label: string; hint: string }[] = [
  { id: "todo", label: "A Fazer", hint: "Backlog priorizado" },
  { id: "in_progress", label: "Fazendo", hint: "Em execução" },
  { id: "review", label: "Em Revisão", hint: "Validação" },
  { id: "blocked", label: "Bloqueado", hint: "Precisa de ação" },
  { id: "done", label: "Concluído", hint: "Entregue" },
];

const PROJECT_ROLE_OPTIONS = [
  { value: "manager", label: "Gerente do projeto" },
  { value: "contributor", label: "Membro da equipe" },
  { value: "client", label: "Cliente" },
  { value: "professor", label: "Professor" },
  { value: "observer", label: "Observador" },
] as const;

const statusLabels: Record<string, string> = {
  todo: "A Fazer",
  in_progress: "Fazendo",
  review: "Em Revisão",
  blocked: "Bloqueado",
  done: "Concluído",
};

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({ meta: [{ title: `Projeto — ${brand.fullName}` }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const project = useQuery(projectQuery(projectId));
  const tasks = useQuery(tasksQuery(projectId));
  const wbs = useProjectTable("wbs_items", projectId, "order_index");
  const risks = useProjectTable("risks", projectId, "created_at");
  const costs = useProjectTable("costs", projectId, "date");
  const docs = useProjectTable("project_documents", projectId, "created_at");
  const conversations = useProjectTable("ai_conversations", projectId, "updated_at");
  const invitations = useProjectTable("project_invitations", projectId, "created_at");
  const members = useProjectTable("project_members", projectId, "created_at");
  const reports = useProjectTable("project_reports", projectId, "created_at");
  const lessons = useProjectTable("lessons_learned", projectId, "created_at");
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const metrics = useMemo(() => buildProjectMetrics(project.data as AnyRow, tasks.data ?? [], risks.data, costs.data), [project.data, tasks.data, risks.data, costs.data]);

  async function handleDragEnd(e: DragEndEvent) {
    const taskId = e.active.id as string;
    const newStatus = e.over?.id as TaskStatus | undefined;
    if (!newStatus) return;
    const task = (tasks.data as AnyRow[] | undefined)?.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    const patch: AnyRow = { status: newStatus, progress: newStatus === "done" ? 100 : task.progress };
    if (newStatus === "done") patch.completed_at = new Date().toISOString();
    if (newStatus === "blocked") {
      const reason = window.prompt("Informe o motivo do bloqueio para manter rastreabilidade:");
      if (!reason?.trim()) return;
      patch.blocked_reason = reason.trim();
    }

    qc.setQueryData<AnyRow[]>(["tasks", projectId], (old) => old?.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) ?? []);
    const { error } = await db.from("tasks").update(patch).eq("id", taskId).eq("project_id", projectId);
    if (error) {
      toast.error("Falha ao mover tarefa");
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      return;
    }
    await db.rpc("recalculate_project_progress", { _project_id: projectId });
    qc.invalidateQueries({ queryKey: ["projects", projectId] });
  }

  if (project.isLoading) return <div className="p-8 text-muted-foreground">Carregando projeto...</div>;
  if (!project.data) return <div className="p-8">Projeto não encontrado.</div>;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card px-6 py-5 lg:px-8">
        <Link to="/projects" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3 w-3" /> Projetos
        </Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-bold">{(project.data as AnyRow).name}</h1>
              <HealthBadge health={(project.data as AnyRow).health} />
              <StatusBadge status={(project.data as AnyRow).status} />
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {(project.data as AnyRow).objective || (project.data as AnyRow).description || "Defina objetivo, EAP, tarefas, riscos e documentos deste projeto."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <NewWbsDialog projectId={projectId} items={wbs.data} />
            <NewTaskDialog projectId={projectId} wbsItems={wbs.data} />
          </div>
        </div>
      </header>

      <div className="px-4 py-6 lg:px-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="h-auto max-w-full flex-wrap justify-start bg-card p-1 shadow-sm">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="wbs">EAP</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="table">Tabela</TabsTrigger>
            <TabsTrigger value="timeline">Cronograma</TabsTrigger>
            <TabsTrigger value="risks">Riscos</TabsTrigger>
            <TabsTrigger value="costs">Custos</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
            <TabsTrigger value="ai">IA do Projeto</TabsTrigger>
            <TabsTrigger value="reports">Relatórios</TabsTrigger>
            <TabsTrigger value="closure">Encerramento</TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab projectId={projectId} project={project.data as AnyRow} metrics={metrics} tasks={tasks.data ?? []} risks={risks.data} invitations={invitations.data} members={members.data} /></TabsContent>
          <TabsContent value="wbs"><WbsTab projectId={projectId} items={wbs.data} tasks={tasks.data ?? []} /></TabsContent>
          <TabsContent value="kanban">
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-2">{COLUMNS.map((col) => <KanbanColumn key={col.id} col={col} tasks={(tasks.data ?? []).filter((t: AnyRow) => t.status === col.id)} />)}</div>
            </DndContext>
          </TabsContent>
          <TabsContent value="table"><TaskTable projectId={projectId} tasks={tasks.data ?? []} wbsItems={wbs.data} /></TabsContent>
          <TabsContent value="timeline"><TimelineTab project={project.data as AnyRow} tasks={tasks.data ?? []} wbsItems={wbs.data} /></TabsContent>
          <TabsContent value="risks"><RisksTab projectId={projectId} risks={risks.data} /></TabsContent>
          <TabsContent value="costs"><CostsTab projectId={projectId} costs={costs.data} project={project.data as AnyRow} /></TabsContent>
          <TabsContent value="documents"><DocumentsTab projectId={projectId} documents={docs.data} /></TabsContent>
          <TabsContent value="ai"><AiTab projectId={projectId} conversations={conversations.data} /></TabsContent>
          <TabsContent value="reports"><ReportsTab projectId={projectId} project={project.data as AnyRow} metrics={metrics} reports={reports.data} /></TabsContent>
          <TabsContent value="closure"><ClosureTab projectId={projectId} project={project.data as AnyRow} lessons={lessons.data} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function useProjectTable(table: string, projectId: string, orderColumn: string) {
  return useQuery({
    queryKey: [table, projectId],
    queryFn: async () => {
      const { data, error } = await db.from(table).select("*").eq("project_id", projectId).order(orderColumn, { ascending: table !== "ai_conversations" && table !== "project_documents" ? true : false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function buildProjectMetrics(project: AnyRow | null | undefined, tasks: AnyRow[], risks: AnyRow[], costs: AnyRow[]) {
  const openTasks = tasks.filter((t) => t.status !== "done");
  const lateTasks = openTasks.filter((t) => t.due_date && new Date(t.due_date) < startOfToday());
  const criticalRisks = risks.filter((r) => r.level === "critical" && r.status !== "closed");
  const budgetPlanned = Number(project?.budget_planned ?? 0);
  const actualFromCosts = costs.reduce((sum, c) => sum + Number(c.actual_value ?? 0), 0);
  const budgetActual = Math.max(Number(project?.budget_actual ?? 0), actualFromCosts);
  const budgetPct = budgetPlanned > 0 ? Math.round((budgetActual / budgetPlanned) * 100) : 0;
  const done = tasks.filter((t) => t.status === "done").length;
  const progress = Number(project?.progress ?? (tasks.length ? Math.round((done / tasks.length) * 100) : 0));
  const healthReason = criticalRisks.some((r) => !r.preventive_action)
    ? `Projeto crítico porque possui ${criticalRisks.length} risco(s) crítico(s), incluindo risco sem ação preventiva.`
    : lateTasks.length > 0 || budgetPct >= 80
      ? `Projeto em atenção porque possui ${lateTasks.length} tarefa(s) atrasada(s) e ${budgetPct}% do orçamento consumido.`
      : "Projeto saudável: sem atrasos relevantes, riscos críticos abertos ou estouro de orçamento cadastrados.";
  return { openTasks, lateTasks, criticalRisks, budgetPlanned, budgetActual, budgetPct, progress, healthReason };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function OverviewTab({ projectId, project, metrics, tasks, risks, invitations, members }: { projectId: string; project: AnyRow; metrics: AnyRow; tasks: AnyRow[]; risks: AnyRow[]; invitations: AnyRow[]; members: AnyRow[] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Progresso geral" value={`${metrics.progress}%`} tone="blue" />
        <MetricCard label="Tarefas atrasadas" value={metrics.lateTasks.length} tone={metrics.lateTasks.length ? "red" : "green"} />
        <MetricCard label="Riscos críticos" value={metrics.criticalRisks.length} tone={metrics.criticalRisks.length ? "red" : "green"} />
        <MetricCard label="Orçamento consumido" value={`${metrics.budgetPct}%`} tone={metrics.budgetPct >= 80 ? "yellow" : "blue"} />
      </div>
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="font-display text-xl font-semibold">Resumo executivo</h2>
            <p className="mt-2 text-sm text-muted-foreground">{metrics.healthReason}</p>
            <div className="mt-4"><Progress value={metrics.progress} /></div>
          </div>
          <div className="rounded-xl border bg-muted/40 p-4 text-sm">
            <p><strong>Início:</strong> {formatDate(project.start_date) || "Não definido"}</p>
            <p><strong>Prazo final:</strong> {formatDate(project.end_date) || "Não definido"}</p>
            <p><strong>Prioridade:</strong> {project.priority ?? "medium"}</p>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6"><h3 className="font-semibold">Próximas tarefas</h3><List items={tasks.filter((t) => t.status !== "done").slice(0, 6).map((t) => `${t.title} — ${formatDate(t.due_date) || "sem prazo"}`)} empty="Nenhuma tarefa aberta." /></Card>
        <Card className="p-6"><h3 className="font-semibold">Principais riscos</h3><List items={risks.slice(0, 6).map((r) => `${r.title} — ${r.level}`)} empty="Nenhum risco cadastrado." /></Card>
      </div>
      <TeamCard projectId={projectId} members={members} invitations={invitations} />
    </div>
  );
}

function TeamCard({ projectId, members, invitations }: { projectId: string; members: AnyRow[]; invitations: AnyRow[] }) {
  const pending = invitations.filter((invite) => invite.status === "pending");
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h3 className="font-display text-lg font-semibold">Equipe do projeto</h3></div>
          <p className="mt-1 text-sm text-muted-foreground">Participantes e convites são específicos deste projeto; não liberam acesso ao workspace inteiro.</p>
        </div>
        <NewInviteDialog projectId={projectId} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <p className="text-sm font-medium">Participantes ativos</p>
          <List items={members.map((member) => `${member.user_id?.slice(0, 8) ?? "Usuário"} — ${roleLabel(member.role)} (${member.status ?? "active"})`)} empty="Nenhum participante adicional." />
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm font-medium">Convites pendentes</p>
          <List items={pending.map((invite) => `${invite.invited_email} — ${roleLabel(invite.role)}`)} empty="Nenhum convite pendente." />
        </div>
      </div>
    </Card>
  );
}

function WbsTab({ projectId, items, tasks }: { projectId: string; items: AnyRow[]; tasks: AnyRow[] }) {
  const roots = items.filter((i) => !i.parent_id);
  return (
    <Card className="p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="font-display text-xl font-semibold">EAP — Estrutura Analítica do Projeto</h2><p className="text-sm text-muted-foreground">Projeto → fases → pacotes → tarefas, com pesos e progresso por fase.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm">Diagrama</Button><Button variant="secondary" size="sm">Tabela</Button><Button variant="secondary" size="sm">Pastas</Button><NewWbsDialog projectId={projectId} items={items} /></div>
      </div>
      {items.length === 0 ? <EmptyState title="Nenhuma EAP criada" text="Adicione fases e pacotes para transformar entregas em tarefas." /> : <div className="space-y-2">{roots.map((item) => <WbsNode key={item.id} item={item} all={items} tasks={tasks} level={0} />)}</div>}
    </Card>
  );
}

function WbsNode({ item, all, tasks, level }: { item: AnyRow; all: AnyRow[]; tasks: AnyRow[]; level: number }) {
  const children = all.filter((i) => i.parent_id === item.id);
  const linkedTasks = tasks.filter((t) => t.wbs_item_id === item.id);
  const done = linkedTasks.filter((t) => t.status === "done").length;
  const calculated = linkedTasks.length ? Math.round((done / linkedTasks.length) * 100) : Number(item.progress ?? 0);
  return (
    <div className="rounded-lg border bg-card p-3" style={{ marginLeft: level * 20 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><span>{item.type === "phase" ? "📁" : item.type === "task" ? "✓" : "📦"}</span><strong>{item.code}</strong><span>{item.title}</span><StatusBadge status={item.status} /></div>
        <div className="flex min-w-56 items-center gap-3 text-xs text-muted-foreground"><span>Peso {Number(item.weight ?? 0)}%</span><Progress value={calculated} className="h-2" /><span>{calculated}%</span></div>
      </div>
      {children.length > 0 && <div className="mt-2 space-y-2">{children.map((child) => <WbsNode key={child.id} item={child} all={all} tasks={tasks} level={level + 1} />)}</div>}
    </div>
  );
}

function KanbanColumn({ col, tasks }: { col: (typeof COLUMNS)[number]; tasks: AnyRow[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div ref={setNodeRef} className={`flex min-h-[620px] w-72 shrink-0 flex-col rounded-2xl border bg-card p-3 shadow-sm ${isOver ? "border-primary bg-primary/5" : ""}`}>
      <div className="mb-3 flex items-start justify-between px-1"><div><h3 className="font-semibold">{col.label}</h3><p className="text-xs text-muted-foreground">{col.hint}</p></div><Badge variant="secondary">{tasks.length}</Badge></div>
      <div className="flex-1 space-y-2">{tasks.map((t) => <TaskCard key={t.id} task={t} />)}</div>
    </div>
  );
}

function TaskCard({ task }: { task: AnyRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const late = task.due_date && new Date(task.due_date) < startOfToday() && task.status !== "done";
  return (
    <Card ref={setNodeRef} {...listeners} {...attributes} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined} className={`cursor-grab p-3 active:cursor-grabbing ${isDragging ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold leading-snug">{task.title}</p><PriorityBadge priority={task.priority} /></div>
      {task.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
      <div className="mt-3 flex items-center justify-between text-xs"><span className={late ? "font-medium text-destructive" : "text-muted-foreground"}>{formatDate(task.due_date) || "Sem prazo"}</span><span>{task.progress ?? 0}%</span></div>
      {task.blocked_reason && <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">Bloqueio: {task.blocked_reason}</p>}
    </Card>
  );
}

function TaskTable({ projectId, tasks, wbsItems }: { projectId: string; tasks: AnyRow[]; wbsItems: AnyRow[] }) {
  const qc = useQueryClient();
  async function quickUpdate(id: string, patch: AnyRow) {
    const { error } = await db.from("tasks").update(patch).eq("id", id).eq("project_id", projectId);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  }
  return (
    <Card className="overflow-hidden"><Table><TableHeader><TableRow><TableHead>Tarefa</TableHead><TableHead>Status</TableHead><TableHead>Prioridade</TableHead><TableHead>Início</TableHead><TableHead>Término</TableHead><TableHead>EAP</TableHead><TableHead>Progresso</TableHead><TableHead>Custo estimado</TableHead></TableRow></TableHeader><TableBody>{tasks.map((t) => <TableRow key={t.id}><TableCell className="font-medium">{t.title}</TableCell><TableCell><Select defaultValue={t.status} onValueChange={(v) => quickUpdate(t.id, { status: v, blocked_reason: v === "blocked" ? "Bloqueio registrado via tabela" : t.blocked_reason })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{COLUMNS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><PriorityBadge priority={t.priority} /></TableCell><TableCell>{formatDate(t.start_date)}</TableCell><TableCell>{formatDate(t.due_date)}</TableCell><TableCell>{wbsItems.find((w) => w.id === t.wbs_item_id)?.title ?? "—"}</TableCell><TableCell>{t.progress ?? 0}%</TableCell><TableCell>R$ {Number(t.estimated_cost ?? 0).toLocaleString("pt-BR")}</TableCell></TableRow>)}</TableBody></Table></Card>
  );
}

function TimelineTab({ project, tasks, wbsItems }: { project: AnyRow; tasks: AnyRow[]; wbsItems: AnyRow[] }) {
 codex/create-saas-platform-nexo-projetos-tsursl
  const rows = [...wbsItems.map((w) => ({ ...w, kind: "EAP" })), ...tasks.map((t) => ({ ...t, kind: "Tarefa" }))].filter((i) => i.start_date || i.due_date || i.end_date);

  const rows: AnyRow[] = [...wbsItems.map((w) => ({ ...w, kind: "EAP" })), ...tasks.map((t) => ({ ...t, kind: "Tarefa" }))].filter((i: AnyRow) => i.start_date || i.due_date || i.end_date);
 main
  return <Card className="p-6"><h2 className="font-display text-xl font-semibold">Cronograma simples</h2><p className="text-sm text-muted-foreground">Linha do tempo sem Gantt complexo para responder o que vem agora e o que está atrasado.</p><div className="mt-5 space-y-3"><div className="rounded-xl border bg-primary/5 p-4"><strong>Janela do projeto:</strong> {formatDate(project.start_date) || "início aberto"} → {formatDate(project.end_date) || "fim aberto"}</div>{rows.length === 0 ? <EmptyState title="Sem datas" text="Adicione início e término em tarefas ou EAP." /> : rows.map((r) => <div key={`${r.kind}-${r.id}`} className="rounded-xl border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{r.kind}: {r.title}</strong><StatusBadge status={r.status} /></div><p className="text-sm text-muted-foreground">{formatDate(r.start_date) || "sem início"} → {formatDate(r.due_date || r.end_date) || "sem término"}</p></div>)}</div></Card>;
}

function RisksTab({ projectId, risks }: { projectId: string; risks: AnyRow[] }) {
  return <Card className="p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-xl font-semibold">Riscos</h2><p className="text-sm text-muted-foreground">Riscos críticos aparecem no dashboard e afetam a saúde do projeto.</p></div><NewRiskDialog projectId={projectId} /></div><div className="grid gap-3 lg:grid-cols-2">{risks.length ? risks.map((r) => <Card key={r.id} className="p-4"><div className="flex justify-between gap-3"><strong>{r.title}</strong><RiskBadge level={r.level} /></div><p className="mt-2 text-sm text-muted-foreground">{r.description || "Sem descrição"}</p><p className="mt-3 text-xs"><strong>Ação preventiva:</strong> {r.preventive_action || "não definida"}</p></Card>) : <EmptyState title="Nenhum risco" text="Cadastre riscos para antecipar problemas." />}</div></Card>;
}

function CostsTab({ projectId, costs, project }: { projectId: string; costs: AnyRow[]; project: AnyRow }) {
  const actual = costs.reduce((sum, c) => sum + Number(c.actual_value ?? 0), Number(project.budget_actual ?? 0));
  const planned = Number(project.budget_planned ?? 0);
  const pct = planned ? Math.round((actual / planned) * 100) : 0;
  return <Card className="p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">Custos</h2><p className="text-sm text-muted-foreground">Planejado: R$ {planned.toLocaleString("pt-BR")} · Real: R$ {actual.toLocaleString("pt-BR")} · Saldo: R$ {(planned - actual).toLocaleString("pt-BR")}</p></div><NewCostDialog projectId={projectId} /></div><Progress value={Math.min(pct, 100)} />{pct >= 80 && <p className="mt-2 text-sm text-warning-foreground">Alerta: orçamento consumido em {pct}%.</p>}<div className="mt-5 space-y-2">{costs.map((c) => <div key={c.id} className="flex justify-between rounded-lg border p-3"><span>{c.description}</span><span>R$ {Number(c.actual_value ?? 0).toLocaleString("pt-BR")}</span></div>)}</div></Card>;
}

function DocumentsTab({ projectId, documents }: { projectId: string; documents: AnyRow[] }) {
  return <Card className="p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-xl font-semibold">Documentos do projeto</h2><p className="text-sm text-muted-foreground">Todo documento é salvo com project_id e só pode ser usado pela IA deste projeto.</p></div><NewDocumentDialog projectId={projectId} /></div><div className="grid gap-3 lg:grid-cols-2">{documents.length ? documents.map((d) => <Card key={d.id} className="p-4"><div className="flex items-start gap-3"><FileText className="mt-1 h-5 w-5 text-primary" /><div><strong>{d.name}</strong><p className="text-sm text-muted-foreground">{d.file_type} · {d.processing_status} · IA {d.ai_enabled ? "habilitada" : "desabilitada"}</p>{d.file_url && <a className="text-sm text-primary hover:underline" href={d.file_url} target="_blank" rel="noreferrer">Abrir arquivo/link</a>}</div></div></Card>) : <EmptyState title="Nenhum documento" text="Cadastre PDFs, DOCX, imagens, planilhas ou links por projeto." />}</div></Card>;
}

function AiTab({ projectId, conversations }: { projectId: string; conversations: AnyRow[] }) {
  const [message, setMessage] = useState("Qual é a situação atual deste projeto?");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  async function ask() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("project-ai", { body: { project_id: projectId, conversation_id: conversations[0]?.id, message } });
    setLoading(false);
    if (error) toast.error(error.message); else setAnswer(data.answer);
  }
  return <div className="grid gap-4 lg:grid-cols-[1fr_320px]"><Card className="p-6"><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Assistente do Projeto</h2></div><div className="mt-3 rounded-xl border bg-primary/5 p-4 text-sm text-muted-foreground"><ShieldCheck className="mb-2 h-4 w-4 text-primary" />A IA recebe obrigatoriamente o project_id atual, consulta apenas dados/documentos deste projeto e é read-only por padrão.</div><Textarea className="mt-4" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} /><Button className="mt-3" onClick={ask} disabled={loading || !message.trim()}><Send className="mr-2 h-4 w-4" />{loading ? "Analisando..." : "Perguntar"}</Button>{answer && <div className="mt-5 whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm">{answer}</div>}</Card><Card className="p-6"><h3 className="font-semibold">Histórico isolado</h3><List items={conversations.map((c) => c.title)} empty="Nenhuma conversa neste projeto." /></Card></div>;
}

function ReportsTab({ projectId, project, metrics, reports }: { projectId: string; project: AnyRow; metrics: AnyRow; reports: AnyRow[] }) {
  return <Card className="p-6"><div className="flex items-center justify-between"><h2 className="font-display text-xl font-semibold">Relatório de status</h2><CreateReportButton projectId={projectId} project={project} metrics={metrics} /></div><div className="mt-5 rounded-xl border bg-muted/30 p-5"><p><strong>Projeto:</strong> {project.name}</p><p><strong>Objetivo:</strong> {project.objective || project.description || "Não definido"}</p><p><strong>Progresso:</strong> {metrics.progress}%</p><p><strong>Saúde:</strong> {project.health} — {metrics.healthReason}</p><p><strong>Tarefas atrasadas:</strong> {metrics.lateTasks.length}</p><p><strong>Riscos principais:</strong> {metrics.criticalRisks.map((r: AnyRow) => r.title).join(", ") || "Nenhum crítico"}</p><p><strong>Custos:</strong> R$ {metrics.budgetActual.toLocaleString("pt-BR")} / R$ {metrics.budgetPlanned.toLocaleString("pt-BR")}</p></div><h3 className="mt-6 font-semibold">Relatórios salvos</h3><List items={reports.map((r) => `${r.title} — ${r.type}`)} empty="Nenhum relatório salvo." /></Card>;
}

function ClosureTab({ projectId, project, lessons }: { projectId: string; project: AnyRow; lessons: AnyRow[] }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const qc = useQueryClient();
  async function addLesson() { const { error } = await db.from("lessons_learned").insert({ project_id: projectId, title, description }); if (error) toast.error(error.message); else { setTitle(""); setDescription(""); qc.invalidateQueries({ queryKey: ["lessons_learned", projectId] }); } }
  return <Card className="p-6"><h2 className="font-display text-xl font-semibold">Encerramento simples</h2><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="space-y-3 rounded-xl border p-4"><p><strong>Objetivo inicial:</strong> {project.objective || "Não definido"}</p><p><strong>Entregas finais:</strong> {project.final_deliverables || "Não definido"}</p><p><strong>Aprovação:</strong> {project.approval_notes || "Pendente"}</p><p><strong>Checklist:</strong> validar entregas, registrar custos finais, documentar riscos enfrentados e aprovar encerramento.</p></div><div className="space-y-3 rounded-xl border p-4"><Input placeholder="Título da lição aprendida" value={title} onChange={(e) => setTitle(e.target.value)} /><Textarea placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} /><Button onClick={addLesson} disabled={!title.trim()}>Adicionar lição</Button></div></div><h3 className="mt-6 font-semibold">Lições aprendidas</h3><List items={lessons.map((l) => `${l.title}: ${l.description || "sem descrição"}`)} empty="Nenhuma lição aprendida registrada." /></Card>;
}

function NewTaskDialog({ projectId, wbsItems }: { projectId: string; wbsItems: AnyRow[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium" as Priority, due_date: "", wbs_item_id: "none" });
  async function create(e: FormEvent) { e.preventDefault(); if (!user) return; const { error } = await db.from("tasks").insert({ project_id: projectId, created_by: user.id, title: form.title, description: form.description || null, priority: form.priority, due_date: form.due_date || null, wbs_item_id: form.wbs_item_id === "none" ? null : form.wbs_item_id }); if (error) toast.error(error.message); else { toast.success("Tarefa criada"); qc.invalidateQueries({ queryKey: ["tasks", projectId] }); setOpen(false); setForm({ title: "", description: "", priority: "medium", due_date: "", wbs_item_id: "none" }); } }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova tarefa</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={create}><Input required placeholder="Nome da tarefa" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><Textarea placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><Select value={form.wbs_item_id} onValueChange={(v) => setForm({ ...form, wbs_item_id: v })}><SelectTrigger><SelectValue placeholder="Entrega vinculada" /></SelectTrigger><SelectContent><SelectItem value="none">Sem vínculo com EAP</SelectItem>{wbsItems.map((w) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.title}</SelectItem>)}</SelectContent></Select><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /><DialogFooter><Button type="submit">Criar</Button></DialogFooter></form></DialogContent></Dialog>;
}

function NewWbsDialog({ projectId, items }: { projectId: string; items: AnyRow[] }) {
  const qc = useQueryClient(); const [open, setOpen] = useState(false); const [form, setForm] = useState({ code: "", title: "", type: "phase", parent_id: "root", weight: "0" });
  async function create(e: FormEvent) { e.preventDefault(); const { error } = await db.from("wbs_items").insert({ project_id: projectId, code: form.code, title: form.title, type: form.type, parent_id: form.parent_id === "root" ? null : form.parent_id, weight: Number(form.weight || 0) }); if (error) toast.error(error.message); else { qc.invalidateQueries({ queryKey: ["wbs_items", projectId] }); setOpen(false); setForm({ code: "", title: "", type: "phase", parent_id: "root", weight: "0" }); } }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="secondary"><Plus className="mr-2 h-4 w-4" />Adicionar pacote</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Adicionar item da EAP</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={create}><Input required placeholder="Código (ex.: 1.0)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /><Input required placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="phase">Fase</SelectItem><SelectItem value="package">Entrega/Pacote</SelectItem><SelectItem value="task">Tarefa</SelectItem></SelectContent></Select><Select value={form.parent_id} onValueChange={(v) => setForm({ ...form, parent_id: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="root">Raiz do projeto</SelectItem>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.code} — {i.title}</SelectItem>)}</SelectContent></Select><Input type="number" min="0" max="100" placeholder="Peso %" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /><DialogFooter><Button type="submit">Salvar</Button></DialogFooter></form></DialogContent></Dialog>;
}

function NewInviteDialog({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ invited_email: "", invited_name: "", role: "contributor", message: "" });
  const [loading, setLoading] = useState(false);
  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("send-project-invite", { body: { project_id: projectId, ...form } });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success(data?.email_status === "sent" ? "Convite enviado por e-mail" : "Convite criado. Configure e-mail para envio automático.");
    qc.invalidateQueries({ queryKey: ["project_invitations", projectId] });
    setOpen(false);
    setForm({ invited_email: "", invited_name: "", role: "contributor", message: "" });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><Plus className="mr-2 h-4 w-4" />Convidar pessoas</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar participantes</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Convide pessoas para participar somente deste projeto. Elas não terão acesso aos outros projetos do seu workspace.</p>
        <form className="space-y-4" onSubmit={sendInvite}>
          <div><Label>E-mail do participante</Label><Input type="email" required value={form.invited_email} onChange={(e) => setForm({ ...form, invited_email: e.target.value })} /></div>
          <div><Label>Nome opcional</Label><Input value={form.invited_name} onChange={(e) => setForm({ ...form, invited_name: e.target.value })} /></div>
          <div><Label>Papel no projeto</Label><Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROJECT_ROLE_OPTIONS.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Mensagem opcional</Label><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
          <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Enviando..." : "Enviar convite"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewRiskDialog({ projectId }: { projectId: string }) { return <QuickInsertDialog title="Novo risco" button="Novo risco" fields={["title", "description", "preventive_action", "response_plan"]} table="risks" projectId={projectId} defaults={{ probability: "medium", impact: "high", level: "critical", status: "open" }} />; }
function NewCostDialog({ projectId }: { projectId: string }) { return <QuickInsertDialog title="Novo custo" button="Novo custo" fields={["description", "planned_value", "actual_value"]} table="costs" projectId={projectId} defaults={{ category: "other" }} />; }
function NewDocumentDialog({ projectId }: { projectId: string }) { const { user } = useAuth(); return <QuickInsertDialog title="Novo documento/link" button="Adicionar documento" fields={["name", "file_type", "file_url", "description"]} table="project_documents" projectId={projectId} defaults={{ uploaded_by: user?.id, processing_status: "pending", ai_enabled: true }} />; }

function QuickInsertDialog({ title, button, fields, table, projectId, defaults }: { title: string; button: string; fields: string[]; table: string; projectId: string; defaults: AnyRow }) {
  const [open, setOpen] = useState(false); const [form, setForm] = useState<AnyRow>({}); const qc = useQueryClient();
 codex/create-saas-platform-nexo-projetos-tsursl
  async function create(e: FormEvent) { e.preventDefault(); const payload = { ...defaults, ...form, project_id: projectId }; for (const k of ["planned_value", "actual_value"]) if (payload[k]) payload[k] = Number(payload[k]); const { error } = await db.from(table).insert(payload); if (error) toast.error(error.message); else { qc.invalidateQueries({ queryKey: [table, projectId] }); setOpen(false); setForm({}); } }

  async function create(e: FormEvent) { e.preventDefault(); const payload: AnyRow = { ...defaults, ...form, project_id: projectId }; for (const k of ["planned_value", "actual_value"]) if (payload[k]) payload[k] = Number(payload[k]); const { error } = await db.from(table).insert(payload); if (error) toast.error(error.message); else { qc.invalidateQueries({ queryKey: [table, projectId] }); setOpen(false); setForm({}); } }
 main
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="secondary"><Plus className="mr-2 h-4 w-4" />{button}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={create}>{fields.map((f) => <div key={f}><Label>{labelFor(f)}</Label>{f.includes("description") || f.includes("action") || f.includes("plan") ? <Textarea value={form[f] ?? ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} /> : <Input required={f === "title" || f === "name" || f === "description"} value={form[f] ?? ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />}</div>)}<DialogFooter><Button type="submit">Salvar</Button></DialogFooter></form></DialogContent></Dialog>;
}

function CreateReportButton({ projectId, project, metrics }: { projectId: string; project: AnyRow; metrics: AnyRow }) { const qc = useQueryClient(); const { user } = useAuth(); return <Button variant="secondary" onClick={async () => { const { error } = await db.from("project_reports").insert({ project_id: projectId, type: "status", title: `Status — ${project.name}`, created_by: user?.id, content: { progress: metrics.progress, health_reason: metrics.healthReason } }); if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["project_reports", projectId] }); }}>Salvar relatório</Button>; }

function MetricCard({ label, value, tone }: { label: string; value: any; tone: "blue" | "green" | "yellow" | "red" }) { const cls = { blue: "bg-primary/10 text-primary", green: "bg-success/10 text-success", yellow: "bg-warning/20 text-warning-foreground", red: "bg-destructive/10 text-destructive" }[tone]; return <Card className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-3 inline-flex rounded-xl px-3 py-1 font-display text-2xl font-bold ${cls}`}>{value}</p></Card>; }
function HealthBadge({ health }: { health: string }) { const map: AnyRow = { green: ["Saudável", "bg-success/15 text-success border-success/30"], yellow: ["Atenção", "bg-warning/15 text-warning-foreground border-warning/40"], red: ["Crítico", "bg-destructive/15 text-destructive border-destructive/40"] }; const v = map[health] ?? map.green; return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${v[1]}`}>{v[0]}</span>; }
function StatusBadge({ status }: { status: string }) { const cls = status === "done" || status === "closed" ? "bg-success/10 text-success" : status === "blocked" ? "bg-destructive/10 text-destructive" : status === "in_progress" || status === "review" || status === "active" ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground"; return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{statusLabels[status] ?? status}</span>; }
function PriorityBadge({ priority }: { priority: string }) { const cls = priority === "urgent" || priority === "high" ? "bg-destructive/10 text-destructive" : priority === "medium" ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground"; return <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{priority}</span>; }
function RiskBadge({ level }: { level: string }) { const cls = level === "critical" ? "bg-destructive/10 text-destructive" : level === "medium" ? "bg-warning/20 text-warning-foreground" : "bg-success/10 text-success"; return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{level}</span>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="rounded-xl border border-dashed p-8 text-center"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>; }
function List({ items, empty }: { items: string[]; empty: string }) { return items.length ? <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{items.map((i, idx) => <li key={idx} className="rounded-lg bg-muted/50 p-2">{i}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{empty}</p>; }
function formatDate(date?: string | null) { return date ? new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR") : ""; }
function roleLabel(role: string) { return PROJECT_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role; }
function labelFor(field: string) { return ({ title: "Título", description: "Descrição", preventive_action: "Ação preventiva", response_plan: "Plano de resposta", planned_value: "Valor planejado", actual_value: "Valor real", name: "Nome", file_type: "Tipo", file_url: "URL do arquivo/link" } as AnyRow)[field] ?? field; }
