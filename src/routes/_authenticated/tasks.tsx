import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { projectsQuery } from "@/lib/queries";
import { brand } from "@/config/brand";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";

const db = supabase as any;
type AnyRow = Record<string, any>;

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: `Tarefas — ${brand.fullName}` }] }),
  component: TasksPage,
});

function TasksPage() {
  const [status, setStatus] = useState("all");
  const projects = useQuery(projectsQuery);
  const tasks = useQuery({
    queryKey: ["all-project-tasks"],
    queryFn: async () => {
      const { data, error } = await db
        .from("tasks")
        .select("id,title,description,status,priority,due_date,start_date,progress,project_id,assignee_id,blocked_reason")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const projectById = useMemo(() => new Map((projects.data ?? []).map((project: AnyRow) => [project.id, project])), [projects.data]);
  const rows = (tasks.data ?? []).filter((task: AnyRow) => status === "all" || task.status === status);
  const lateCount = rows.filter((task: AnyRow) => task.due_date && new Date(`${task.due_date}T00:00:00`) < startOfToday() && task.status !== "done").length;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Tarefas</h1>
          <p className="mt-1 text-muted-foreground">Todas as tarefas dos projetos aos quais você tem acesso, sempre filtradas por RLS.</p>
        </div>
        <div className="w-full lg:w-56">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Filtrar status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="todo">A Fazer</SelectItem>
              <SelectItem value="in_progress">Fazendo</SelectItem>
              <SelectItem value="review">Em Revisão</SelectItem>
              <SelectItem value="blocked">Bloqueado</SelectItem>
              <SelectItem value="done">Concluído</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Metric label="Tarefas visíveis" value={rows.length} />
        <Metric label="Atrasadas" value={lateCount} tone={lateCount ? "red" : "green"} />
        <Metric label="Concluídas" value={rows.filter((task: AnyRow) => task.status === "done").length} tone="green" />
      </div>

      <div className="mt-8 grid gap-3">
        {tasks.isLoading && <Card className="p-6 text-sm text-muted-foreground">Carregando tarefas...</Card>}
        {!tasks.isLoading && rows.length === 0 && <Card className="p-10 text-center text-muted-foreground">Nenhuma tarefa encontrada para este filtro.</Card>}
        {rows.map((task: AnyRow) => {
          const project = projectById.get(task.project_id) as AnyRow | undefined;
          const late = task.due_date && new Date(`${task.due_date}T00:00:00`) < startOfToday() && task.status !== "done";
          return (
            <Link key={task.id} to="/projects/$projectId" params={{ projectId: task.project_id }}>
              <Card className="p-4 transition hover:border-primary/50 hover:shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{task.title}</h3>
                      <StatusBadge status={task.status} />
                      <PriorityBadge priority={task.priority} />
                      {late && <Badge variant="destructive">Atrasada</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{project?.name ?? "Projeto"} · Prazo: {formatDate(task.due_date) || "sem prazo"}</p>
                    {task.blocked_reason && <p className="mt-2 text-sm text-destructive">Bloqueio: {task.blocked_reason}</p>}
                  </div>
                  <div className="w-full lg:w-48"><Progress value={task.progress ?? 0} /></div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "blue" }: { label: string; value: number; tone?: "blue" | "green" | "red" }) {
  const cls = tone === "red" ? "text-destructive" : tone === "green" ? "text-success" : "text-primary";
  return <Card className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 font-display text-3xl font-bold ${cls}`}>{value}</p></Card>;
}
function StatusBadge({ status }: { status: string }) { return <Badge variant={status === "done" ? "default" : status === "blocked" ? "destructive" : "secondary"}>{({ todo: "A Fazer", in_progress: "Fazendo", review: "Em Revisão", blocked: "Bloqueado", done: "Concluído" } as AnyRow)[status] ?? status}</Badge>; }
function PriorityBadge({ priority }: { priority: string }) { return <Badge variant={priority === "urgent" || priority === "high" ? "destructive" : "outline"}>{priority}</Badge>; }
function formatDate(date?: string | null) { return date ? new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR") : ""; }
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
