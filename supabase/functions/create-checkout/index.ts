import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  opts: { email?: string; userId?: string; workspaceId: string; legalName?: string },
): Promise<string> {
  if (opts.userId && !/^[a-zA-Z0-9_-]+$/.test(opts.userId)) throw new Error("Invalid userId");
  if (!/^[a-zA-Z0-9_-]+$/.test(opts.workspaceId)) throw new Error("Invalid workspaceId");

  const byWs = await stripe.customers.search({
    query: `metadata['workspaceId']:'${opts.workspaceId}'`,
    limit: 1,
  });
  if (byWs.data.length) return byWs.data[0].id;

  if (opts.email) {
    const existing = await stripe.customers.list({ email: opts.email, limit: 1 });
    if (existing.data.length) {
      const c = existing.data[0];
      await stripe.customers.update(c.id, {
        metadata: {
          ...c.metadata,
          workspaceId: opts.workspaceId,
          ...(opts.userId && { userId: opts.userId }),
        },
      });
      return c.id;
    }
  }
  const created = await stripe.customers.create({
    ...(opts.email && { email: opts.email }),
    ...(opts.legalName && { name: opts.legalName }),
    metadata: {
      workspaceId: opts.workspaceId,
      ...(opts.userId && { userId: opts.userId }),
    },
  });
  return created.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { lookup_key, workspace_id, customer_email, legal_name, return_url, environment } = body as {
      lookup_key: string;
      workspace_id: string;
      customer_email?: string;
      legal_name?: string;
      return_url: string;
      environment: StripeEnv;
    };

    if (!lookup_key || !workspace_id || !return_url) throw new Error("Missing required fields");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    let userId: string | undefined;
    if (authHeader) {
      const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = data.user?.id;
    }

    const stripe = createStripeClient(environment);

    const prices = await stripe.prices.list({ lookup_keys: [lookup_key], active: true, limit: 1 });
    if (!prices.data.length) throw new Error(`Price not found for lookup_key: ${lookup_key}`);
    const price = prices.data[0];
    const isRecurring = price.type === "recurring";

    const customerId = await resolveOrCreateCustomer(stripe, {
      email: customer_email,
      userId,
      workspaceId: workspace_id,
      legalName: legal_name,
    });

    await supabase
      .from("workspace_subscriptions")
      .update({ stripe_customer_id: customerId, stripe_environment: environment })
      .eq("workspace_id", workspace_id);

    const productId = typeof price.product === "string" ? price.product : price.product.id;
    const product = await stripe.products.retrieve(productId);

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: price.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url,
      customer: customerId,
      ...(isRecurring
        ? {
            subscription_data: {
              metadata: { workspaceId: workspace_id, lookup_key, ...(userId && { userId }) },
            },
          }
        : {
            payment_intent_data: {
              description: product.name,
              metadata: { workspaceId: workspace_id, lookup_key, ...(userId && { userId }) },
            },
          }),
      metadata: { workspaceId: workspace_id, lookup_key, ...(userId && { userId }) },
    });

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[create-checkout]", e);
    return new Response(JSON.stringify({ error: e.message ?? "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
