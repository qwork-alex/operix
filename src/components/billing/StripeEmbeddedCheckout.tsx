import { useMemo } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  lookupKey: string;
  workspaceId: string;
  customerEmail?: string;
  legalName?: string;
  returnUrl: string;
}

/**
 * Renders Stripe Embedded Checkout inline.
 * The clientSecret fetcher MUST be stable across renders — otherwise
 * EmbeddedCheckoutProvider remounts and throws "cannot change client secret".
 */
export function StripeEmbeddedCheckout({
  lookupKey,
  workspaceId,
  customerEmail,
  legalName,
  returnUrl,
}: Props) {
  const options = useMemo(
    () => ({
      fetchClientSecret: async (): Promise<string> => {
        const { data, error } = await supabase.functions.invoke("create-checkout", {
          body: {
            lookup_key: lookupKey,
            workspace_id: workspaceId,
            customer_email: customerEmail,
            legal_name: legalName,
            return_url: returnUrl,
            environment: getStripeEnvironment(),
          },
        });
        if (error || !data?.clientSecret) {
          throw new Error(error?.message || data?.error || "Falha ao iniciar checkout");
        }
        return data.clientSecret as string;
      },
    }),
    [lookupKey, workspaceId, customerEmail, legalName, returnUrl],
  );

  return (
    <div id="checkout" className="rounded-lg overflow-hidden border border-border/40">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
