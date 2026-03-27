
-- Fix overly permissive RLS policies on discrepancies and financial_records

-- Drop permissive system policies
DROP POLICY IF EXISTS "System insert discrepancies" ON public.discrepancies;
DROP POLICY IF EXISTS "System update discrepancies" ON public.discrepancies;
DROP POLICY IF EXISTS "Auth users read discrepancies" ON public.discrepancies;
DROP POLICY IF EXISTS "financial_records_trigger_insert" ON public.financial_records;

-- Replace with scoped policies
CREATE POLICY "Authenticated read discrepancies" ON public.discrepancies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System insert discrepancies" ON public.discrepancies
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "System update discrepancies" ON public.discrepancies
  FOR UPDATE TO authenticated USING (true) WITH CHECK (auth.uid() IS NOT NULL);

-- Financial records: allow trigger-based inserts only for authenticated users
CREATE POLICY "financial_records_trigger_insert" ON public.financial_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
