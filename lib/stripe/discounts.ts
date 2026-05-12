import Stripe from "stripe";
import { getStripeClient } from "./client";

type DiscountType = "PERCENT" | "AMOUNT";

type CreateBiscoitoDiscountInput = {
  sellerId: string;
  code: string;
  productId: string;
  discountType: DiscountType;
  discountValue: number;
  currency: string;
};

export type CreatedBiscoitoDiscount = {
  coupon: Stripe.Coupon;
  promotionCode: Stripe.PromotionCode;
};

export async function createBiscoitoDiscount(
  input: CreateBiscoitoDiscountInput
): Promise<CreatedBiscoitoDiscount> {
  const couponParams: Stripe.CouponCreateParams = {
    duration: "once",
    metadata: {
      seller_id: input.sellerId,
      source: "nextcrm",
    },
    applies_to: {
      products: [input.productId],
    },
  };

  if (input.discountType === "PERCENT") {
    couponParams.percent_off = input.discountValue;
  } else {
    couponParams.amount_off = input.discountValue;
    couponParams.currency = input.currency;
  }

  const stripe = getStripeClient();
  const coupon = await stripe.coupons.create(couponParams);

  try {
    const promotionCode = await stripe.promotionCodes.create({
      promotion: {
        type: "coupon",
        coupon: coupon.id,
      },
      code: input.code,
      max_redemptions: 1,
      active: true,
      metadata: {
        seller_id: input.sellerId,
        source: "nextcrm",
      },
    });

    return { coupon, promotionCode };
  } catch (error) {
    await deleteBiscoitoCoupon(coupon.id);
    throw error;
  }
}

export async function deactivateBiscoitoPromotionCode(promotionCodeId: string): Promise<void> {
  await getStripeClient().promotionCodes.update(promotionCodeId, { active: false });
}

export async function deleteBiscoitoCoupon(couponId: string): Promise<void> {
  await getStripeClient().coupons.del(couponId);
}
