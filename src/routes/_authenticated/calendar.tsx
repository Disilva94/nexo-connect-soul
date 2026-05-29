import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { projectsQuery } from "@/lib/queries";
import { brand } from "@/config/brand";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const db = supabase as any;
type AnyRow = Record<string, any>;

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: `Calendário — ${brand.fullName}` }] }),
  component: CalendarPage,
});

function CalendarPage() {
  const projects = useQuery(projectsQuery);
  const tasks = useQuery({
    queryKey: ["calendar-tasks"],
    queryFn: async () => {
      const { data, error } = await db.from("tasks").select("id,title,status,priority,due_date,start_date,project_id").not("due_date", "is", null).order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const projectById = new Map((projects.data ?? []).map((project: AnyRow) => [project.id, project]));
  const events = [
    ...(tasks.data ?? []).map((task: AnyRow) => ({ type: "task", date: task.due_date, project_id: task.project_id, title: task.title, status: task.status, priority: task.priority })),
    ...(projects.data ?? []).filter((project: AnyRow) => project.end_date).map((project: AnyRow) => ({ type: "project", date: project.end_date, project_id: project.id, title: `Entrega final: ${project.name}`, status: project.status, priority: project.priority })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const nextEvents = events.filter((event) => new Date(`${event.date}T00:00:00`) >= startOfToday()).slice(0, 10);
  const lateEvents = events.filter((event) => new Date(`${event.date}T00:00:00`) < startOfToday() && event.status !== "done" && event.status !== "closed");

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <h1 className="font-display text-3xl font-bold">Calendário</h1>
      <p className="mt-1 text-muted-foreground">Prazos de tarefas e entregas finais dos projetos acessíveis.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Metric label="Eventos futuros" value={nextEvents.length} />
        <Metric label="Atrasos" value={lateEvents.length} tone={lateEvents.length ? "red" : "green"} />
        <Metric label="Total no calendário" value={events.length} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <h2 className="font-display text-xl font-semibold">Linha do tempo</h2>
          <div className="mt-5 space-y-3">
            {events.length === 0 && <p className="text-sm text-muted-foreground">Nenhum prazo cadastrado.</p>}
            {events.map((event, index) => {
              const late = new Date(`${event.date}T00:00:00`) < startOfToday() && event.status !== "done" && event.status !== "closed";
              const project = projectById.get(event.project_id) as AnyRow | undefined;
              return (
                <Link key={`${event.type}-${event.project_id}-${event.title}-${index}`} to="/projects/$projectId" params={{ projectId: event.project_id }} className="block rounded-xl border p-4 transition hover:border-primary/50 hover:bg-muted/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="font-medium">{event.title}</p><p className="text-sm text-muted-foreground">{project?.name ?? "Projeto"}</p></div>
                    <div className="flex items-center gap-2"><Badge variant={event.type === "project" ? "default" : "secondary"}>{event.type === "project" ? "Projeto" : "Tarefa"}</Badge>{late && <Badge variant="destructive">Atrasado</Badge>}<span className="text-sm font-medium">{formatDate(event.date)}</span></div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="font-display text-xl font-semibold">Próximos prazos</h2>
          <div className="mt-4 space-y-2">{nextEvents.length ? nextEvents.map((event, index) => <div key={index} className="rounded-lg bg-muted/50 p-3 text-sm"><p className="font-medium">{event.title}</p><p className="text-muted-foreground">{formatDate(event.date)}</p></div>) : <p className="text-sm text-muted-foreground">Nenhum próximo prazo.</p>}</div>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "blue" }: { label: string; value: number; tone?: "blue" | "green" | "red" }) { const cls = tone === "red" ? "text-destructive" : tone === "green" ? "text-success" : "text-primary"; return <Card className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 font-display text-3xl font-bold ${cls}`}>{value}</p></Card>; }
function formatDate(date?: string | null) { return date ? new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR") : ""; }
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
