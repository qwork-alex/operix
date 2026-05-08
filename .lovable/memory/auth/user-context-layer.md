---
name: User Context Layer
description: Camada paralela `get_user_context()` + `useUserContext()` — fonte única de identidade, role, workspace e ownership. Opt-in. Não substitui useAuth/useRole ainda.
type: feature
---

# User Context Layer (Fase 1 — paralela)

## Status
- **Aplicado**: SQL `public.get_user_context(_workspace_id uuid)`, view `public.v_user_context_self`, hook `useUserContext()`.
- **Não tocado**: nenhuma policy RLS, trigger, função existente, hook (`useAuth`, `useRole`, `useWorkspace`, `useImpersonation`) ou query de SO/PO/financial/upload.
- Reversível com `DROP FUNCTION public.get_user_context(uuid) CASCADE;`.

## Contrato (JSONB)
```
{
  auth_user_id, app_user_id, email,
  is_active, is_system_owner,
  primary_role ('admin'|'socio'|'tecnico'|'cliente'),
  primary_db_role ('admin'|'partner'|'technician'|'client'),
  secondary_roles[], current_workspace_id, workspace_ids[],
  membership_role, effective_role,
  can_manage_all, can_view_all_workspace,
  ownership: { technician_id, owns_filter_uids[] },
  flags: { is_admin, is_partner, is_technician, is_client, is_impersonating },
  computed_at
}
```

Todas as flags exigem `is_active=true`. Banido => todas as flags `false`.

## Uso recomendado (FE)
```ts
const { ctx, isLoading } = useUserContext();
if (ctx?.flags.is_admin) { ... }
```
Cache TanStack Query: `staleTime=5min`, invalida ao mudar impersonation ou auth uid.

## Migração (Fase 2 — futura, 1 PR por item)
1. `useNotifications` → `ctx.auth_user_id`
2. `useDashboardData` → `ctx.flags`
3. `useAssignableUsers` → `ctx.can_manage_all` (depende de `profiles_public` da Fase A2)
4. `useTechnicianEarnings` → `ctx.ownership.technician_id`
5. `usePermission/useCan` → pré-carregar permissões via `ctx`
6. `useRole` vira wrapper de `ctx.primary_db_role`

## NÃO usar para
- Decisão de RLS (continue confiando nas policies, não no FE).
- Login/sessão (só chamar **após** sessão estabelecida).
- Substituir `useAuth` (continua sendo a fonte do `session`/`user`).
