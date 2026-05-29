import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { projectsQuery } from "@/lib/queries";
import { brand } from "@/config/brand";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

const db = supabase as any;
type AnyRow = Record<string, any>;

export const Route = createFileRoute("/_authenticated/files")({
  head: () => ({ meta: [{ title: `Arquivos — ${brand.fullName}` }] }),
  component: FilesPage,
});

function FilesPage() {
  const projects = useQuery(projectsQuery);
  const documents = useQuery({
    queryKey: ["all-project-documents"],
    queryFn: async () => {
      const { data, error } = await db.from("project_documents").select("id,project_id,name,file_type,file_url,description,processing_status,ai_enabled,tags,created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const projectById = new Map((projects.data ?? []).map((project: AnyRow) => [project.id, project]));
  const rows = documents.data ?? [];
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <h1 className="font-display text-3xl font-bold">Arquivos</h1>
      <p className="mt-1 text-muted-foreground">Documentos vinculados aos projetos acessíveis. Nenhum arquivo é listado fora do isolamento por projeto.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Metric label="Documentos" value={rows.length} />
        <Metric label="Liberados para IA" value={rows.filter((doc: AnyRow) => doc.ai_enabled).length} />
        <Metric label="Processados" value={rows.filter((doc: AnyRow) => doc.processing_status === "processed").length} />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {documents.isLoading && <Card className="p-6 text-sm text-muted-foreground">Carregando arquivos...</Card>}
        {!documents.isLoading && rows.length === 0 && <Card className="col-span-full p-10 text-center text-muted-foreground">Nenhum documento cadastrado.</Card>}
        {rows.map((doc: AnyRow) => {
          const project = projectById.get(doc.project_id) as AnyRow | undefined;
          return (
            <Card key={doc.id} className="p-5 transition hover:border-primary/50 hover:shadow-sm">
              <div className="flex items-start gap-3">
                <FileText className="mt-1 h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{doc.name}</h3><Badge variant="secondary">{doc.processing_status}</Badge>{doc.ai_enabled && <Badge>IA</Badge>}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{project?.name ?? "Projeto"} · {doc.file_type}</p>
                  {doc.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{doc.description}</p>}
                  <div className="mt-4 flex gap-2">
                    <Link to="/projects/$projectId" params={{ projectId: doc.project_id }} className="text-sm font-medium text-primary hover:underline">Abrir projeto</Link>
                    {doc.file_url?.startsWith("http") && <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">Abrir arquivo</a>}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <Card className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl font-bold text-primary">{value}</p></Card>; }
