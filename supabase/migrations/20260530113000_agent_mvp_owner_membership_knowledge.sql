-- Agent MVP fixes: ensure creators become project managers and add knowledge-base tables.

-- A newly-created project must be readable/editable by its creator immediately.
-- Previous RLS required project_members membership, but no member row existed yet.
CREATE OR REPLACE FUNCTION public.ensure_project_owner_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role, status)
  VALUES (NEW.id, NEW.owner_id, 'manager', 'active')
  ON CONFLICT (project_id, user_id) DO UPDATE
    SET role = CASE
      WHEN public.project_members.role = 'manager' THEN public.project_members.role
      ELSE EXCLUDED.role
    END,
    status = 'active';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_project_owner_member ON public.projects;
CREATE TRIGGER trg_ensure_project_owner_member
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.ensure_project_owner_member();

-- Backfill access for projects created before the trigger existed.
INSERT INTO public.project_members (project_id, user_id, role, status)
SELECT p.id, p.owner_id, 'manager', 'active'
FROM public.projects p
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_members pm
  WHERE pm.project_id = p.id AND pm.user_id = p.owner_id
)
ON CONFLICT (project_id, user_id) DO NOTHING;

DO $$ BEGIN
  CREATE TYPE public.knowledge_processing_status AS ENUM ('pending', 'processing', 'processed', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.knowledge_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  file_type TEXT,
  file_url TEXT,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'apostila',
  processing_status public.knowledge_processing_status NOT NULL DEFAULT 'pending',
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_files_org ON public.knowledge_files(organization_id, ai_enabled, created_at DESC);
ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_knowledge_files_updated_at ON public.knowledge_files;
CREATE TRIGGER trg_knowledge_files_updated_at BEFORE UPDATE ON public.knowledge_files
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_file_id UUID NOT NULL REFERENCES public.knowledge_files(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_file ON public.knowledge_sources(knowledge_file_id, created_at);
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_files, public.knowledge_sources TO authenticated;
GRANT ALL ON public.knowledge_files, public.knowledge_sources TO service_role;

DROP POLICY IF EXISTS "Org admins manage knowledge files" ON public.knowledge_files;
CREATE POLICY "Org admins manage knowledge files" ON public.knowledge_files
  FOR ALL TO authenticated
  USING (organization_id IS NULL OR public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (uploaded_by = auth.uid() AND (organization_id IS NULL OR public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])));

DROP POLICY IF EXISTS "Org members read enabled knowledge files" ON public.knowledge_files;
CREATE POLICY "Org members read enabled knowledge files" ON public.knowledge_files
  FOR SELECT TO authenticated
  USING (ai_enabled = true AND (organization_id IS NULL OR public.is_org_member(organization_id, auth.uid())));

DROP POLICY IF EXISTS "Org admins manage knowledge sources" ON public.knowledge_sources;
CREATE POLICY "Org admins manage knowledge sources" ON public.knowledge_sources
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.knowledge_files k
    WHERE k.id = knowledge_file_id
      AND (k.organization_id IS NULL OR public.has_org_role(k.organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.knowledge_files k
    WHERE k.id = knowledge_file_id
      AND (k.organization_id IS NULL OR public.has_org_role(k.organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  ));

DROP POLICY IF EXISTS "Org members read enabled knowledge sources" ON public.knowledge_sources;
CREATE POLICY "Org members read enabled knowledge sources" ON public.knowledge_sources
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.knowledge_files k
    WHERE k.id = knowledge_file_id
      AND k.ai_enabled = true
      AND (k.organization_id IS NULL OR public.is_org_member(k.organization_id, auth.uid()))
  ));

CREATE OR REPLACE FUNCTION public.ensure_current_user_project_owner_member(_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT owner_id INTO v_owner FROM public.projects WHERE id = _project_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not_project_owner';
  END IF;

  INSERT INTO public.project_members (project_id, user_id, role, status)
  VALUES (_project_id, auth.uid(), 'manager', 'active')
  ON CONFLICT (project_id, user_id) DO UPDATE
    SET role = CASE
      WHEN public.project_members.role = 'manager' THEN public.project_members.role
      ELSE EXCLUDED.role
    END,
    status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_current_user_project_owner_member(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.try_parse_uuid(value TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN value::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Storage buckets used by project documents and administrator knowledge files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false), ('knowledge-files', 'knowledge-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Project members upload project documents" ON storage.objects;
CREATE POLICY "Project members upload project documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND public.is_org_member(public.try_parse_uuid((storage.foldername(name))[1]), auth.uid())
  );

DROP POLICY IF EXISTS "Project members read project documents" ON storage.objects;
CREATE POLICY "Project members read project documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.is_project_member(public.try_parse_uuid((storage.foldername(name))[2]), auth.uid())
  );

DROP POLICY IF EXISTS "Org admins manage knowledge files storage" ON storage.objects;
CREATE POLICY "Org admins manage knowledge files storage" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'knowledge-files'
    AND public.has_org_role(public.try_parse_uuid((storage.foldername(name))[1]), auth.uid(), ARRAY['owner','admin']::public.org_role[])
  )
  WITH CHECK (
    bucket_id = 'knowledge-files'
    AND public.has_org_role(public.try_parse_uuid((storage.foldername(name))[1]), auth.uid(), ARRAY['owner','admin']::public.org_role[])
  );
