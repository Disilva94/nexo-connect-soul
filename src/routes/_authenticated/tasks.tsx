import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { projectsQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { brand } from "@/config/brand";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
 codex/create-saas-platform-nexo-projetos-8ui7wb
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
 main
import { toast } from "sonner";

const db = supabase as any;
type AnyRow = Record<string, any>;

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: `Tarefas — ${brand.fullName}` }] }),
  component: TasksPage,
});

function TasksPage() {
  const { user } = useAuth()
  codex/create-saas-platform-nexo-projetos-8ui7wb
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [projectId, setProjectId] = useState("");
  const [generating, setGenerating] = useState(false);

  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [projectId, setProjectId] = useState("");
  const [generating, setGenerating] = useState(false);

 main
  const projects = useQuery(projectsQuery);
  const tasks = useQuery({
    queryKey: ["all-project-tasks"],
    queryFn: async () => {
      const { data, error } = await db
        .from("tasks")
 codex/create-saas-platform-nexo-projetos-8ui7wb
        .select("id,title,description,status,priority,due_date,start_date,progress,project_id,assignee_id,blocked_reason")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];

        .select(
          "id,title,description,status,priority,due_date,start_date,progress,project_id,assignee_id,blocked_reason",
        )
        .order("due_date", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data ?? []) as AnyRow[];
 main
    },
  });

  const projectRows = (projects.data ?? []) as AnyRow[];
  const selectedProjectId = projectId || projectRows[0]?.id || "";
 codex/create-saas-platform-nexo-projetos-8ui7wb
  const projectById = useMemo(() => new Map(projectRows.map((project: AnyRow) => [project.id, project])), [projectRows]);
  const rows = (tasks.data ?? []).filter((task: AnyRow) => status === "all" || task.status === status);
  const lateCount = rows.filter((task: AnyRow) => task.due_date && new Date(`${task.due_date}T00:00:00`) < startOfToday() && task.status !== "done").length;

  async function generateProjectTasks() {
    const project = projectById.get(selectedProjectId) as AnyRow | undefined;
    if (!user || !project) return;
    setGenerating(true);
    const newTasks = buildExecutionTasks(project, user.id);
    const { error } = await db.from("tasks").insert(newTasks);
    if (error) {
      const fallback = newTasks.map(({ project_id, created_by, title, description, priority, status, due_date, position }) => ({ project_id, created_by, title, description, priority, status, due_date, position }));
      const { error: fallbackError } = await db.from("tasks").insert(fallback);

  const projectById = useMemo(
    () => new Map(projectRows.map((project) => [project.id, project])),
    [projectRows],
  );

  const rows = (tasks.data ?? []).filter(
    (task) => status === "all" || task.status === status,
  );
  const lateCount = rows.filter(
    (task) =>
      task.due_date &&
      new Date(`${task.due_date}T00:00:00`) < startOfToday() &&
      task.status !== "done",
  ).length;

  async function generateProjectTasks() {
    const project = projectById.get(selectedProjectId);
    if (!user || !project) return;

    setGenerating(true);
    const newTasks = buildExecutionTasks(project, user.id);
    const { error } = await db.from("tasks").insert(newTasks);

    if (error) {
      const fallbackRows = newTasks.map(
        ({ project_id, created_by, title, description, priority, status, due_date, position }) => ({
          project_id,
          created_by,
          title,
          description,
          priority,
          status,
          due_date,
          position,
        }),
      );

      const { error: fallbackError } = await db.from("tasks").insert(fallbackRows);
 main
      if (fallbackError) {
        toast.error(fallbackError.message);
        setGenerating(false);
        return;
      }
    }
 codex/create-saas-platform-nexo-projetos-8ui7wb
    toast.success("Tarefas de execução criadas para o projeto selecionado.");
    qc.invalidateQueries({ queryKey: ["all-project-tasks"] });


    await queryClient.invalidateQueries({ queryKey: ["all-project-tasks"] });
    toast.success("Tarefas de execução criadas para o projeto selecionado.");
 main
    setGenerating(false);
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Tarefas</h1>
 codex/create-saas-platform-nexo-projetos-8ui7wb
          <p className="mt-1 text-muted-foreground">Execução estilo Trello/monday: filtre, acompanhe atrasos e gere tarefas iniciais quando o projeto estiver vazio.</p>
        </div>
        <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="lg:w-52"><SelectValue placeholder="Filtrar status" /></SelectTrigger>

          <p className="mt-1 text-muted-foreground">
            Filtre por status, acompanhe atrasos e gere tarefas iniciais para um projeto.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="lg:w-52">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
 main
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="todo">A Fazer</SelectItem>
              <SelectItem value="in_progress">Fazendo</SelectItem>
              <SelectItem value="review">Em Revisão</SelectItem>
              <SelectItem value="blocked">Bloqueado</SelectItem>
              <SelectItem value="done">Concluído</SelectItem>
            </SelectContent>
          </Select>
 codex/create-saas-platform-nexo-projetos-8ui7wb
          <Select value={selectedProjectId} onValueChange={setProjectId}>
            <SelectTrigger className="lg:w-64"><SelectValue placeholder="Projeto para gerar tarefas" /></SelectTrigger>
            <SelectContent>{projectRows.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={generateProjectTasks} disabled={!selectedProjectId || generating}>{generating ? "Gerando..." : "Recriar tarefas"}</Button>


          <Select value={selectedProjectId} onValueChange={setProjectId}>
            <SelectTrigger className="lg:w-64">
              <SelectValue placeholder="Projeto para gerar tarefas" />
            </SelectTrigger>
            <SelectContent>
              {projectRows.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={generateProjectTasks} disabled={!selectedProjectId || generating}>
            {generating ? "Gerando..." : "Recriar tarefas"}
          </Button>
 main
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Metric label="Tarefas visíveis" value={rows.length} />
 codex/create-saas-platform-nexo-projetos-8ui7wb
        <Metric label="Atrasadas" value={lateCount} tone={lateCount ? "red" : "green"} />
        <Metric label="Concluídas" value={rows.filter((task: AnyRow) => task.status === "done").length} tone="green" />

        <Metric label="Atrasadas" value={lateCount} />
        <Metric
          label="Concluídas"
          value={rows.filter((task) => task.status === "done").length}
        />
 main
      </div>

      <KanbanSummary tasks={rows} />

      <div className="mt-8 grid gap-3">
 codex/create-saas-platform-nexo-projetos-8ui7wb
        {tasks.isLoading && <Card className="p-6 text-sm text-muted-foreground">Carregando tarefas...</Card>}
        {!tasks.isLoading && rows.length === 0 && <Card className="p-10 text-center text-muted-foreground">Nenhuma tarefa encontrada. Escolha um projeto e clique em “Recriar tarefas”.</Card>}
        {rows.map((task: AnyRow) => {
          const project = projectById.get(task.project_id) as AnyRow | undefined;
          const late = task.due_date && new Date(`${task.due_date}T00:00:00`) < startOfToday() && task.status !== "done";

        {tasks.isLoading ? (
          <Card className="p-6 text-sm text-muted-foreground">Carregando tarefas...</Card>
        ) : null}

        {!tasks.isLoading && rows.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            Nenhuma tarefa encontrada para este filtro.
          </Card>
        ) : null}

        {rows.map((task) => {
          const project = projectById.get(task.project_id);
          const late =
            task.due_date &&
            new Date(`${task.due_date}T00:00:00`) < startOfToday() &&
            task.status !== "done";

 main
          return (
            <Link key={task.id} to="/projects/$projectId" params={{ projectId: task.project_id }}>
              <Card className="p-4 transition hover:border-primary/50 hover:shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{task.title}</h3>
                      <StatusBadge status={task.status} />
                      <PriorityBadge priority={task.priority} />
 codex/create-saas-platform-nexo-projetos-8ui7wb
                      {late && <Badge variant="destructive">Atrasada</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{project?.name ?? "Projeto"} · Prazo: {formatDate(task.due_date) || "sem prazo"}</p>
                    {task.blocked_reason && <p className="mt-2 text-sm text-destructive">Bloqueio: {task.blocked_reason}</p>}
                  </div>
                  <div className="w-full lg:w-48"><Progress value={task.progress ?? 0} /></div>

                      {late ? <Badge variant="destructive">Atrasada</Badge> : null}
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {project?.name ?? "Projeto"} · Prazo: {formatDate(task.due_date) || "sem prazo"}
                    </p>

                    {task.blocked_reason ? (
                      <p className="mt-2 text-sm text-destructive">
                        Bloqueio: {task.blocked_reason}
                      </p>
                    ) : null}
                  </div>

                  <div className="w-full lg:w-48">
                    <Progress value={task.progress ?? 0} />
                  </div>
 main
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function KanbanSummary({ tasks }: { tasks: AnyRow[] }) {
 codex/create-saas-platform-nexo-projetos-8ui7wb
  const columns = [

  const columns: Array<[string, string]> = [
 main
    ["todo", "A Fazer"],
    ["in_progress", "Fazendo"],
    ["review", "Em Revisão"],
    ["blocked", "Bloqueado"],
    ["done", "Concluído"],
  ];
 codex/create-saas-platform-nexo-projetos-8ui7wb
  return <div className="mt-8 grid gap-3 md:grid-cols-5">{columns.map(([id, label]) => <Card key={id} className="p-4"><p className="text-sm font-medium">{label}</p><p className="mt-2 font-display text-2xl font-bold">{tasks.filter((task) => task.status === id).length}</p></Card>)}</div>;


  return (
    <div className="mt-8 grid gap-3 md:grid-cols-5">
      {columns.map(([id, label]) => (
        <Card key={id} className="p-4">
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold">
            {tasks.filter((task) => task.status === id).length}
          </p>
        </Card>
      ))}
    </div>
  );
 main
}

function buildExecutionTasks(project: AnyRow, userId: string) {
  const start = project.start_date || new Date().toISOString().slice(0, 10);
 codex/create-saas-platform-nexo-projetos-8ui7wb
  return ["Validar escopo", "Organizar EAP", "Planejar cronograma", "Configurar Kanban", "Levantar riscos", "Registrar documentos", "Executar entrega principal", "Revisar qualidade", "Gerar relatório de status", "Encerrar lições aprendidas"].map((title, index) => ({


  return [
    "Validar escopo",
    "Organizar EAP",
    "Planejar cronograma",
    "Configurar Kanban",
    "Levantar riscos",
    "Registrar documentos",
    "Executar entrega principal",
    "Revisar qualidade",
    "Gerar relatório de status",
    "Encerrar lições aprendidas",
  ].map((title, index) => ({
 main
    project_id: project.id,
    created_by: userId,
    title,
    description: `Tarefa inicial gerada para o projeto ${project.name}. Ajuste responsável, prazo e detalhes conforme necessário.`,
    priority: index < 2 ? "high" : "medium",
    status: "todo",
    start_date: addDays(start, Math.max(0, index - 1)),
    due_date: addDays(start, (index + 1) * 3),
    progress: 0,
    position: index,
  }));
}

 codex/create-saas-platform-nexo-projetos-8ui7wb
function Metric({ label, value, tone = "blue" }: { label: string; value: number; tone?: "blue" | "green" | "red" }) {
  const cls = tone === "red" ? "text-destructive" : tone === "green" ? "text-success" : "text-primary";
  return <Card className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 font-display text-3xl font-bold ${cls}`}>{value}</p></Card>;
}
function StatusBadge({ status }: { status: string }) { return <Badge variant={status === "done" ? "default" : status === "blocked" ? "destructive" : "secondary"}>{({ todo: "A Fazer", in_progress: "Fazendo", review: "Em Revisão", blocked: "Bloqueado", done: "Concluído" } as AnyRow)[status] ?? status}</Badge>; }
function PriorityBadge({ priority }: { priority: string }) { return <Badge variant={priority === "urgent" || priority === "high" ? "destructive" : "outline"}>{priority}</Badge>; }
function formatDate(date?: string | null) { return date ? new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR") : ""; }
function addDays(date: string, days: number) { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-primary">{value}</p>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    todo: "A Fazer",
    in_progress: "Fazendo",
    review: "Em Revisão",
    blocked: "Bloqueado",
    done: "Concluído",
  };

  return (
    <Badge
      variant={
        status === "done"
          ? "default"
          : status === "blocked"
            ? "destructive"
            : "secondary"
      }
    >
      {labels[status] ?? status}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant={priority === "urgent" || priority === "high" ? "destructive" : "outline"}>
      {priority}
    </Badge>
  );
}

function formatDate(date?: string | null) {
  return date ? new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR") : "";
}

function addDays(date: string, days: number) {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
 main
