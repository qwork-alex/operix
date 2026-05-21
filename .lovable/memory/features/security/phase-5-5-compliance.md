---
name: Phase 5.5 — Compliance, GDPR, Anti-Fraud
description: GDPR consent ledger, data export, workspace deletion lifecycle, immutable audit chain, fraud signals, device tracking, security policies
type: feature
---

Phase 5.5 layers full GDPR/compliance + anti-fraud + device tracking on top of the Phase 5 multi-tenant security base. No Stripe integration.

### Tables (all under RLS)
- `consent_logs` — append-only, GDPR Art. 7. Self-insert via `record_consent` RPC.
- `data_retention_rules` — owner-managed, public-read. Seeded for `backend_event_logs` (365d), `security_events` (730d), `immutable_audit_logs` (7y/2555d), `consent_logs` (7y), `fraud_signals` (365d).
- `user_privacy_settings` — per-user toggles: marketing_emails, analytics_tracking, ai_training_optin, share_usage_data.
- `immutable_audit_logs` — sha256 hash-chained ledger (`prev_hash` + `row_hash`). NO update/delete policy.
- `fraud_signals` — risk_score 0-100, severity enum (info/low/medium/high/critical), status (open/reviewing/cleared/blocked).
- `user_devices` — fingerprint + browser/os/ip/country, soft-revocable via `revoked_at`.
- `workspace_deletion_requests` — 30d retention default before execution. Cancellable.
- `data_export_requests` — GDPR Art. 20. JSON/CSV/PDF scope.
- `security_policies` — per-workspace session_timeout_minutes, max_login_attempts, lockout_minutes, mfa_required, ip_allowlist.

### RPCs
`record_consent`, `withdraw_consent`, `write_immutable_log` (hash-chained), `request_data_export`, `request_workspace_deletion`, `cancel_workspace_deletion`, `register_device`, `revoke_device`, `revoke_all_devices`, `record_fraud_signal`, `compute_user_risk_score`, `compute_compliance_overview`.

### Frontend
- `src/hooks/useCompliance.ts` — single TanStack hooks module.
- `src/lib/deviceFingerprint.ts` — UUID stored in localStorage as `qw_device_fp`. Auto-registers on auth state change (silent, debounced via `registered` flag).
- `src/components/platform/ComplianceDashboard.tsx` — owner-only KPIs + fraud signals + audit ledger viewer. Mounted as a new "Compliance" tab on `PlatformOwnerPage`.
- `src/components/settings/PrivacyAndSessionsCard.tsx` — mounted at the bottom of `ProfilePage`: privacy switches, device list + per-device revoke + revoke-all (AlertDialog), JSON/CSV/PDF export request buttons, right-to-be-forgotten notice.

### Constraints kept
- No UI redesign — purely additive cards and one new tab.
- No Stripe integration; the financial/billing compliance is the existing Phase 3/4 infrastructure plus the new immutable audit category `financial`.
- All new SECURITY DEFINER functions set `search_path = public`.
- `is_system_owner_jwt()` helper checks `auth.users.email = 'qwork@qworkgroup.com'` to keep the owner-protection rule consistent with the rest of the codebase.
