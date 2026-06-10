import type { WorkspaceSubscription } from "@prisma/client";

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "grace_period"
  | "overdue"
  | "suspended"
  | "cancelled";

export const WORKSPACE_TIERS = [
  {
    code: "starter",
    name: "Starter",
    base_price_monthly: 35,
    yearly_price: 350,
    tier_min: 1,
    tier_max: 20,
    sort_order: 1,
  },
  {
    code: "pro",
    name: "Pro",
    base_price_monthly: 45,
    yearly_price: 450,
    tier_min: 21,
    tier_max: 40,
    sort_order: 2,
  },
  {
    code: "scale",
    name: "Scale",
    base_price_monthly: 55,
    yearly_price: 550,
    tier_min: 41,
    tier_max: 60,
    sort_order: 3,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    base_price_monthly: 75,
    yearly_price: 750,
    tier_min: 61,
    tier_max: null,
    sort_order: 4,
  },
] as const;

const DEFAULT_TRIAL_DAYS = 14;

type Tier = (typeof WORKSPACE_TIERS)[number];

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function differenceInCalendarDays(future: Date, now: Date) {
  const ms = future.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function findWorkspaceTier(planCode: string | null | undefined, technicianCount: number): Tier {
  if (planCode) {
    const exact = WORKSPACE_TIERS.find((tier) => tier.code === planCode);
    if (exact) {
      return exact;
    }
  }

  return (
    WORKSPACE_TIERS.find(
      (tier) =>
        technicianCount >= (tier.tier_min ?? 1) &&
        technicianCount <= (tier.tier_max ?? Number.MAX_SAFE_INTEGER),
    ) ?? WORKSPACE_TIERS[0]
  );
}

function nextTierPrice(currentTier: Tier) {
  const next = WORKSPACE_TIERS.find((tier) => tier.sort_order === currentTier.sort_order + 1);
  return next?.base_price_monthly ?? currentTier.base_price_monthly;
}

export function buildBillingContext(args: {
  workspaceId: string;
  workspaceCreatedAt: Date;
  technicianCount: number;
  subscription: WorkspaceSubscription | null;
}) {
  const now = new Date();
  const subscription = args.subscription;
  const trialStartedAt = subscription?.trialStartedAt ?? args.workspaceCreatedAt;
  const trialEndsAt = subscription?.trialEndsAt ?? addDays(trialStartedAt, DEFAULT_TRIAL_DAYS);
  const status = (subscription?.status as SubscriptionStatus | undefined) ?? "trial";
  const billingCycle = subscription?.billingCycle === "yearly" ? "yearly" : "monthly";
  const tier = findWorkspaceTier(subscription?.planCode, args.technicianCount);
  const nextTierAt = (tier.tier_max ?? args.technicianCount) + 1;
  const isTrial = status === "trial" && trialEndsAt.getTime() > now.getTime();

  return {
    snapshot: {
      exists: true,
      subscription: {
        id: subscription?.id ?? `trial-${args.workspaceId}`,
        workspace_id: args.workspaceId,
        plan_id: tier.code,
        status,
        billing_cycle: billingCycle,
        trial_started_at: trialStartedAt.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        current_period_start: subscription?.currentPeriodStart?.toISOString() ?? null,
        current_period_end: subscription?.currentPeriodEnd?.toISOString() ?? null,
        grace_until: subscription?.graceUntil?.toISOString() ?? null,
        cancelled_at: subscription?.cancelledAt?.toISOString() ?? null,
        technician_count: args.technicianCount,
        current_price: billingCycle === "yearly" ? tier.yearly_price : tier.base_price_monthly,
      },
      plan: {
        code: tier.code,
        name: tier.name,
        base_price_monthly: tier.base_price_monthly,
        base_tech_included: tier.tier_max ?? tier.tier_min ?? 0,
        extra_block_size: 20,
        extra_block_price: 10,
        yearly_discount_months: 2,
      },
      usage: {
        technician_count: args.technicianCount,
        included: tier.tier_max ?? tier.tier_min ?? 0,
        next_tier_at: nextTierAt,
      },
      pricing: {
        current_monthly: tier.base_price_monthly,
        current_yearly: tier.yearly_price,
        next_tier_price: nextTierPrice(tier),
      },
      trial: {
        is_trial: isTrial,
        days_left: differenceInCalendarDays(trialEndsAt, now),
        ends_at: trialEndsAt.toISOString(),
      },
    },
    access: {
      access_mode: status === "suspended" || status === "cancelled" ? "readonly" : "full",
      status,
      suspension_mode: status === "suspended" ? "soft" : null,
      legal_hold: false,
      reasons:
        status === "suspended"
          ? ["A workspace encontra-se suspensa."]
          : status === "cancelled"
            ? ["A subscrição foi cancelada."]
            : [],
      can_create: status !== "suspended" && status !== "cancelled",
      can_edit: status !== "suspended" && status !== "cancelled",
      can_export: true,
      can_access_billing: true,
      trial_days_left: isTrial ? differenceInCalendarDays(trialEndsAt, now) : null,
      subscription_id: subscription?.id ?? null,
      workspace_id: args.workspaceId,
    },
    stripe: {
      state: subscription?.stripeSubscriptionId
        ? "synced"
        : subscription?.stripeCustomerId
          ? "customer_only"
          : subscription
            ? "pending"
            : "unavailable",
      stripe_subscription_id: subscription?.stripeSubscriptionId ?? null,
      stripe_customer_id: subscription?.stripeCustomerId ?? null,
      stripe_price_lookup_key: subscription?.stripePriceLookupKey ?? null,
      stripe_environment: subscription?.stripeEnvironment ?? null,
      last_recalculated_at: subscription?.lastRecalculatedAt?.toISOString() ?? null,
    },
  };
}
