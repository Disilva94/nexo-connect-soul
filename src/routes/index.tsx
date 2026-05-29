import { createFileRoute, Link } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { ArrowRight, KanbanSquare, ListChecks, Shield, Sparkles, GitBranch, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${brand.fullName} — ${brand.tagline}` },
      { name: "description", content: brand.description },
    ],
  }),
  component: LandingPage,
});

const features = [
  { icon: KanbanSquare, title: "Kanban claro", desc: "Veja o que está em andamento, em revisão e concluído em uma única tela." },
  { icon: ListChecks, title: "EAP e entregas", desc: "Quebre o projeto em entregas e pacotes de trabalho — depois vire tarefas." },
  { icon: GitBranch, title: "Riscos e decisões", desc: "Registre o que pode atrasar e o que foi decidido. Memória do projeto." },
  { icon: BarChart3, title: "Saúde em tempo real", desc: "Health visual por projeto: verde, amarelo, vermelho — sem planilhas." },
  { icon: Sparkles, title: "Agente de IA por projeto", desc: "Um copiloto isolado por projeto: analisa, sugere ações, redige relatórios." },
  { icon: Shield, title: "Isolamento por workspace", desc: "Cada workspace é estanque. Dados nunca vazam entre projetos ou times." },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">
            <span className="text-primary">{brand.name}</span>
            <span className="ml-1 text-muted-foreground">Projetos</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Entrar
            </Link>
            <Button asChild size="sm">
              <Link to="/signup">Começar grátis</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Novo: agente de IA por projeto
          </div>
          <h1 className="mt-6 font-display text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            Projetos sob controle.<br />
            <span className="text-primary">Sem planilha, sem caos.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {brand.description}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">
                Criar minha conta <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Já tenho conta</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            O que precisa ser feito, quem responde, o que está atrasado.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Respostas rápidas para as perguntas que importam em qualquer projeto.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border border-border/60 bg-card p-6 transition-all hover:border-accent/60 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">
            Comece em menos de um minuto.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Workspace pessoal criado automaticamente. Sem cartão de crédito.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/signup">
              Criar conta gratuita <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {brand.fullName}
      </footer>
    </div>
  );
}
