// Stripe webhook — SYNCS into existing tables. Does NOT create internal plans.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _supabase;
}

const STRIPE_TO_INTERNAL_STATUS: Record<string, string> = {
  trialing: "trial",
  active: "active",
  past_due: "overdue",
  unpaid: "overdue",
  incomplete: "trial",
  incomplete_expired: "cancelled",
  canceled: "cancelled",
  paused: "suspended",
};

async function logEvent(workspaceId: string, type: string, message: string, metadata: any = {}) {
  try {
    await db().rpc("log_subscription_event", {
      _workspace_id: workspaceId,
      _event_type: type,
      _severity: "info",
      _message: message,
      _metadata: metadata,
    });
  } catch (e) {
    console.error("[logEvent]", e);
  }
}

async function resolveWorkspaceByCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await db()
    .from("workspace_subscriptions")
    .select("workspace_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data as any)?.workspace_id ?? null;
}

async function handleSubscriptionUpsert(sub: any, env: StripeEnv) {
  const workspaceId = sub.metadata?.workspaceId ?? (await resolveWorkspaceByCustomer(sub.customer));
  if (!workspaceId) {
    console.warn("subscription without workspaceId", sub.id);
    return;
  }
  const item = sub.items?.data?.[0];
  const lookupKey = item?.price?.lookup_key ?? null;
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  const internalStatus = STRIPE_TO_INTERNAL_STATUS[sub.status] ?? "active";

  await db()
    .from("workspace_subscriptions")
    .update({
      stripe_subscription_id: sub.id,
      stripe_customer_id: sub.customer,
      stripe_price_lookup_key: lookupKey,
      stripe_environment: env,
      status: internalStatus,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      auto_renew: !sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId);

  await logEvent(workspaceId, `stripe.subscription.${sub.status}`, `Stripe: subscription ${sub.status}`, {
    stripe_subscription_id: sub.id,
    lookup_key: lookupKey,
  });
}

async function handleSubscriptionDeleted(sub: any) {
  const workspaceId = sub.metadata?.workspaceId ?? (await resolveWorkspaceByCustomer(sub.customer));
  if (!workspaceId) return;
  await db()
    .from("workspace_subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      auto_renew: false,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId);
  await logEvent(workspaceId, "stripe.subscription.deleted", "Stripe: subscription cancelled", {
    stripe_subscription_id: sub.id,
  });
}

async function handleInvoicePaid(inv: any) {
  const workspaceId = inv.subscription_details?.metadata?.workspaceId
    ?? inv.metadata?.workspaceId
    ?? (await resolveWorkspaceByCustomer(inv.customer));
  if (!workspaceId) return;

  if (inv.id) {
    await db()
      .from("billing_invoices")
      .update({
        stripe_invoice_id: inv.id,
        stripe_payment_intent_id: inv.payment_intent ?? null,
        paid_amount: (inv.amount_paid ?? 0) / 100,
        status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("stripe_invoice_id", inv.id);
  }

  await logEvent(
    workspaceId,
    "stripe.invoice.paid",
    `Stripe: pagamento recebido (${((inv.amount_paid ?? 0) / 100).toFixed(2)} ${(inv.currency ?? "eur").toUpperCase()})`,
    { stripe_invoice_id: inv.id, hosted_invoice_url: inv.hosted_invoice_url },
  );
}

async function handleInvoiceFailed(inv: any) {
  const workspaceId = inv.subscription_details?.metadata?.workspaceId
    ?? inv.metadata?.workspaceId
    ?? (await resolveWorkspaceByCustomer(inv.customer));
  if (!workspaceId) return;
  await logEvent(workspaceId, "stripe.invoice.failed", "Stripe: pagamento falhou", {
    stripe_invoice_id: inv.id,
    attempt_count: inv.attempt_count,
    next_payment_attempt: inv.next_payment_attempt,
  });
}

async function handleCheckoutCompleted(session: any) {
  const workspaceId = session.metadata?.workspaceId ?? (await resolveWorkspaceByCustomer(session.customer));
  if (!workspaceId) return;
  await logEvent(workspaceId, "stripe.checkout.completed", "Stripe: checkout concluído", {
    session_id: session.id,
    mode: session.mode,
    amount_total: session.amount_total ? session.amount_total / 100 : null,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), { status: 200 });
  }
  const env: StripeEnv = rawEnv;
  try {
    const event = await verifyWebhook(req, env);
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object, env);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.paid":
      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object);
        break;
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      default:
        console.log("[payments-webhook] unhandled", event.type);
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[payments-webhook]", e);
    return new Response("Webhook error", { status: 400 });
  }
});
