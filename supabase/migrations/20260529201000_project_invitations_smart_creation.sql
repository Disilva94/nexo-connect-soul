-- Project-scoped invitations and smart project creation preview support.

ALTER TYPE public.project_role ADD VALUE IF NOT EXISTS 'client';
ALTER TYPE public.project_role ADD VALUE IF NOT EXISTS 'professor';
ALTER TYPE public.project_role ADD VALUE IF NOT EXISTS 'observer';

DO $$ BEGIN
  CREATE TYPE public.project_invitation_status AS ENUM ('pending', 'accepted', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.project_member_status AS ENUM ('active', 'inactive', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.smart_preview_status AS ENUM ('draft', 'generated', 'approved', 'discarded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invitation_id UUID,
  ADD COLUMN IF NOT EXISTS status public.project_member_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_project_members_updated_at ON public.project_members;
CREATE TRIGGER trg_project_members_updated_at BEFORE UPDATE ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_email TEXT NOT NULL,
  invited_name TEXT,
  role public.project_role NOT NULL DEFAULT 'contributor',
  token TEXT NOT NULL UNIQUE,
  status public.project_invitation_status NOT NULL DEFAULT 'pending',
  message TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_invitations_email_lower CHECK (invited_email = lower(invited_email)),
  CONSTRAINT project_invitations_not_expired_on_create CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_project_invitations_project ON public.project_invitations(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON public.project_invitations(invited_email, status);
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_project_invitations_updated_at ON public.project_invitations;
CREATE TRIGGER trg_project_invitations_updated_at BEFORE UPDATE ON public.project_invitations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_invitation_id_fkey;
ALTER TABLE public.project_members
  ADD CONSTRAINT project_members_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.project_invitations(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.smart_project_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.smart_preview_status NOT NULL DEFAULT 'draft',
  input JSONB NOT NULL DEFAULT '{}',
  generated_structure JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_smart_project_previews_user ON public.smart_project_previews(created_by, created_at DESC);
ALTER TABLE public.smart_project_previews ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_smart_project_previews_updated_at ON public.smart_project_previews;
CREATE TRIGGER trg_smart_project_previews_updated_at BEFORE UPDATE ON public.smart_project_previews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.communication_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  audience TEXT NOT NULL,
  subject TEXT NOT NULL,
  channel TEXT,
  frequency TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_communication_plan_project ON public.communication_plan_items(project_id);
ALTER TABLE public.communication_plan_items ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_communication_plan_items_updated_at ON public.communication_plan_items;
CREATE TRIGGER trg_communication_plan_items_updated_at BEFORE UPDATE ON public.communication_plan_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.project_org_chart_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.project_org_chart_nodes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  person_name TEXT,
  responsibilities TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_org_chart_project ON public.project_org_chart_nodes(project_id, parent_id, order_index);
ALTER TABLE public.project_org_chart_nodes ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_project_org_chart_nodes_updated_at ON public.project_org_chart_nodes;
CREATE TRIGGER trg_project_org_chart_nodes_updated_at BEFORE UPDATE ON public.project_org_chart_nodes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_invitations, public.smart_project_previews, public.communication_plan_items, public.project_org_chart_nodes TO authenticated;
GRANT ALL ON public.project_invitations, public.smart_project_previews, public.communication_plan_items, public.project_org_chart_nodes TO service_role;

CREATE POLICY "Project managers see invitations" ON public.project_invitations
  FOR SELECT TO authenticated USING (
    public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[])
    OR invited_email = lower((auth.jwt()->>'email')::text)
  );
CREATE POLICY "Project managers create invitations" ON public.project_invitations
  FOR INSERT TO authenticated WITH CHECK (
    project_id IS NOT NULL
    AND invited_by = auth.uid()
    AND public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[])
  );
CREATE POLICY "Project managers cancel invitations" ON public.project_invitations
  FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));
CREATE POLICY "Service role manages invitations" ON public.project_invitations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users manage own smart previews" ON public.smart_project_previews
  FOR ALL TO authenticated
  USING (created_by = auth.uid() AND public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (created_by = auth.uid() AND public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Project members see communication plan" ON public.communication_plan_items
  FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project contributors create communication plan" ON public.communication_plan_items
  FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project contributors update communication plan" ON public.communication_plan_items
  FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete communication plan" ON public.communication_plan_items
  FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE POLICY "Project members see org chart" ON public.project_org_chart_nodes
  FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project contributors create org chart" ON public.project_org_chart_nodes
  FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project contributors update org chart" ON public.project_org_chart_nodes
  FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager','contributor']::public.project_role[]));
CREATE POLICY "Project managers delete org chart" ON public.project_org_chart_nodes
  FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), ARRAY['manager']::public.project_role[]));

CREATE OR REPLACE FUNCTION public.accept_project_invitation(_token TEXT, _user UUID, _email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invitation public.project_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_invitation
  FROM public.project_invitations
  WHERE token = _token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
  IF v_invitation.status = 'cancelled' THEN
    RAISE EXCEPTION 'invite_cancelled';
  END IF;
  IF v_invitation.status = 'expired' OR v_invitation.expires_at < now() THEN
    UPDATE public.project_invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'invite_expired';
  END IF;
  IF lower(_email) <> v_invitation.invited_email THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  INSERT INTO public.project_members (project_id, user_id, role, invited_by, invitation_id, status)
  VALUES (v_invitation.project_id, _user, v_invitation.role, v_invitation.invited_by, v_invitation.id, 'active')
  ON CONFLICT (project_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        invited_by = EXCLUDED.invited_by,
        invitation_id = EXCLUDED.invitation_id,
        status = 'active',
        updated_at = now();

  UPDATE public.project_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN v_invitation.project_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_project_invitation(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_project_invitation(TEXT, UUID, TEXT) TO authenticated, service_role;
