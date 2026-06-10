import { Buffer } from "node:buffer";
import Stripe from "stripe";
import { env } from "../config/env.js";

export type StripeEnv = "sandbox" | "live";

function getStripeApiKey(environment: StripeEnv) {
  return environment === "live" ? env.STRIPE_LIVE_API_KEY || "" : env.STRIPE_SANDBOX_API_KEY || "";
}

function getWebhookSecret(environment: StripeEnv) {
  return environment === "live"
    ? env.PAYMENTS_LIVE_WEBHOOK_SECRET || ""
    : env.PAYMENTS_SANDBOX_WEBHOOK_SECRET || "";
}

export function getConfiguredStripeEnvironment(preferred?: string | null): StripeEnv | null {
  if (preferred === "live" && env.STRIPE_LIVE_API_KEY) {
    return "live";
  }

  if (preferred === "sandbox" && env.STRIPE_SANDBOX_API_KEY) {
    return "sandbox";
  }

  if (env.STRIPE_SANDBOX_API_KEY) {
    return "sandbox";
  }

  if (env.STRIPE_LIVE_API_KEY) {
    return "live";
  }

  return null;
}

export function createStripeClient(environment: StripeEnv) {
  const apiKey = getStripeApiKey(environment);
  if (!apiKey) {
    throw new Error(`Stripe ${environment} API key is not configured.`);
  }

  return new Stripe(apiKey, {
    apiVersion: "2025-08-27.basil",
  });
}

export async function verifyStripeWebhookSignature(args: {
  payload: string | Uint8Array;
  signature: string;
  environment: StripeEnv;
}) {
  const secret = getWebhookSecret(args.environment);
  if (!secret) {
    throw new Error(`Stripe ${args.environment} webhook secret is not configured.`);
  }

  const stripe = createStripeClient(args.environment);
  const payload = typeof args.payload === "string" ? args.payload : Buffer.from(args.payload);
  return stripe.webhooks.constructEvent(payload, args.signature, secret);
}
