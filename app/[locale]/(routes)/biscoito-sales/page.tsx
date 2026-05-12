import Link from "next/link";
import { Plus, Search } from "lucide-react";
import Container from "@/app/[locale]/(routes)/components/ui/Container";
import { getBiscoitoSales } from "@/actions/biscoito-sales/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SalesTable } from "./components/SalesTable";

type BiscoitoSalesPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

const statusOptions = ["PENDING", "PAID", "CANCELLED", "EXPIRED"];

function pageHref(page: number, params: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  next.set("page", String(page));
  return `/biscoito-sales?${next.toString()}`;
}

export default async function BiscoitoSalesPage({ searchParams }: BiscoitoSalesPageProps) {
  const params = await searchParams;
  const result = await getBiscoitoSales(params);

  return (
    <Container
      title="Biscoito Sales"
      description="Create and manage one-use Stripe coupons for Biscoito subscriptions."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <form className="grid gap-2 md:flex md:items-center" action="/biscoito-sales">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={params.q}
                placeholder="Search code or plan"
                className="h-11 pl-9 md:w-72"
              />
            </div>
            <select
              name="status"
              defaultValue={params.status ?? ""}
              className="h-11 rounded-md border border-input bg-background px-3 text-base"
            >
              <option value="">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" className="h-11">
              Filter
            </Button>
          </form>

          <Button asChild className="h-11">
            <Link href="/biscoito-sales/new">
              <Plus size={16} />
              Create coupon
            </Link>
          </Button>
        </div>

        {result.sales.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-md border border-dashed p-8 text-center">
            <div>
              <h2 className="text-lg font-semibold">No Biscoito coupons yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create the first one-use coupon and share it with a customer.
              </p>
            </div>
            <Button asChild>
              <Link href="/biscoito-sales/new">
                <Plus size={16} />
                Create coupon
              </Link>
            </Button>
          </div>
        ) : (
          <SalesTable sales={result.sales} isAdmin={result.isAdmin} />
        )}

        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Page {result.page} of {result.totalPages} · {result.totalCount} total
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={result.page <= 1}>
              <Link href={pageHref(Math.max(result.page - 1, 1), params)}>Previous</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={result.page >= result.totalPages}>
              <Link href={pageHref(Math.min(result.page + 1, result.totalPages), params)}>
                Next
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Container>
  );
}
