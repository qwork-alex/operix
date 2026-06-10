import { useMemo } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { apiRequest } from "@/lib/api";

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
        const data = await apiRequest<{ clientSecret?: string; message?: string }>(
          `/billing/workspaces/${workspaceId}/checkout-session`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lookup_key: lookupKey,
              customer_email: customerEmail,
              legal_name: legalName,
              return_url: returnUrl,
              environment: getStripeEnvironment(),
            }),
          },
        );
        if (!data?.clientSecret) {
          throw new Error(data?.message || "Falha ao iniciar checkout");
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
