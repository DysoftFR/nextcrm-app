"use server";

import { revalidatePath } from "next/cache";
import { BiscoitoDiscountType } from "@prisma/client";
import { prismadb } from "@/lib/prisma";
import { createSafeAction, type ActionState } from "@/lib/create-safe-action";
import {
  AuthenticationError,
  AuthorizationError,
  requireActiveAuthenticated,
} from "@/lib/authz";
import { retrieveBiscoitoPrice } from "@/lib/stripe/plans";
import {
  createBiscoitoDiscount,
  deactivateBiscoitoPromotionCode,
  deleteBiscoitoCoupon,
} from "@/lib/stripe/discounts";
import { generateUniqueBiscoitoPromoCode } from "@/lib/stripe/codes";
import {
  buildBiscoitoShareUrl,
  createBiscoitoSaleSchema,
  type CreateBiscoitoSaleInput,
  type CreateBiscoitoSaleOutput,
} from "./schema";

type ActionReturn = ActionState<CreateBiscoitoSaleInput, CreateBiscoitoSaleOutput>;

function getExpandedProduct(price: Awaited<ReturnType<typeof retrieveBiscoitoPrice>>) {
  const product = price.product;
  if (typeof product === "string" || "deleted" in product) {
    throw new Error("Stripe price must include an active expanded product");
  }
  return product;
}

async function getUniquePromoCode(): Promise<string> {
  return generateUniqueBiscoitoPromoCode(async (promoCode) => {
    const existing = await prismadb.crm_BiscoitoSales.findUnique({
      where: { promoCode },
      select: { id: true },
    });
    return Boolean(existing);
  });
}

const handler = async (input: CreateBiscoitoSaleInput): Promise<ActionReturn> => {
  let user;
  try {
    user = await requireActiveAuthenticated();
  } catch (error) {
    if (error instanceof AuthenticationError) return { error: "Unauthorized" };
    if (error instanceof AuthorizationError) return { error: "Forbidden" };
    throw error;
  }

  let price;
  try {
    price = await retrieveBiscoitoPrice(input.targetPriceId);
  } catch (error) {
    console.error("[BISCOITO_PRICE]", error);
    return { error: "Selected Stripe plan could not be loaded" };
  }

  const product = getExpandedProduct(price);
  if (!price.active || price.type !== "recurring" || !price.recurring || !product.active) {
    return { error: "Selected Stripe plan is not available" };
  }

  const allowedProductId = process.env.STRIPE_BISCOITO_PRODUCT_ID;
  if (allowedProductId && product.id !== allowedProductId) {
    return { error: "Selected Stripe plan is not available for Biscoito sales" };
  }

  const promoCode = await getUniquePromoCode();
  const discount = await createBiscoitoDiscount({
    sellerId: user.id,
    code: promoCode,
    productId: product.id,
    discountType: input.discountType,
    discountValue: input.discountValue,
    currency: price.currency,
  });

  try {
    const sale = await prismadb.crm_BiscoitoSales.create({
      data: {
        sellerId: user.id,
        targetPriceId: price.id,
        stripeProductId: product.id,
        stripeProductName: product.name,
        stripePriceNickname: price.nickname,
        stripeUnitAmount: price.unit_amount,
        stripeCouponId: discount.coupon.id,
        stripePromotionCodeId: discount.promotionCode.id,
        promoCode,
        discountType: input.discountType as BiscoitoDiscountType,
        discountValue: input.discountValue,
        currency: price.currency,
      },
      select: { id: true, promoCode: true },
    });

    revalidatePath("/biscoito-sales");
    return {
      data: {
        id: sale.id,
        promoCode: sale.promoCode,
        shareUrl: buildBiscoitoShareUrl(sale.promoCode),
      },
    };
  } catch (error) {
    console.error("[CREATE_BISCOITO_SALE]", error);
    await Promise.allSettled([
      deactivateBiscoitoPromotionCode(discount.promotionCode.id),
      deleteBiscoitoCoupon(discount.coupon.id),
    ]);
    return { error: "Failed to create Biscoito sale" };
  }
};

export const createBiscoitoSale = createSafeAction(createBiscoitoSaleSchema, handler);
