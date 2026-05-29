import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { projectsQuery, orgsQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { brand } from "@/config/brand";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: `Projetos — ${brand.fullName}` }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const projects = useQuery(projectsQuery);
  const orgs = useQuery(orgsQuery);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Projetos</h1>
          <p className="mt-1 text-muted-foreground">Todos os projetos do seu workspace.</p>
        </div>
        <NewProjectDialog defaultOrgId={orgs.data?.[0]?.id} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!projects.isLoading && projects.data?.length === 0 && (
          <Card className="col-span-full flex flex-col items-center justify-center p-12 text-center">
            <p className="text-muted-foreground">Nenhum projeto ainda.</p>
            <p className="mt-1 text-sm text-muted-foreground">Crie seu primeiro projeto para começar.</p>
          </Card>
        )}
        {projects.data?.map((p) => (
          <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }}>
            <Card className="p-5 transition-all hover:border-accent/60 hover:shadow-md">
              <div className="flex items-start justify-between">
                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                <HealthDot health={p.health} />
              </div>
              {p.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-secondary px-2 py-0.5">{p.status}</span>
                {p.end_date && <span>Entrega: {new Date(p.end_date).toLocaleDateString("pt-BR")}</span>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function HealthDot({ health }: { health: "green" | "yellow" | "red" }) {
  const cls = health === "green" ? "bg-success" : health === "yellow" ? "bg-warning" : "bg-destructive";
  return <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function NewProjectDialog({ defaultOrgId }: { defaultOrgId?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!defaultOrgId || !user) return;
    setLoading(true);
    const { error } = await supabase.from("projects").insert({
      name: name.trim(),
      description: desc.trim() || null,
      end_date: endDate || null,
      org_id: defaultOrgId,
      owner_id: user.id,
      status: "active",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Projeto criado");
    qc.invalidateQueries({ queryKey: ["projects"] });
    setOpen(false);
    setName(""); setDesc(""); setEndDate("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!defaultOrgId}>
          <Plus className="mr-2 h-4 w-4" /> Novo projeto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
        </DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="desc">Objetivo / descrição</Label>
            <Textarea id="desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="end">Data de entrega prevista</Label>
            <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Criando..." : "Criar projeto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
