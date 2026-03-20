-- Allow authenticated users to insert service orders
CREATE POLICY "Auth users insert so"
ON public.service_orders
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- Allow authenticated users to update their own service orders
CREATE POLICY "Auth users update own so"
ON public.service_orders
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- Allow authenticated users to insert payment orders
CREATE POLICY "Auth users insert po"
ON public.payment_orders
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- Allow authenticated users to update their own payment orders
CREATE POLICY "Auth users update own po"
ON public.payment_orders
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());