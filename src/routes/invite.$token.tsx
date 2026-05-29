import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: `Aceitar convite — ${brand.fullName}` }] }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  async function acceptInvite() {
    setAccepting(true);
    setError("");
    const { data, error } = await supabase.functions.invoke("accept-project-invite", { body: { token } });
    setAccepting(false);
    if (error) {
      const message = error.message || "Não foi possível aceitar o convite.";
      setError(message);
      toast.error(message);
      return;
    }
    toast.success("Convite aceito. Você agora tem acesso somente a este projeto.");
    navigate({ to: "/projects/$projectId", params: { projectId: data.project_id } });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-lg p-8 text-center">
        <Link to="/" className="font-display text-2xl font-bold">
          {brand.name} <span className="text-primary">Projetos</span>
        </Link>
        <h1 className="mt-8 font-display text-2xl font-bold">Convite para projeto específico</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Este convite libera acesso somente ao projeto vinculado ao token. Ele não dá acesso ao workspace inteiro nem a outros projetos.
        </p>
        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Validando sessão...</p>
        ) : user ? (
          <Button className="mt-6 w-full" onClick={acceptInvite} disabled={accepting}>
            {accepting ? "Aceitando convite..." : `Aceitar convite como ${user.email}`}
          </Button>
        ) : (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">Faça login ou crie conta com o e-mail convidado para aceitar.</p>
            <Button asChild className="w-full"><Link to="/login">Entrar</Link></Button>
            <Button asChild variant="secondary" className="w-full"><Link to="/signup">Criar conta</Link></Button>
          </div>
        )}
        {error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </Card>
    </div>
  );
}
