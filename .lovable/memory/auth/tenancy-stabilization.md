---
name: Tenancy stabilization — no auto-workspace for admin-provisioned users
description: provision_workspace_on_signup honors `provisioned_by_admin` flag; admin-create-user attaches new users to caller's workspace via membership only
type: feature
---
Triggers on `auth.users`:
- `on_auth_user_created` → `handle_new_auth_user()` (profile + user_roles default 'technician' + app_users)
- `on_auth_user_created_provision_workspace` → `provision_workspace_on_signup()` (workspace + admin membership)

Bypass rules in `provision_workspace_on_signup` (no new workspace, just app_user upsert):
1. `raw_user_meta_data.invite_token` present (existing behavior)
2. `raw_user_meta_data.provisioned_by_admin = true` (added; logs `SIGNUP_BLOCKED_BY_ADMIN_PROVISION`)

`admin-create-user` edge function:
- Sets `provisioned_by_admin: true`, `provisioned_by: <caller_id>`, `provisioned_workspace_id` in user_metadata.
- Resolves target workspace = `body.workspace_id` or caller's first active membership.
- Upserts `memberships(user_id=newAppUser.id, workspace_id=target, role=<mapped>, status='active')` — never owner, never creates a workspace.
- Role map: admin→admin, partner→socio, technician→tecnico, client→cliente.

Effective role source (current, unchanged): `effective_role(_user_id, _workspace_id)` reads memberships first, falls back to user_roles. `useRole` still reads `user_roles` directly; `useWorkspace` reads membership.role for the active workspace. These two layers coexist — do not deduplicate yet.

Known still-legacy:
- `handle_new_auth_user` always inserts default `technician` in `user_roles`. The admin-create-user role then overwrites it via upsert.
- Self-signup path still auto-creates a personal workspace + admin membership (intentional for real signups).
- Existing duplicate workspaces created by past admin-provisioned users are NOT cleaned up by this change.
