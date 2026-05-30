import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { projectsQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { brand } from "@/config/brand";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const db = supabase as any;
type AnyRow = Record<string, any>;

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: `Aprovações — ${brand.fullName}` }] }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const projects = useQuery(projectsQuery);
  const approvals = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const { data, error } = await db.from("pending_approvals").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const projectById = new Map(((projects.data ?? []) as AnyRow[]).map((project) => [project.id, project]));
  const rows = (approvals.data ?? []) as AnyRow[];

  async function approve(row: AnyRow) {
    if (!user) return;
    const warnings: string[] = [];
    if (["task_suggestion", "meeting_suggestion"].includes(row.approval_type)) {
      const payload = row.payload ?? {};
      const meetingDetails = payload.meeting ? `\n\nDetalhes da reunião: ${JSON.stringify(payload.meeting)}` : "";
      const { error } = await db.from("tasks").insert({
        project_id: row.project_id,
        created_by: user.id,
        title: payload.title || row.title,
        description: `${payload.description || row.summary || ""}${meetingDetails}`.trim() || null,
        priority: payload.priority || "medium",
        status: "todo",
        due_date: payload.due_date || null,
        task_type: row.approval_type === "meeting_suggestion" ? "meeting" : (payload.task_type || "common"),
        notes: payload.notes || "Criado após aprovação de sugestão da IA.",
      });
      if (error) {
        const { error: fallbackError } = await db.from("tasks").insert({
          project_id: row.project_id,
          created_by: user.id,
          title: payload.title || row.title,
          description: `${payload.description || row.summary || ""}${meetingDetails}`.trim() || null,
          priority: payload.priority || "medium",
          status: "todo",
          due_date: payload.due_date || null,
        });
        if (fallbackError) warnings.push(fallbackError.message);
      }
    }

    if (row.approval_type === "risk_suggestion") {
      const payload = row.payload ?? {};
      const { error } = await db.from("risks").insert({
        project_id: row.project_id,
        title: payload.title || row.title,
        description: payload.description || row.summary || null,
        probability: payload.probability || "medium",
        impact: payload.impact || "medium",
        level: payload.level || "medium",
        preventive_action: payload.preventive_action || null,
        response_plan: payload.response_plan || null,
        status: "open",
      });
      if (error) warnings.push(error.message);
    }

    if (!warnings.length) {
      await db.from("pending_approvals").update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() }).eq("id", row.id);
      if (row.ai_output_id) await db.from("ai_outputs").update({ status: "approved" }).eq("id", row.ai_output_id);
      await db.from("ai_action_logs").insert({ project_id: row.project_id, ai_output_id: row.ai_output_id, pending_approval_id: row.id, action_type: row.approval_type, result: "success", interpretation: row.summary, executed_by: user.id });
      toast.success("Ação aprovada e salva no projeto.");
    } else {
      await db.from("ai_action_logs").insert({ project_id: row.project_id, ai_output_id: row.ai_output_id, pending_approval_id: row.id, action_type: row.approval_type, result: "error", error_message: warnings.join("; "), executed_by: user.id });
      toast.error(warnings[0]);
    }
    qc.invalidateQueries({ queryKey: ["pending-approvals"] });
  }

  async function reject(row: AnyRow) {
    await db.from("pending_approvals").update({ status: "rejected", rejected_at: new Date().toISOString() }).eq("id", row.id);
    if (row.ai_output_id) await db.from("ai_outputs").update({ status: "discarded" }).eq("id", row.ai_output_id);
    await db.from("ai_action_logs").insert({ project_id: row.project_id, ai_output_id: row.ai_output_id, pending_approval_id: row.id, action_type: row.approval_type, result: "skipped", interpretation: "Sugestão recusada pelo usuário.", executed_by: user?.id ?? null });
    toast.success("Sugestão recusada.");
    qc.invalidateQueries({ queryKey: ["pending-approvals"] });
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <h1 className="font-display text-3xl font-bold">Aprovações Pendentes</h1>
      <p className="mt-1 text-muted-foreground">Revise ações preparadas pelo agente antes de salvar qualquer mudança sensível no projeto.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Metric label="Pendentes" value={rows.filter((row) => row.status === "pending").length} />
        <Metric label="Aprovadas" value={rows.filter((row) => row.status === "approved").length} />
        <Metric label="Recusadas" value={rows.filter((row) => row.status === "rejected").length} />
      </div>
      <div className="mt-8 grid gap-4">
        {approvals.isLoading && <Card className="p-6 text-sm text-muted-foreground">Carregando aprovações...</Card>}
        {!approvals.isLoading && rows.length === 0 && <Card className="p-10 text-center text-muted-foreground">Nenhuma aprovação pendente.</Card>}
        {rows.map((row) => {
          const project = projectById.get(row.project_id) as AnyRow | undefined;
          return (
            <Card key={row.id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-semibold">{row.title}</h3><Badge>{typeLabel(row.approval_type)}</Badge><Badge variant={row.status === "pending" ? "secondary" : "outline"}>{statusLabel(row.status)}</Badge></div>
                  <p className="mt-2 text-sm text-muted-foreground">Projeto: {project?.name ?? row.project_id}</p>
                  {row.summary && <p className="mt-3 text-sm">{row.summary}</p>}
                  <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground">{JSON.stringify(row.payload ?? {}, null, 2)}</pre>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button asChild variant="secondary"><Link to="/projects/$projectId" params={{ projectId: row.project_id }}>Ver projeto</Link></Button>
                  {row.status === "pending" && <Button onClick={() => approve(row)}>Aprovar e salvar</Button>}
                  {row.status === "pending" && <Button variant="outline" onClick={() => toast.info("Edição avançada da aprovação ficará na próxima fase. Por enquanto, recuse e peça uma nova sugestão ao assistente.")}>Editar antes de salvar</Button>}
                  {row.status === "pending" && <Button variant="destructive" onClick={() => reject(row)}>Descartar sugestão</Button>}
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
function typeLabel(type: string) { return ({ task_suggestion: "Tarefa", meeting_suggestion: "Reunião", wbs_suggestion: "EAP", risk_suggestion: "Risco", timeline_suggestion: "Cronograma", email_draft: "E-mail", calendar_event_draft: "Agenda", reminder_draft: "Lembrete", report_draft: "Relatório" } as AnyRow)[type] ?? type; }
function statusLabel(status: string) { return ({ pending: "Pendente", approved: "Aprovada", rejected: "Recusada", cancelled: "Cancelada" } as AnyRow)[status] ?? status; }
