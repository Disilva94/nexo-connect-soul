import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { orgsQuery, orgMembersQuery } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brand } from "@/config/brand";

export const Route = createFileRoute("/_authenticated/settings/organization")({
  head: () => ({ meta: [{ title: `Workspace — ${brand.fullName}` }] }),
  component: OrgSettings,
});

function OrgSettings() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data?.[0];
  const members = useQuery({ ...orgMembersQuery(org?.id ?? ""), enabled: !!org?.id });

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="font-display text-3xl font-bold">Workspace</h1>
      <p className="mt-1 text-muted-foreground">Configurações do seu workspace.</p>

      {org && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>{org.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Identificador</dt><dd className="font-mono">{org.slug}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Criado em</dt><dd>{new Date(org.created_at).toLocaleDateString("pt-BR")}</dd></div>
            </dl>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader><CardTitle>Membros</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {members.data?.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border p-3">
              <span className="font-mono text-xs text-muted-foreground">{m.user_id.slice(0, 8)}…</span>
              <Badge variant="secondary">{m.role}</Badge>
            </div>
          ))}
          {members.data?.length === 0 && <p className="text-sm text-muted-foreground">Apenas você por enquanto.</p>}
          <p className="pt-2 text-xs text-muted-foreground">Convidar membros estará disponível em breve.</p>
        </CardContent>
      </Card>
    </div>
  );
}
