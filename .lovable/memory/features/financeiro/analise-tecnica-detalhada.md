---
name: Análise técnica detalhada
description: Year-block structured financial analysis per technician with revenue, loans, expenses, and result per year
type: feature
---
The 'Detalhamento' tab provides granular financial analysis per technician, organized into **yearly financial blocks**.

**Structure**: Technician → Year Block (2025, 2026...) → Revenue + Movements + Expenses + Result

**Year Block Contents**:
- **Receitas**: Manual inputs for expected/received revenue per year, stored with `year:YYYY` tag in notes
- **Movimentações financeiras**: Loans filtered by year period, with `paidAmount` field for partial payments
- **Despesas**: Spreadsheet filtered by year suffix (`filterYear` prop on ExpenseSpreadsheet)
- **Resultado**: `result = received - totalExpenses - loansPending`

**Partial Loan Logic**: When `paidAmount` is set, remaining = amount - paidAmount. Status auto-adjusts (pending/partial/paid).

**Revenue Storage**: `financial_records` with notes format `tech:ID:NAME:year:YYYY` (upgraded from legacy `tech:ID:NAME`).

**Data Flow**: All data stored in `financial_records` table. Spreadsheet/movements serialized as JSON in `category` field.
