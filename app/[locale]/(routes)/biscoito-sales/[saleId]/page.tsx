import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Container from "@/app/[locale]/(routes)/components/ui/Container";
import { getBiscoitoSale, type BiscoitoSaleSummary } from "@/actions/biscoito-sales/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CancelButton } from "../components/CancelButton";
import { CopyButton } from "../components/CopyButton";

type BiscoitoSaleDetailPageProps = {
  params: Promise<{ saleId: string }>;
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  PAID: "default",
  CANCELLED: "outline",
  EXPIRED: "destructive",
};

function formatDiscount(sale: BiscoitoSaleSummary): string {
  if (sale.discountType === "PERCENT") return `${sale.discountValue}%`;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: sale.currency.toUpperCase(),
  }).format(sale.discountValue / 100);
}

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function stripeDashboardUrl(path: string): string {
  return `https://dashboard.stripe.com/${path}`;
}

export default async function BiscoitoSaleDetailPage({ params }: BiscoitoSaleDetailPageProps) {
  const { saleId } = await params;
  const sale = await getBiscoitoSale(saleId);
  if (!sale) notFound();

  return (
    <Container title={`Coupon ${sale.promoCode}`} description="Biscoito sale details and Stripe references.">
      <div className="flex max-w-5xl flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Button asChild variant="outline" className="w-fit">
            <Link href="/biscoito-sales">
              <ArrowLeft size={16} />
              Back to coupons
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={sale.promoCode} label="Copy code" />
            <CopyButton value={sale.shareUrl} label="Copy URL" />
            {sale.canCancel ? <CancelButton saleId={sale.id} /> : null}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Coupon summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Detail label="Status">
                <Badge variant={statusVariant[sale.status] ?? "outline"}>{sale.status}</Badge>
              </Detail>
              <Detail label="Discount">{formatDiscount(sale)}</Detail>
              <Detail label="Product">{sale.stripeProductName ?? sale.stripeProductId}</Detail>
              <Detail label="Price">{sale.stripePriceNickname ?? sale.targetPriceId}</Detail>
              <Detail label="Created">{formatDate(sale.createdAt)}</Detail>
              <Detail label="Paid">{formatDate(sale.paidAt)}</Detail>
              <Detail label="Cancelled">{formatDate(sale.cancelledAt)}</Detail>
              <Detail label="Seller">{sale.sellerName ?? sale.sellerEmail}</Detail>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stripe links</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button asChild variant="outline">
                <a href={stripeDashboardUrl(`coupons/${sale.stripeCouponId}`)} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                  Stripe coupon
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={stripeDashboardUrl(`promotion_codes/${sale.stripePromotionCodeId}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />
                  Promotion code
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Share URL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="break-all rounded-md border bg-muted p-4 text-sm">{sale.shareUrl}</div>
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
