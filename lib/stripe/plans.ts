import Stripe from "stripe";
import { getStripeClient } from "./client";

export type BiscoitoPlan = {
  id: string;
  currency: string;
  unitAmount: number | null;
  nickname: string | null;
  lookupKey: string | null;
  recurring: {
    interval: Stripe.Price.Recurring.Interval;
    intervalCount: number;
  };
  product: {
    id: string;
    name: string;
    active: boolean;
  };
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPlans: { data: BiscoitoPlan[]; expiresAt: number } | null = null;

function getBiscoitoProductFilter(): string | undefined {
  const productId = process.env.STRIPE_BISCOITO_PRODUCT_ID?.trim().replace(/^["']|["']$/g, "");
  return productId?.startsWith("prod_") ? productId : undefined;
}

/**
 * The Stripe account is shared with other projects: only products converged by
 * the Bouéla backend (metadata.app = biscoito) that are the current version of
 * a self-serve merchant plan are sellable from the CRM.
 */
export function isSellableBouelaProduct(metadata: Record<string, string> | null | undefined): boolean {
  if (!metadata || metadata.app !== "biscoito") return false;
  if (metadata.current !== "true") return false;
  if (metadata.audience && metadata.audience !== "BRAND") return false;
  if (metadata.hidden === "true" || metadata.internal === "true" || metadata.contact_only === "true") return false;
  return true;
}

function isProduct(product: string | Stripe.Product | Stripe.DeletedProduct): product is Stripe.Product {
  return typeof product !== "string" && !("deleted" in product);
}

function toBiscoitoPlan(price: Stripe.Price): BiscoitoPlan | null {
  if (!price.recurring || !isProduct(price.product)) return null;

  return {
    id: price.id,
    currency: price.currency,
    unitAmount: price.unit_amount,
    nickname: price.nickname,
    lookupKey: price.lookup_key,
    recurring: {
      interval: price.recurring.interval,
      intervalCount: price.recurring.interval_count,
    },
    product: {
      id: price.product.id,
      name: price.product.name,
      active: price.product.active ?? true,
    },
  };
}

export async function listBiscoitoPlans(): Promise<BiscoitoPlan[]> {
  const now = Date.now();
  if (cachedPlans && cachedPlans.expiresAt > now) return cachedPlans.data;

  const product = getBiscoitoProductFilter();
  const prices = await getStripeClient().prices.list({
    active: true,
    type: "recurring",
    product,
    expand: ["data.product"],
    limit: 100,
  });

  const data = prices.data
    .filter((price) => product || (isProduct(price.product) && isSellableBouelaProduct(price.product.metadata)))
    .map(toBiscoitoPlan)
    .filter((plan): plan is BiscoitoPlan => Boolean(plan))
    .sort((a, b) => (a.unitAmount ?? 0) - (b.unitAmount ?? 0));

  cachedPlans = { data, expiresAt: now + CACHE_TTL_MS };
  return data;
}

export async function retrieveBiscoitoPrice(priceId: string): Promise<Stripe.Price> {
  return getStripeClient().prices.retrieve(priceId, {
    expand: ["product"],
  });
}
