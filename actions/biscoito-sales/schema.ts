import { z } from "zod";

/** Highest discount a sales rep may grant without an admin (percent of the plan price). */
export const MAX_DISCOUNT_PERCENT = (() => {
  const raw = Number(process.env.BISCOITO_MAX_DISCOUNT_PERCENT);
  return Number.isFinite(raw) && raw > 0 && raw <= 100 ? Math.floor(raw) : 30;
})();

export const createBiscoitoSaleSchema = z.object({
  targetPriceId: z.string().min(1, "Select a plan"),
  discountType: z.enum(["PERCENT", "AMOUNT"]),
  discountValue: z.number().int().positive("Discount must be greater than zero"),
}).superRefine((input, ctx) => {
  if (input.discountType === "PERCENT" && input.discountValue > MAX_DISCOUNT_PERCENT) {
    ctx.addIssue({
      code: "custom",
      path: ["discountValue"],
      message: `Percent discount cannot exceed ${MAX_DISCOUNT_PERCENT}%`,
    });
  }
});

/** AMOUNT discounts are capped to the same share of the plan price (minor units). */
export function maxAmountOff(unitAmount: number | null | undefined): number | null {
  if (!unitAmount || unitAmount <= 0) return null;
  return Math.floor((unitAmount * MAX_DISCOUNT_PERCENT) / 100);
}

export type CreateBiscoitoSaleInput = z.infer<typeof createBiscoitoSaleSchema>;

export type CreateBiscoitoSaleOutput = {
  id: string;
  promoCode: string;
  shareUrl: string;
};

/**
 * Link handed to the merchant: the public pricing page with the code in the
 * query string; the Bouéla backend applies it to the Stripe Checkout Session.
 */
export function buildBiscoitoShareUrl(promoCode: string): string {
  const url = new URL(
    process.env.NEXT_PUBLIC_BISCOITO_PAYMENT_URL || "https://bouela.com/fr/pricing"
  );
  url.searchParams.set("promo", promoCode);
  return url.toString();
}
