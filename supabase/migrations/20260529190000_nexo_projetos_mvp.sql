-- Nexo Projetos MVP domain expansion: WBS, risks, costs, documents, AI history and reports.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'blocked';

DO $$ BEGIN
  CREATE TYPE public.wbs_item_type AS ENUM ('project', 'phase', 'package', 'task');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.risk_probability AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.risk_impact AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.risk_level AS ENUM ('low', 'medium', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.risk_status AS ENUM ('open', 'monitoring', 'mitigated', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.cost_category AS ENUM ('people', 'tools', 'materials', 'vendors', 'marketing', 'transport', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.document_processing_status AS ENUM ('pending', 'processing', 'processed', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.ai_message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.report_type AS ENUM ('status', 'academic', 'closure');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS priority public.task_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  ADD COLUMN IF NOT EXISTS health_reason TEXT,
  ADD COLUMN IF NOT EXISTS budget_planned NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_actual NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS justification TEXT,
  ADD COLUMN IF NOT EXISTS assumptions TEXT,
  ADD COLUMN IF NOT EXISTS constraints_text TEXT,
  ADD COLUMN IF NOT EXISTS success_criteria TEXT,
  ADD COLUMN IF NOT EXISTS main_deliverables TEXT,
  ADD COLUMN IF NOT EXISTS final_deliverables TEXT,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS lessons_summary TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.wbs_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.wbs_items(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  type public.wbs_item_type NOT NULL DEFAULT 'package',
  weight NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status public.task_status NOT NULL DEFAULT 'todo',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date DATE,
  due_date DATE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_wbs_items_project_parent ON public.wbs_items(project_id, parent_id, order_index);
ALTER TABLE public.wbs_items ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_wbs_items_updated_at ON public.wbs_items;
CREATE TRIGGER trg_wbs_items_updated_at BEFORE UPDATE ON public.wbs_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS wbs_item_id UUID REFERENCES public.wbs_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  ADD COLUMN IF NOT EXISTS comments_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachments_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_tasks_project_wbs ON public.tasks(project_id, wbs_item_id);

CREATE TABLE IF NOT EXISTS public.risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  probability public.risk_probability NOT NULL DEFAULT 'medium',
  impact public.risk_impact NOT NULL DEFAULT 'medium',
  level public.risk_level NOT NULL DEFAULT 'low',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  preventive_action TEXT,
  response_plan TEXT,
  status public.risk_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_risks_project_level ON public.risks(project_id, level, status);
ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_risks_updated_at ON public.risks;
CREATE TRIGGER trg_risks_updated_at BEFORE UPDATE ON public.risks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category public.cost_category NOT NULL DEFAULT 'other',
  planned_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_costs_project_date ON public.costs(project_id, date DESC);
ALTER TABLE public.costs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  organization TEXT,
  role TEXT,
  influence TEXT,
  interest TEXT,
  communication_channel TEXT,
  communication_frequency TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stakeholders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reason TEXT,
  scope_impact TEXT,
  schedule_impact TEXT,
  cost_impact TEXT,
  quality_impact TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_change_requests_updated_at ON public.change_requests;
CREATE TRIGGER trg_change_requests_updated_at BEFORE UPDATE ON public.change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_url TEXT,
  description TEXT,
  processing_status public.document_processing_status NOT NULL DEFAULT 'pending',
  ai_enabled BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON public.project_documents(project_id, created_at DESC);
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_project_documents_updated_at ON public.project_documents;
CREATE TRIGGER trg_project_documents_updated_at BEFORE UPDATE ON public.project_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.project_documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_chunks_project_document ON public.document_chunks(project_id, document_id);
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Conversa com Assistente do Projeto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_project_user ON public.ai_conversations(project_id, user_id, updated_at DESC);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_ai_conversations_updated_at ON public.ai_conversations;
CREATE TRIGGER trg_ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role public.ai_message_role NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON public.ai_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_messages_project ON public.ai_messages(project_id, created_at DESC);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.project_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type public.report_type NOT NULL DEFAULT 'status',
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.lessons_learned (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lessons_learned ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.document_chunk_project_matches()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.project_documents d
    WHERE d.id = NEW.document_id AND d.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'document chunk project_id must match document project_id';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_chunk_project_matches ON public.document_chunks;
CREATE TRIGGER trg_document_chunk_project_matches
BEFORE INSERT OR UPDATE ON public.document_chunks
FOR EACH ROW EXECUTE FUNCTION public.document_chunk_project_matches();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wbs_items, public.risks, public.costs, public.stakeholders, public.change_requests, public.project_documents, public.document_chunks, public.ai_conversations, public.ai_messages, public.project_reports, public.lessons_learned TO authenticated;
GRANT ALL ON public.wbs_items, public.risks, public.costs, public.stakeholders, public.change_requests, public.project_documents, public.document_chunks, public.ai_conversations, public.ai_messages, public.project_reports, public.lessons_learned TO service_role;

-- Generic project-scoped RLS policies.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['wbs_items','risks','costs','stakeholders','change_requests','project_documents','document_chunks','ai_conversations','ai_messages','project_reports','lessons_learned'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Project members see %1$s" ON public.%1$I', tbl);
    EXECUTE format('CREATE POLICY "Project members see %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()))', tbl);
  END LOOP;
END $$;

CREATE POLICY "Project contributors create wbs" ON public.wbs_items FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project contributors update wbs" ON public.wbs_items FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete wbs" ON public.wbs_items FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE POLICY "Project contributors create risks" ON public.risks FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project contributors update risks" ON public.risks FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete risks" ON public.risks FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE POLICY "Project contributors create costs" ON public.costs FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project contributors update costs" ON public.costs FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete costs" ON public.costs FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE POLICY "Project contributors create documents" ON public.project_documents FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]) AND uploaded_by = auth.uid());
CREATE POLICY "Project contributors update documents" ON public.project_documents FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete documents" ON public.project_documents FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE POLICY "Service role manages chunks" ON public.document_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users create own project ai conversations" ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Users update own project ai conversations" ON public.ai_conversations FOR UPDATE TO authenticated USING (public.is_project_member(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Users delete own project ai conversations" ON public.ai_conversations FOR DELETE TO authenticated USING (public.is_project_member(project_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Users create own ai messages" ON public.ai_messages FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()) AND (user_id = auth.uid() OR role = 'assistant'));
CREATE POLICY "Service role manages ai messages" ON public.ai_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Project contributors create reports" ON public.project_reports FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project contributors update reports" ON public.project_reports FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete reports" ON public.project_reports FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE POLICY "Project contributors create lessons" ON public.lessons_learned FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project contributors update lessons" ON public.lessons_learned FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete lessons" ON public.lessons_learned FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE POLICY "Project contributors create stakeholders" ON public.stakeholders FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project contributors update stakeholders" ON public.stakeholders FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete stakeholders" ON public.stakeholders FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE POLICY "Project contributors create changes" ON public.change_requests FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project contributors update changes" ON public.change_requests FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete changes" ON public.change_requests FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE OR REPLACE FUNCTION public.recalculate_project_progress(_project_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  weighted_progress NUMERIC;
  task_progress NUMERIC;
BEGIN
  SELECT COALESCE(SUM((weight / 100.0) * progress), 0)
  INTO weighted_progress
  FROM public.wbs_items
  WHERE project_id = _project_id AND parent_id IS NULL AND type = 'phase';

  SELECT COALESCE(AVG(progress), 0)
  INTO task_progress
  FROM public.tasks
  WHERE project_id = _project_id;

  UPDATE public.projects
  SET progress = LEAST(100, GREATEST(0, ROUND(CASE WHEN weighted_progress > 0 THEN weighted_progress ELSE task_progress END)::INTEGER))
  WHERE id = _project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_task_status_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status::text = 'done' THEN
    NEW.progress := 100;
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSIF NEW.status::text = 'blocked' AND COALESCE(NEW.blocked_reason, '') = '' THEN
    RAISE EXCEPTION 'blocked tasks require blocked_reason';
  ELSIF NEW.status::text <> 'done' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_task_status_fields ON public.tasks;
CREATE TRIGGER trg_sync_task_status_fields
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_task_status_fields();

REVOKE EXECUTE ON FUNCTION public.document_chunk_project_matches() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_project_progress(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_task_status_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_project_progress(UUID) TO authenticated;
