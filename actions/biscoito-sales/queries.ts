import { BiscoitoSaleStatus, type Prisma } from "@prisma/client";
import { prismadb } from "@/lib/prisma";
import {
  AuthenticationError,
  AuthorizationError,
  requireActiveAuthenticated,
} from "@/lib/authz";
import { buildBiscoitoShareUrl } from "./schema";

export type BiscoitoSaleSummary = {
  id: string;
  promoCode: string;
  shareUrl: string;
  targetPriceId: string;
  stripeProductId: string;
  stripeProductName: string | null;
  stripePriceNickname: string | null;
  stripeUnitAmount: number | null;
  discountType: string;
  discountValue: number;
  currency: string;
  status: string;
  sellerName: string | null;
  sellerEmail: string;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  canCancel: boolean;
};

export type BiscoitoSaleListResult = {
  sales: BiscoitoSaleSummary[];
  page: number;
  totalPages: number;
  totalCount: number;
  isAdmin: boolean;
};

const PAGE_SIZE = 10;

type SaleWithSeller = Prisma.crm_BiscoitoSalesGetPayload<{
  include: { seller: { select: { name: true; email: true } } };
}>;

function toSummary(sale: SaleWithSeller, viewerId: string, isAdmin: boolean): BiscoitoSaleSummary {
  return {
    id: sale.id,
    promoCode: sale.promoCode,
    shareUrl: buildBiscoitoShareUrl(sale.promoCode),
    targetPriceId: sale.targetPriceId,
    stripeProductId: sale.stripeProductId,
    stripeProductName: sale.stripeProductName,
    stripePriceNickname: sale.stripePriceNickname,
    stripeUnitAmount: sale.stripeUnitAmount,
    discountType: sale.discountType,
    discountValue: sale.discountValue,
    currency: sale.currency,
    status: sale.status,
    sellerName: sale.seller.name,
    sellerEmail: sale.seller.email,
    createdAt: sale.createdAt.toISOString(),
    paidAt: sale.paidAt?.toISOString() ?? null,
    cancelledAt: sale.cancelledAt?.toISOString() ?? null,
    canCancel: sale.status === "PENDING" && (isAdmin || sale.sellerId === viewerId),
  };
}

function parseStatus(value?: string): BiscoitoSaleStatus | undefined {
  if (!value) return undefined;
  return Object.values(BiscoitoSaleStatus).includes(value as BiscoitoSaleStatus)
    ? (value as BiscoitoSaleStatus)
    : undefined;
}

export async function getBiscoitoSales(params: {
  page?: string;
  status?: string;
  q?: string;
}): Promise<BiscoitoSaleListResult> {
  let user;
  try {
    user = await requireActiveAuthenticated();
  } catch (error) {
    if (error instanceof AuthenticationError) throw new Error("Unauthorized");
    if (error instanceof AuthorizationError) throw new Error("Forbidden");
    throw error;
  }

  const page = Math.max(Number(params.page) || 1, 1);
  const isAdmin = user.role === "admin";
  const status = parseStatus(params.status);
  const q = params.q?.trim();

  const where: Prisma.crm_BiscoitoSalesWhereInput = {
    ...(isAdmin ? {} : { sellerId: user.id }),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { promoCode: { contains: q, mode: "insensitive" } },
            { stripeProductName: { contains: q, mode: "insensitive" } },
            { targetPriceId: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [sales, totalCount] = await Promise.all([
    prismadb.crm_BiscoitoSales.findMany({
      where,
      include: { seller: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prismadb.crm_BiscoitoSales.count({ where }),
  ]);

  return {
    sales: sales.map((sale) => toSummary(sale, user.id, isAdmin)),
    page,
    totalPages: Math.max(Math.ceil(totalCount / PAGE_SIZE), 1),
    totalCount,
    isAdmin,
  };
}

export async function getBiscoitoSale(id: string): Promise<BiscoitoSaleSummary | null> {
  const user = await requireActiveAuthenticated();
  const isAdmin = user.role === "admin";
  const sale = await prismadb.crm_BiscoitoSales.findFirst({
    where: {
      id,
      ...(isAdmin ? {} : { sellerId: user.id }),
    },
    include: { seller: { select: { name: true, email: true } } },
  });

  return sale ? toSummary(sale, user.id, isAdmin) : null;
}
