import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { BookOpen, Upload } from "lucide-react";
import { brand } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { orgsQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const db = supabase as any;
type AnyRow = Record<string, any>;

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({ meta: [{ title: `Base de conhecimento — ${brand.fullName}` }] }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const orgs = useQuery(orgsQuery);
  const orgId = orgs.data?.[0]?.id;
  const files = useQuery({
    queryKey: ["knowledge-files", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db.from("knowledge_files").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [form, setForm] = useState({ name: "", description: "", category: "apostila", ai_enabled: true });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function uploadKnowledge(e: FormEvent) {
    e.preventDefault();
    if (!user || !orgId) return;
    setLoading(true);
    const id = crypto.randomUUID();
    let fileUrl: string | null = null;
    let status = "pending";

    if (selectedFile) {
      const path = `${orgId}/knowledge/${id}/${selectedFile.name}`;
      const { error } = await supabase.storage.from("knowledge-files").upload(path, selectedFile, { upsert: true });
      if (error) {
        status = "error";
        toast.warning(`Não consegui enviar o arquivo ao Storage: ${error.message}. Vou salvar o registro para você revisar.`);
      } else {
        fileUrl = path;
      }
    }

    const { error } = await db.from("knowledge_files").insert({
      id,
      organization_id: orgId,
      uploaded_by: user.id,
      name: form.name || selectedFile?.name || "Apostila de Gestão de Projetos",
      file_type: selectedFile?.type || "material",
      file_url: fileUrl,
      description: form.description || null,
      category: form.category || "apostila",
      processing_status: status,
      ai_enabled: form.ai_enabled,
    });

    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Apostila cadastrada na base de conhecimento do agente.");
    setForm({ name: "", description: "", category: "apostila", ai_enabled: true });
    setSelectedFile(null);
    qc.invalidateQueries({ queryKey: ["knowledge-files", orgId] });
  }

  async function toggleAi(file: AnyRow) {
    const { error } = await db.from("knowledge_files").update({ ai_enabled: !file.ai_enabled }).eq("id", file.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["knowledge-files", orgId] });
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary"><BookOpen className="h-6 w-6" /></div>
        <div>
          <h1 className="font-display text-3xl font-bold">Base de Conhecimento do Agente</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">Envie apostilas de Gestão de Projetos para orientar respostas conceituais e sugestões do Assistente. O agente deve usar estes materiais como referência e avisar quando não encontrar informação suficiente.</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card className="p-6">
          <h2 className="font-display text-xl font-semibold">Enviar apostila</h2>
          <form className="mt-5 space-y-4" onSubmit={uploadKnowledge}>
            <div><Label>Nome do material</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Apostila de EAP e Cronograma" /></div>
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="apostila, guia, template..." /></div>
            <div><Label>Descrição para o agente</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Explique quando este material deve ser usado." /></div>
            <div><Label>Arquivo</Label><Input type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.xlsx,.csv" onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.ai_enabled} onChange={(e) => setForm({ ...form, ai_enabled: e.target.checked })} /> Permitir uso pelo agente</label>
            <Button type="submit" disabled={loading || (!form.name.trim() && !selectedFile)}><Upload className="mr-2 h-4 w-4" />{loading ? "Salvando..." : "Salvar apostila"}</Button>
          </form>
        </Card>

        <div className="grid gap-4">
          {files.isLoading && <Card className="p-6 text-sm text-muted-foreground">Carregando materiais...</Card>}
          {!files.isLoading && (files.data ?? []).length === 0 && <Card className="p-10 text-center text-muted-foreground">Nenhuma apostila cadastrada ainda.</Card>}
          {(files.data ?? []).map((file: AnyRow) => (
            <Card key={file.id} className="p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{file.name}</h3><Badge>{file.category}</Badge><Badge variant={file.ai_enabled ? "secondary" : "outline"}>IA {file.ai_enabled ? "habilitada" : "desabilitada"}</Badge><Badge variant="outline">{file.processing_status}</Badge></div>
                  {file.description && <p className="mt-2 text-sm text-muted-foreground">{file.description}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{file.file_type || "material"} · {new Date(file.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <Button variant="outline" onClick={() => toggleAi(file)}>{file.ai_enabled ? "Desabilitar IA" : "Habilitar IA"}</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
