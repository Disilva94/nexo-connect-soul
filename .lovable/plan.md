Ativar auto-confirmação de e-mail no Lovable Cloud para que novos cadastros possam entrar imediatamente sem precisar confirmar o e-mail.

## Mudança
- Configurar auth com `auto_confirm_email: true` via `supabase--configure_auth`.
- Usuários existentes que ficaram com e-mail não confirmado serão confirmados manualmente (update em `auth.users.email_confirmed_at`) via migração.

## Sem alterações de código
Fluxo de signup/login atual continua igual — apenas a etapa de confirmação por e-mail deixa de ser exigida.