---
name: Contextual Action Engine
description: Hook + discreet picker that resolves which workspace an action belongs to, only prompting when 2+ workspaces grant the module.
type: feature
---

# Contextual Action Engine (Phase 2)

Additive layer on top of Phase 1 workspace context. Does NOT change
existing operational flows — modules opt in.

## Pieces
- `src/hooks/useContextualWorkspace.ts` — resolves `workspace_id` for an action by intersecting user's memberships with `workspace_module_permissions`.
- `src/components/workspace/ContextualWorkspacePicker.tsx` — small chip selector; renders nothing when only 1 workspace is eligible; collapses to a tiny inline link after confirm.
- `src/lib/treeGrouping.ts` — `groupByYearWorkspaceUser` helper for OS/OP trees (YEAR → WORKSPACE → USER → GROUP/LIST).

## Rule
- 1 eligible workspace → auto-assign, no UI.
- 2+ eligible → require explicit pick (session-scoped, sessionStorage key `ctx_ws::<module>`).
- After confirm, picker collapses to a discreet `↳ <wsname>` chip that re-opens on click.

## How to plug into a flow
```ts
const ctx = useContextualWorkspace("payment_orders");
// In form header:
<ContextualWorkspacePicker ctx={ctx} />
// On submit:
if (ctx.requireSelection || !ctx.resolvedWorkspaceId) return toast.error("Selecione o workspace");
await supabase.from("payment_orders").insert({ ...payload, workspace_id: ctx.resolvedWorkspaceId });
ctx.clearSelection(); // optional, keep pick for batch flows
```

Modules to wire (incrementally, non-breaking):
OS uploads, OP creation, invoice creation, document uploads, fleet trips, reports, accounting entries, financial records.
