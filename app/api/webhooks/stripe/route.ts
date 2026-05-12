import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prismadb } from "@/lib/prisma";
import {
  constructStripeWebhookEvent,
  getPromotionCodeIdFromSession,
  retrieveCheckoutSessionWithDiscounts,
} from "@/lib/stripe/webhooks";

async function markCheckoutSessionPaid(sessionId: string): Promise<void> {
  const session = await retrieveCheckoutSessionWithDiscounts(sessionId);
  const promotionCodeId = getPromotionCodeIdFromSession(session);
  if (!promotionCodeId) return;

  await prismadb.crm_BiscoitoSales.updateMany({
    where: {
      stripePromotionCodeId: promotionCodeId,
      status: "PENDING",
    },
    data: {
      status: "PAID",
      paidAt: new Date(),
    },
  });
}

async function recordWebhookEvent(eventId: string, type: string): Promise<boolean> {
  try {
    await prismadb.crm_StripeWebhookEvents.create({
      data: { id: eventId, type },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  let event;
  try {
    event = constructStripeWebhookEvent(await request.text(), signature);
  } catch (error) {
    console.error("[STRIPE_WEBHOOK_SIGNATURE]", error);
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  const existingEvent = await prismadb.crm_StripeWebhookEvents.findUnique({
    where: { id: event.id },
    select: { id: true },
  });
  if (existingEvent) return NextResponse.json({ received: true, duplicate: true });

  try {
    if (event.type === "checkout.session.completed") {
      await markCheckoutSessionPaid(event.data.object.id);
    }

    const recorded = await recordWebhookEvent(event.id, event.type);
    return NextResponse.json({ received: true, duplicate: !recorded });
  } catch (error) {
    console.error("[STRIPE_WEBHOOK]", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
