"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prismadb } from "@/lib/prisma";
import type { ActionState } from "@/lib/create-safe-action";
import {
  AuthenticationError,
  AuthorizationError,
  requireActiveAuthenticated,
} from "@/lib/authz";
import { deactivateBiscoitoPromotionCode } from "@/lib/stripe/discounts";

type CancelOutput = { id: string; status: "CANCELLED" };

const cancelSchema = z.string().uuid();

export async function cancelBiscoitoSale(
  saleId: string
): Promise<ActionState<string, CancelOutput>> {
  const parsed = cancelSchema.safeParse(saleId);
  if (!parsed.success) return { error: "Invalid Biscoito sale" };

  let user;
  try {
    user = await requireActiveAuthenticated();
  } catch (error) {
    if (error instanceof AuthenticationError) return { error: "Unauthorized" };
    if (error instanceof AuthorizationError) return { error: "Forbidden" };
    throw error;
  }

  const sale = await prismadb.crm_BiscoitoSales.findUnique({
    where: { id: parsed.data },
    select: {
      id: true,
      sellerId: true,
      status: true,
      stripePromotionCodeId: true,
    },
  });

  if (!sale) return { error: "Biscoito sale not found" };
  if (sale.status !== "PENDING") return { error: "Only pending Biscoito sales can be cancelled" };
  if (sale.sellerId !== user.id && user.role !== "admin") return { error: "Forbidden" };

  try {
    await deactivateBiscoitoPromotionCode(sale.stripePromotionCodeId);
    const updated = await prismadb.crm_BiscoitoSales.update({
      where: { id: sale.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
      select: { id: true, status: true },
    });

    revalidatePath("/biscoito-sales");
    revalidatePath(`/biscoito-sales/${sale.id}`);
    return { data: { id: updated.id, status: "CANCELLED" } };
  } catch (error) {
    console.error("[CANCEL_BISCOITO_SALE]", error);
    return { error: "Failed to cancel Biscoito sale" };
  }
}
