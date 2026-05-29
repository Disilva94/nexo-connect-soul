# Nexo Projetos — Plano técnico e visual do MVP

## 1. Arquitetura geral do produto

Nexo Projetos será um SaaS multi-tenant baseado em Supabase Auth, banco Postgres com Row Level Security, Supabase Storage para arquivos por projeto e Edge Functions para recursos de IA. A arquitetura separa identidade visual/branding da lógica de domínio por meio de configuração central de marca, permitindo trocar Nexo Projetos por Axis sem alterar o modelo de dados nem as regras de segurança.

Camadas principais:

- Frontend: TanStack Start/React, UI responsiva desktop/tablet, sidebar global, topbar contextual e abas por projeto.
- Autenticação: Supabase Auth com perfil e workspace pessoal criado no cadastro.
- Multi-tenancy: organizações, membros de organização, projetos e membros de projeto.
- Domínio de projetos: projetos, EAP, tarefas, riscos, custos, documentos, relatórios, encerramento e histórico de IA.
- Documentos: metadados no banco sempre com `project_id`; objetos no Storage por caminho `organization_id/project_id/document_id/...`.
- IA por projeto: Edge Function autenticada, read-only por padrão, recebendo sempre `project_id` e buscando apenas dados, documentos e conversas desse projeto.

## 2. Estrutura de páginas

Rotas globais do MVP:

- `/login`: login.
- `/signup`: cadastro.
- `/dashboard`: indicadores globais, prazos, riscos e projetos recentes.
- `/projects`: lista e criação de projetos.
- `/projects/$projectId`: área do projeto com abas progressivas.
- `/settings/organization`: configurações básicas de workspace.

Abas internas do projeto no MVP:

- Visão geral.
- EAP.
- Kanban.
- Tabela.
- Cronograma.
- Riscos.
- Custos.
- Documentos.
- IA do Projeto.
- Relatórios.
- Encerramento.

Abas planejadas para fases seguintes:

- Stakeholders.
- Comunicação.
- Mudanças.
- Automações avançadas.
- Integrações.

## 3. Estrutura de banco de dados no Supabase

Tabelas base já existentes:

- `profiles`.
- `organizations`.
- `organization_members`.
- `projects`.
- `project_members`.
- `tasks`.

Extensões do MVP:

- `projects`: objetivo, prioridade, progresso, orçamento planejado/real, motivo da saúde, escopo, justificativa, premissas, restrições, critérios de sucesso, entregas principais e campos de encerramento.
- `tasks`: vínculo com EAP (`wbs_item_id`), datas de início/fim, motivo de bloqueio, progresso, conclusão, comentário e custo estimado.
- `wbs_items`: árvore Projeto → Fases → Entregas/Pacotes → Tarefas, sempre com `project_id`.
- `risks`: riscos por projeto com probabilidade, impacto, nível calculado, ação preventiva e plano de resposta.
- `costs`: custos planejados e reais por projeto.
- `project_documents`: documentos e links por projeto, sempre com `project_id NOT NULL`.
- `document_chunks`: chunks RAG por documento e projeto, com restrição de consistência entre `document_id` e `project_id`.
- `ai_conversations`: conversas por `project_id` e `user_id`.
- `ai_messages`: mensagens por conversa, projeto e usuário.
- `project_reports`: relatórios por projeto.
- `lessons_learned`: lições aprendidas por projeto.
- `stakeholders` e `change_requests`: schema preparado para evolução, sem UI avançada no MVP.

## 4. Regras de segurança e isolamento de dados

Regras mandatórias:

- RLS habilitado em todas as tabelas.
- Usuário acessa organizações apenas quando é membro.
- Usuário acessa projetos quando é membro direto ou administrador/dono da organização.
- Todas as tabelas operacionais específicas de projeto usam `project_id NOT NULL`.
- Políticas de RLS em tabelas operacionais validam `public.is_project_member(project_id, auth.uid())`.
- Escrita em dados críticos exige papel de gerente ou colaborador do projeto.
- Exclusão de dados sensíveis fica restrita a gerente.
- Documentos, chunks, conversas e mensagens de IA nunca são consultados sem `project_id`.
- O frontend filtra por projeto para UX, mas a segurança real fica no banco e na Edge Function.
- Storage deve usar caminhos por organização/projeto/documento e políticas que validem membership antes de entregar arquivos.

## 5. Estratégia do agente de IA por projeto

O Assistente do Projeto será implementado por Edge Function para nunca expor chaves no frontend. A função receberá `project_id`, `conversation_id` opcional e mensagem do usuário.

Fluxo seguro:

1. Validar JWT e obter usuário autenticado.
2. Validar que `project_id` existe e que o usuário tem permissão via `is_project_member`.
3. Buscar contexto estruturado apenas com `.eq('project_id', project_id)`.
4. Buscar documentos/chunks apenas com `.eq('project_id', project_id)` e `ai_enabled = true`.
5. Montar prompt interno com regra: “Use apenas informações do projeto atual. Se a informação não estiver disponível no contexto, diga que não sabe.”
6. Registrar conversa e mensagens com `project_id` e `user_id`.
7. Retornar resposta separando dados cadastrados, dados de documentos e sugestões de IA.

No MVP, a UI e o histórico já ficam preparados, e a Edge Function pode retornar uma resposta estruturada local quando a chave de IA ainda não estiver configurada.

## 6. Plano de implementação por fases

Fase 1 — MVP seguro e navegável:

- Autenticação.
- Dashboard geral.
- CRUD básico de projetos.
- Abas do projeto.
- EAP em árvore.
- Kanban com status incluindo bloqueado.
- Tabela de tarefas.
- Cronograma simples.
- Riscos e custos básicos.
- Registro de documentos por projeto.
- IA do Projeto preparada via Edge Function e histórico isolado.
- Relatório de status e encerramento simples.
- RLS em todas as novas tabelas.

Fase 2 — Profundidade operacional:

- Upload real com processamento assíncrono.
- Extração de texto, chunking e embeddings.
- Comentários, anexos por tarefa e notificações internas.
- Stakeholders, comunicação e mudanças com UI completa.
- Cálculos automáticos via triggers ou jobs.

Fase 3 — Produto SaaS comercial:

- Billing.
- Planos e limites.
- Templates de projetos.
- Exportações PDF/CSV.
- Integrações externas.
- Auditoria e trilha de alterações.

Fase 4 — IA avançada:

- RAG vetorial com filtros obrigatórios por projeto.
- Sugestões com aprovação explícita.
- Agente de relatório executivo.
- Detecção de riscos e atrasos por documentos e cronograma.

## 7. Riscos técnicos e recomendações

- Risco de vazamento cross-project: mitigar com `project_id NOT NULL`, RLS, Edge Function autenticada e testes de isolamento.
- Risco de políticas recursivas em RLS: centralizar validações em funções `SECURITY DEFINER` bem auditadas.
- Risco de IA inventar dados: prompt restritivo, contexto explícito e resposta com seções por fonte.
- Risco de custo alto com embeddings: processar apenas documentos com `ai_enabled`, limitar tamanho e usar filas.
- Risco de UX ficar complexa: usar disclosure progressivo, abas claras e ações primárias por tela.
- Risco de schema engessar branding: manter marca em configuração central e evitar nomes de marca no schema.

## 8. Complemento — criação inteligente e convites por projeto

A criação inteligente passa a usar um assistente em etapas:

1. Informações básicas do projeto.
2. Documentos do projeto, mantidos em estado de prévia e gravados apenas após existir `project_id`.
3. Participantes do projeto por e-mail, com papel específico do projeto.
4. Geração da estrutura com IA via Edge Function segura.
5. Prévia editável antes de criar registros definitivos.

A Edge Function de geração inteligente recebe somente os dados do formulário, documentos listados para o projeto em criação, participantes informados e contexto do workspace autorizado. Ela grava a prévia em `smart_project_previews` e retorna JSON estruturado com visão geral, EAP, tarefas, cronograma, organograma, riscos, stakeholders, comunicação, checklist e relatório inicial. Nenhum registro definitivo de projeto, EAP, tarefa, risco ou convite é criado antes da confirmação explícita do usuário.

Convites são sempre específicos de projeto:

- `project_invitations.project_id` é obrigatório.
- O convidado aceito entra em `project_members`, não em `organization_members`.
- O papel do projeto não concede acesso ao workspace inteiro.
- Tokens são únicos, expiram em 7 dias e só podem ser aceitos pelo e-mail convidado.
- Edge Functions validam autenticação e permissão de gerente antes de criar convite ou aceitar token.

Essa abordagem preserva a regra central do produto: cada projeto tem contexto, documentos, IA, participantes e permissões isolados por `project_id`.
