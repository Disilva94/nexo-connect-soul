import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { projectsQuery, myTasksQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { brand } from "@/config/brand";
import { AlertTriangle, CalendarDays, CheckCircle2, FolderKanban, Gauge, ListTodo, ShieldAlert } from "lucide-react";

const db = supabase as any;

type AnyRow = Record<string, any>;

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: `Dashboard — ${brand.fullName}` }] }),
  component: Dashboard,
});

function Dashboard() {
  const projects = useQuery(projectsQuery);
  const tasks = useQuery(myTasksQuery);
  const risks = useQuery({
    queryKey: ["dashboard-critical-risks"],
    queryFn: async () => {
      const { data, error } = await db.from("risks").select("id,title,level,status,project_id").eq("level", "critical").neq("status", "closed").limit(20);
      if (error) return [];
      return data ?? [];
    },
  });

  const projectRows = (projects.data ?? []) as AnyRow[];
  const taskRows = (tasks.data ?? []) as AnyRow[];
  const active = projectRows.filter((p) => p.status === "active").length;
  const healthy = projectRows.filter((p) => p.health === "green").length;
  const attention = projectRows.filter((p) => p.health === "yellow").length;
  const critical = projectRows.filter((p) => p.health === "red").length;
  const overdue = taskRows.filter((t) => t.due_date && new Date(t.due_date) < startOfToday()).length;
  const upcoming = taskRows.filter((t) => t.due_date && new Date(t.due_date) >= startOfToday()).slice(0, 6);
  const averageProgress = projectRows.length ? Math.round(projectRows.reduce((sum, p) => sum + Number(p.progress ?? 0), 0) / projectRows.length) : 0;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Início</h1>
          <p className="mt-1 text-muted-foreground">Visão executiva dos projetos, tarefas atrasadas, prazos e riscos.</p>
        </div>
        <Link to="/projects" className="text-sm font-medium text-primary hover:underline">Abrir lista de projetos</Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={FolderKanban} title="Projetos ativos" value={active} helper={`${projectRows.length} no total`} />
        <Metric icon={CheckCircle2} title="Saudáveis" value={healthy} helper={`${attention} em atenção · ${critical} críticos`} tone="green" />
        <Metric icon={AlertTriangle} title="Tarefas atrasadas" value={overdue} helper="Minhas tarefas abertas" tone={overdue ? "red" : "green"} />
        <Metric icon={ShieldAlert} title="Riscos críticos" value={(risks.data ?? []).length} helper="Abertos nos projetos acessíveis" tone={(risks.data ?? []).length ? "red" : "green"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-primary" /> Progresso médio dos projetos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4"><Progress value={averageProgress} className="h-3" /><span className="font-display text-2xl font-bold">{averageProgress}%</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Próximos prazos</CardTitle></CardHeader>
          <CardContent className="space-y-2">{upcoming.length ? upcoming.map((t) => <Link key={t.id} to="/projects/$projectId" params={{ projectId: t.project_id }} className="flex justify-between rounded-lg border p-2 text-sm hover:bg-muted"><span className="truncate">{t.title}</span><Badge variant="secondary">{formatDate(t.due_date)}</Badge></Link>) : <p className="text-sm text-muted-foreground">Nenhum prazo próximo.</p>}</CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-xl font-semibold">Projetos recentes</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projectRows.length === 0 && <Card className="col-span-full p-10 text-center text-muted-foreground">Nenhum projeto ainda. Crie seu primeiro projeto para começar.</Card>}
          {projectRows.slice(0, 6).map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-primary" /> Minhas tarefas abertas</CardTitle></CardHeader>
          <CardContent className="space-y-2">{taskRows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma tarefa atribuída a você.</p> : taskRows.slice(0, 8).map((t) => <Link key={t.id} to="/projects/$projectId" params={{ projectId: t.project_id }} className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/30"><div className="min-w-0 flex-1"><div className="truncate font-medium">{t.title}</div><div className="text-xs text-muted-foreground">{statusLabel(t.status)}</div></div>{t.due_date && <Badge variant={new Date(t.due_date) < startOfToday() ? "destructive" : "secondary"} className="ml-2 shrink-0">{formatDate(t.due_date)}</Badge>}</Link>)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Alertas de saúde</CardTitle></CardHeader>
          <CardContent className="space-y-2">{projectRows.filter((p) => p.health !== "green").length === 0 ? <p className="text-sm text-muted-foreground">Nenhum alerta relevante.</p> : projectRows.filter((p) => p.health !== "green").slice(0, 8).map((p) => <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="block rounded-md border p-3 hover:bg-accent/30"><div className="flex items-center justify-between"><span className="font-medium">{p.name}</span><HealthBadge health={p.health} /></div><p className="mt-1 text-xs text-muted-foreground">{p.health_reason || "Revise tarefas, riscos e custos para entender a causa."}</p></Link>)}</CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: AnyRow }) {
  return (
    <Link to="/projects/$projectId" params={{ projectId: project.id }}>
      <Card className="h-full p-5 transition-all hover:border-primary/50 hover:shadow-md">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-lg font-semibold">{project.name}</h3><p className="mt-1 text-xs text-muted-foreground">Responsável: {project.owner_id.slice(0, 8)}...</p></div><HealthBadge health={project.health} /></div>
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{project.objective || project.description || "Sem objetivo cadastrado."}</p>
        <div className="mt-4 space-y-2"><div className="flex justify-between text-xs text-muted-foreground"><span>Progresso</span><span>{project.progress ?? 0}%</span></div><Progress value={project.progress ?? 0} /></div>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>Prazo: {formatDate(project.end_date) || "sem prazo"}</span><span>Status: {project.status}</span></div>
        <Button className="mt-4 w-full" variant="secondary">Abrir projeto</Button>
      </Card>
    </Link>
  );
}

function Metric({ icon: Icon, title, value, helper, tone = "blue" }: { icon: any; title: string; value: number; helper: string; tone?: "blue" | "green" | "red" }) {
  const cls = tone === "red" ? "text-destructive" : tone === "green" ? "text-success" : "text-primary";
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><Icon className={`h-4 w-4 ${cls}`} /></CardHeader><CardContent><div className={`font-display text-3xl font-bold ${cls}`}>{value}</div><p className="text-xs text-muted-foreground">{helper}</p></CardContent></Card>;
}

function HealthBadge({ health }: { health: string }) {
  const map: AnyRow = { green: { label: "Saudável", cls: "bg-success/15 text-success border-success/30" }, yellow: { label: "Atenção", cls: "bg-warning/15 text-warning-foreground border-warning/40" }, red: { label: "Crítico", cls: "bg-destructive/15 text-destructive border-destructive/40" } };
  const v = map[health] ?? map.green;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${v.cls}`}>{v.label}</span>;
}
function statusLabel(status: string) { return ({ todo: "A Fazer", in_progress: "Fazendo", review: "Em Revisão", blocked: "Bloqueado", done: "Concluído" } as AnyRow)[status] ?? status; }
function formatDate(date?: string | null) { return date ? new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR") : ""; }
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
