import Link from "next/link";
import { Eye } from "lucide-react";
import type { BiscoitoSaleSummary } from "@/actions/biscoito-sales/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CancelButton } from "./CancelButton";
import { CopyButton } from "./CopyButton";

type SalesTableProps = {
  sales: BiscoitoSaleSummary[];
  isAdmin: boolean;
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SalesTable({ sales, isAdmin }: SalesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Discount</TableHead>
          <TableHead>Status</TableHead>
          {isAdmin ? <TableHead>Seller</TableHead> : null}
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sales.map((sale) => (
          <TableRow key={sale.id}>
            <TableCell>
              <div className="font-medium">{sale.promoCode}</div>
              <div className="text-sm text-muted-foreground">{sale.targetPriceId}</div>
            </TableCell>
            <TableCell>
              <div className="font-medium">{sale.stripeProductName ?? sale.stripeProductId}</div>
              <div className="text-sm text-muted-foreground">
                {sale.stripePriceNickname ?? "Recurring price"}
              </div>
            </TableCell>
            <TableCell>{formatDiscount(sale)}</TableCell>
            <TableCell>
              <Badge variant={statusVariant[sale.status] ?? "outline"}>{sale.status}</Badge>
            </TableCell>
            {isAdmin ? (
              <TableCell>
                <div>{sale.sellerName ?? sale.sellerEmail}</div>
                <div className="text-sm text-muted-foreground">{sale.sellerEmail}</div>
              </TableCell>
            ) : null}
            <TableCell>{formatDate(sale.createdAt)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap justify-end gap-2">
                <CopyButton value={sale.promoCode} label="Code" />
                <CopyButton value={sale.shareUrl} label="URL" />
                <Button asChild variant="outline" size="sm">
                  <Link href={`/biscoito-sales/${sale.id}`}>
                    <Eye size={16} />
                    View
                  </Link>
                </Button>
                {sale.canCancel ? <CancelButton saleId={sale.id} /> : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
