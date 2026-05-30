import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { projectsQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { brand } from "@/config/brand";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
type AnyRow = Record<string, any>;

export const Route = createFileRoute("/_authenticated/files")({
  head: () => ({ meta: [{ title: `Arquivos — ${brand.fullName}` }] }),
  component: FilesPage,
});

function FilesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);


  const projects = useQuery(projectsQuery);
  const documents = useQuery({
    queryKey: ["all-project-documents"],
    queryFn: async () => {
      const { data, error } = await db.from("project_documents").select("id,project_id,name,file_type,file_url,description,processing_status,ai_enabled,tags,created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const projectRows = (projects.data ?? []) as AnyRow[];
  const selectedProjectId = projectId || projectRows[0]?.id || "";
  const projectById = new Map(projectRows.map((project: AnyRow) => [project.id, project]));

      const { data, error } = await db
        .from("project_documents")
        .select(
          "id,project_id,name,file_type,file_url,description,processing_status,ai_enabled,tags,created_at",
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as AnyRow[];
    },
  });

  const projectRows = (projects.data ?? []) as AnyRow[];
  const selectedProjectId = projectId || projectRows[0]?.id || "";
  const projectById = useMemo(
    () => new Map(projectRows.map((project) => [project.id, project])),
    [projectRows],
  );
  const rows = documents.data ?? [];

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || !user || !selectedProjectId) return;
    const project = projectById.get(selectedProjectId) as AnyRow | undefined;
    setUploading(true);
    const warnings: string[] = [];
    for (const file of Array.from(files)) {
      const documentId = crypto.randomUUID();
      const path = `${project?.org_id ?? "org"}/${selectedProjectId}/documents/${documentId}/${file.name}`;
      const { error: storageError } = await supabase.storage.from("project-documents").upload(path, file, { upsert: true });
      if (storageError) warnings.push(`upload ${file.name}: ${storageError.message}`);


    const project = projectById.get(selectedProjectId);
    const warnings: string[] = [];
    setUploading(true);

    for (const file of Array.from(files)) {
      const documentId = crypto.randomUUID();
      const path = `${project?.org_id ?? "org"}/${selectedProjectId}/documents/${documentId}/${file.name}`;

      const { error: storageError } = await supabase.storage
        .from("project-documents")
        .upload(path, file, { upsert: true });

      const { error: docError } = await db.from("project_documents").insert({
        id: documentId,
        project_id: selectedProjectId,
        uploaded_by: user.id,
        name: file.name,
        file_type: file.type || "arquivo",
        file_url: path,
        description: description || "Documento enviado pela área de Arquivos para aprendizado do projeto.",
        processing_status: storageError ? "error" : "pending",
        ai_enabled: aiEnabled,
      });
      if (docError) warnings.push(`documento ${file.name}: ${docError.message}`);
    }
    setUploading(false);
    setDescription("");
    qc.invalidateQueries({ queryKey: ["all-project-documents"] });
    if (warnings.length) toast.warning(`Upload concluído com avisos: ${warnings.slice(0, 2).join("; ")}`);
    else toast.success("Documentos enviados e vinculados ao projeto.");

        description:
          description ||
          "Documento enviado pela área de arquivos para aprendizado do projeto.",
        processing_status: storageError ? "error" : "pending",
        ai_enabled: aiEnabled,
      });

      if (storageError) warnings.push(`upload ${file.name}: ${storageError.message}`);
      if (docError) warnings.push(`documento ${file.name}: ${docError.message}`);
    }

    setUploading(false);
    setDescription("");
    await queryClient.invalidateQueries({ queryKey: ["all-project-documents"] });

    if (warnings.length) {
      toast.warning(`Upload concluído com avisos: ${warnings.slice(0, 2).join("; ")}`);
      return;
    }

    toast.success("Documentos enviados e vinculados ao projeto.");
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <h1 className="font-display text-3xl font-bold">Arquivos</h1>
      <p className="mt-1 text-muted-foreground">Envie documentos para o aprendizado de cada projeto. Todo arquivo fica vinculado a um único project_id.</p>

      <Card className="mt-6 p-6">
        <div className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Upload de documentos do projeto</h2></div>
        <p className="mt-2 text-sm text-muted-foreground">Selecione o projeto e envie PDFs, DOCX, TXT, imagens ou planilhas. Eles poderão ser usados pela IA somente se você permitir.</p>

      <p className="mt-1 text-muted-foreground">
        Envie documentos para cada projeto e acompanhe o processamento em um só lugar.
      </p>

      <Card className="mt-6 p-6">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-semibold">
            Upload de documentos do projeto
          </h2>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          Selecione o projeto e envie PDFs, DOCX, TXT, imagens ou planilhas.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
          <div>
            <Label>Projeto</Label>
            <Select value={selectedProjectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Selecione um projeto" /></SelectTrigger>
              <SelectContent>{projectRows.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Arquivos</Label>
            <Input type="file" multiple disabled={!selectedProjectId || uploading} onChange={(event) => uploadFiles(event.target.files)} />
          </div>
          <div className="lg:col-span-2">
            <Label>Descrição / instrução para a IA</Label>
            <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: briefing do cliente, contrato, material de referência ou documento para aprendizado deste projeto." />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={aiEnabled} onChange={(event) => setAiEnabled(event.target.checked)} /> Permitir uso pela IA deste projeto
          </label>
          {uploading && <p className="text-sm text-muted-foreground">Enviando documentos...</p>}

              <SelectTrigger>
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {projectRows.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Arquivos</Label>
            <Input
              type="file"
              multiple
              disabled={!selectedProjectId || uploading}
              onChange={(event) => uploadFiles(event.target.files)}
            />
          </div>

          <div className="lg:col-span-2">
            <Label>Descrição / instrução para a IA</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex.: briefing do cliente, contrato, material de referência ou documento para aprendizado deste projeto."
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(event) => setAiEnabled(event.target.checked)}
            />
            Permitir uso pela IA deste projeto
          </label>

          {uploading ? (
            <p className="text-sm text-muted-foreground">Enviando documentos...</p>
          ) : null}
        </div>
      </Card>

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

        <Metric
          label="Liberados para IA"
          value={rows.filter((doc) => doc.ai_enabled).length}
        />
        <Metric
          label="Processados"
          value={rows.filter((doc) => doc.processing_status === "processed").length}
        />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {documents.isLoading ? (
          <Card className="p-6 text-sm text-muted-foreground">Carregando arquivos...</Card>
        ) : null}

        {!documents.isLoading && rows.length === 0 ? (
          <Card className="col-span-full p-10 text-center text-muted-foreground">
            Nenhum documento cadastrado.
          </Card>
        ) : null}

        {rows.map((doc) => {
          const project = projectById.get(doc.project_id);

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


                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{doc.name}</h3>
                    <Badge variant="secondary">{doc.processing_status}</Badge>
                    {doc.ai_enabled ? <Badge>IA</Badge> : null}
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {project?.name ?? "Projeto"} · {doc.file_type}
                  </p>

                  {doc.description ? (
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                      {doc.description}
                    </p>
                  ) : null}

                  <div className="mt-4 flex gap-3">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: doc.project_id }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Abrir projeto
                    </Link>

                    {typeof doc.file_url === "string" && doc.file_url.startsWith("http") ? (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Abrir arquivo
                      </a>
                    ) : null}
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-primary">{value}</p>
    </Card>
  );
}
