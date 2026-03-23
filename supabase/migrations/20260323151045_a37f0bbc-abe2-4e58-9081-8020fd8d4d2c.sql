
-- Fix recursive RLS on technician_clients
-- The current policy "Read own tc links" has a bug: pc.client_id = pc.client_id (self-referencing)
DROP POLICY IF EXISTS "Read own tc links" ON public.technician_clients;

CREATE POLICY "Read own tc links"
ON public.technician_clients
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = technician_clients.technician_id AND t.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.partner_clients pc
    WHERE pc.client_id = technician_clients.client_id AND pc.partner_user_id = auth.uid()
  )
);

-- Fix service_orders SELECT policy to also allow reading orders with null client_id (created by user)
DROP POLICY IF EXISTS "Users read assigned so" ON public.service_orders;

CREATE POLICY "Users read assigned so"
ON public.service_orders
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR (client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id))
  OR EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = service_orders.technician_id AND t.user_id = auth.uid()
  )
);

-- Fix payment_orders SELECT policy similarly
DROP POLICY IF EXISTS "Users read assigned po" ON public.payment_orders;

CREATE POLICY "Users read assigned po"
ON public.payment_orders
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR (client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id))
  OR EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = payment_orders.technician_id AND t.user_id = auth.uid()
  )
);

-- Add SELECT policy for discrepancies for authenticated users
DROP POLICY IF EXISTS "Auth users read discrepancies" ON public.discrepancies;
CREATE POLICY "Auth users read discrepancies"
ON public.discrepancies
FOR SELECT
TO authenticated
USING (true);

-- Add SELECT policy for financial_records for authenticated users  
DROP POLICY IF EXISTS "Auth users read fr" ON public.financial_records;
CREATE POLICY "Auth users read fr"
ON public.financial_records
FOR SELECT
TO authenticated
USING (true);

-- Add INSERT policy for financial_records for authenticated users
DROP POLICY IF EXISTS "Auth users insert fr" ON public.financial_records;
CREATE POLICY "Auth users insert fr"
ON public.financial_records
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add INSERT for vehicles for authenticated users
DROP POLICY IF EXISTS "Auth users insert vehicles" ON public.vehicles;
CREATE POLICY "Auth users insert vehicles"
ON public.vehicles
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add SELECT for vehicles for authenticated users
DROP POLICY IF EXISTS "Auth users read vehicles" ON public.vehicles;
CREATE POLICY "Auth users read vehicles"
ON public.vehicles
FOR SELECT
TO authenticated
USING (true);

-- Add read policy for technicians for all authenticated users
DROP POLICY IF EXISTS "Auth users read technicians" ON public.technicians;
CREATE POLICY "Auth users read technicians"
ON public.technicians
FOR SELECT
TO authenticated
USING (true);

-- Add read policy for clients for all authenticated users
DROP POLICY IF EXISTS "Auth users read clients" ON public.clients;
CREATE POLICY "Auth users read clients"
ON public.clients
FOR SELECT
TO authenticated
USING (true);
