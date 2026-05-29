import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { projectsQuery, myTasksQuery } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brand } from "@/config/brand";
import { FolderKanban, ListTodo, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: `Dashboard — ${brand.fullName}` }] }),
  component: Dashboard,
});

function Dashboard() {
  const projects = useQuery(projectsQuery);
  const tasks = useQuery(myTasksQuery);

  const overdue = tasks.data?.filter((t) => t.due_date && new Date(t.due_date) < new Date()).length ?? 0;
  const active = projects.data?.filter((p) => p.status === "active").length ?? 0;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="font-display text-3xl font-bold">Dashboard</h1>
      <p className="mt-1 text-muted-foreground">Visão rápida dos seus projetos e tarefas.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projetos ativos</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold">{active}</div>
            <p className="text-xs text-muted-foreground">de {projects.data?.length ?? 0} no total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Minhas tarefas abertas</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold">{tasks.data?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em atraso</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-display font-bold ${overdue > 0 ? "text-destructive" : ""}`}>{overdue}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Projetos recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {projects.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum projeto ainda. <Link to="/projects" className="text-primary hover:underline">Criar primeiro projeto</Link>
              </p>
            )}
            {projects.data?.slice(0, 5).map((p) => (
              <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/30">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.status}</div>
                </div>
                <HealthBadge health={p.health} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Minhas tarefas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa atribuída a você.</p>
            )}
            {tasks.data?.slice(0, 8).map((t) => {
              const late = t.due_date && new Date(t.due_date) < new Date();
              return (
                <Link key={t.id} to="/projects/$projectId" params={{ projectId: t.project_id }} className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/30">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.status}</div>
                  </div>
                  {t.due_date && (
                    <Badge variant={late ? "destructive" : "secondary"} className="ml-2 shrink-0">
                      {new Date(t.due_date).toLocaleDateString("pt-BR")}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HealthBadge({ health }: { health: "green" | "yellow" | "red" }) {
  const map = {
    green: { label: "Saudável", cls: "bg-success/15 text-success border-success/30" },
    yellow: { label: "Atenção", cls: "bg-warning/15 text-warning-foreground border-warning/40" },
    red: { label: "Crítico", cls: "bg-destructive/15 text-destructive border-destructive/40" },
  };
  const v = map[health];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${v.cls}`}>{v.label}</span>;
}
