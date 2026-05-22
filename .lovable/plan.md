# Billing Restructure + Stabilization Plan

This is a large, multi-phase change. I'll break it into approval gates so we don't ship a half-migrated billing system.

---

## Phase 1 — Billing Model Separation (DB + Pricing)

**New plan taxonomy** in `subscription_plans`:

| code | kind | price/mo | tech range |
|---|---|---|---|
| `technician_pro` | technician | 24.99€ | n/a (per seat) |
| `workspace_t1` | workspace | 24.99€ | 1–15 |
| `workspace_t2` | workspace | 44.99€ | 16–30 |
| `workspace_t3` | workspace | 59.99€ | 31–45 |
| `workspace_t4` | workspace | 79.99€ | 46–60 |

**DB migration**
- Add `subscription_plans.kind` enum (`workspace` | `technician`), `tier_min`, `tier_max`.
- New table `technician_subscriptions` (user_id, status, stripe_*, current_period_end, environment) — mirrors `workspace_subscriptions` shape but per-user.
- Replace tier-recalculation trigger: pick workspace plan by `count(active technicians in workspace)` falling into `[tier_min, tier_max]`.
- Backfill existing workspaces onto the matching `workspace_tN` tier.
- New RPC `get_technician_subscription(_user_id)` + update `get_workspace_access_state` so workspace blocks no longer depend on per-tech billing.
- New view `v_workspace_active_tech_count` used by trigger + UI.

**Stripe products (sandbox)**
Use `payments--batch_create_product` with `lookup_key` = plan code + cycle:
- `technician_pro` → prices `technician_pro_monthly` (2499) / `technician_pro_yearly` (24990 = 10 months)
- `workspace_t1..t4` → same monthly/yearly pair each
- tax_code `txcd_10103001` (SaaS)

**VAT copy**
Replace existing aggressive VAT banners with neutral suffix `" + IVA aplicável"` in:
- `CheckoutPage`, `SubscriptionPage`, plan cards, invoice previews.

---

## Phase 2 — Onboarding Flows

**Workspace onboarding** (new route group `/onboarding/workspace/*`):
```
Landing → CreateWorkspace → Subscription(pickTier) → CompanySetup → PlatformAccess
```
- Driven by a single `WorkspaceOnboardingProvider` (step state in URL).
- Plan picker shows the 4 tiers + estimated price by declared tech count.
- Subscription step opens existing `StripeEmbeddedCheckout` with the resolved `workspace_tN_*` lookup key.
- Company Setup writes to `company_settings`.
- Platform Access = success screen → redirect to dashboard.

**Technician onboarding** (already invite-only):
```
Invite link → Accept → CreateProfile → EnterWorkspace
```
- After profile creation, prompt for `technician_pro` checkout (skippable for workspace-paid seats — to confirm with you, see Open Questions).
- Reuses existing invite/join flow in `JoinPage`.

**Landing**
- Add `/` (or `/landing`) marketing page with two CTAs: "Criar Workspace" / "Sou Técnico (tenho convite)".

---

## Phase 3 — Billing Abstraction Layer

New `src/lib/billing/`:
- `billingProvider.ts` — single interface: `getWorkspaceSubscription`, `getTechnicianSubscription`, `openCheckout(kind, lookupKey)`, `openPortal()`.
- `seatCounter.ts` — `useActiveTechnicianCount(workspaceId)`.
- `subscriptionGuards.tsx` — `<RequireWorkspaceSub/>`, `<RequireTechnicianSub/>` wrapping `AccessGuard`.
- `lifecycleBus.ts` — emits `subscription.activated|suspended|tier_changed|seat_added|seat_removed` on the existing `OperationalEventBus`.

Update `payments-webhook` edge function to route by `lookup_key` prefix: `technician_*` → `technician_subscriptions`, `workspace_*` → `workspace_subscriptions`.

---

## Phase 4 — Stabilization Sweep

Done as one PR after Phase 1–3 land:
- **Audit**: run `tsc --noEmit`-equivalent via build + `bun test`; fix dead imports.
- **Realtime**: re-init `RealtimeHub` channels on auth change; reconnect-on-visibility.
- **Providers**: verify `AIProvider`, `TenantContext`, `WorkspaceProvider`, `ConsentGate` mount order; remove any duplicated providers found.
- **i18n**: run `scripts/i18n-audit.mjs`; add missing PT/EN keys for new billing/onboarding strings.
- **UI consistency**: enforce semantic tokens in new billing screens; remove hard-coded colors.
- **Permissions**: smoke-test `RoleGuard` + `AccessGuard` on every new route.
- **Cleanup**: delete unused components flagged by audit (esp. old PresenceOverlay/CharacterLayer if fully superseded).
- **Event system**: dedupe listeners in `OperationalEventBus`; ensure unsubscribes on unmount.
- **Loading states**: add skeletons to onboarding steps + subscription cards.
- **Responsive**: verify onboarding at 375 / 768 / 1280.
- **Observability**: confirm `useObservabilityBoot` captures new lifecycle events.

---

## Technical Notes

- `payments--batch_create_product` is sandbox-only; live syncs at publish.
- `stripe_price_lookup_key` pattern stays `{plan_code}_{cycle}` — no checkout/webhook code changes beyond plan codes.
- Owner account `qwork@qworkgroup.com` bypass remains intact.
- All migrations RLS-protected; `technician_subscriptions` policy: user reads own row, service_role writes.

---

## Open Questions (need answers before Phase 1)

1. **Tech seat billing model**: when a workspace pays tier T1–T4, is `technician_pro` *additional* (each tech pays their own 24.99€ for Siltech/AI/mobile) or *included* (workspace tier already covers everything for seats up to its cap)?
2. **Existing data**: any live workspaces today? If yes — grandfather pricing or force-migrate at next renewal?
3. **Yearly cycle**: keep current "10 months for 12" discount, or remove and only offer monthly?
4. **Landing page**: build a real marketing landing, or a minimal 2-CTA splash for now?

I'll wait for answers on these 4 before starting Phase 1, since they materially change the schema and Stripe catalog.
