import Stripe from "stripe";

export const STRIPE_API_VERSION = "2026-02-25.clover";

let stripe: Stripe | null = null;

function normalizeSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^["']|["']$/g, "");
}

export function getStripeClient(): Stripe {
  const secretKey = normalizeSecret(
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_TOKEN
  );
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY or STRIPE_SECRET_TOKEN is not configured");
  }

  stripe ??= new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    maxNetworkRetries: 2,
  });

  return stripe;
}
