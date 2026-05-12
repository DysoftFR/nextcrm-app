import { randomInt } from "crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTHS = [4, 6] as const;

export function generateBiscoitoPromoCode(): string {
  return CODE_LENGTHS.map((length) =>
    Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")
  ).join("-");
}

export async function generateUniqueBiscoitoPromoCode(
  exists: (code: string) => Promise<boolean>,
  maxAttempts = 5
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateBiscoitoPromoCode();
    if (!(await exists(code))) return code;
  }

  throw new Error("Unable to generate a unique Biscoito promo code");
}
