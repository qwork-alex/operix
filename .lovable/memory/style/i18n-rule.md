---
name: i18n Rule
description: Strict rule — all visible UI strings must use useLanguage().t(key); never inline literals
type: constraint
---
Every visible string in any component MUST go through `useLanguage().t("key", fallback?)`.

**Forbidden:**
- Hardcoded JSX text such as `<TabsTrigger>Auditoria</TabsTrigger>` or `<p>No data</p>`.
- `placeholder=""`, `title=""`, `aria-label=""`, `toast({ title, description })` with literal strings.
- Mixing languages inside one component (e.g. PT label next to EN tooltip).

**Required:**
- Add the key + all 12 lang slots to `src/hooks/useLanguage.tsx` (group by module prefix: `fin.*`, `part.*`, `audit.*`, `so.*`, `po.*`, `fleet.*`, `users.*`, `common.*`).
- Reuse existing keys when semantics match — do not create near-duplicates.
- Brazilian Portuguese variants live in the existing `pt` slot (no new lang code in this phase).
- Status / type tokens coming from the database (e.g. `paid`, `partial`, `partner`) MUST map through a `t(\`part.status.\${s}\`)` style lookup before render.

**Why:** Phase 4C i18n hardening — switching language from the top bar must update every visible string live, with no English fragments inside pt mode (and vice-versa).

**How to apply:** Before merging any new component, run `node scripts/i18n-audit.mjs` and confirm the file is not in the top-offenders list. Audit output: `/mnt/documents/i18n_audit.md`.
