import Stripe from "stripe";
import { getStripeClient } from "./client";

export function constructStripeWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  return getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
}

export async function retrieveCheckoutSessionWithDiscounts(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  return getStripeClient().checkout.sessions.retrieve(sessionId, {
    expand: ["discounts.promotion_code"],
  });
}

export function getPromotionCodeIdFromSession(session: Stripe.Checkout.Session): string | null {
  for (const discount of session.discounts ?? []) {
    const promotionCode = discount.promotion_code;
    if (!promotionCode) continue;
    return typeof promotionCode === "string" ? promotionCode : promotionCode.id;
  }

  return null;
}
