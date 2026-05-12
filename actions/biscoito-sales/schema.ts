import { z } from "zod";

export const createBiscoitoSaleSchema = z.object({
  targetPriceId: z.string().min(1, "Select a Stripe plan"),
  discountType: z.enum(["PERCENT", "AMOUNT"]),
  discountValue: z.number().int().positive("Discount must be greater than zero"),
}).superRefine((input, ctx) => {
  if (input.discountType === "PERCENT" && input.discountValue > 100) {
    ctx.addIssue({
      code: "custom",
      path: ["discountValue"],
      message: "Percent discount cannot exceed 100",
    });
  }
});

export type CreateBiscoitoSaleInput = z.infer<typeof createBiscoitoSaleSchema>;

export type CreateBiscoitoSaleOutput = {
  id: string;
  promoCode: string;
  shareUrl: string;
};

export function buildBiscoitoShareUrl(promoCode: string): string {
  const url = new URL(
    process.env.NEXT_PUBLIC_BISCOITO_PAYMENT_URL || "https://biscoito.io/payment"
  );
  url.searchParams.set("promo", promoCode);
  return url.toString();
}
