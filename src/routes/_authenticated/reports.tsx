import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { projectsQuery } from "@/lib/queries";
import { brand } from "@/config/brand";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const db = supabase as any;
type AnyRow = Record<string, any>;

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: `Relatórios — ${brand.fullName}` }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const projects = useQuery(projectsQuery);
  const reports = useQuery({
    queryKey: ["all-project-reports"],
    queryFn: async () => {
      const { data, error } = await db.from("project_reports").select("id,project_id,type,title,content,created_by,created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const projectById = new Map((projects.data ?? []).map((project: AnyRow) => [project.id, project]));
  const rows = reports.data ?? [];

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <h1 className="font-display text-3xl font-bold">Relatórios</h1>
      <p className="mt-1 text-muted-foreground">Relatórios salvos dos projetos aos quais você tem permissão.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Metric label="Relatórios" value={rows.length} />
        <Metric label="Status" value={rows.filter((report: AnyRow) => report.type === "status").length} />
        <Metric label="Encerramento" value={rows.filter((report: AnyRow) => report.type === "closure").length} />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.isLoading && <Card className="p-6 text-sm text-muted-foreground">Carregando relatórios...</Card>}
        {!reports.isLoading && rows.length === 0 && <Card className="col-span-full p-10 text-center text-muted-foreground">Nenhum relatório salvo ainda.</Card>}
        {rows.map((report: AnyRow) => {
          const project = projectById.get(report.project_id) as AnyRow | undefined;
          return (
            <Link key={report.id} to="/projects/$projectId" params={{ projectId: report.project_id }}>
              <Card className="h-full p-5 transition hover:border-primary/50 hover:shadow-sm">
                <div className="flex items-start justify-between gap-3"><h3 className="font-display text-lg font-semibold">{report.title}</h3><Badge>{report.type}</Badge></div>
                <p className="mt-2 text-sm text-muted-foreground">{project?.name ?? "Projeto"}</p>
                <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">{extractSummary(report.content)}</p>
                <p className="mt-4 text-xs text-muted-foreground">Criado em {new Date(report.created_at).toLocaleDateString("pt-BR")}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <Card className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl font-bold text-primary">{value}</p></Card>; }
function extractSummary(content: unknown) { if (!content) return "Sem resumo."; if (typeof content === "string") return content; const value = content as AnyRow; return value.summary || value.health_reason || value.recommendations?.join?.(" · ") || JSON.stringify(value).slice(0, 180); }
