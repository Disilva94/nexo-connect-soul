import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { projectQuery, tasksQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronLeft } from "lucide-react";
import { brand } from "@/config/brand";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import {
  DndContext, useSensor, useSensors, PointerSensor,
  type DragEndEvent, useDroppable, useDraggable,
} from "@dnd-kit/core";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Status = Database["public"]["Enums"]["task_status"];

const COLUMNS: { id: Status; label: string }[] = [
  { id: "todo", label: "A fazer" },
  { id: "in_progress", label: "Em andamento" },
  { id: "review", label: "Revisão" },
  { id: "done", label: "Concluído" },
];

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({ meta: [{ title: `Projeto — ${brand.fullName}` }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const project = useQuery(projectQuery(projectId));
  const tasks = useQuery(tasksQuery(projectId));
  const qc = useQueryClient();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleDragEnd(e: DragEndEvent) {
    const taskId = e.active.id as string;
    const newStatus = e.over?.id as Status | undefined;
    if (!newStatus) return;
    const task = tasks.data?.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    qc.setQueryData<Task[]>(["tasks", projectId], (old) =>
      old?.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)) ?? []
    );
    const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    if (error) {
      toast.error("Falha ao mover tarefa");
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    }
  }

  if (project.isLoading) {
    return <div className="p-8 text-muted-foreground">Carregando...</div>;
  }
  if (!project.data) {
    return <div className="p-8">Projeto não encontrado.</div>;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-card px-8 py-5">
        <Link to="/projects" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3 w-3" /> Projetos
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">{project.data.name}</h1>
            {project.data.description && <p className="mt-0.5 text-sm text-muted-foreground">{project.data.description}</p>}
          </div>
          <NewTaskDialog projectId={projectId} />
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {COLUMNS.map((col) => {
            const items = tasks.data?.filter((t) => t.status === col.id) ?? [];
            return <Column key={col.id} id={col.id} label={col.label} tasks={items} />;
          })}
        </div>
      </DndContext>
    </div>
  );
}

function Column({ id, label, tasks }: { id: Status; label: string; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 p-3 transition-colors ${isOver ? "border-accent bg-accent/10" : ""}`}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const late = task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";

  const priorityCls = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-secondary text-secondary-foreground",
    high: "bg-warning/20 text-warning-foreground",
    urgent: "bg-destructive/20 text-destructive",
  }[task.priority];

  return (
    <Card ref={setNodeRef} {...listeners} {...attributes} style={style} className={`cursor-grab p-3 ${isDragging ? "opacity-50" : ""} active:cursor-grabbing`}>
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={`rounded px-1.5 py-0.5 ${priorityCls}`}>{task.priority}</span>
        {task.due_date && (
          <span className={late ? "text-destructive" : "text-muted-foreground"}>
            {new Date(task.due_date).toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>
    </Card>
  );
}

function NewTaskDialog({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<Status>("todo");
  const [priority, setPriority] = useState<Database["public"]["Enums"]["task_priority"]>("medium");
  const [due, setDue] = useState("");
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("tasks").insert({
      project_id: projectId,
      title: title.trim(),
      description: desc.trim() || null,
      status,
      priority,
      due_date: due || null,
      created_by: user.id,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    setOpen(false);
    setTitle(""); setDesc(""); setDue("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Nova tarefa</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <div>
            <Label htmlFor="title">Título</Label>
            <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="desc">Descrição</Label>
            <Textarea id="desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLUMNS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="due">Prazo</Label>
            <Input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading || !title.trim()}>
              {loading ? "Criando..." : "Criar tarefa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
