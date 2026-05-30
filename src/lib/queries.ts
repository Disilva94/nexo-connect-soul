import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const orgsQuery = queryOptions({
  queryKey: ["orgs"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
});

export const projectsQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: async () => {
    const { data, error } = await db
      .from("projects")
      .select("id, name, description, objective, status, health, progress, health_reason, budget_planned, budget_actual, start_date, end_date, owner_id, org_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: ["projects", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("projects")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const tasksQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["tasks", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

export const myTasksQuery = queryOptions({
  queryKey: ["my-tasks"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return [];
    const { data, error } = await db
      .from("tasks")
      .select("id, title, status, due_date, project_id, priority")
      .eq("assignee_id", u.user.id)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  },
});

export const orgMembersQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["org-members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("id, user_id, role, created_at")
        .eq("org_id", orgId);
      if (error) throw error;
      return data ?? [];
    },
  });
