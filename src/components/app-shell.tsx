import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CalendarDays, CheckSquare, Files, FolderKanban, LayoutDashboard, ListTodo, LogOut, Settings, Users, BarChart3 } from "lucide-react";
import { brand } from "@/config/brand";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Início", icon: LayoutDashboard },
  { to: "/projects", label: "Projetos", icon: FolderKanban },
  { to: "/tasks", label: "Tarefas", icon: ListTodo },
  { to: "/calendar", label: "Calendário", icon: CalendarDays },
  { to: "/settings/organization", label: "Equipe", icon: Users },
  { to: "/reports", label: "Relatórios", icon: BarChart3 },
  { to: "/approvals", label: "Aprovações", icon: CheckSquare },
  { to: "/files", label: "Arquivos", icon: Files },
  { to: "/settings/organization", label: "Configurações", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="p-6">
          <Link to="/dashboard" className="font-display text-xl font-bold">
            {brand.name} <span className="text-sidebar-primary">Projetos</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={`${item.to}-${item.label}`}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-xs text-sidebar-foreground/60">{user?.email}</p>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
