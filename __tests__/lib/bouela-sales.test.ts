/**
 * Bouéla Sales module (CIS-292): plan filter on the shared Stripe account,
 * discount caps, merchant share link.
 */
import { isSellableBouelaProduct } from "@/lib/stripe/plans";
import {
  MAX_DISCOUNT_PERCENT,
  buildBiscoitoShareUrl,
  createBiscoitoSaleSchema,
  maxAmountOff,
} from "@/actions/biscoito-sales/schema";

jest.mock("@/lib/stripe/client", () => ({ getStripeClient: () => ({}) }));

describe("isSellableBouelaProduct", () => {
  const current = { app: "biscoito", current: "true", audience: "BRAND", plan_key: "BRAND_PRO" };
  it("accepts current self-serve merchant plans only", () => {
    expect(isSellableBouelaProduct(current)).toBe(true);
    expect(isSellableBouelaProduct({ ...current, current: "false" })).toBe(false);
    expect(isSellableBouelaProduct({ ...current, audience: "INFLUENCER" })).toBe(false);
    expect(isSellableBouelaProduct({ ...current, contact_only: "true" })).toBe(false);
    expect(isSellableBouelaProduct({ ...current, hidden: "true" })).toBe(false);
    expect(isSellableBouelaProduct({ ...current, internal: "true" })).toBe(false);
  });
  it("rejects products of other projects on the shared account", () => {
    expect(isSellableBouelaProduct({ app: "turismo" })).toBe(false);
    expect(isSellableBouelaProduct({})).toBe(false);
    expect(isSellableBouelaProduct(null)).toBe(false);
  });
});

describe("discount caps", () => {
  it("percent is capped at MAX_DISCOUNT_PERCENT (default 30)", () => {
    expect(MAX_DISCOUNT_PERCENT).toBe(30);
    expect(createBiscoitoSaleSchema.safeParse({ targetPriceId: "price_1", discountType: "PERCENT", discountValue: 30 }).success).toBe(true);
    expect(createBiscoitoSaleSchema.safeParse({ targetPriceId: "price_1", discountType: "PERCENT", discountValue: 31 }).success).toBe(false);
    expect(createBiscoitoSaleSchema.safeParse({ targetPriceId: "price_1", discountType: "PERCENT", discountValue: 100 }).success).toBe(false);
  });
  it("amount cap is the same share of the plan price, in minor units", () => {
    expect(maxAmountOff(24900)).toBe(7470);
    expect(maxAmountOff(0)).toBeNull();
    expect(maxAmountOff(null)).toBeNull();
  });
});

describe("buildBiscoitoShareUrl", () => {
  const prev = process.env.NEXT_PUBLIC_BISCOITO_PAYMENT_URL;
  afterEach(() => { process.env.NEXT_PUBLIC_BISCOITO_PAYMENT_URL = prev; });
  it("points to the public pricing page with the code in the query", () => {
    delete process.env.NEXT_PUBLIC_BISCOITO_PAYMENT_URL;
    expect(buildBiscoitoShareUrl("AB3D-KQ7M2X")).toBe("https://bouela.com/fr/pricing?promo=AB3D-KQ7M2X");
  });
  it("honours the configured base URL", () => {
    process.env.NEXT_PUBLIC_BISCOITO_PAYMENT_URL = "https://v2.bouela.com/fr/pricing";
    expect(buildBiscoitoShareUrl("X")).toBe("https://v2.bouela.com/fr/pricing?promo=X");
  });
});
