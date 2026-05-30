# Nexus — Plano técnico e visual do MVP do Agente de IA de Gestão de Projetos

> Status: planejamento aprovado/pendente de validação. Este documento não implementa novas automações. Ele define a ordem segura de construção para evitar que o agente crie tarefas, reuniões, e-mails, lembretes ou eventos de agenda sem aprovação humana.

## 1. Resumo do entendimento

A Nexus deve ser uma plataforma simples de gestão de projetos para usuários não técnicos, combinando a clareza visual de Trello, Monday, Notion e Linear com um copiloto de gestão de projetos. O agente deve ajudar o usuário a organizar ideias em objetivo, escopo, EAP, tarefas, cronograma, riscos, reuniões, lembretes, convites e relatórios, mas sempre como **sugestões revisáveis**.

Regra principal: o agente entende o pedido, identifica dados faltantes, prepara um rascunho, mostra um resumo e só executa qualquer ação depois de aprovação humana explícita.

## 2. Arquitetura simples da solução

### 2.1 Frontend Lovable/React

- Interface guiada para usuários leigos.
- Sidebar com áreas principais: Dashboard, Projetos, Tarefas, Calendário, Aprovações, Arquivos, Conhecimento e Configurações.
- Detalhe do projeto com abas progressivas: Visão geral, Kanban, Cronograma, Reuniões, Assistente, Aprovações, Documentos e Relatórios.
- Componentes pequenos e reaproveitáveis, evitando telas poluídas.

### 2.2 Supabase Database

- Postgres com RLS em todas as tabelas operacionais.
- Dados sempre isolados por `project_id` quando forem específicos de projeto.
- Ações preparadas pela IA ficam em tabelas de rascunho/aprovação antes de criar registros definitivos.

### 2.3 Supabase Edge Functions

- Toda ação sensível passa por função backend autenticada.
- Chaves de IA, e-mail e Google ficam em secrets, nunca no frontend.
- Funções validam usuário, projeto, papel/permissão e `project_id` antes de consultar ou executar.

### 2.4 Storage

- Documentos do projeto em paths por organização/projeto.
- Apostilas do agente em bucket próprio de conhecimento.
- Futuro processamento: extração de texto, chunks e busca semântica.

## 3. Fluxo do usuário

### 3.1 Criar projeto com IA

1. Usuário clica em **Criar projeto com IA**.
2. Informa nome, descrição, objetivo, prazo, participantes e documentos.
3. Agente gera uma prévia com EAP, tarefas, cronograma, riscos e relatório inicial.
4. Usuário revisa e escolhe **Aprovar e salvar**, **Editar antes de salvar** ou **Descartar**.
5. Apenas após aprovação, a Nexus cria registros definitivos vinculados ao `project_id`.

### 3.2 Usar o Assistente do Projeto

1. Usuário entra em um projeto.
2. Abre **Assistente do Projeto**.
3. Digita um comando natural, por exemplo: “Crie uma reunião amanhã às 19h com Marcos”.
4. O agente identifica intenção, dados fornecidos e dados faltantes.
5. O agente mostra um resumo: título, data, horário, participantes, ações opcionais e riscos de falta de dados.
6. A ação vai para **Aprovações Pendentes**.
7. O usuário aprova, edita ou recusa.

### 3.3 Reuniões, e-mails e agenda

- Reunião começa como tarefa do tipo `meeting`.
- E-mail de convite começa como `email_draft`.
- Evento de Google Calendar começa como `calendar_event_draft`.
- Lembrete começa como `reminder_draft`.
- Nada é enviado, criado na agenda ou ativado sem confirmação.

## 4. Mapa das telas

### 4.1 Dashboard geral

- Projetos ativos.
- Tarefas próximas do prazo.
- Reuniões próximas.
- Aprovações pendentes.
- Alertas de riscos e atrasos.

### 4.2 Lista de projetos

- Cards simples dos projetos.
- Botão **Criar projeto com IA**.
- Estado vazio com orientação clara.

### 4.3 Detalhe do projeto

Abas recomendadas para MVP:

- Visão geral.
- Kanban.
- Tarefas.
- Cronograma.
- Reuniões.
- Assistente do Projeto.
- Aprovações.
- Documentos.
- Relatórios.

### 4.4 Tarefas/Kanban

- Colunas: A fazer, Em andamento, Em revisão, Concluído e Atrasado.
- Card com título, responsável, prazo, prioridade e tipo.
- Modal de tarefa com campos principais e campos extras quando tipo for reunião.

### 4.5 Reuniões do Projeto

- Próximas reuniões.
- Reuniões concluídas.
- Reuniões sem data.
- Reuniões sem convidados.
- Reuniões aguardando confirmação.
- Reuniões sincronizadas com Google Agenda.

### 4.6 Aprovações Pendentes

- Lista de ações preparadas pela IA.
- Botões: Aprovar, Editar, Recusar, Ver detalhes.
- Cards com linguagem clara: “Isto ainda não foi executado”.

### 4.7 Histórico de Ações da IA

- Comando recebido.
- Interpretação do agente.
- Ação sugerida.
- Usuário que aprovou.
- Resultado ou erro.

### 4.8 Integrações

- Card **Conectar Google Agenda**.
- Status da conexão.
- Orientação simples caso não esteja conectado.

### 4.9 Base de Conhecimento do Agente

- Upload de apostilas.
- Lista de materiais.
- Ativar/desativar uso pela IA.
- Status de processamento.

## 5. Estrutura de banco sugerida

### 5.1 Tabelas atuais reaproveitadas

- `profiles`.
- `projects`.
- `project_members`.
- `project_documents`.
- `tasks` como equivalente prático de `project_tasks`.
- `wbs_items` como equivalente prático de `project_wbs`.
- `risks` como equivalente prático de `project_risks`.
- `ai_messages`.
- `ai_outputs`.
- `pending_approvals`.
- `ai_action_logs`.
- `knowledge_files`.
- `knowledge_sources`.

### 5.2 Novas tabelas por fase

#### Fase 1 — Tarefas e aprovações

- Revisar `tasks` para garantir: `title`, `description`, `assignee_id`, `start_date`, `due_date`, `priority`, `status`, `project_id`, `task_type`, `notes`.
- `ai_outputs` para sugestões estruturadas.
- `pending_approvals` para confirmação humana.
- `ai_action_logs` para auditoria.

#### Fase 2 — Reuniões

- `project_meetings`.
- `meeting_attendees`.

#### Fase 3 — Google Calendar

- `calendar_integrations`.
- Campos em reuniões: `google_event_id`, `google_meet_link`, `sync_status`.

#### Fase 4 — Lembretes

- `task_reminders`.

#### Fase 5 — E-mails

- `email_logs`.

#### Fase 6 — Comandos da IA

- `ai_commands` para intenção, entidades extraídas e campos faltantes.

## 6. Componentes que serão criados

- `ProjectCard`.
- `TaskCard`.
- `TaskModal`.
- `MeetingModal`.
- `ReminderSelector`.
- `CalendarIntegrationCard`.
- `AIChatPanel`.
- `PendingApprovalCard`.
- `KnowledgeFileUploader`.
- `ActionHistoryTimeline`.
- `MemberInviteModal`.
- `StatusBadge`.
- `PriorityBadge`.

## 7. Fases de implementação

### Fase 1 — Base de projetos, tarefas e aprovação segura

Objetivo: garantir que tarefas e sugestões do agente funcionem com segurança antes de qualquer integração externa.

Escopo:

- Revisar tela de projetos.
- Revisar detalhe do projeto.
- Revisar criação/edição de tarefa.
- Garantir tipo de tarefa.
- Melhorar Kanban.
- Criar/ajustar aprovações pendentes.
- Garantir histórico de ações da IA.

Critério de aceite:

- Usuário cria projeto.
- Usuário cria tarefa.
- Usuário marca tarefa como reunião.
- Agente prepara rascunho.
- Rascunho só vira tarefa após aprovação.

### Fase 2 — Módulo de reuniões

- Campos específicos de reunião.
- Lista de reuniões do projeto.
- Participantes e e-mails.
- Status de confirmação.

### Fase 3 — Integrações/Google Calendar

- Tela de integração.
- OAuth Google.
- Criar evento somente após aprovação.
- Armazenar ID do evento.

### Fase 4 — Lembretes

- Lembretes internos.
- Lembretes por e-mail como rascunho.
- Lembretes vinculados a tarefa/reunião.

### Fase 5 — E-mails

- Edge Function de envio.
- Template de convite.
- Logs de envio.
- Confirmação antes de enviar.

### Fase 6 — Agente especialista

- Interpretação de comando.
- Extração de intenção e entidades.
- Campos faltantes.
- Sugestões estruturadas.
- Respostas didáticas.

### Fase 7 — Base de conhecimento

- Upload de apostilas.
- Processamento inicial de TXT/PDF conforme viabilidade.
- Chunks pesquisáveis.
- Respostas conceituais com base nas apostilas.

### Fase 8 — Comando por texto avançado

- Comandos naturais mais flexíveis.
- Confirmações específicas por ação.
- Edição de rascunho antes de aprovar.

### Fase 9 — Comando de voz

- Botão visual de microfone como “em breve”.
- Implementação real apenas após estabilizar texto, aprovações e integrações.

## 8. Riscos técnicos

- **RLS bloqueando fluxo de criação:** o criador precisa virar membro/gerente do projeto imediatamente.
- **Ações irreversíveis por IA:** mitigar com `pending_approvals` e logs.
- **Google Calendar:** depende de OAuth, escopos e credenciais externas.
- **Google Meet:** pode depender do tipo de conta Google e permissões de conferência.
- **E-mail:** depende de domínio/remetente validado no provedor.
- **Apostilas:** upload não basta; é necessário processamento e chunking para consulta real.
- **Usuário leigo:** telas precisam explicar o que é rascunho, aprovação e ação executada.

## 9. Configurações externas necessárias

### Supabase

- Migrations aplicadas.
- Buckets de documentos e conhecimento.
- Secrets para IA, e-mail e Google.
- Edge Functions publicadas.

### Google Cloud

- OAuth Client ID.
- OAuth Client Secret.
- Redirect URI.
- Calendar API habilitada.

### Provedor de e-mail

- Resend ou equivalente.
- API key em secrets.
- Domínio validado.
- Remetente padrão.

### Provedor de IA

- API key em secrets.
- Modelo definido.
- Limites de custo.
- Política de retenção/logs.

## 10. Recomendação do que construir primeiro

Construir somente a **Fase 1** após aprovação explícita:

1. Ajustar/revisar modelo de tarefas.
2. Garantir tipo de tarefa e campos principais.
3. Melhorar modal de tarefa.
4. Melhorar Kanban.
5. Consolidar aprovações pendentes.
6. Registrar histórico de ações da IA.
7. Garantir que o agente gere rascunhos, não execute ações.

Não iniciar Google Calendar, e-mails automáticos, lembretes externos ou comando de voz antes da Fase 1 estar funcionando.

## 11. Perguntas essenciais antes da Fase 1

1. Os papéis finais serão `owner/admin/member/viewer` ou manteremos os papéis atuais de projeto como `manager/contributor/client/professor/observer`?
2. A reunião deve ser inicialmente uma tarefa com `task_type = meeting` ou uma tabela separada desde a Fase 1?
3. O botão “Editar antes de salvar” deve abrir modal completo já na Fase 1 ou pode começar com revisão simples?
4. A Base de Conhecimento será global da Nexus ou por organização/workspace?
5. O provedor de IA será OpenAI ou outro serviço configurado no Lovable/Supabase?
6. O envio de e-mails será em nome da Nexus ou do usuário/projeto?
