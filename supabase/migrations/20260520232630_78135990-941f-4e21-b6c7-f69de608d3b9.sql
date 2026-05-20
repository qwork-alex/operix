create table if not exists public.temp_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  temp_password text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

alter table public.temp_credentials enable row level security;

drop policy if exists "temp_credentials_select" on public.temp_credentials;
create policy "temp_credentials_select" on public.temp_credentials
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin'::app_role)
  or public.has_role(auth.uid(), 'partner'::app_role)
);

drop policy if exists "temp_credentials_delete_self_or_admin" on public.temp_credentials;
create policy "temp_credentials_delete_self_or_admin" on public.temp_credentials
for delete to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'admin'::app_role)
);

create or replace function public.clear_my_temp_credential()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.temp_credentials where user_id = auth.uid();
$$;

grant execute on function public.clear_my_temp_credential() to authenticated;

update public.workspaces w
set name = coalesce(
  (
    select nullif(trim(cs.company_name), '')
    from public.company_settings cs
    join public.app_users au on au.id = w.owner_user_id
    where cs.user_id = au.auth_user_id
    limit 1
  ),
  'Workspace'
)
where w.name in ('Default Workspace', 'default workspace', 'DEFAULT WORKSPACE');