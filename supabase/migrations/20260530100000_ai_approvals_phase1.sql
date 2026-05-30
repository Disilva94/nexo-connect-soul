-- Phase 1: safe AI copilot outputs, pending approvals and action logs.

DO $$ BEGIN
  CREATE TYPE public.ai_output_type AS ENUM ('task_suggestion', 'meeting_suggestion', 'wbs_suggestion', 'risk_suggestion', 'timeline_suggestion', 'email_draft', 'calendar_event_draft', 'reminder_draft', 'report_draft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.ai_output_status AS ENUM ('draft', 'approved', 'discarded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.pending_approval_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.ai_action_result AS ENUM ('pending', 'success', 'error', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'common',
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS public.ai_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  type public.ai_output_type NOT NULL,
  status public.ai_output_status NOT NULL DEFAULT 'draft',
  content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_project_status ON public.ai_outputs(project_id, status, created_at DESC);
ALTER TABLE public.ai_outputs ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_ai_outputs_updated_at ON public.ai_outputs;
CREATE TRIGGER trg_ai_outputs_updated_at BEFORE UPDATE ON public.ai_outputs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.pending_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ai_output_id UUID REFERENCES public.ai_outputs(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approval_type public.ai_output_type NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  status public.pending_approval_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_project_status ON public.pending_approvals(project_id, status, created_at DESC);
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_pending_approvals_updated_at ON public.pending_approvals;
CREATE TRIGGER trg_pending_approvals_updated_at BEFORE UPDATE ON public.pending_approvals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.ai_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ai_output_id UUID REFERENCES public.ai_outputs(id) ON DELETE SET NULL,
  pending_approval_id UUID REFERENCES public.pending_approvals(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  result public.ai_action_result NOT NULL DEFAULT 'pending',
  command TEXT,
  interpretation TEXT,
  error_message TEXT,
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_project ON public.ai_action_logs(project_id, created_at DESC);
ALTER TABLE public.ai_action_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_outputs, public.pending_approvals, public.ai_action_logs TO authenticated;
GRANT ALL ON public.ai_outputs, public.pending_approvals, public.ai_action_logs TO service_role;

CREATE POLICY "Project members see ai outputs" ON public.ai_outputs
  FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members create ai outputs" ON public.ai_outputs
  FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Project contributors update ai outputs" ON public.ai_outputs
  FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete ai outputs" ON public.ai_outputs
  FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE POLICY "Project members see pending approvals" ON public.pending_approvals
  FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members create pending approvals" ON public.pending_approvals
  FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()) AND requested_by = auth.uid());
CREATE POLICY "Project contributors update pending approvals" ON public.pending_approvals
  FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete pending approvals" ON public.pending_approvals
  FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE POLICY "Project members see ai action logs" ON public.ai_action_logs
  FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members create ai action logs" ON public.ai_action_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Service role manages ai action logs" ON public.ai_action_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
