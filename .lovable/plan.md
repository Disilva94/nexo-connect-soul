
# Nexo Projetos — Plano de Produto e Arquitetura

Plataforma SaaS multi-tenant de gestão de projetos com Kanban, EAP, riscos, custos, documentos, relatórios e um agente de IA isolado por projeto. Branding (Nexo → eventual Axis) fica em uma camada separada para não impactar arquitetura.

---

## 1. Arquitetura geral do produto

**Stack**
- Frontend: TanStack Start (já no template) + React 19 + Tailwind v4 + shadcn/ui.
- Backend: Lovable Cloud (Supabase) — Postgres + Auth + Storage + RLS.
- Server logic: `createServerFn` do TanStack para operações sensíveis; rotas `src/routes/api/public/*` apenas para webhooks externos.
- IA: Lovable AI Gateway (`google/gemini-3-flash-preview` como default) via AI SDK, chamada a partir de server functions; contexto **escopado por projeto** (nunca cruza projetos/orgs).
- Branding em camada única (`src/config/brand.ts` + tokens em `styles.css`) — trocar Nexo → Axis = editar 1 arquivo + tokens.

**Modelo multi-tenant**
- Tenant raiz = `organization` (workspace). Usuário pertence a 1+ orgs via `organization_members` com role (`owner`, `admin`, `member`, `viewer`).
- Projetos pertencem a 1 organização. Membros de projeto (`project_members`) refinam acesso dentro da org.
- Isolamento garantido por RLS em **todas** as tabelas, sempre via funções `SECURITY DEFINER` (`is_org_member`, `is_project_member`, `has_project_role`) — nunca subquery na própria tabela (evita recursão).

**Camadas lógicas**
```text
UI (rotas TanStack)
  └─ Server Functions (.functions.ts) — validação Zod + auth middleware
       └─ Supabase (auth user client) → RLS
       └─ Supabase admin (somente jobs internos / IA / webhooks)
       └─ AI Gateway (contexto montado a partir do projectId)
```

---

## 2. Estrutura de páginas

Rotas (TanStack file-based, cada rota com `head()` próprio):

**Públicas**
- `/` — landing (hero, features, pricing teaser, CTA).
- `/login`, `/signup`, `/reset-password`.

**Autenticadas (`_authenticated/`)**
- `/dashboard` — visão geral: projetos do usuário, tarefas atribuídas, atrasos, saúde geral.
- `/projects` — lista/filtro de projetos da org ativa.
- `/projects/new` — wizard de criação (nome, objetivo, datas, template).
- `/projects/$projectId` — **shell do projeto** com sub-rotas:
  - `/overview` — saúde, KPIs, próximas entregas, alertas.
  - `/wbs` — EAP (árvore de entregas → pacotes de trabalho).
  - `/board` — Kanban (default do MVP).
  - `/timeline` — Gantt simples (fase 2).
  - `/risks` — registro de riscos (matriz prob × impacto).
  - `/costs` — orçamento vs. realizado.
  - `/documents` — upload (Supabase Storage).
  - `/decisions` — log de decisões.
  - `/changes` — change log do projeto.
  - `/reports` — status reports + exportação.
  - `/lessons` — lições aprendidas (encerramento).
  - `/ai` — chat do agente de IA do projeto.
  - `/settings` — membros, papéis, arquivar/encerrar.
- `/settings/organization` — workspace, membros, billing futuro.
- `/settings/profile`.

**MVP entrega**: `/`, auth, `/dashboard`, `/projects`, `/projects/new`, `/projects/$id/overview`, `/board`, `/settings/organization`.

---

## 3. Estrutura de banco de dados (Supabase)

Tabelas principais (todas com `id uuid pk`, `created_at`, `updated_at`, RLS habilitada e GRANTs explícitos):

| Tabela | Campos-chave | Propósito |
|---|---|---|
| `organizations` | name, slug | Tenant raiz |
| `organization_members` | org_id, user_id, role (`owner/admin/member/viewer`) | Pertencimento à org |
| `profiles` | user_id (fk auth.users), full_name, avatar_url | Perfil leve |
| `projects` | org_id, name, description, status (`planning/active/on_hold/closed`), start_date, end_date, health (`green/yellow/red`), owner_id | Projeto |
| `project_members` | project_id, user_id, role (`manager/contributor/viewer`) | Acesso fino |
| `wbs_nodes` | project_id, parent_id (self-fk), name, type (`deliverable/work_package`), order_index | EAP em árvore |
| `tasks` | project_id, wbs_node_id (nullable), title, description, status (`todo/in_progress/review/done`), priority, assignee_id, due_date, position | Kanban |
| `task_comments` | task_id, author_id, body | Discussão |
| `risks` | project_id, title, probability (1-5), impact (1-5), mitigation, status | Riscos |
| `costs` | project_id, label, planned_amount, actual_amount, currency, incurred_at | Custos |
| `documents` | project_id, name, storage_path, mime, size, uploaded_by | Metadados (arquivo no Storage) |
| `decisions` | project_id, title, context, decision, decided_by, decided_at | Log de decisões |
| `change_log` | project_id, entity_type, entity_id, action, diff jsonb, actor_id | Auditoria |
| `status_reports` | project_id, period_start, period_end, summary, health, generated_by_ai | Relatórios |
| `lessons_learned` | project_id, category, what_worked, what_didnt, recommendation | Encerramento |
| `ai_conversations` | project_id, user_id, title | Sessões do agente |
| `ai_messages` | conversation_id, role, content, tokens, created_at | Mensagens (escopo do projeto) |

Bucket de Storage: `project-documents/{project_id}/...` com policies espelhando RLS.

---

## 4. Regras de segurança e isolamento de dados

**Princípios**
- RLS habilitada em **toda** tabela do schema `public`, com GRANTs explícitos para `authenticated` (e `service_role` para jobs).
- Roles em tabela separada (`organization_members`, `project_members`) — **nunca** em `profiles` (evita escalonamento).
- Funções `SECURITY DEFINER` com `search_path = public` para checagens:
  - `is_org_member(_org uuid, _user uuid) returns boolean`
  - `is_project_member(_project uuid, _user uuid) returns boolean`
  - `has_project_role(_project uuid, _user uuid, _role text) returns boolean`
- Policies padrão por tabela de projeto:
  - SELECT: `is_project_member(project_id, auth.uid())`
  - INSERT/UPDATE/DELETE: `has_project_role(project_id, auth.uid(), 'manager'|'contributor')` conforme regra.
- IA isolada: server function que monta contexto recebe `projectId` e **só** lê dados onde RLS valida o usuário; `ai_messages` carregam `project_id` redundante para policy direta.
- Storage policies: caminho deve começar com `project_id` ao qual o usuário pertença.
- Auth: email/senha + Google (via broker Lovable). HIBP ativado.
- Server functions sensíveis usam `requireSupabaseAuth`; nunca admin client em loader/componente.
- Validação Zod em toda entrada de server function (limites de tamanho, formatos).

**O que nunca deve acontecer**
- Usuário ler dados de projeto que não é membro.
- Cross-tenant leak via IA, relatórios, search ou comments.
- Role definida no client; toda checagem é via função SECURITY DEFINER.

---

## 5. Estratégia do agente de IA por projeto

- 1 agente por projeto, com **contexto estritamente escopado a `project_id`**.
- Server function `chatWithProjectAgent({ projectId, message })`:
  1. `requireSupabaseAuth` + checa `is_project_member`.
  2. Monta contexto: snapshot resumido do projeto (overview, tarefas abertas, atrasadas, riscos top, últimas decisões, marcos próximos) — limitado em tokens.
  3. System prompt define escopo: "Você é o agente do projeto X. Só use dados deste projeto."
  4. Chama AI Gateway (`google/gemini-3-flash-preview`) com `streamText` + tools server-side:
     - `list_overdue_tasks`, `summarize_risks`, `propose_status_report`, `suggest_next_actions`, `draft_lessons_learned`. Cada tool faz query filtrada por `project_id`.
  5. Persiste mensagens em `ai_messages` com `project_id` (RLS valida).
- Sem memória cross-projeto. Cada conversa vive em `ai_conversations` com URL `/projects/$id/ai/$conversationId`.
- Capacidades-alvo: gerar EAP a partir de objetivo, sugerir tarefas a partir de entregas, redigir status report, analisar saúde, propor mitigação de riscos, redigir lições aprendidas no encerramento.

---

## 6. Plano de implementação por fases

**Fase 1 — MVP (vamos implementar agora)**
- Lovable Cloud habilitado.
- Auth: email/senha + Google; `/login`, `/signup`, `/reset-password`.
- Schema: `organizations`, `organization_members`, `profiles`, `projects`, `project_members`, `tasks` + funções SECURITY DEFINER + RLS + GRANTs + trigger de criação automática de org+profile no signup.
- Páginas: `/` (landing simples e impactante), `/dashboard` (meus projetos + minhas tarefas), `/projects`, `/projects/new`, `/projects/$id/overview`, `/projects/$id/board` (Kanban drag-and-drop), `/settings/organization` (membros).
- Branding centralizado em `src/config/brand.ts` + tokens semânticos em `styles.css` (paleta a definir com você).

**Fase 2 — Estrutura de projeto**
- EAP (`wbs_nodes`) com árvore + geração de tarefas a partir de pacotes.
- Riscos, decisões, change log, documentos (Storage).
- Comentários em tarefas, anexos.

**Fase 3 — Controle**
- Custos (orçado vs. realizado).
- Timeline/Gantt simples.
- Status reports manuais + exportação PDF/Markdown.

**Fase 4 — IA**
- Agente por projeto (chat + tools).
- Geração assistida de EAP, status report, lições aprendidas.

**Fase 5 — Operação SaaS**
- Convites por e-mail, billing (Stripe), planos, limites por org, auditoria, notificações.

**Fase 6 — Encerramento e analytics**
- Lições aprendidas formais, dashboard de portfólio, comparativos entre projetos.

---

## 7. Riscos técnicos e recomendações

| Risco | Mitigação |
|---|---|
| Vazamento cross-tenant via RLS mal escrita | Funções SECURITY DEFINER + testes manuais com 2 contas em orgs diferentes a cada fase |
| Recursão infinita em policy | Nunca consultar a própria tabela na policy; sempre via função |
| Custo de IA descontrolado | Limitar tamanho do contexto, cache de snapshots, contador por org |
| IA "alucinar" dados de outro projeto | Tools recebem `projectId` fixo do contexto da sessão; system prompt restritivo |
| Performance do board com muitas tarefas | Paginar/virtualizar; índice em `(project_id, status, position)` |
| Troca de nome Nexo → Axis | Tudo (textos, logo, cores) atrás de `brand.ts` + tokens; sem nome hardcoded em componentes |
| Sessão não hidratada em loaders protegidos | `beforeLoad` com `supabase.auth.getUser()` em rotas autenticadas |
| Storage exposto | Bucket privado + policies por path `project_id/...` |

**Recomendações**
- Adotar uma paleta com identidade forte desde o MVP (sugiro perguntar antes de codar — proponho 3 opções na próxima etapa).
- Manter `change_log` desde a Fase 1 já com hook em mutações principais (barato, salva muito depois).
- Não criar Edge Functions; tudo em `createServerFn`.

---

## Próximo passo

Ao aprovar, eu:
1. Ativo o Lovable Cloud.
2. Pergunto rapidamente paleta + tipografia + tom da landing (3 opções visuais).
3. Crio o schema do MVP com RLS.
4. Construo as páginas da Fase 1 e entrego um app funcional fim-a-fim para autenticar, criar projeto e mover tarefas no Kanban.

Sobre GitHub: a conexão é feita pelo menu do projeto (canto superior direito → GitHub → Connect) — não consigo disparar isso por aqui, mas pode ser feito antes ou depois do MVP sem impacto.
