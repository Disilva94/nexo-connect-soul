import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Plus, Sparkles } from "lucide-react";
import { brand } from "@/config/brand";
import { toast } from "sonner";

const db = supabase as any;
type AnyRow = Record<string, any>;

type SmartProjectInput = {
  name: string;
  project_type: string;
  description: string;
  objective: string;
  start_date: string;
  end_date: string;
  complexity: string;
  area: string;
  team: string;
  notes: string;
};

type InviteDraft = {
  invited_email: string;
  invited_name: string;
  role: string;
  message: string;
};

type DocDraft = {
  id: string;
  name: string;
  file_type: string;
  description: string;
  ai_enabled: boolean;
  file?: File;
  file_url?: string;
};

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: `Projetos — ${brand.fullName}` }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const projects = useQuery(projectsQuery);
  const orgs = useQuery(orgsQuery);
  const rows = (projects.data ?? []) as AnyRow[];

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Projetos</h1>
          <p className="mt-1 text-muted-foreground">
            Crie projetos completos com apoio de IA e convide pessoas por projeto.
          </p>
        </div>
        <SmartProjectWizard defaultOrgId={orgs.data?.[0]?.id} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : null}

        {!projects.isLoading && rows.length === 0 ? (
          <Card className="col-span-full flex flex-col items-center justify-center p-12 text-center">
            <p className="text-muted-foreground">Nenhum projeto ainda.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use o assistente para criar seu primeiro projeto.
            </p>
          </Card>
        ) : null}

        {rows.map((project) => (
          <Link key={project.id} to="/projects/$projectId" params={{ projectId: project.id }}>
            <Card className="h-full p-5 transition-all hover:border-primary/60 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">{project.name}</h3>
                <HealthDot health={project.health} />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {project.objective || project.description || "Sem objetivo cadastrado."}
              </p>
              <div className="mt-4">
                <Progress value={project.progress ?? 0} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Progresso {project.progress ?? 0}%</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{project.status ?? "active"}</Badge>
                {project.end_date ? (
                  <span>
                    Entrega: {new Date(`${project.end_date}T00:00:00`).toLocaleDateString("pt-BR")}
                  </span>
                ) : null}
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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState<SmartProjectInput>({
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
  const [invites, setInvites] = useState<InviteDraft[]>([]);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>({
    invited_email: "",
    invited_name: "",
    role: "contributor",
    message: "",
  });
  const [documents, setDocuments] = useState<DocDraft[]>([]);

  const summary = useMemo(
    () => [
      input.objective || input.description || "Objetivo ainda não informado.",
      input.start_date && input.end_date
        ? `Janela: ${new Date(`${input.start_date}T00:00:00`).toLocaleDateString("pt-BR")} → ${new Date(`${input.end_date}T00:00:00`).toLocaleDateString("pt-BR")}`
        : "Defina início e fim desejados para o cronograma.",
      `Convites preparados: ${invites.length}`,
      `Documentos preparados: ${documents.length}`,
    ],
    [documents.length, input.description, input.end_date, input.objective, input.start_date, invites.length],
  );

  async function createProject() {
    if (!defaultOrgId || !user || !input.name.trim()) return;

    setLoading(true);
    try {
      const { data: project, error } = await db
        .from("projects")
        .insert({
          org_id: defaultOrgId,
          owner_id: user.id,
          name: input.name.trim(),
          description: input.description || null,
          objective: input.objective || null,
          start_date: input.start_date || null,
          end_date: input.end_date || null,
          status: "active",
          health: "green",
          progress: 0,
          health_reason: "Projeto criado a partir do assistente.",
        })
        .select("id")
        .single();

      if (error || !project?.id) {
        throw new Error(error?.message || "Não foi possível criar o projeto.");
      }

      for (const invite of invites) {
        await db.from("project_invitations").insert({
          project_id: project.id,
          invited_email: invite.invited_email,
          invited_name: invite.invited_name || null,
          role: invite.role,
          message: invite.message || null,
          invited_by: user.id,
          status: "pending",
        });
      }

      for (const doc of documents) {
        await db.from("project_documents").insert({
          id: doc.id,
          project_id: project.id,
          uploaded_by: user.id,
          name: doc.name,
          file_type: doc.file_type,
          file_url: doc.file_url ?? null,
          description: doc.description || null,
          ai_enabled: doc.ai_enabled,
          processing_status: doc.file_url ? "linked" : "pending",
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      toast.success("Projeto criado.");
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar o projeto.");
    } finally {
      setLoading(false);
    }
  }

  function addInvite() {
    if (!inviteDraft.invited_email.trim()) return;
    setInvites((current) => [
      ...current,
      {
        ...inviteDraft,
        invited_email: inviteDraft.invited_email.trim().toLowerCase(),
      },
    ]);
    setInviteDraft({ invited_email: "", invited_name: "", role: "contributor", message: "" });
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setDocuments((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        file_type: file.type || "arquivo",
        description: "",
        ai_enabled: true,
        file,
      })),
    ]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!defaultOrgId}>
          <Sparkles className="mr-2 h-4 w-4" />
          Novo projeto com IA
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criação inteligente de projeto</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome do projeto">
                <Input value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} />
              </Field>
              <Field label="Tipo do projeto">
                <Input value={input.project_type} onChange={(event) => setInput({ ...input, project_type: event.target.value })} />
              </Field>
              <Field label="Objetivo principal">
                <Textarea value={input.objective} onChange={(event) => setInput({ ...input, objective: event.target.value })} />
              </Field>
              <Field label="Descrição">
                <Textarea value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} />
              </Field>
              <Field label="Data de início">
                <Input type="date" value={input.start_date} onChange={(event) => setInput({ ...input, start_date: event.target.value })} />
              </Field>
              <Field label="Data final">
                <Input type="date" value={input.end_date} onChange={(event) => setInput({ ...input, end_date: event.target.value })} />
              </Field>
            </div>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Participantes</h3>
                <Button type="button" variant="secondary" size="sm" onClick={addInvite}>
                  <Plus className="mr-2 h-4 w-4" />Adicionar
                </Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input type="email" placeholder="E-mail" value={inviteDraft.invited_email} onChange={(event) => setInviteDraft({ ...inviteDraft, invited_email: event.target.value })} />
                <Select value={inviteDraft.role} onValueChange={(role) => setInviteDraft({ ...inviteDraft, role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="contributor">Colaborador</SelectItem>
                    <SelectItem value="client">Cliente</SelectItem>
                    <SelectItem value="observer">Observador</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Nome opcional" value={inviteDraft.invited_name} onChange={(event) => setInviteDraft({ ...inviteDraft, invited_name: event.target.value })} />
                <Input placeholder="Mensagem opcional" value={inviteDraft.message} onChange={(event) => setInviteDraft({ ...inviteDraft, message: event.target.value })} />
              </div>
              <div className="mt-3 space-y-2">
                {invites.map((invite, index) => (
                  <div key={`${invite.invited_email}-${index}`} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>{invite.invited_email} — {invite.role}</span>
                    <Button variant="ghost" size="sm" onClick={() => setInvites(invites.filter((_, i) => i !== index))}>Remover</Button>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold">Documentos e links</h3>
              <Input className="mt-3" type="file" multiple onChange={(event) => addFiles(event.target.files)} />
              <div className="mt-3 space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>{doc.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => setDocuments(documents.filter((item) => item.id !== doc.id))}>Remover</Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-display text-lg font-semibold">Prévia rápida</h3>
              </div>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                {summary.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">
                Esta versão foi saneada para restaurar a rota e a criação básica de projetos.
              </p>
            </Card>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={createProject} disabled={loading || !defaultOrgId || !input.name.trim()}>
            {loading ? "Criando..." : "Criar projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function HealthDot({ health }: { health: "green" | "yellow" | "red" | null | undefined }) {
  const cls =
    health === "yellow"
      ? "bg-warning"
      : health === "red"
        ? "bg-destructive"
        : "bg-primary";

  return <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />;
}
