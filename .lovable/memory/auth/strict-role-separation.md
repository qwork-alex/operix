---
name: Strict workspace/role separation
description: Workspace owners must be admins; technician/client/partner can never own a workspace or hold admin membership; deletion is blocked while a workspace is owned
type: feature
---

# DB enforcement (migration 2026-05-22)

Triggers added:
- `trg_workspaces_owner_must_be_admin` (BEFORE INSERT/UPDATE OF owner_user_id on `workspaces`)
  → `enforce_workspace_owner_is_admin()` resolves `app_users.auth_user_id` → `user_roles.role`; requires `'admin'`.
- `trg_memberships_admin_requires_admin_role` (BEFORE INSERT/UPDATE OF role on `memberships`)
  → `enforce_admin_membership_requires_admin_role()` only allows `role='admin'` if the linked user has global `user_roles.role='admin'`.
- `trg_app_users_block_delete_if_owns_workspace` (BEFORE DELETE on `app_users`)
  → `block_delete_workspace_owner()` raises if the user still owns any workspace.

# Signup default role

`handle_new_auth_user()` now branches on metadata:
- `invite_token` present OR `provisioned_by_admin=true` → NO default role (invite/create flow assigns it).
- Otherwise (real self-signup) → default `user_roles.role='admin'`. This aligns with `provision_workspace_on_signup` which already creates a workspace + admin membership only for self-signups.

# admin-create-user edge function

`delete_user` action now:
1. Preflight queries `workspaces.owner_user_id` for the target's `app_user.id`.
2. If any workspaces are owned and no `transfer_workspace_to_user_id` is provided → returns `409 owns_workspaces` with the workspace list.
3. If `transfer_workspace_to_user_id` is provided → transfers ownership (DB trigger validates new owner has admin role) before continuing the existing reassign/detach pipeline.

# Cleanup performed

Deleted orphan workspace `b95977b8-8d6c-44b4-8bb6-0c189aee0d00` ("Workspace de test") which had been auto-provisioned for technician `test@test.fr`. No operational data referenced it. Event logged as `ORPHAN_TECHNICIAN_WORKSPACE_CLEANED` in `backend_event_logs`.
