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
    .map(toBiscoitoPlan)
    .filter((plan): plan is BiscoitoPlan => Boolean(plan));

  cachedPlans = { data, expiresAt: now + CACHE_TTL_MS };
  return data;
}

export async function retrieveBiscoitoPrice(priceId: string): Promise<Stripe.Price> {
  return getStripeClient().prices.retrieve(priceId, {
    expand: ["product"],
  });
}
